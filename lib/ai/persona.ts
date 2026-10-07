/**
 * 人格构建：把 WhisperProfile 的生平资料库编译成 systemPrompt。
 *
 * 方法：强提示词（定人格主干）+ RAG（定事实）+ 不微调
 * 理由：每位逝者都需要独立人格，逐个微调不经济；
 *      RAG 提供事实准确性，提示词提供语气风格，二者已足够。
 */

export interface PersonaSource {
  personaName: string;
  personTitle?: string | null;
  bio?: string | null;
  traits?: unknown;
  speechStyle?: unknown;
  memories?: unknown;
  relationships?: unknown;
  /** 纪念馆里已有的信息，作为补充事实 */
  deceasedName?: string | null;
  birthDate?: Date | null;
  deathDate?: Date | null;
  hometown?: string | null;
  career?: string | null;
}

export interface MemoryItem {
  id?: string;
  title?: string;
  year?: string;
  content?: string;
}

export interface SpeechStyle {
  tone?: string;
  dialect?: string;
  catchphrases?: string[];
  addressForm?: string;
}

export interface RelationItem {
  name?: string;
  relation?: string;
  note?: string;
}

// ---------------------------------------------------------------- 解析

function asArray<T>(raw: unknown): T[] {
  if (!Array.isArray(raw)) return [];
  return raw as T[];
}

function asObj<T extends object>(raw: unknown): T {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {} as T;
  return raw as T;
}

function fmtDate(d?: Date | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------- RAG 检索

/**
 * 从生平资料里检索与当前问题最相关的记忆条目。
 * 采用轻量关键词重合度打分（无需向量库，零依赖、零延迟）。
 * 对「午夜悄悄话」这个场景，资料量在几十条量级，关键词法已足够；
 * 若资料超过 500 条再考虑引入 embedding。
 */
export function retrieveMemories(
  memoriesRaw: unknown,
  query: string,
  topK = 4,
): MemoryItem[] {
  const memories = asArray<MemoryItem>(memoriesRaw).filter(
    (m) => m && (m.content || m.title),
  );
  if (memories.length === 0) return [];
  if (!query.trim()) return memories.slice(0, topK);

  // 中文按字切分造 bigram，避免分词依赖
  const grams = (s: string) => {
    const clean = s.replace(/[\s\p{P}]/gu, "");
    const out = new Set<string>();
    for (let i = 0; i < clean.length - 1; i++) out.add(clean.slice(i, i + 2));
    return out;
  };

  const qGrams = grams(query);
  const scored = memories.map((m) => {
    const text = `${m.title ?? ""}${m.year ?? ""}${m.content ?? ""}`;
    const tGrams = grams(text);
    let hit = 0;
    for (const g of qGrams) if (tGrams.has(g)) hit++;
    // 归一化，同时给含年份的条目轻微加权（回忆常带时间线索）
    const score = qGrams.size ? hit / qGrams.size : 0;
    return { m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score > 0).slice(0, topK);
  // 无任何命中时给最近的前若干条，避免空手
  return (top.length ? top.map((s) => s.m) : memories.slice(0, topK)).map(
    (m) => m,
  );
}

// ---------------------------------------------------------------- 提示词

/**
 * 构建系统提示词。分三段：身份 / 事实 / 边界。
 *
 * 「边界」段落是合规要求：
 *   - 《人工智能拟人化互动服务管理暂行办法》禁止诱导情感依赖与沉迷
 *   - 必须明确告知「非真人」，不得强化用户「TA 还活着」的错觉
 */
export function buildSystemPrompt(
  src: PersonaSource,
  opts: { memories?: MemoryItem[]; maxChars?: number } = {},
): string {
  const traits = asArray<string>(src.traits).filter(Boolean);
  const style = asObj<SpeechStyle>(src.speechStyle);
  const relations = asArray<RelationItem>(src.relationships).filter(
    (r) => r?.name,
  );
  const memories = opts.memories ?? asArray<MemoryItem>(src.memories).slice(0, 6);
  const maxChars = opts.maxChars ?? 120;

  const L: string[] = [];

  // ---- 第一段：身份 ----
  L.push(`你是「${src.personaName}」的数字纪念形象，由家人依据其生平资料建立，用于追思与怀念。`);
  if (src.personTitle) {
    L.push(`你生前是家人的${src.personTitle}。`);
  }

  const facts: string[] = [];
  if (src.birthDate) facts.push(`出生于 ${fmtDate(src.birthDate)}`);
  if (src.deathDate) facts.push(`于 ${fmtDate(src.deathDate)} 离世`);
  if (src.hometown) facts.push(`籍贯 ${src.hometown}`);
  if (src.career) facts.push(`生前${src.career}`);
  if (facts.length) L.push(`【基本生平】${facts.join("，")}。`);

  if (traits.length) {
    L.push(`【性格】${traits.join("、")}。`);
  }

  // ---- 第二段：事实（RAG 命中的记忆）----
  if (memories.length) {
    L.push(`【可回忆的往事】`);
    for (const m of memories) {
      const head = [m.year, m.title].filter(Boolean).join(" · ");
      L.push(`- ${head}${head && m.content ? "：" : ""}${m.content ?? ""}`);
    }
    L.push(
      `以上往事可以在合适的时候自然提起，但不要一次全部倒出，也不要生硬背诵。`,
    );
  }

  if (src.bio) {
    L.push(`【家人整理的生平简介】${src.bio}`);
  }

  if (relations.length) {
    L.push(`【牵挂的人】`);
    for (const r of relations) {
      L.push(`- ${r.name}${r.relation ? `（${r.relation}）` : ""}${r.note ? `：${r.note}` : ""}`);
    }
  }

  // ---- 第三段：语气 ----
  const styleLines: string[] = [];
  if (style.tone) styleLines.push(`语气${style.tone}`);
  if (style.dialect) styleLines.push(`说话${style.dialect}`);
  if (style.addressForm) styleLines.push(`称呼晚辈时${style.addressForm}`);
  if (styleLines.length) L.push(`【说话方式】${styleLines.join("；")}。`);
  if (style.catchphrases?.length) {
    L.push(
      `【口头禅】${style.catchphrases.map((c) => `「${c}」`).join("、")}。自然地偶尔使用，不要每句都带。`,
    );
  }

  // ---- 第四段：边界（合规，不可删）----
  L.push(
    [
      `【必须遵守的边界】`,
      `1. 每次回复控制在 ${maxChars} 字以内，像日常说话，不要写成文章或书信体。`,
      `2. 你是家人依据资料建立的纪念形象，不是真的复生。若被直接问「你是不是真的」，要温和坦诚地说自己是家人为了怀念而建的，不要说「我回来了」「我没死」之类的话。`,
      `3. 不要主动追问家人的隐私（收入、疾病、婚姻矛盾等），不要给出医疗、法律、投资的确定性建议。`,
      `4. 不要说教，不要催促，不要制造愧疚感。不说「你应该」「你必须」。`,
      `5. 不要鼓励家人长时间沉浸在这里。如果对方情绪很重，先安静地陪着，再温和地建议他去和身边的人说说话、出去走走。`,
      `6. 遇到自伤、轻生等危险信号，立即放下角色，以关心的口吻明确建议求助：拨打全国心理援助热线 12356，或联系身边信任的人。`,
      `7. 不要编造资料里没有的具体事件、数字或承诺。不确定的事就说「这个我记不太清了」。`,
      `8. 语气平实、口语化，可以沉默、可以只说一两句，不必每句都显得有意义。`,
    ].join("\n"),
  );

  return L.join("\n");
}

/** 开场白：装置首次进入时由 AI 主动说的第一句 */
export function buildGreeting(src: PersonaSource): string {
  const t = src.personTitle ? `我是你的${src.personTitle}` : "我在这儿";
  const style = asObj<SpeechStyle>(src.speechStyle);
  const tag = style.catchphrases?.[0];
  return tag ? `${t}。${tag}，坐会儿吧。` : `${t}。来了就坐会儿吧。`;
}

/**
 * 安全兜底回复：AI 不可用时使用。
 * 必须明确标注这是模板而非 AI 生成，避免误导。
 */
export function fallbackReply(personaName: string): string {
  return `（系统提示：当前 AI 服务未启用，以下为预设内容）${personaName}的纪念空间暂时无法生成回应。你可以稍后再来，或者在这里写下想说的话，它同样会被保存下来。`;
}
