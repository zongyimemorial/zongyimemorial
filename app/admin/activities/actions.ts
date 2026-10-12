"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { ModerationStatus } from "@prisma/client";

/** 活动类型（与 seed / 前台展示口径一致） */
const KINDS = ["祭祖大典", "宗亲联谊", "修谱研讨", "家族议事"];

function isStaff(role?: string | null) {
  return role === "admin" || role === "editor" || role === "super_admin";
}

/** 平台后台发布/编辑活动（新建或更新二合一；支持「直接发布」与「存为待审」） */
export async function saveActivity(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) redirect("/console");

  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const startAtRaw = String(formData.get("startAt") || "").trim();
  if (!title) throw new Error("标题必填");
  if (!location) throw new Error("活动地点必填");
  if (!startAtRaw) throw new Error("活动时间必填");
  const startAt = new Date(startAtRaw);
  if (Number.isNaN(startAt.getTime())) throw new Error("活动时间格式不正确");

  const kindRaw = String(formData.get("kind") || "");
  const kind = KINDS.includes(kindRaw) ? kindRaw : KINDS[0];
  const capacity = Math.max(1, Number(formData.get("capacity") || 100) || 100);

  // intent: publish=直接发布(approved) | pending=存为待审
  const intent = String(formData.get("intent") || "pending");
  const reviewStatus = (intent === "publish" ? "approved" : "pending") as ModerationStatus;

  const data = {
    title,
    kind,
    surname: String(formData.get("surname") || "").trim() || null,
    location,
    onlineLink: String(formData.get("onlineLink") || "").trim() || null,
    coverImage: String(formData.get("coverImage") || "").trim() || null,
    description: String(formData.get("description") || "").trim() || null,
    startAt,
    capacity,
    reviewStatus,
    reviewedAt: reviewStatus === "approved" ? new Date() : null,
  };

  if (id) {
    await prisma.clanActivity.update({ where: { id }, data });
  } else {
    await prisma.clanActivity.create({ data: { ...data, createdByUserId: user.id } });
  }

  revalidatePath("/admin/activities");
  revalidatePath("/clan/activities");
  revalidatePath("/clan");
  redirect("/admin/activities");
}

/** 删除活动（平台后台专用） */
export async function deleteActivity(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) redirect("/console");

  const id = String(formData.get("id") || "");
  if (!id) return;

  await prisma.clanActivity.delete({ where: { id } });
  revalidatePath("/admin/activities");
  revalidatePath("/clan/activities");
  revalidatePath("/clan");
  redirect("/admin/activities");
}
