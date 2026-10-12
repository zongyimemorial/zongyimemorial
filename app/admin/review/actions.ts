"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { ModerationStatus } from "@prisma/client";

export async function reviewItem(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

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

// 宗祠设立审核：通过 → active；标准/替代通道 → 公开；特殊申述通道 → 仅创建者可见（60 天补传后转公开）；驳回 → rejected
export async function reviewClanHall(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const reason = String(formData.get("reason") || "");
  if (!id || (decision !== "active" && decision !== "rejected")) return;

  const hall = await prisma.clanHall.findUnique({
    where: { id },
    select: { reviewChannel: true },
  });

  const data: {
    status: "active" | "rejected";
    isPublic: boolean;
  } = {
    status: decision === "active" ? "active" : "rejected",
    isPublic: false,
  };
  if (decision === "active") {
    // 特殊申述通道：先「仅创建者可见」，owner 60 天内补传正式材料后转公开
    data.isPublic = hall?.reviewChannel === "appeal" ? false : true;
  }

  await prisma.clanHall.update({
    where: { id },
    data,
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

// 纪念馆建馆审核：通过 → active；标准/替代通道 → 公开；特殊申述通道 → 仅创建者可见
export async function reviewHall(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) redirect("/console");

  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const reason = String(formData.get("reason") || "");
  if (!id || (decision !== "active" && decision !== "rejected")) return;

  const hall = await prisma.memorialHall.findUnique({
    where: { id },
    select: { reviewChannel: true },
  });

  const data: {
    status: "active" | "rejected";
    isPublic: boolean;
    supplementDeadline?: Date | null;
  } = {
    status: decision === "active" ? "active" : "rejected",
    isPublic: false,
  };
  if (decision === "active") {
    if (hall?.reviewChannel === "appeal") {
      // 特殊申述通道：先「仅创建者可见」，owner 60 天内补传正式材料后转公开
      data.isPublic = false;
    } else {
      data.isPublic = true;
    }
  }

  await prisma.memorialHall.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: `hall_${decision}${reason ? `:${reason.slice(0, 100)}` : ""}`,
      entity: "MemorialHall",
      entityId: id,
    },
  });

  revalidatePath("/admin/review");
  revalidatePath("/halls");
}

// 处理建馆审核举报（被举报队列）
// decision: handled（已处置，如撤馆/下架）| dismissed（驳回误报）
export async function handleHallReport(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) redirect("/console");

  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const note = String(formData.get("note") || "");
  if (!id || (decision !== "handled" && decision !== "dismissed")) return;

  await prisma.hallReport.update({
    where: { id },
    data: {
      status: decision,
      handlerId: user.id,
      handledAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: `hall_report_${decision}${note ? `:${note.slice(0, 100)}` : ""}`,
      entity: "HallReport",
      entityId: id,
    },
  });

  revalidatePath("/admin/review");
}

// 文章评论审核：通过 → approved 并展示；驳回 → rejected
export async function reviewComment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

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
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

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
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

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

// 宗族活动审核（祠主发布的本族活动先审后显）
export async function reviewClanActivity(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const reason = String(formData.get("reason") || "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  const status = (decision === "approved" ? "approved" : "rejected") as ModerationStatus;
  await prisma.clanActivity.update({
    where: { id },
    data: { reviewStatus: status, reviewedAt: new Date(), reviewNote: reason || null },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: `clan_activity_${status}${reason ? `:${reason.slice(0, 100)}` : ""}`,
      entity: "ClanActivity",
      entityId: id,
    },
  });

  revalidatePath("/admin/review");
  revalidatePath("/admin/activities");
  revalidatePath("/clan/activities");
  revalidatePath("/clan");
}

/**
 * 午夜悄悄话装置审核。
 *
 * 合规要求（最高优先级）：开启追思对话前必须同时满足
 *   1. 已录入家属授权链（WhisperConsent）
 *   2. 授权未被撤回
 *   3. 【声音克隆】装置须已通过伦理审查（ethicsStatus === "approved"）
 * 因此即使管理员点「通过」，缺少授权或伦理审查未过也不予开启，
 * 并在审计日志中记录原因。
 *
 * 说明：纯语音预设声线（无克隆样本）不触发伦理审查闸门，
 *      避免对不涉及逝者生物特征复刻的装置造成误伤。
 */
export async function reviewWhisper(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const reason = String(formData.get("reason") || "");
  if (!id || (decision !== "active" && decision !== "rejected")) return;

  const profile = await prisma.whisperProfile.findUnique({
    where: { id },
    include: {
      consent: { select: { id: true, revokedAt: true } },
      _count: { select: { voices: true } },
    },
  });
  if (!profile) return;

  // 闸门 1：无授权或已撤回 → 强制驳回
  const consentOk = !!profile.consent && !profile.consent.revokedAt;
  // 闸门 2：涉及声音克隆时，伦理审查必须已通过
  const hasClone = profile._count.voices > 0;
  const ethicsOk = profile.ethicsStatus === "approved";
  const ethicsBlocked = hasClone && !ethicsOk;

  const blocked = (decision === "active" && !consentOk) || (decision === "active" && ethicsBlocked);
  const finalDecision = blocked ? "rejected" : decision;

  let blockedReason = reason;
  if (blocked) {
    if (!consentOk) blockedReason = "缺少有效家属授权，系统自动驳回";
    else if (ethicsBlocked) blockedReason = "声音克隆装置未通过伦理审查，系统自动驳回";
  }

  // 伦理状态同步：涉及克隆且未走过审查流程时，标记为待审
  const nextEthicsStatus = hasClone && profile.ethicsStatus === "not_required" ? "pending" : profile.ethicsStatus;

  await prisma.whisperProfile.update({
    where: { id },
    data: {
      status: finalDecision === "active" ? "active" : "rejected",
      enabled: finalDecision === "active",
      isPublic: finalDecision === "active",
      ethicsStatus: nextEthicsStatus,
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

/**
 * 声音克隆伦理审查（子流程）。
 *
 * 依据规划方案的法律合规框架：声音克隆属于对逝者生物特征的复刻，
 * 除近亲属单独同意外，还须经平台伦理审查确认：
 *   - 样本来源合法（逝者生前录音，非公开渠道抓取）
 *   - 已取得近亲属单独同意，且其他近亲属无异议
 *   - 逝者生前无明确反对表示
 *   - 用途仅限家庭追思，不用于商业或对外传播
 */
export async function reviewWhisperEthics(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const note = String(formData.get("note") || "").slice(0, 500);
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  const profile = await prisma.whisperProfile.findUnique({ where: { id } });
  if (!profile) return;

  const approved = decision === "approved";

  await prisma.whisperProfile.update({
    where: { id },
    data: {
      ethicsStatus: approved ? "approved" : "rejected",
      ethicsReviewer: user.name || user.email || user.id,
      ethicsReviewedAt: new Date(),
      ethicsNote: note || null,
      // 伦理未通过时，已上线装置立即下线
      ...(approved ? {} : { enabled: false, status: "rejected" }),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: `whisper_ethics_${decision}${note ? `:${note.slice(0, 100)}` : ""}`,
      entity: "WhisperProfile",
      entityId: id,
    },
  });

  revalidatePath("/admin/review");
  revalidatePath("/whispers");
}
