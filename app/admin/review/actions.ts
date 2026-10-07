"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { ModerationStatus } from "@prisma/client";

export async function reviewItem(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");

  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const reason = String(formData.get("reason") || "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  const item = await prisma.moderationQueue.findUnique({ where: { id } });
  if (!item) return;

  const status = (decision === "approved" ? "approved" : "rejected") as ModerationStatus;
  await prisma.moderationQueue.update({
    where: { id },
    data: {
      status,
      reviewerId: user.id!,
      reason: reason || null,
      reviewedAt: new Date(),
    },
  });

  // 联动：文章驳回 → 文章状态置为 rejected；实名通过 → 用户标记已认证
  if (item.targetType === "article" && decision === "rejected") {
    await prisma.article.update({
      where: { id: item.targetId },
      data: { status: "rejected" },
    });
  }
  if (item.targetType === "realname" && decision === "approved") {
    await prisma.user.update({
      where: { id: item.targetId },
      data: { idVerified: true },
    });
  }

  revalidatePath("/admin/review");
  revalidatePath("/admin/articles");
  revalidatePath("/console/realname");
}

// 宗祠设立审核：通过 → active 并公开；驳回 → rejected
export async function reviewClanHall(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");

  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const reason = String(formData.get("reason") || "");
  if (!id || (decision !== "active" && decision !== "rejected")) return;

  await prisma.clanHall.update({
    where: { id },
    data: {
      status: decision === "active" ? "active" : "rejected",
      isPublic: decision === "active",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: `clan_hall_${decision}${reason ? `:${reason.slice(0, 100)}` : ""}`,
      entity: "ClanHall",
      entityId: id,
    },
  });

  revalidatePath("/admin/review");
  revalidatePath("/clan/halls");
}

// 纪念馆建馆审核：通过 → active 并公开；驳回 → rejected
export async function reviewHall(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/console");

  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const reason = String(formData.get("reason") || "");
  if (!id || (decision !== "active" && decision !== "rejected")) return;

  await prisma.memorialHall.update({
    where: { id },
    data: {
      status: decision === "active" ? "active" : "rejected",
      isPublic: decision === "active",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: `hall_${decision}`,
      entity: "MemorialHall",
      entityId: id,
    },
  });

  revalidatePath("/admin/review");
  revalidatePath("/halls");
}

// 文章评论审核：通过 → approved 并展示；驳回 → rejected
export async function reviewComment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");

  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  await prisma.articleComment.update({
    where: { id },
    data: { status: decision === "approved" ? "approved" : "rejected" },
  });

  revalidatePath("/admin/review");
  revalidatePath("/news");
}

// 族谱审核：通过 → 公开可检索
export async function reviewGenealogy(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");

  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  await prisma.genealogy.update({
    where: { id },
    data: {
      status: decision === "approved" ? "approved" : "rejected",
      isPublic: decision === "approved",
    },
  });
  revalidatePath("/admin/review");
  revalidatePath("/clan/genealogy");
}

// 宗亲社区帖子/回帖审核
export async function reviewClanContent(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");

  const id = String(formData.get("id") || "");
  const kind = String(formData.get("kind") || "post");
  const decision = String(formData.get("decision") || "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  const status = decision === "approved" ? "approved" : "rejected";
  if (kind === "reply") {
    await prisma.clanPostReply.update({ where: { id }, data: { status } });
  } else {
    await prisma.clanPost.update({ where: { id }, data: { status } });
  }
  revalidatePath("/admin/review");
  revalidatePath("/clan/community");
}

/**
 * 午夜悄悄话装置审核。
 *
 * 合规要求（最高优先级）：开启追思对话前必须同时满足
 *   1. 已录入家属授权链（WhisperConsent）
 *   2. 授权未被撤回
 * 因此即使管理员点「通过」，缺少授权也不予开启，并在审计日志中记录原因。
 */
export async function reviewWhisper(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");

  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const reason = String(formData.get("reason") || "");
  if (!id || (decision !== "active" && decision !== "rejected")) return;

  const profile = await prisma.whisperProfile.findUnique({
    where: { id },
    include: { consent: { select: { id: true, revokedAt: true } } },
  });
  if (!profile) return;

  // 授权闸门：无授权或已撤回 → 强制驳回
  const consentOk = !!profile.consent && !profile.consent.revokedAt;
  const finalDecision = decision === "active" && !consentOk ? "rejected" : decision;
  const blockedReason =
    decision === "active" && !consentOk ? "缺少有效家属授权，系统自动驳回" : reason;

  await prisma.whisperProfile.update({
    where: { id },
    data: {
      status: finalDecision === "active" ? "active" : "rejected",
      enabled: finalDecision === "active",
      isPublic: finalDecision === "active",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: `whisper_${finalDecision}${blockedReason ? `:${blockedReason.slice(0, 100)}` : ""}`,
      entity: "WhisperProfile",
      entityId: id,
    },
  });

  revalidatePath("/admin/review");
  revalidatePath("/whispers");
}
