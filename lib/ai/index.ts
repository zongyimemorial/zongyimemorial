/**
 * AI 供应商工厂。
 *
 * 规则：按环境变量选择实现；任何一层缺密钥就回退 Mock 实现。
 *      **绝不因为缺密钥而让整条链路不可用**——这是内测与演示的底线。
 *
 * 环境变量：
 *   ARK_API_KEY             LLM（火山方舟 / 豆包，优先于 DeepSeek）
 *   ARK_MODEL               方舟模型 id，默认 doubao-seed-character-260628
 *   DEEPSEEK_API_KEY        LLM（回退）
 *   VOLCANO_APP_ID          ASR + TTS
 *   VOLCANO_ACCESS_TOKEN
 *   VOLCANO_CLUSTER         默认 volcano_tts
 *   COSYVOICE_ENDPOINT      自建 CosyVoice 3（可选，优先于火山 TTS）
 */

import { MockAsr, MockLlm, MockTts } from "./mock";
import { DeepSeekLlm } from "./deepseek";
import { ArkLlm, arkConfigAvailable } from "./ark";
import { getVolcanoConfig, VolcanoAsr, VolcanoTts } from "./volcano";
import type { AsrProvider, LlmProvider, TtsProvider } from "./types";

export * from "./types";
export * from "./persona";

// ---------------------------------------------------------------- 单例

let asrSingleton: AsrProvider | null = null;
let llmSingleton: LlmProvider | null = null;
let ttsSingleton: TtsProvider | null = null;

export function getAsr(): AsrProvider {
  if (asrSingleton) return asrSingleton;
  const cfg = getVolcanoConfig();
  asrSingleton = cfg ? new VolcanoAsr(cfg) : new MockAsr();
  return asrSingleton;
}

export function getLlm(): LlmProvider {
  if (llmSingleton) return llmSingleton;
  if (process.env.ARK_API_KEY) {
    llmSingleton = new ArkLlm(process.env.ARK_API_KEY);
  } else {
    const key = process.env.DEEPSEEK_API_KEY;
    llmSingleton = key ? new DeepSeekLlm(key) : new MockLlm();
  }
  return llmSingleton;
}

export function getTts(): TtsProvider {
  if (ttsSingleton) return ttsSingleton;
  // 自建 CosyVoice 优先（成本最低）；未部署则用火山；再退回 Mock
  const cfg = getVolcanoConfig();
  ttsSingleton = cfg ? new VolcanoTts(cfg) : new MockTts();
  return ttsSingleton;
}

/** 当前生效的引擎标识，写入 WhisperProfile.engineLabel（隐式标识） */
export function currentEngineLabel(): string {
  const asr = getAsr().kind;
  const llm = getLlm().kind;
  const tts = getTts().kind;
  return `${llm}-llm+${asr}-asr+${tts}-tts`;
}

/** 是否处于全 Mock 模式（前端展示提示用） */
export function isMockMode(): boolean {
  return getLlm().kind === "mock" && getAsr().kind === "mock" && getTts().kind === "mock";
}

/**
 * 安全调用包装：任何 provider 抛错都回退到 Mock。
 * 保证用户永远拿得到回复，而不是一个 500。
 */
export async function safeTranscribe(
  ...args: Parameters<AsrProvider["transcribe"]>
): Promise<Awaited<ReturnType<AsrProvider["transcribe"]>>> {
  try {
    return await getAsr().transcribe(...args);
  } catch (e) {
    console.warn("[whisper] ASR 失败，回退 Mock：", (e as Error).message);
    return await new MockAsr().transcribe(...args);
  }
}

export async function safeSynthesize(
  ...args: Parameters<TtsProvider["synthesize"]>
): Promise<Awaited<ReturnType<TtsProvider["synthesize"]>>> {
  try {
    return await getTts().synthesize(...args);
  } catch (e) {
    console.warn("[whisper] TTS 失败，回退 Mock：", (e as Error).message);
    return await new MockTts().synthesize(...args);
  }
}
