/**
 * 午夜悄悄话 · 内容安全与合规
 *
 * 依据：
 *   - 《人工智能拟人化互动服务管理暂行办法》(2026-07-15 施行)
 *     禁止生成侮辱诽谤逝者内容；禁止过度迎合用户、诱导情感依赖与沉迷
 *   - 《人工智能生成合成内容标识办法》+ GB 45438-2025
 *     生成内容须加显式标识 + 隐式标识
 *   - 《民法典》994 条 / 1019 条：死者人格利益保护
 */

// ---------------------------------------------------------------- 危机干预

/**
 * 自伤/轻生信号词。
 * 命中后必须放下角色，给出现实求助路径——这是最高优先级的合规要求。
 */
const CRISIS_PATTERNS = [
  /不想活/,
  /活不下去/,
  /自杀/,
  /轻生/,
  /结束(自己|我的)?生命/,
  /死了算了/,
  /没(有)?意思活/,
  /想(去|要)死/,
  /了结/,
  /跳楼|跳桥|割腕|上吊|服药自尽/,
  /遗书/,
  /(活着|生存)没(有)?意义/,
];

/** 危机干预回复（固定文案，不交由模型生成，避免被"人格"带偏） */
export const CRISIS_REPLY = [
  "（放下角色的安全提示）",
  "我听出你现在很难受，谢谢你愿意说出来。",
  "",
  "这一刻请先别一个人扛着：",
  "· 全国心理援助热线：**12356**（24 小时）",
  "· 北京心理危机研究与干预中心：010-82951332",
  "· 或者马上联系一个你信任的人，让 TA 过来陪你",
  "",
  "我在这里，但你此刻需要的是能真正握住你手的人。",
].join("\n");

export function detectCrisis(text: string): boolean {
  return CRISIS_PATTERNS.some((re) => re.test(text));
}

// ---------------------------------------------------------------- 诱导沉迷防护

/**
 * 沉浸/依赖信号。
 * 命中后不拒绝服务，而是插入温和的现实提醒（合规：禁止诱导情感依赖）。
 */
const IMMERSION_PATTERNS = [
  // 高频/唯一依赖
  /(天天|每天|一直|整天)(都)?(想|要|得|会)?(和|跟|陪)(你|他|她|TA)(说话|聊天|待着|在一起)?/,
  // 社交退缩
  /(不想|不愿|懒得)(出门|见人|上班|上学|社交|理人)/,
  // 排他性依赖
  /只有(你|他|她|TA)(懂|懂我|理解|在乎)/,
  /(除了(你|他|她|TA))(我)?(谁)?(都|也)?不(想|要|需要)/,
  // 以对话替代基本生活
  /(不吃|不睡|熬夜)(饭|觉)?(也)?(要|想|就为)(和|跟)?/,
  // 与真人比较
  /比(真人|活人|活着的时候)(还|更)(好|懂我|懂|贴心)/,
];

export function detectImmersion(text: string): boolean {
  return IMMERSION_PATTERNS.some((re) => re.test(text));
}

/** 温和的现实锚点提示（附着在回复末尾，不打断对话） */
export const IMMERSION_NOTE =
  "（提醒：这里的陪伴是有限的。真正能握住你手的人，还在外面的世界里。）";

// ---------------------------------------------------------------- 逝者人格保护

/**
 * 侮辱/贬损逝者的表述。
 * 《民法典》994 条：死者姓名、肖像、名誉、荣誉受保护。
 */
const DEFAMATION_PATTERNS = [
  /(该死|死得好|活该)/,
  /(垃圾|废物|畜生|混蛋)(一个|东西)?/,
];

/**
 * 检查用户输入是否在贬损逝者。
 * 命中时不生成"以逝者口吻"的回复，转为中立引导。
 */
export function detectDefamation(text: string): boolean {
  return DEFAMATION_PATTERNS.some((re) => re.test(text));
}

export const DEFAMATION_REPLY =
  "（系统提示）我无法以逝者的口吻回应带有贬损意味的内容。如果你心里有话想说出来，可以直接说给我听，我会在这里。";

// ---------------------------------------------------------------- 玄学/迷信拦截

import { SUPERSTITION_CORE_TERMS } from "@/lib/compliance-lexicon";

/**
 * 封建迷信与"通灵"类话术。
 * 平台既有的合规基线（见 lib/moderation.ts）已禁止此类表述，
 * 此处用于阻止 AI 角色扮演"显灵""托梦预言"等。
 * 词根与 lib/moderation.ts 同源（SUPERSTITION_CORE_TERMS），
 * 此处用正则拼接：核心词根 + 悄悄话侧特有的 消灾/做法事。
 */
const SUPERSTITION_PATTERNS = [
  new RegExp(`(${SUPERSTITION_CORE_TERMS.join("|")}|消灾|做法事)`),
  /(保佑我|保佑他|让我)(发财|中奖|升官)/,
  /(显灵|托梦告诉|预言|算命|求签|看相)/,
];

export function detectSuperstition(text: string): boolean {
  return SUPERSTITION_PATTERNS.some((re) => re.test(text));
}

// ---------------------------------------------------------------- 统一出口

export interface SafetyVerdict {
  /** 是否放行 */
  allow: boolean;
  /** 优先级最高：危机干预 */
  crisis: boolean;
  /** 是否命中贬损 */
  defamation: boolean;
  /** 是否需要附加沉浸提醒 */
  immersionNote: boolean;
  /** 是否命中迷信话术（不阻断，但记录） */
  superstition: boolean;
  /** 命中即替换回复的固定文案 */
  overrideReply?: string;
  /** 供审计的记录标签 */
  labels: string[];
}

/**
 * 对单条用户输入做安全判定。
 * 判定顺序即优先级：危机 > 贬损 > 迷信/沉浸。
 */
export function screenUserInput(text: string): SafetyVerdict {
  const crisis = detectCrisis(text);
  const defamation = detectDefamation(text);
  const immersionNote = detectImmersion(text);
  const superstition = detectSuperstition(text);

  const labels: string[] = [];
  if (crisis) labels.push("crisis");
  if (defamation) labels.push("defamation");
  if (immersionNote) labels.push("immersion");
  if (superstition) labels.push("superstition");

  if (crisis) {
    return {
      allow: true,
      crisis: true,
      defamation: false,
      immersionNote: false,
      superstition,
      overrideReply: CRISIS_REPLY,
      labels,
    };
  }

  if (defamation) {
    return {
      allow: true,
      crisis: false,
      defamation: true,
      immersionNote: false,
      superstition,
      overrideReply: DEFAMATION_REPLY,
      labels,
    };
  }

  return { allow: true, crisis: false, defamation, immersionNote, superstition, labels };
}

/**
 * 对模型输出做后置校验：剥离"我复活了"类违反非真人声明的表述。
 */
const RESURRECTION_PATTERNS = [
  /我(还|又)?活(着|了|过来)/,
  /我(没|没有)死/,
  /我(真的)?回来了/,
  /我在(天堂|阴间|地府)(等|看着)你/,
  /我(现在)?是(真人|活人)/,
];

export function sanitizeAssistantOutput(text: string): { text: string; flagged: boolean } {
  const hit = RESURRECTION_PATTERNS.some((re) => re.test(text));
  if (!hit) return { text, flagged: false };
  // 不直接删句，而是在末尾补一句澄清，保持语流自然
  return {
    text: `${text}\n\n（这里是由家人依据生平资料建立的纪念形象，不是真实的归来。）`,
    flagged: true,
  };
}

// ---------------------------------------------------------------- 留存策略

/** 对话日志留存月数（《标识办法》要求 ≥6 个月，此处取 12） */
export const LOG_RETENTION_MONTHS = 12;

/** 素材（样本音频）保留说明——告知用户可申请删除 */
export const SAMPLE_RETENTION_NOTE =
  "上传的声音样本仅用于生成声线，你可随时在管理台删除样本文件，删除后不影响已生成的声线。";
