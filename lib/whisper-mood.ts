/**
 * 情感状态标记。
 *
 * 为什么需要它：规划方案把"察觉情绪、避免诱导依赖"作为合规要求之一。
 * 让来访者在进入对话前自选一个心情，有两个作用：
 *   1. 对话层可据心情调整开场语气（"今天有点想哭" vs "今天想跟您说件高兴事"）
 *   2. 回顾页可按心情聚合，家属能看到自己这段日子的情绪走向
 *      ——若长期集中在"自责""低落"，平台会给出温和的求助提示。
 *
 * 取值刻意保持粗粒度（6 档），避免变成情绪问卷。
 */

export type MoodKey = "calm" | "missing" | "grief" | "guilty" | "joyous" | "blank";

export interface MoodSpec {
  key: MoodKey;
  label: string;
  /** 用于对话层注入的语境描述 */
  hint: string;
  /** 是否属于需要关切的情绪（回顾页会提示求助渠道） */
  concerning: boolean;
}

export const MOODS: MoodSpec[] = [
  {
    key: "calm",
    label: "平静",
    hint: "来访者心情平静，只是想安静地说说话。语气可以温和日常，不必刻意安慰。",
    concerning: false,
  },
  {
    key: "missing",
    label: "想念",
    hint: "来访者很想念你。可以多说一点过去共同经历的具体细节，让对方感到被记得。",
    concerning: false,
  },
  {
    key: "grief",
    label: "难过",
    hint: "来访者今天情绪低落、可能刚哭过。语气放轻，先承接情绪，不急着讲道理或转移话题。",
    concerning: true,
  },
  {
    key: "guilty",
    label: "自责",
    hint: "来访者心里有愧疚，可能觉得生前陪伴不够。不要替对方开脱式地否定这种感受，而是像长辈那样宽厚地回应。",
    concerning: true,
  },
  {
    key: "joyous",
    label: "有喜事",
    hint: "来访者有高兴的事想告诉你，希望你能一起高兴。语气可以轻快一些，多回应细节。",
    concerning: false,
  },
  {
    key: "blank",
    label: "说不上来",
    hint: "来访者也说不清自己的心情。可以温和地开个头，给对方一个容易接的话题。",
    concerning: false,
  },
];

const MOOD_MAP = new Map(MOODS.map((m) => [m.key, m]));

export function moodSpec(key: string | null | undefined): MoodSpec | null {
  if (!key) return null;
  return MOOD_MAP.get(key as MoodKey) ?? null;
}

export function moodLabel(key: string | null | undefined): string {
  return moodSpec(key)?.label ?? "未记录";
}

/** 某轮对话是否应注入"关切情绪"提示（用于回顾页聚合统计） */
export function isConcerningMood(key: string | null | undefined): boolean {
  return moodSpec(key)?.concerning ?? false;
}
