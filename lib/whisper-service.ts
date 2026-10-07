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
  avatarId: string | null;
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

  const festival = currentFestival();
  if (!festival) return base;

  return [
    base,
    `【今日节气】现在是${festival.spec.name}（${festival.spec.whisperTheme.badge}）。${festival.spec.whisperTheme.prompt}`,
  ].join("\n");
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
    const systemPrompt = composeSparkPrompt(p, text);
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
      const tts = await safeSynthesize({ text: finalReply, voiceId: p.voiceId ?? undefined });
      // 写入公开上传目录，走 /uploads 路由读取
      const { saveGeneratedAudio } = await import("@/lib/upload");
      audioUrl = await saveGeneratedAudio(tts.buffer, p.id, tts.mimeType);
    } catch (e) {
      console.warn("[whisper] TTS 失败：", (e as Error).message);
    }
  }

  // ---- 6. 日志留存（≥6 个月）----
  const engine = currentEngineLabel();
  const session = await ensureSession(p.id, userId, params.sessionId);
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
async function ensureSession(profileId: string, userId: string, sessionId?: string) {
  if (sessionId) {
    const found = await prisma.whisperSession.findFirst({
      where: { id: sessionId, profileId, userId },
    });
    if (found) return found;
  }
  return prisma.whisperSession.create({
    data: { profileId, userId, mode: "voice" },
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
  const [sessions, messages, voiceCount, avatarCount] = await Promise.all([
    prisma.whisperSession.count({ where: { profileId } }),
    prisma.whisperMessage.count({ where: { session: { profileId } } }),
    prisma.whisperVoice.count({ where: { profileId } }),
    prisma.whisperAvatar.count({ where: { profileId } }),
  ]);
  const agg = await prisma.whisperSession.aggregate({
    where: { profileId },
    _sum: { minutesUsed: true },
  });
  return {
    sessions,
    messages,
    voiceCount,
    avatarCount,
    totalMinutes: agg._sum.minutesUsed ?? 0,
  };
}
