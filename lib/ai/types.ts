/**
 * 午夜悄悄话 · AI 能力抽象层
 *
 * 三层能力各自定义接口，实现可替换：
 *   - AsrProvider  语音识别（录音 → 文字）
 *   - LlmProvider  大模型对话（消息 + 人格 → 回复）
 *   - TtsProvider  语音合成（文字 → 音频）
 *
 * 设计原则（沿用 lib/ai.ts 的既有范式）：
 *   1. 未配置 API Key 时回退 Mock 实现，全流程必须能跑通，绝不阻塞
 *   2. 所有外部调用带超时（AbortSignal.timeout）
 *   3. 任何异常都回退 Mock，不让用户看到 500
 */

// ---------------------------------------------------------------- 通用

/** 供应商类型 */
export type ProviderKind = "mock" | "deepseek" | "ark" | "volcano" | "cosyvoice";

/** 对话消息（与 OpenAI 兼容格式一致） */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 生成结果的溯源标签（写入 WhisperMessage.aiLabel，属于隐式标识） */
export interface EngineLabel {
  provider: string;
  model: string;
  at: string; // ISO 时间戳
}

/** 统一的 AI 调用错误，便于上层区分「配置缺失」与「真实故障」 */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

// ---------------------------------------------------------------- ASR

export interface AsrInput {
  /** 音频二进制 */
  buffer: Buffer;
  /** MIME 类型，如 audio/webm、audio/mpeg */
  mimeType: string;
  /** 提示词：提供逝者常用词可提升识别率 */
  hint?: string;
}

export interface AsrResult {
  text: string;
  /** 识别置信度 0–1，Mock 返回 0.9 */
  confidence: number;
  /** 音频时长（毫秒），用于配额扣减 */
  durationMs: number;
  label: EngineLabel;
}

export interface AsrProvider {
  readonly kind: ProviderKind;
  transcribe(input: AsrInput): Promise<AsrResult>;
}

// ---------------------------------------------------------------- LLM

export interface LlmInput {
  messages: ChatMessage[];
  /** 人格系统提示词（由 lib/ai/persona.ts 构建） */
  systemPrompt: string;
  /** 采样温度：追思场景偏低（0.6–0.8），保证人格稳定 */
  temperature?: number;
  /** 单次回复字数上限的软约束（写进提示词） */
  maxChars?: number;
}

export interface LlmResult {
  text: string;
  label: EngineLabel;
  /** token 用量，用于成本核算 */
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LlmProvider {
  readonly kind: ProviderKind;
  chat(input: LlmInput): Promise<LlmResult>;
  /** 流式输出：逐块产出文本增量 */
  chatStream(input: LlmInput): AsyncGenerator<string, LlmResult, void>;
}

// ---------------------------------------------------------------- TTS

export interface TtsInput {
  text: string;
  /**
   * 声线标识。
   * - mock 实现下用于选择合成"音色描述"
   * - 真实实现下为 providerVoiceId
   */
  voiceId?: string;
  /** 语速倍率，1.0 为正常；追思场景默认偏慢(0.92)以降低机械感 */
  speed?: number;
  /** 情绪：neutral / happy / sad（火山大模型音色支持，其余值被静默忽略） */
  emotion?: string;
}

export interface TtsResult {
  /** 音频二进制。Mock 返回一段极小的静音 WAV，供前端 <audio> 正常播放 */
  buffer: Buffer;
  mimeType: string;
  /** 估算时长（毫秒），用于配额扣减 */
  durationMs: number;
  label: EngineLabel;
}

export interface TtsProvider {
  readonly kind: ProviderKind;
  synthesize(input: TtsInput): Promise<TtsResult>;
}

// ---------------------------------------------------------------- 工具

/** 构造溯源标签 */
export function makeLabel(provider: string, model: string): EngineLabel {
  return { provider, model, at: new Date().toISOString() };
}

/** 把标签渲染成单行字符串，写入 aiLabel 字段（隐式标识） */
export function formatLabel(label: EngineLabel): string {
  return `AI 生成 · ${label.provider}/${label.model} · ${label.at}`;
}

/**
 * 估算中文文本的朗读时长（毫秒）。
 * 中文播报约 4 字/秒，叠加标点停顿。
 * 准确值应由 TTS 供应商返回；此处用于 Mock 与配额预扣。
 */
export function estimateSpeechMs(text: string): number {
  const chars = text.replace(/\s/g, "").length;
  const pauses = (text.match(/[，。！？；：、,.!?;:]/g) ?? []).length;
  return Math.round((chars / 4) * 1000 + pauses * 180);
}
