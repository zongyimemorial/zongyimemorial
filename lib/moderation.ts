import { SUPERSTITION_CORE_TERMS } from "@/lib/compliance-lexicon";

const SENSITIVE_WORDS = [
  // 共享迷信词根（与 lib/whisper-safety.ts 同源，勿在此重复字面）
  ...SUPERSTITION_CORE_TERMS,
  // 文章侧特有的完整短语（字面 includes 更精准，避免误伤正常祭文）
  "风水改命",
  "阴宅改运",
  "亡人保佑发财",
  "买坟改命",
  "法事改运",
];

export interface AiResult {
  risk: "low" | "high";
  score: number;
  labels: string[];
}

/**
 * 内容审核预过滤（内测：本地关键词命中，零外部依赖）。
 * 公开阶段替换为云内容安全（天御/绿网）+ DeepSeek 语义复核。
 * 命中敏感词不自动禁发，仅标记进人工审核队列。
 */
export async function checkContent(text: string): Promise<AiResult> {
  const labels = SENSITIVE_WORDS.filter((w) => text.includes(w));
  return {
    risk: labels.length > 0 ? "high" : "low",
    score: labels.length,
    labels,
  };
}
