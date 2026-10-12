/**
 * 火山引擎（豆包）ASR + TTS 实现。
 *
 * 选型与实测结论（2026-10，来源：官方文档 + 实测）：
 *   - TTS 资源：volc.service_type.10029（语音合成大模型_字符版），
 *     HTTP /api/v1/tts，鉴权 Authorization: Bearer;{token}
 *   - ASR 资源：volc.seedasr.sauc.duration（豆包流式语音识别模型2.0 小时版），
 *     WebSocket wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream
 *     （一句话识别大模型 nostream 接口，旧版鉴权头 X-Api-App-Key + X-Api-Access-Key）
 *
 * ⚠️ 未配置密钥时本模块不会被实例化（见 index.ts）。
 */

import { gzipSync, gunzipSync } from "node:zlib";
import WebSocket from "ws";
import {
  type AsrInput,
  type AsrProvider,
  type AsrResult,
  type TtsInput,
  type TtsProvider,
  type TtsResult,
  estimateSpeechMs,
  makeLabel,
} from "./types";

const ASR_ENDPOINT = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream";
const TTS_ENDPOINT = "https://openspeech.bytedance.com/api/v1/tts";
const TIMEOUT_MS = 30000;

// 默认声线：温柔女声，贴合追思场景
const DEFAULT_VOICE = "zh_female_cancan_mars_bigtts";

// 追思场景默认语速：偏慢(0.92)更松弛自然，弱化"字正腔圆念字"的机械感（1.0 为正常）
const DEFAULT_SPEED = 0.92;

// 火山大模型音色官方支持的情绪枚举；其余值服务端会静默当作 neutral
const SUPPORTED_EMOTIONS = new Set(["neutral", "happy", "sad", "angry", "fear", "surprise"]);

/** 归一化情绪参数：非合法值回落 undefined（不传，由服务端按 neutral 处理） */
function normalizeEmotion(e?: string): string | undefined {
  if (!e || !SUPPORTED_EMOTIONS.has(e)) return undefined;
  return e;
}

/**
 * 预设音色映射：把产品层预设伪 ID 对应到真实火山大模型音色。
 * （这些 ID 来自旧 Mock 时代，不能直接传给火山，否则 403）
 * 以下音色均已于 2026-10 用当前资源实测可用（code 3000）。
 */
const PRESET_VOICE_MAP: Record<string, string> = {
  "preset-male-warm": "zh_male_wennuanahu_moon_bigtts", // 温和男声 → 温暖阿虎
  "preset-female-kind": "zh_female_cancan_mars_bigtts", // 慈祥女声 → 知性灿灿
  "preset-elder-steady": "zh_male_wennuanahu_moon_bigtts", // 沉稳长者 → 温暖阿虎
};

/** 火山音色 ID 形如 zh_male_xxx_mars_bigtts / icl_xxx（复刻音色） */
function isVolcanoVoiceId(id: string): boolean {
  return /^[a-z]{2}_(male|female)_[a-z0-9_]+/.test(id) || id.startsWith("icl_");
}

/** 解析最终 voice_type：预设映射 → 直通火山 ID → 兜底默认（绝不因无效音色 403） */
function resolveVoiceType(voiceId?: string): string {
  if (!voiceId) return DEFAULT_VOICE;
  const mapped = PRESET_VOICE_MAP[voiceId];
  if (mapped) return mapped;
  if (isVolcanoVoiceId(voiceId)) return voiceId;
  return DEFAULT_VOICE;
}

interface VolcanoConfig {
  appId: string;
  accessToken: string;
  cluster: string;
  ttsResource: string;
  asrResource: string;
}

function readConfig(): VolcanoConfig | null {
  const appId = process.env.VOLCANO_APP_ID;
  const accessToken = process.env.VOLCANO_ACCESS_TOKEN;
  if (!appId || !accessToken) return null;
  return {
    appId,
    accessToken,
    cluster: process.env.VOLCANO_CLUSTER || "volcano_tts",
    ttsResource: process.env.VOLCANO_TTS_RESOURCE || "volc.service_type.10029",
    asrResource: process.env.VOLCANO_ASR_RESOURCE || "volc.seedasr.sauc.duration",
  };
}

// ---------------------------------------------------------------- 二进制帧（火山 v3 协议）

function buildFrame(msgType: number, flags: number, serialize: number, compress: number, payload: Buffer): Buffer {
  const header = Buffer.from([
    (0x1 << 4) | 0x1, // version=1, header_size=1（1 个额外 4 字节字）
    (msgType << 4) | flags,
    (serialize << 4) | compress,
    0x00,
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length);
  return Buffer.concat([header, size, payload]);
}

interface ParsedFrame {
  msgType: number;
  json: any;
}

function parseFrame(buf: Buffer): ParsedFrame {
  const msgType = buf[1] >> 4;
  const serialize = buf[2] >> 4;
  const compress = buf[2] & 0x0f;
  const headerSize = buf[0] & 0x0f; // 额外 4 字节字数量
  const additional = headerSize * 4;
  const payloadSize = buf.readUInt32BE(4 + additional);
  let payload = buf.subarray(8 + additional, 8 + additional + payloadSize);
  if (compress === 1) payload = gunzipSync(payload);
  let json: any = null;
  if (serialize === 1) {
    try {
      json = JSON.parse(payload.toString("utf8"));
    } catch {
      json = null;
    }
  }
  return { msgType, json };
}

function guessFormat(mime: string): string {
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp3") || mime.includes("mpeg")) return "mp3";
  if (mime.includes("m4a") || mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function estimateAudioMsFallback(bytes: number): number {
  return Math.max(800, Math.round((bytes * 8) / 16));
}

// ---------------------------------------------------------------- ASR

export class VolcanoAsr implements AsrProvider {
  readonly kind = "volcano" as const;

  constructor(private readonly cfg: VolcanoConfig) {}

  async transcribe(input: AsrInput): Promise<AsrResult> {
    const reqId = crypto.randomUUID();
    const fmt = guessFormat(input.mimeType);
    const ws = new WebSocket(ASR_ENDPOINT, {
      headers: {
        "X-Api-App-Key": this.cfg.appId,
        "X-Api-Access-Key": this.cfg.accessToken,
        "X-Api-Resource-Id": this.cfg.asrResource,
        "X-Api-Request-Id": reqId,
      },
    });

    return new Promise<AsrResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          ws.terminate();
        } catch {}
        reject(new Error("Volcano ASR 超时"));
      }, TIMEOUT_MS);

      let lastText = "";
      let durationMs = estimateAudioMsFallback(input.buffer.length);
      let gotResult = false;

      ws.on("open", () => {
        const payload = {
          user: { uid: "zongyitang" },
          audio:
            // 裸 PCM 需显式告知采样参数；带头的 wav/mp3/m4a/ogg 只传 format 即可
            fmt === "pcm"
              ? { format: fmt, codec: "raw", rate: 16000, bits: 16, channel: 1 }
              : { format: fmt },
          request: {
            model_name: "bigmodel",
            enable_itn: true,
            enable_punc: true,
            ...(input.hint ? { corpus: { context: JSON.stringify({ hotwords: [input.hint] }) } } : {}),
          },
        };
        // 1) full client request（JSON + gzip）
        ws.send(buildFrame(0x1, 0x0, 0x1, 0x1, gzipSync(Buffer.from(JSON.stringify(payload)))));
        // 2) 整段音频，last 包
        ws.send(buildFrame(0x2, 0x2, 0x0, 0x1, gzipSync(input.buffer)));
      });

      ws.on("message", (data: Buffer | ArrayBuffer) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const { json } = parseFrame(buf);
        if (!json) return;
        if (typeof json?.audio_info?.duration === "number") durationMs = json.audio_info.duration;
        const text: string | undefined = json?.result?.text;
        if (typeof text === "string") {
          lastText = text;
          gotResult = true;
        }
        // 错误帧（部分接口会在顶层带 code/message）
        if (json?.code !== undefined && json.code !== 0 && json.code !== 20000000) {
          clearTimeout(timer);
          ws.close();
          reject(new Error(`Volcano ASR 错误: ${json.code} ${json.message ?? ""}`));
        }
      });

      ws.on("error", (e: Error) => {
        clearTimeout(timer);
        reject(new Error(`Volcano ASR 连接失败: ${e.message}`));
      });

      ws.on("close", (code: number) => {
        clearTimeout(timer);
        if (code !== 1000 && code !== 1005) {
          reject(new Error(`Volcano ASR 异常关闭: ${code}`));
          return;
        }
        if (!gotResult) {
          reject(new Error("Volcano ASR 未返回识别文本"));
          return;
        }
        resolve({
          text: lastText,
          confidence: 0.95,
          durationMs,
          label: makeLabel("volcano", "bigmodel-asr"),
        });
      });
    });
  }
}

// ---------------------------------------------------------------- TTS

export class VolcanoTts implements TtsProvider {
  readonly kind = "volcano" as const;

  constructor(private readonly cfg: VolcanoConfig) {}

  async synthesize(input: TtsInput): Promise<TtsResult> {
    const res = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer;${this.cfg.accessToken}`,
        "X-Api-Resource-Id": this.cfg.ttsResource,
      },
      body: JSON.stringify({
        app: {
          appid: this.cfg.appId,
          token: this.cfg.accessToken,
          cluster: this.cfg.cluster,
        },
        user: { uid: "zongyitang" },
        audio: {
          voice_type: resolveVoiceType(input.voiceId),
          encoding: "mp3",
          speed_ratio: input.speed && input.speed > 0 ? input.speed : DEFAULT_SPEED,
          ...(normalizeEmotion(input.emotion)
            ? { emotion: normalizeEmotion(input.emotion) }
            : {}),
        },
        request: {
          reqid: crypto.randomUUID(),
          text: input.text,
          operation: "query",
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Volcano TTS ${res.status}`);

    const data = await res.json();
    if (data?.code !== 3000 || !data?.data) {
      throw new Error(`Volcano TTS 失败: ${data?.message ?? data?.code}`);
    }

    const buffer = Buffer.from(data.data, "base64");
    return {
      buffer,
      mimeType: "audio/mpeg",
      durationMs: estimateSpeechMs(input.text),
      label: makeLabel("volcano", `tts:${resolveVoiceType(input.voiceId)}`),
    };
  }
}

export function volcanoConfigAvailable(): boolean {
  return readConfig() !== null;
}

export function getVolcanoConfig(): VolcanoConfig | null {
  return readConfig();
}
