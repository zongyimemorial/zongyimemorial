/**
 * 午夜悄悄话 · 装置服务层
 *
 * 职责：把「资料库 → 人格 → AI 调用 → 安全校验 → 配额扣减 → 日志留存」
 *      串成一条可复用的链路，供 API 路由与 Server Action 共用。
 */

import { prisma } from "@/lib/db";
import {
  getLlm,
  buildSystemPrompt,
  buildGreeting,
  retrieveMemories,
  currentEngineLabel,
  formatLabel,
  safeTranscribe,
  safeSynthesize,
  isMockMode,
  type ChatMessage,
} from "@/lib/ai/index";
import { consumeRound, buildAiLabel, type QuotaSnapshot } from "@/lib/whisper";
import {
  screenUserInput,
  sanitizeAssistantOutput,
  IMMERSION_NOTE,
} from "@/lib/whisper-safety";
import { currentFestival } from "@/lib/festivals";
import { moodSpec, isConcerningMood, moodLabel } from "@/lib/whisper-mood";

// ---------------------------------------------------------------- 类型

export interface TalkResult {
  ok: true;
  /** AI 回复文本 */
  reply: string;
  /** 回复语音的公开 URL（若请求了语音） */
  audioUrl?: string;
  /** 隐式标识（供前端展示与审计） */
  aiLabel: string;
  /** 是否需要展示情绪提示 */
  immersionNote: boolean;
  /** 是否命中危机干预 */
  crisis: boolean;
  /** 回复后剩余配额 */
  quota: QuotaSnapshot;
  /** 本轮消耗分钟 */
  minutes: number;
  /** 当前是否运行在 Mock 模式（前端提示用） */
  mockMode: boolean;
}

export type TalkFailure = {
  ok: false;
  code: "not_found" | "disabled" | "no_consent" | "quota" | "error";
  message: string;
};

// ---------------------------------------------------------------- 加载装置

export interface LoadedProfile {
  id: string;
  ownerUserId: string;
  personaName: string;
  personTitle: string | null;
  bio: string | null;
  traits: unknown;
  speechStyle: unknown;
  memories: unknown;
  relationships: unknown;
  systemPrompt: string | null;
  voiceId: string | null;
  mode: string;
  enabled: boolean;
  status: string;
  hallId: string;
  hall: { name: string; deceasedName: string; birthDate: Date | null; deathDate: Date | null };
  consent: { id: string; revokedAt: Date | null } | null;
}

export async function loadProfileByHall(hallId: string): Promise<LoadedProfile | null> {
  return (await prisma.whisperProfile.findUnique({
    where: { hallId },
    include: {
      hall: {
        select: { name: true, deceasedName: true, birthDate: true, deathDate: true },
      },
      consent: { select: { id: true, revokedAt: true } },
    },
  })) as LoadedProfile | null;
}

export async function loadProfile(id: string): Promise<LoadedProfile | null> {
  return (await prisma.whisperProfile.findUnique({
    where: { id },
    include: {
      hall: {
        select: { name: true, deceasedName: true, birthDate: true, deathDate: true },
      },
      consent: { select: { id: true, revokedAt: true } },
    },
  })) as LoadedProfile | null;
}

/**
 * 语音合成前清洗：去掉（沉默片刻）（轻笑）这类舞台指示与情绪标注，
 * 只让 TTS 朗读真正的对话内容——否则合成音会把括号描述一并念出来。
 * 若清洗后为空（整条都是指示），回退原文。
 */
export function toSpeakableText(text: string): string {
  const stripped = text
    .replace(/[（(][^（）()]*[）)]/g, "") // 全角/半角括号内的舞台指示
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return stripped || text;
}

/**
 * 语音语速微调：追思场景偏慢(0.92)更松弛自然，弱化"字正腔圆念字"的机械感。
 * 与 lib/ai/volcano.ts 的 DEFAULT_SPEED 保持一致（单一取值来源）。
 */
export const TTS_SPEED = 0.92;

/**
 * 从回复原文（含括号舞台指示）推断火山 TTS 情绪参数。
 * 让合成音带上 AI 此刻表达的情绪——笑意明亮、哀婉低回、其余平静温暖，
 * 直接消除"机械念字"的扁平感。
 * 仅返回火山支持的枚举（neutral/happy/sad），其余回落 neutral。
 *
 * 注意：必须传入【剥离前】的原文，括号里的舞台指示正是情绪线索来源。
 */
export function deriveEmotion(raw: string): string {
  const s = raw || "";
  if (/(轻笑|笑出声|忍俊|扑哧|打趣|逗趣|调侃|打哈哈|玩笑)/.test(s)) return "happy";
  if (/(沉默|叹气|哽咽|红了眼眶|鼻酸|垂眸|失落|难过|心疼|落泪|潸然|黯然|低声|柔声|轻叹)/.test(s)) return "sad";
  return "neutral";
}

/**
 * 把装置绑定的音色记录 ID（WhisperVoice.id）解析成供应商音色 ID。
 * profile.voiceId 存的是数据库行 ID，直接传给 TTS 会被拒（403），
 * 必须先取出 WhisperVoice.providerVoiceId（如 preset-male-warm / 火山音色 ID）。
 */
export async function resolveTtsVoiceId(voiceId?: string | null): Promise<string | undefined> {
  if (!voiceId) return undefined;
  const v = await prisma.whisperVoice.findUnique({
    where: { id: voiceId },
    select: { providerVoiceId: true },
  });
  return v?.providerVoiceId ?? undefined;
}

/**
 * 门禁检查：装置是否可对话。
 * 三道闸：已启用 → 未撤回授权 → 有授权记录。
 */
export function gateProfile(
  p: LoadedProfile | null,
): { ok: true } | TalkFailure {
  if (!p) {
    return { ok: false, code: "not_found", message: "追思装置不存在。" };
  }
  if (!p.enabled || p.status !== "active") {
    return {
      ok: false,
      code: "disabled",
      message: "该追思装置尚未通过审核开启。",
    };
  }
  if (!p.consent || p.consent.revokedAt) {
    return {
      ok: false,
      code: "no_consent",
      message: "尚未完成家属授权，或授权已被撤回。追思对话需先完成授权。",
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- 人格构建

/**
 * 为某个装置构建 systemPrompt。
 * 优先使用人工编辑过的版本；否则即时生成（带 RAG 检索）。
 *
 * 节日语境（P0）：当前处于节日前后 2 天窗口时，在人格提示词之后追加
 * 「今日节气」段——让对话自然带一点时令感（清明/中元/除夕等日子的来访，
 * 家人多半正是为了这个日子而来）。注入在人工版本之后而非替代之，
 * 保证馆主手写的人格设定始终完整。
 */
export function composeSparkPrompt(
  p: LoadedProfile,
  query: string,
  mood?: string | null,
): string {
  const base =
    p.systemPrompt && p.systemPrompt.trim()
      ? p.systemPrompt
      : buildSystemPrompt(
          {
            personaName: p.personaName,
            personTitle: p.personTitle,
            bio: p.bio,
            traits: p.traits,
            speechStyle: p.speechStyle,
            memories: p.memories,
            relationships: p.relationships,
            deceasedName: p.hall.deceasedName,
            birthDate: p.hall.birthDate,
            deathDate: p.hall.deathDate,
          },
          { memories: retrieveMemories(p.memories, query, 4) },
        );

  const parts = [base];

  // 情感状态注入（C2）：让开场语气贴合来访者此刻的心情
  const moodHint = moodSpec(mood)?.hint;
  if (moodHint) {
    parts.push(`【来访者此刻的心情】${moodHint}`);
  }

  const festival = currentFestival();
  if (festival) {
    parts.push(
      `【今日节气】现在是${festival.spec.name}（${festival.spec.whisperTheme.badge}）。${festival.spec.whisperTheme.prompt}`,
    );
  }

  return parts.join("\n");
}

/** 当前节日语境（供前端渲染节日徽章）；不在节日窗口时为 null */
export function festivalBadge() {
  const f = currentFestival();
  return f ? { name: f.spec.name, badge: f.spec.whisperTheme.badge } : null;
}

export function greetingFor(p: LoadedProfile): string {
  return buildGreeting({
    personaName: p.personaName,
    personTitle: p.personTitle,
    speechStyle: p.speechStyle,
  });
}

// ---------------------------------------------------------------- 核心对话

export interface TalkParams {
  profile: LoadedProfile;
  userId: string;
  /** 用户输入文本（文字模式直接给，语音模式由 ASR 产出） */
  text: string;
  /** 是否合成本轮回复的语音 */
  wantVoice: boolean;
  /** 会话 id，不传则新建 */
  sessionId?: string;
  /** 对话历史（最近 N 轮，控制上下文长度与成本） */
  history?: ChatMessage[];
  /** 情感状态标记（来访者自选心情），仅首轮落库 */
  mood?: string | null;
  /** 心情补充说明 */
  moodNote?: string | null;
}

/** 保留的上下文轮数——过长的历史既贵又容易让人格漂移 */
const MAX_HISTORY = 8;

export async function talk(params: TalkParams): Promise<TalkResult | TalkFailure> {
  const { profile: p, userId, text, wantVoice } = params;

  // ---- 1. 安全前置检查 ----
  const verdict = screenUserInput(text);

  // ---- 2. 配额 ----
  // 语音模式先按估算扣分钟；危机干预不消耗配额（不能因为没额度就不给求助）
  const estMinutes = wantVoice ? Math.max(1, Math.round(text.length / 240)) : 0;

  let quotaAfter: QuotaSnapshot | null = null;
  let consumedMinutes = 0;

  if (!verdict.crisis) {
    const consumed = await consumeRound(userId, {
      minutes: estMinutes,
      isVoice: wantVoice,
    });
    if (!consumed.ok) {
      return { ok: false, code: "quota", message: consumed.message };
    }
    quotaAfter = consumed.snapshot;
    consumedMinutes = estMinutes;
  } else {
    // 危机场景：跳过配额，直接给求助信息
    const { getQuota } = await import("@/lib/whisper");
    quotaAfter = await getQuota(userId);
  }

  // ---- 3. 生成回复 ----
  let replyText: string;
  let flagged = false;

  if (verdict.overrideReply) {
    // 危机 / 贬损：用固定文案，不交给模型（避免被"人格"带偏）
    replyText = verdict.overrideReply;
    flagged = true;
  } else {
    const systemPrompt = composeSparkPrompt(p, text, params.mood);
    const history = (params.history ?? []).slice(-MAX_HISTORY);

    try {
      const llm = getLlm();
      const r = await llm.chat({
        systemPrompt,
        messages: [...history, { role: "user", content: text }],
        temperature: 0.75,
      });
      replyText = r.text || "……（沉默）";
    } catch (e) {
      console.warn("[whisper] LLM 失败：", (e as Error).message);
      replyText = "我这边刚刚有点走神，你再说一遍好吗？";
      flagged = true;
    }

    // 输出后置校验：剥离"我复活了"类表述
    const sanitized = sanitizeAssistantOutput(replyText);
    replyText = sanitized.text;
    if (sanitized.flagged) flagged = true;
  }

  // ---- 4. 沉浸提示（合规：不诱导情感依赖）----
  const needImmersion = verdict.immersionNote;
  const finalReply = needImmersion ? `${replyText}\n\n${IMMERSION_NOTE}` : replyText;

  // ---- 5. 语音合成 ----
  let audioUrl: string | undefined;
  if (wantVoice) {
    try {
      const tts = await safeSynthesize({
        text: toSpeakableText(finalReply),
        voiceId: await resolveTtsVoiceId(p.voiceId),
        emotion: deriveEmotion(finalReply),
        speed: TTS_SPEED,
      });
      // 写入公开上传目录，走 /uploads 路由读取
      const { saveGeneratedAudio } = await import("@/lib/upload");
      audioUrl = await saveGeneratedAudio(tts.buffer, p.id, tts.mimeType);
    } catch (e) {
      console.warn("[whisper] TTS 失败：", (e as Error).message);
    }
  }

  // ---- 6. 日志留存（≥6 个月）----
  const engine = currentEngineLabel();
  const session = await ensureSession(p.id, userId, params.sessionId, params.mood, params.moodNote);
  const label = buildAiLabel(engine);

  await prisma.whisperMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      text,
      flagged: verdict.crisis || verdict.defamation,
      flagReason: verdict.labels.length ? verdict.labels.join(",") : null,
    },
  });

  await prisma.whisperMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      text: finalReply,
      audioUrl,
      aiGenerated: true,
      aiLabel: label,
      flagged,
      flagReason: flagged ? "sanitized" : null,
    },
  });

  await prisma.whisperSession.update({
    where: { id: session.id },
    data: {
      roundsUsed: { increment: 1 },
      minutesUsed: { increment: consumedMinutes },
    },
  });

  return {
    ok: true,
    reply: finalReply,
    audioUrl,
    aiLabel: label,
    immersionNote: needImmersion,
    crisis: verdict.crisis,
    quota: quotaAfter!,
    minutes: consumedMinutes,
    mockMode: isMockMode(),
  };
}

/** 取或建会话 */
/**
 * 取得或新建会话。
 *
 * mood/moodNote 只在**新建会话时**写入——心情是"这次来看望时的心情"，
 * 中途改心情不应覆盖同一会话的首次记录（那会污染回顾页的统计口径）。
 * 若已有会话但当初没记心情，这里补记一次（补记不覆盖已有值）。
 */
async function ensureSession(
  profileId: string,
  userId: string,
  sessionId?: string,
  mood?: string | null,
  moodNote?: string | null,
) {
  if (sessionId) {
    const found = await prisma.whisperSession.findFirst({
      where: { id: sessionId, profileId, userId },
    });
    if (found) {
      // 补记心情：仅在原值为空且本次有值时写一次
      if (!found.mood && mood) {
        return prisma.whisperSession.update({
          where: { id: found.id },
          data: { mood, moodNote: moodNote ?? null },
        });
      }
      return found;
    }
  }
  return prisma.whisperSession.create({
    data: { profileId, userId, mode: "voice", mood: mood ?? null, moodNote: moodNote ?? null },
  });
}

// ---------------------------------------------------------------- 语音转写

export async function transcribe(
  buffer: Buffer,
  mimeType: string,
  hint?: string,
): Promise<{ text: string; durationMs: number; label: string }> {
  const r = await safeTranscribe({ buffer, mimeType, hint });
  return {
    text: r.text,
    durationMs: r.durationMs,
    label: formatLabel(r.label),
  };
}

// ---------------------------------------------------------------- 历史读取

export async function recentHistory(
  profileId: string,
  userId: string,
  limit = MAX_HISTORY,
): Promise<ChatMessage[]> {
  const rows = await prisma.whisperMessage.findMany({
    where: { session: { profileId, userId } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { role: true, text: true },
  });
  return rows
    .reverse()
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.text }));
}

/** 会话统计，供管理台展示 */
export async function profileStats(profileId: string) {
  const [sessions, messages, voiceCount] = await Promise.all([
    prisma.whisperSession.count({ where: { profileId } }),
    prisma.whisperMessage.count({ where: { session: { profileId } } }),
    prisma.whisperVoice.count({ where: { profileId } }),
  ]);
  const agg = await prisma.whisperSession.aggregate({
    where: { profileId },
    _sum: { minutesUsed: true },
  });
  return {
    sessions,
    messages,
    voiceCount,
    totalMinutes: agg._sum.minutesUsed ?? 0,
  };
}

// ---------------------------------------------------------------- 对话历史回顾

/** 会话列表项（回顾页左栏） */
export interface SessionSummary {
  id: string;
  mood: string | null;
  moodNote: string | null;
  roundsUsed: number;
  minutesUsed: number;
  createdAt: Date;
  endedAt: Date | null;
  messageCount: number;
  /** 该会话最后一句话的摘要，用于列表预览 */
  preview: string | null;
}

/**
 * 列出某用户在某装置下的会话（回顾页用）。
 *
 * 权限口径（已决策）：**仅会话本人可见**。
 * 即便装置主人也不能看到其他来访者的对话——追思对话属敏感个人信息，
 * 最小可见范围是唯一稳妥解。馆主能看的是聚合统计（profileStats），不是原文。
 */
export async function listSessions(
  profileId: string,
  userId: string,
  take = 50,
): Promise<SessionSummary[]> {
  const sessions = await prisma.whisperSession.findMany({
    where: { profileId, userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      mood: true,
      moodNote: true,
      roundsUsed: true,
      minutesUsed: true,
      createdAt: true,
      endedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { text: true },
      },
      _count: { select: { messages: true } },
    },
  });

  return sessions.map((s) => ({
    id: s.id,
    mood: s.mood,
    moodNote: s.moodNote,
    roundsUsed: s.roundsUsed,
    minutesUsed: s.minutesUsed,
    createdAt: s.createdAt,
    endedAt: s.endedAt,
    messageCount: s._count.messages,
    preview: s.messages[0]?.text.slice(0, 60) ?? null,
  }));
}

/** 会话详情（含全部消息）；越权返回 null */
export async function loadSession(profileId: string, userId: string, sessionId: string) {
  return prisma.whisperSession.findFirst({
    where: { id: sessionId, profileId, userId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
}

/** 情绪走向聚合（回顾页顶部提示用）：统计各心情出现次数 */
export async function moodTrend(profileId: string, userId: string) {
  const rows = await prisma.whisperSession.groupBy({
    by: ["mood"],
    where: { profileId, userId, mood: { not: null } },
    _count: { mood: true },
  });
  const total = rows.reduce((a, r) => a + r._count.mood, 0);
  return {
    total,
    buckets: rows
      .map((r) => ({ mood: r.mood as string, count: r._count.mood }))
      .sort((a, b) => b.count - a.count),
  };
}
