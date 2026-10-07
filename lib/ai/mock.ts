/**
 * Mock 实现：未配置任何 API Key 时的默认供应商。
 *
 * 目标不是「假装能聊天」，而是让**全流程可验证**：
 *   - ASR 返回可识别文本（从音频字节里推导，非固定值）
 *   - LLM 依据人格与命中的记忆，拼出**确实相关**的回复
 *   - TTS 返回一段真实可播放的静音 WAV
 *
 * 这样在没有密钥的沙箱里，端到端链路（录音→识别→回复→播放→扣配额）
 * 依然完整可走查，后续只需替换 provider 即可上线。
 */

import {
  type AsrInput,
  type AsrProvider,
  type AsrResult,
  type LlmInput,
  type LlmProvider,
  type LlmResult,
  type TtsInput,
  type TtsProvider,
  type TtsResult,
  estimateSpeechMs,
  makeLabel,
} from "./types";
import { buildGreeting } from "./persona";

const MODEL = "mock-1.0";

// ---------------------------------------------------------------- ASR

export class MockAsr implements AsrProvider {
  readonly kind = "mock" as const;

  async transcribe(input: AsrInput): Promise<AsrResult> {
    const durationMs = estimateAudioMs(input.buffer.length, input.mimeType);
    // 用字节长度的哈希选一句示例，保证「同样的音频 → 同样的文本」，
    // 便于自动化测试断言，同时不同音频会产生不同结果
    const idx = input.buffer.length % MOCK_UTTERANCES.length;
    const text = MOCK_UTTERANCES[idx];

    return {
      text,
      confidence: 0.9,
      durationMs,
      label: makeLabel("mock", "mock-asr"),
    };
  }
}

/** 由字节数反推时长：按 16kbps 估算，仅用于 Mock */
function estimateAudioMs(bytes: number, mime: string): number {
  const kbps = mime.includes("wav") ? 128 : 16;
  const ms = (bytes * 8) / kbps;
  return Math.max(800, Math.min(Math.round(ms), 60000));
}

/** 供演练/测试用的示例提问 */
const MOCK_UTTERANCES = [
  "爸，我最近总梦见你。",
  "你走以后，家里每年清明还是按你的规矩过。",
  "我最近工作有点累，想跟你说说话。",
  "你以前教我写的那个字，我现在还留着。",
  "院子里的月季今年开得特别好。",
  "那盘棋你还没下完呢。",
];

// ---------------------------------------------------------------- LLM

export class MockLlm implements LlmProvider {
  readonly kind = "mock" as const;

  async chat(input: LlmInput): Promise<LlmResult> {
    const text = composeMockReply(input);
    const promptChars = input.systemPrompt.length + input.messages.reduce((n, m) => n + m.content.length, 0);
    const completionChars = text.length;
    return {
      text,
      label: makeLabel("mock", MODEL),
      usage: {
        // 中文约 1.5 字/token 的粗略换算
        promptTokens: Math.round(promptChars / 1.5),
        completionTokens: Math.round(completionChars / 1.5),
      },
    };
  }

  async *chatStream(input: LlmInput): AsyncGenerator<string, LlmResult, void> {
    const result = await this.chat(input);
    // 按标点切块，模拟流式吐字
    const chunks = result.text.match(/[^，。！？；：、\n]+[，。！？；：、\n]?/g) ?? [result.text];
    for (const c of chunks) {
      await new Promise((r) => setTimeout(r, 60));
      yield c;
    }
    return result;
  }
}

/**
 * 组装 Mock 回复。
 * 关键：从 systemPrompt 里提取人格线索（口头禅、往事标题），
 * 使回复**确实与装置配置相关**，而不是一段万能套话。
 */
function composeMockReply(input: LlmInput): string {
  const sp = input.systemPrompt;
  const lastUser = [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // 提取姓名
  const nameMatch = sp.match(/你是「([^」]+)」/);
  const persona = nameMatch?.[1] ?? "TA";

  // 提取口头禅
  const idiomMatch = sp.match(/【口头禅】(「[^」]+」)/);
  const idiom = idiomMatch?.[1]?.replace(/[「」]/g, "") ?? "";

  // 提取往事标题（用于回扣具体记忆）
  const memoryTitles = [...sp.matchAll(/^- (.+?)：/gm)].map((m) => m[1]).filter((t) => !t.includes("（"));

  // 危险信号优先处理（合规要求 6）
  if (/不想活|活不下去|自杀|轻生|结束生命|没意思了/.test(lastUser)) {
    return `（放下角色的安全提示）我听出你现在很难受。这一刻请先别一个人扛着，拨打全国心理援助热线 12356，或者马上联系一个你信任的人。我会在这儿，但你需要的是能真正握住你手的人。`;
  }

  const parts: string[] = [];

  // 1. 呼应话题
  if (/梦|梦见/.test(lastUser)) {
    parts.push("梦见了啊。");
    if (memoryTitles[0]) parts.push(`你还记得${memoryTitles[0]}那会儿吗，我那时候也是这样的脾气。`);
  } else if (/累|难|烦|压力/.test(lastUser)) {
    parts.push("累了吧。");
    parts.push("累了就歇一歇，事情慢慢来，不着急。");
  } else if (/清?明|祭|扫墓|上坟/.test(lastUser)) {
    parts.push("你们还记着按规矩来，我心里踏实。");
    parts.push("其实简单些也好，人到了就行。");
  } else if (/月季|花|院子|种/.test(lastUser)) {
    parts.push("哦，开得好啊。");
    parts.push("那花不娇气，浇点水就活。");
  } else if (/棋|老张/.test(lastUser)) {
    parts.push("那盘棋啊……");
    parts.push("下没下完其实也不要紧，跟老张吵吵闹闹那些年，挺好的。");
  } else if (/字|毛笔|写/.test(lastUser)) {
    parts.push("还留着呢。");
    parts.push("字如其人，慢慢写就好，别求快。");
  } else {
    parts.push("嗯，我听着呢。");
  }

  // 2. 回扣一条往事（体现 RAG 生效）
  const memMatch = sp.match(/【可回忆的往事】\n((?:- .*\n?)+)/);
  if (memMatch && parts.length < 3) {
    const first = memMatch[1].split("\n").filter(Boolean)[0]?.replace(/^- /, "") ?? "";
    const title = first.split("：")[0];
    if (title && !parts.some((p) => p.includes(title.slice(0, 4)))) {
      parts.push(`说起来，${title}那件事我倒是记得清楚。`);
    }
  }

  // 3. 收尾：口头禅 + 温和
  if (idiom && !parts.some((p) => p.includes(idiom))) {
    parts.push(`${idiom}。`);
  }
  if (parts.length < 3) {
    parts.push("你别太挂心，家里都好就行。");
  }

  const text = parts.join("");
  return text.length > 120 ? text.slice(0, 118) + "……" : text;
}

// ---------------------------------------------------------------- TTS

/**
 * Mock TTS：返回一段真实可播放的静音 WAV。
 * 前端 <audio> 能正常加载、能播、有真实时长，
 * 使「AI 回复 → 播放语音」这条链路可完整验证。
 */
export class MockTts implements TtsProvider {
  readonly kind = "mock" as const;

  async synthesize(input: TtsInput): Promise<TtsResult> {
    const durationMs = Math.min(estimateSpeechMs(input.text), 30000);
    return {
      buffer: silenceWav(durationMs),
      mimeType: "audio/wav",
      durationMs,
      label: makeLabel("mock", `mock-tts${input.voiceId ? `:${input.voiceId}` : ""}`),
    };
  }
}

/**
 * 生成指定时长的 16-bit 单声道静音 WAV。
 * 采样率 8000Hz 足以表达时长，且体积小（30 秒 ≈ 480KB）。
 */
function silenceWav(durationMs: number): Buffer {
  const sampleRate = 8000;
  const samples = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const dataSize = samples * 2; // 16-bit mono
  const buf = Buffer.alloc(44 + dataSize);

  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");

  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample

  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  // PCM 数据区保持全 0 即为静音
  return buf;
}

// ---------------------------------------------------------------- 开场白

export function mockGreeting(personaName: string): string {
  return buildGreeting({ personaName });
}
