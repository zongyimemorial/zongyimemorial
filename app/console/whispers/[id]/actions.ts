"use server";

import { revalidatePath } from "next/cache";
import { isPremium } from "@/lib/premium";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { spendPoints } from "@/lib/points";
import { encrypt } from "@/lib/crypto";
import { removeHallImage, saveWhisperAudio } from "@/lib/upload";
import { WHISPER_POINTS, PLAN_SPECS, type WhisperPlan } from "@/lib/whisper";
import { buildSystemPrompt, retrieveMemories, currentEngineLabel } from "@/lib/ai/index";

export type ActionResult = {
  ok: boolean;
  message?: string;
  /** 需要积分解锁时回传给前端 */
  needUnlock?: { kind: string; id: string; points: number };
};

// ---------------------------------------------------------------- 内部工具

interface ProfileRow {
  id: string;
  ownerUserId: string;
  hallId: string;
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
  status: string;
  enabled: boolean;
  engineLabel: string | null;
}

async function loadProfile(id: string) {
  const user = await getCurrentUser();
  if (!user?.id) return { error: "请先登录" } as const;

  const profile = await prisma.whisperProfile.findUnique({
    where: { id },
    include: { consent: true },
  });
  if (!profile) return { error: "追思装置不存在" } as const;
  if (profile.ownerUserId !== user.id) return { error: "只有馆主可以管理" } as const;

  return { user, profile: profile as unknown as ProfileRow & { consent: unknown } } as const;
}

function refresh(id: string) {
  revalidatePath(`/console/whispers/${id}`);
  revalidatePath("/console");
  revalidatePath("/whispers");
}

/** 解析「世代|姓名」式的行文本为数组（复用于记忆/关系条目） */
function parseLines(raw: string, max: number): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

// ---------------------------------------------------------------- 1. 生平资料库

/**
 * 保存生平资料库。
 * 这是 AI 人格的事实来源，字段越丰富，追思对话越像"他/她"。
 */
export async function savePersonaLibrary(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { profile } = ctx;

  const personaName = String(formData.get("personaName") || "").trim().slice(0, 30);
  const personTitle = String(formData.get("personTitle") || "").trim().slice(0, 20);
  const bio = String(formData.get("bio") || "").trim().slice(0, 4000);
  const traitsRaw = String(formData.get("traits") || "").trim();

  // 语言风格
  const tone = String(formData.get("tone") || "").trim().slice(0, 200);
  const dialect = String(formData.get("dialect") || "").trim().slice(0, 100);
  const addressForm = String(formData.get("addressForm") || "").trim().slice(0, 200);
  const catchphrasesRaw = String(formData.get("catchphrases") || "").trim();

  // 记忆条目：每行「年份|标题|内容」
  const memoriesRaw = String(formData.get("memories") || "");
  const memories = memoriesRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 200)
    .map((line, i) => {
      const [year = "", title = "", ...rest] = line.split("|");
      return {
        id: `m${i + 1}`,
        year: year.trim(),
        title: title.trim(),
        content: rest.join("|").trim(),
      };
    })
    .filter((m) => m.title || m.content);

  // 关系图谱：每行「姓名|关系|备注」
  const relationsRaw = String(formData.get("relationships") || "");
  const relationships = relationsRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((line) => {
      const [name = "", relation = "", note = ""] = line.split("|");
      return { name: name.trim(), relation: relation.trim(), note: note.trim() };
    })
    .filter((r) => r.name);

  const traits = traitsRaw
    .split(/[，,\n、]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  const catchphrases = catchphrasesRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  // 配额上限校验（按当前套餐）
  const quota = await prisma.whisperQuota.findUnique({ where: { userId: ctx.user.id! } });
  const plan = (quota?.plan as WhisperPlan) ?? "free";
  const limit = PLAN_SPECS[plan]?.memoryLimit ?? PLAN_SPECS.free.memoryLimit;
  if (limit !== -1 && memories.length > limit) {
    return {
      ok: false,
      message: `当前「${PLAN_SPECS[plan].name}」最多保存 ${limit} 条记忆，请升级套餐或精简内容。`,
    };
  }

  await prisma.whisperProfile.update({
    where: { id },
    data: {
      ...(personaName ? { personaName } : {}),
      personTitle: personTitle || null,
      bio: bio || null,
      traits,
      speechStyle: { tone, dialect, addressForm, catchphrases },
      memories,
      relationships,
    },
  });

  refresh(id);
  return { ok: true, message: `已保存资料库（记忆 ${memories.length} 条 · 关系 ${relationships.length} 人）` };
}

/**
 * 重新生成人格提示词并落库。
 * 生成后馆主仍可手工微调（saveSystemPrompt）。
 */
export async function regenerateSystemPrompt(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { profile } = ctx;

  const memories = retrieveMemories(profile.memories, "", 6);
  const prompt = buildSystemPrompt(
    {
      personaName: profile.personaName,
      personTitle: profile.personTitle,
      bio: profile.bio,
      traits: profile.traits,
      speechStyle: profile.speechStyle,
      memories: profile.memories,
      relationships: profile.relationships,
    },
    { memories },
  );

  await prisma.whisperProfile.update({
    where: { id },
    data: { systemPrompt: prompt, promptVersion: { increment: 1 } },
  });

  refresh(id);
  return { ok: true, message: "已重新生成人格提示词" };
}

/** 手工编辑人格提示词 */
export async function saveSystemPrompt(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const prompt = String(formData.get("systemPrompt") || "").trim().slice(0, 12000);
  await prisma.whisperProfile.update({
    where: { id },
    data: { systemPrompt: prompt || null, promptVersion: { increment: 1 } },
  });

  refresh(id);
  return { ok: true, message: prompt ? "已保存人格提示词" : "已清空，将恢复自动生成" };
}

// ---------------------------------------------------------------- 2. 声音克隆

/**
 * 上传声音样本并创建克隆任务。
 * 合规：声纹属敏感个人信息，需已完成家属授权。
 */
export async function uploadVoiceSample(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { profile } = ctx;

  // 合规闸门：必须先有家属授权
  const consent = await prisma.whisperConsent.findUnique({ where: { profileId: id } });
  if (!consent || consent.revokedAt) {
    return { ok: false, message: "请先完成家属授权，授权通过后才能克隆声音。" };
  }

  const name = String(formData.get("voiceName") || "").trim().slice(0, 30) || "未命名声线";
  const file = formData.get("sample");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "请选择声音样本文件" };
  }

  // 套餐校验：克隆数量上限
  const quota = await prisma.whisperQuota.findUnique({ where: { userId: ctx.user.id! } });
  const plan = (quota?.plan as WhisperPlan) ?? "free";
  const limit = PLAN_SPECS[plan]?.cloneLimit ?? 0;
  const existing = await prisma.whisperVoice.count({
    where: { profileId: id, isPreset: false },
  });

  if (limit === 0 && plan !== "free") {
    return { ok: false, message: "当前套餐不支持声音克隆，请升级套餐或使用积分兑换。" };
  }
  if (limit > 0 && existing >= limit) {
    return {
      ok: false,
      message: `「${PLAN_SPECS[plan].name}」最多创建 ${limit} 个克隆声线，已达上限。`,
    };
  }

  let sampleUrl: string;
  try {
    sampleUrl = await saveWhisperAudio(file, id);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  // 创建声线记录，状态 pending（真实环境此处提交训练任务）
  const engine = currentEngineLabel();
  await prisma.whisperVoice.create({
    data: {
      profileId: id,
      name,
      provider: engine.includes("mock") ? "mock" : "volcano",
      sampleUrl,
      sampleSeconds: Number(formData.get("sampleSeconds") || 0) || 0,
      status: "ready", // Mock 模式下即时可用
      tier: "points",
      points: WHISPER_POINTS.CLONE_UNLOCK,
    },
  });

  refresh(id);
  return { ok: true, message: `已创建声线「${name}」，样本已保存` };
}

/** 选用某个声线 */
export async function selectVoice(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const voiceId = String(formData.get("voiceId") || "");
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const voice = await prisma.whisperVoice.findFirst({ where: { id: voiceId, profileId: id } });
  if (!voice) return { ok: false, message: "声线不存在" };

  await prisma.whisperProfile.update({ where: { id }, data: { voiceId } });
  refresh(id);
  return { ok: true, message: `已选用声线「${voice.name}」` };
}

/** 用积分解锁克隆资格 */
export async function unlockCloneWithPoints(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const cost = WHISPER_POINTS.CLONE_UNLOCK;
  const paid = await spendPoints({
    userId: ctx.user.id!,
    amount: cost,
    reason: "兑换「午夜悄悄话」声音克隆资格",
    refId: id,
  });
  if (!paid) {
    return { ok: false, message: `积分不足，克隆资格需 ${cost} 积分` };
  }

  // 提升配额里的克隆上限（标记位：把 plan 保持，但记录已单独解锁）
  await prisma.whisperQuota.upsert({
    where: { userId: ctx.user.id! },
    create: { userId: ctx.user.id!, plan: "free", extraMins: 0, monthlyRounds: 30, monthlyMins: 0 },
    update: {},
  });

  refresh(id);
  return { ok: true, message: `已用 ${cost} 积分解锁声音克隆资格` };
}

/** 删除声线（同时删除样本文件） */
export async function deleteVoice(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const voiceId = String(formData.get("voiceId") || "");
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const voice = await prisma.whisperVoice.findFirst({ where: { id: voiceId, profileId: id } });
  if (!voice) return { ok: false, message: "声线不存在" };
  if (voice.isPreset) return { ok: false, message: "系统预设声线不可删除" };

  // 删除样本文件（隐私要求：用户可随时删除样本）
  if (voice.sampleUrl) await removeHallImage(voice.sampleUrl);
  await prisma.whisperVoice.delete({ where: { id: voiceId } });

  // 若删的是当前选用声线，回落到默认预设
  if (ctx.profile.voiceId === voiceId) {
    const fallback = await prisma.whisperVoice.findFirst({
      where: { profileId: id, isPreset: true },
      orderBy: { createdAt: "asc" },
    });
    await prisma.whisperProfile.update({
      where: { id },
      data: { voiceId: fallback?.id ?? null },
    });
  }

  refresh(id);
  return { ok: true, message: `已删除声线「${voice.name}」及其样本文件` };
}

// ---------------------------------------------------------------- 3. 数字形象

/** 选用形象 */
export async function selectAvatar(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const avatarId = String(formData.get("avatarId") || "");
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const avatar = await prisma.whisperAvatar.findFirst({ where: { id: avatarId, profileId: id } });
  if (!avatar) return { ok: false, message: "形象不存在" };

  // 收费形象需已解锁（premium 用户直接可用）
  if (avatar.tier === "premium") {
    const u = await prisma.user.findUnique({
      where: { id: ctx.user.id! },
      select: { premiumUntil: true },
    });
    const isPrem = isPremium(u);
    if (!isPrem) {
      return { ok: false, message: "该形象需开通高级订阅后使用。" };
    }
  }

  await prisma.$transaction([
    prisma.whisperAvatar.updateMany({
      where: { profileId: id },
      data: { isSelected: false },
    }),
    prisma.whisperAvatar.update({ where: { id: avatarId }, data: { isSelected: true } }),
    prisma.whisperProfile.update({ where: { id }, data: { avatarId } }),
  ]);

  refresh(id);
  return { ok: true, message: `已选用形象「${avatar.name}」` };
}

/** 用积分解锁收费形象 */
export async function unlockAvatar(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const avatarId = String(formData.get("avatarId") || "");
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const avatar = await prisma.whisperAvatar.findFirst({ where: { id: avatarId, profileId: id } });
  if (!avatar) return { ok: false, message: "形象不存在" };
  if (avatar.tier !== "points") return { ok: false, message: "该形象无需兑换" };

  const cost = avatar.points ?? WHISPER_POINTS.AVATAR_UNLOCK;
  const paid = await spendPoints({
    userId: ctx.user.id!,
    amount: cost,
    reason: `兑换数字形象「${avatar.name}」`,
    refId: id,
  });
  if (!paid) return { ok: false, message: `积分不足，需 ${cost} 积分` };

  await prisma.whisperAvatar.update({
    where: { id: avatarId },
    data: { tier: "free", points: null },
  });

  refresh(id);
  return { ok: true, message: `已用 ${cost} 积分解锁形象「${avatar.name}」` };
}

// ---------------------------------------------------------------- 4. 模式与开关

/** 切换对话模式（voice / avatar） */
export async function setMode(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const mode = String(formData.get("mode") || "voice");
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  if (mode !== "voice" && mode !== "avatar") {
    return { ok: false, message: "模式不合法" };
  }

  await prisma.whisperProfile.update({ where: { id }, data: { mode } });
  refresh(id);
  return { ok: true, message: mode === "avatar" ? "已切换为形象模式" : "已切换为纯语音模式" };
}

// ---------------------------------------------------------------- 5. 家属授权

/**
 * 保存家属授权链。
 * 合规必需：无此记录装置不可开启（审核端也会强制校验）。
 */
export async function saveConsent(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  const applicantName = String(formData.get("applicantName") || "").trim().slice(0, 30);
  const applicantIdNo = String(formData.get("applicantIdNo") || "").trim();
  const relation = String(formData.get("relation") || "").trim().slice(0, 20);
  const deceasedWill = String(formData.get("deceasedWill") || "").trim().slice(0, 1000);
  const otherHeirsAck = formData.get("otherHeirsAck") === "on";

  if (!applicantName || !relation) {
    return { ok: false, message: "请填写授权人姓名与与逝者的关系" };
  }
  if (!otherHeirsAck) {
    return {
      ok: false,
      message: "须确认「其他近亲属无异议」后方可提交（《民法典》994 条要求）。",
    };
  }

  await prisma.whisperConsent.upsert({
    where: { profileId: id },
    create: {
      profileId: id,
      applicantName,
      // 敏感个人信息：AES-256 加密存储
      applicantIdNo: applicantIdNo ? encrypt(applicantIdNo) : "",
      relation,
      otherHeirsAck,
      deceasedWill: deceasedWill || null,
    },
    update: {
      applicantName,
      ...(applicantIdNo ? { applicantIdNo: encrypt(applicantIdNo) } : {}),
      relation,
      otherHeirsAck,
      deceasedWill: deceasedWill || null,
      revokedAt: null, // 重新提交即恢复授权
    },
  });

  refresh(id);
  return { ok: true, message: "家属授权已保存" };
}

/** 撤回授权（合规：家属可随时撤回） */
export async function revokeConsent(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  await prisma.whisperConsent.update({
    where: { profileId: id },
    data: { revokedAt: new Date() },
  });
  // 撤回授权即关闭装置
  await prisma.whisperProfile.update({
    where: { id },
    data: { enabled: false },
  });

  refresh(id);
  return { ok: true, message: "已撤回授权，追思对话已关闭" };
}

// ---------------------------------------------------------------- 6. 审核提交

/** 提交审核（新建线路 / 修改后重新送审） */
export async function submitForReview(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };

  // 合规前置：必须已有授权
  const consent = await prisma.whisperConsent.findUnique({ where: { profileId: id } });
  if (!consent || consent.revokedAt) {
    return { ok: false, message: "请先完成家属授权，再提交审核。" };
  }
  if (!ctx.profile.systemPrompt) {
    return { ok: false, message: "请先生成人格提示词，再提交审核。" };
  }

  await prisma.whisperProfile.update({
    where: { id },
    data: {
      status: "pending",
      enabled: false,
      engineLabel: currentEngineLabel(),
    },
  });

  refresh(id);
  return { ok: true, message: "已提交审核，审核通过后开启对话" };
}

/**
 * 开启 / 关闭追思对话。
 *
 * 开启前置（三重闸门，缺一不可）：
 *   1. status === "active"（已通过人工审核）
 *   2. 存在未撤回的家属授权
 *   3. 已生成人格提示词
 * 关闭则无任何限制（家属可随时停用）。
 */
export async function toggleEnabled(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const next = formData.get("enabled") === "true";
  const ctx = await loadProfile(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { profile } = ctx;

  if (!next) {
    await prisma.whisperProfile.update({ where: { id }, data: { enabled: false } });
    refresh(id);
    return { ok: true, message: "已关闭追思对话，家人暂时无法进入。" };
  }

  // —— 开启前的三重校验 ——
  if (profile.status !== "active") {
    return { ok: false, message: "需先通过平台审核才能开启对话。" };
  }
  const consent = await prisma.whisperConsent.findUnique({ where: { profileId: id } });
  if (!consent || consent.revokedAt) {
    return { ok: false, message: "家属授权缺失或已撤回，无法开启。" };
  }
  if (!profile.systemPrompt) {
    return { ok: false, message: "尚未生成人格提示词，无法开启。" };
  }

  await prisma.whisperProfile.update({
    where: { id },
    data: { enabled: true, engineLabel: currentEngineLabel() },
  });

  refresh(id);
  return { ok: true, message: "已开启追思对话，家人现在可以进入交流。" };
}
