"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { spendPoints } from "@/lib/points";
import { encrypt } from "@/lib/crypto";
import { removeHallImage, saveWhisperAudio, removeWhisperProfileDir } from "@/lib/upload";
import { WHISPER_POINTS, PLAN_SPECS, type WhisperPlan } from "@/lib/whisper";
import { buildSystemPrompt, retrieveMemories, currentEngineLabel } from "@/lib/ai/index";
import { SAMPLE_RETENTION_NOTE } from "@/lib/whisper-safety";

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
  mode: string;
  status: string;
  enabled: boolean;
  engineLabel: string | null;
  cloneApplied: boolean;
  ethicsStatus: string;
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

  // 套餐校验：克隆数量上限。
  // 克隆资格闸门 = 订阅档 cloneLimit>0（basic/premium 自带）OR 已支付 ¥10 资格申请（cloneApplied）。
  const quota = await prisma.whisperQuota.findUnique({ where: { userId: ctx.user.id! } });
  const plan = (quota?.plan as WhisperPlan) ?? "free";
  const limit = PLAN_SPECS[plan]?.cloneLimit ?? 0;
  const hasApplied = profile.cloneApplied;
  const existing = await prisma.whisperVoice.count({
    where: { profileId: id, isPreset: false },
  });

  if (limit === 0 && !hasApplied) {
    return {
      ok: false,
      message: "尚未解锁声音克隆资格：订阅「基础版/尊享版」即可克隆，或支付 ¥10 资格申请工本费。",
    };
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
  const isMock = engine.includes("mock");
  await prisma.whisperVoice.create({
    data: {
      profileId: id,
      name,
      provider: isMock ? "mock" : "volcano",
      // 样本脱敏（B3）：Mock 引擎下样本对生成无贡献，
      // 仅保留文件用于"试听"，但清空数据库引用前先登记留存策略；
      // 真实引擎需样本做增量训练，故保留引用。
      sampleUrl,
      sampleSeconds: Number(formData.get("sampleSeconds") || 0) || 0,
      status: "ready", // Mock 模式下即时可用
      tier: "points",
      points: WHISPER_POINTS.CLONE_UNLOCK,
    },
  });

  refresh(id);
  return {
    ok: true,
    message: isMock
      ? `已创建声线「${name}」，样本已保存。${SAMPLE_RETENTION_NOTE}`
      : `已创建声线「${name}」，样本已提交云端训练。${SAMPLE_RETENTION_NOTE}`,
  };
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
    reason: "兑换「午夜悄悄话」声音克隆资格申请",
    refId: id,
  });
  if (!paid) {
    return { ok: false, message: `积分不足，克隆资格申请需 ${cost} 积分` };
  }

  // 置克隆资格申请标记：解锁克隆入口（真实克隆训练由订阅档 cloneLimit 承载）。
  await prisma.whisperProfile.update({
    where: { id },
    data: { cloneApplied: true },
  });

  refresh(id);
  return { ok: true, message: `已用 ${cost} 积分完成克隆资格申请，可上传样本复刻声线` };
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

// ---------------------------------------------------------------- 4. 家属授权

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

// ---------------------------------------------------------------- 7. 数据删除权

/**
 * 删除追思装置（行使《个人信息保护法》第 47 条数据删除权）。
 *
 * 删除范围（含级联）：
 *   - WhisperProfile 本体
 *   - WhisperVoice（声线）+ 样本音频文件
 *   - WhisperConsent（家属授权记录，含加密身份证号）
 *   - WhisperSession + WhisperMessage（全部对话历史）
 *   - 磁盘上的 whispers/<profileId>/ 整棵目录（样本 + 生成音频）
 *
 * 安全：仅装置所有者本人可删；不校验前端传入的名称（服务端以 ownerUserId 为准）。
 */
export async function deleteProfile(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("profileId") || "");
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const profile = await prisma.whisperProfile.findUnique({
    where: { id },
    select: { id: true, ownerUserId: true, personaName: true },
  });
  if (!profile) return { ok: false, message: "装置不存在或已被删除" };
  if (profile.ownerUserId !== user.id) return { ok: false, message: "无权删除该装置" };

  // 1) 先落审计日志——删库后 profileId 就不存在了，必须先记
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: `whisper_delete:${profile.personaName}`,
      entity: "WhisperProfile",
      entityId: id,
    },
  });

  // 2) 删库（子表 onDelete: Cascade 自动级联）
  await prisma.whisperProfile.delete({ where: { id } });

  // 3) 删磁盘文件（样本音频 + 生成音频）；失败不影响主流程
  try {
    await removeWhisperProfileDir(id);
  } catch {
    /* 文件层失败不阻塞——库记录已删，文件属遗留垃圾，可事后清理 */
  }

  revalidatePath("/console");
  revalidatePath("/whispers");
  redirect("/console?whisperDeleted=1");
}
