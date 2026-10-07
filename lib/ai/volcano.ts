/**
 * 火山引擎（豆包）ASR + TTS 实现。
 *
 * 选型理由（2026-09 核价，来源：火山引擎官方文档）：
 *   - 声音复刻：5 秒样本，¥138/音色 + ¥0.0008/字符
 *   - 大模型流式 ASR：¥0.075/分钟
 *   - 录音文件识别：¥0.039/分钟
 *   - 与 LLM 同生态，延迟与集成成本最低
 *
 * ⚠️ 自建 CosyVoice 3（Apache 2.0）可把 TTS 成本从 ¥0.0008/字符
 *    降到约 ¥5/月的固定摊销。生产环境建议走自建，本文件保留云 API 路径。
 *
 * ⚠️ 未配置密钥时本模块不会被实例化（见 index.ts）。
 */

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

const ASR_ENDPOINT = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
const TTS_ENDPOINT = "https://openspeech.bytedance.com/api/v1/tts";
const TIMEOUT_MS = 30000;

interface VolcanoConfig {
  appId: string;
  accessToken: string;
  cluster: string;
}

function readConfig(): VolcanoConfig | null {
  const appId = process.env.VOLCANO_APP_ID;
  const accessToken = process.env.VOLCANO_ACCESS_TOKEN;
  if (!appId || !accessToken) return null;
  return {
    appId,
    accessToken,
    cluster: process.env.VOLCANO_CLUSTER || "volcano_tts",
  };
}

// ---------------------------------------------------------------- ASR

export class VolcanoAsr implements AsrProvider {
  readonly kind = "volcano" as const;

  constructor(private readonly cfg: VolcanoConfig) {}

  async transcribe(input: AsrInput): Promise<AsrResult> {
    const reqId = crypto.randomUUID();

    const res = await fetch(ASR_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-App-Key": this.cfg.appId,
        "X-Api-Access-Key": this.cfg.accessToken,
        "X-Api-Resource-Id": "volc.bigasr.auc_turbo",
        "X-Api-Request-Id": reqId,
        "X-Api-Sequence": "-1",
      },
      body: JSON.stringify({
        user: { uid: "zongyitang" },
        audio: {
          format: guessFormat(input.mimeType),
          data: input.buffer.toString("base64"),
        },
        request: {
          model_name: "bigmodel",
          // 提供逝者常用词可显著提升专有名词识别率
          corpus: input.hint ? { context: JSON.stringify({ hotwords: [input.hint] }) } : undefined,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Volcano ASR ${res.status}`);

    const data = await res.json();
    const text: string = data?.result?.text ?? data?.result?.utterances?.[0]?.text ?? "";
    if (!text) throw new Error("Volcano ASR 返回空文本");

    const durationMs = data?.audio_info?.duration
      ? Number(data.audio_info.duration)
      : estimateAudioMsFallback(input.buffer.length);

    return {
      text,
      confidence: 0.95,
      durationMs,
      label: makeLabel("volcano", "bigmodel-asr"),
    };
  }
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
      },
      body: JSON.stringify({
        app: {
          appid: this.cfg.appId,
          token: this.cfg.accessToken,
          cluster: this.cfg.cluster,
        },
        user: { uid: "zongyitang" },
        audio: {
          voice_type: input.voiceId || "BV700_streaming",
          encoding: "mp3",
          speed_ratio: input.speed ?? 1.0,
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
      // 火山未直接返回时长，按文本估算；实际以播放器为准
      durationMs: estimateSpeechMs(input.text),
      label: makeLabel("volcano", `tts:${input.voiceId || "default"}`),
    };
  }
}

export function volcanoConfigAvailable(): boolean {
  return readConfig() !== null;
}

export function getVolcanoConfig(): VolcanoConfig | null {
  return readConfig();
}
