"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { slugify } from "@/lib/memorial";

/** 后台角色守卫：仅管理员 / 超级管理员可操作公益纪念审核 */
async function requireStaff() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) redirect("/console");
  return user;
}

/**
 * 通过申请 → 生成最高级别（imperial）公开纪念堂 PublicMemorial，并回写申请记录。
 * 合规：仅当申请处于 PENDING 且 consentConfirmed 为 true 时放行。
 */
export async function approveApplication(formData: FormData) {
  const user = await requireStaff();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const app = await prisma.publicMemorialApplication.findUnique({ where: { id } });
  if (!app || app.status !== "PENDING" || !app.consentConfirmed) return;

  const memorial = await prisma.publicMemorial.create({
    data: {
      slug: slugify(app.deceasedName),
      name: app.deceasedName,
      category: app.category,
      birthYear: app.birthYear,
      deathYear: app.deathYear,
      honorTitle: app.honorTitle,
      summary: app.summary,
      story: app.story,
      sourceUrl: app.sourceUrl,
      portraitUrl: app.portraitUrl,
      grade: "imperial",
      status: "APPROVED",
      approvedById: user.id,
    },
  });

  await prisma.publicMemorialApplication.update({
    where: { id },
    data: {
      status: "APPROVED",
      memorialId: memorial.id,
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: `memorial_approve:${app.deceasedName}`,
      entity: "PublicMemorial",
      entityId: memorial.id,
    },
  });

  revalidatePath("/admin/memorial-review");
  revalidatePath("/memorial");
}

/** 驳回申请（填原因） */
export async function rejectApplication(formData: FormData) {
  const user = await requireStaff();
  const id = String(formData.get("id") || "");
  const note = String(formData.get("note") || "").slice(0, 200);
  if (!id) return;

  await prisma.publicMemorialApplication.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewNote: note || null,
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: `memorial_reject${note ? `:${note}` : ""}`,
      entity: "PublicMemorialApplication",
      entityId: id,
    },
  });

  revalidatePath("/admin/memorial-review");
}

/** 下架已上线纪念堂（家属申请或违规巡查） */
export async function takedownMemorial(formData: FormData) {
  const user = await requireStaff();
  const id = String(formData.get("id") || "");
  const reason = String(formData.get("reason") || "").slice(0, 200);
  if (!id) return;

  await prisma.publicMemorial.update({
    where: { id },
    data: { status: "TAKEN_DOWN", takedownReason: reason || null },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: `memorial_takedown${reason ? `:${reason}` : ""}`,
      entity: "PublicMemorial",
      entityId: id,
    },
  });

  revalidatePath("/admin/memorial-review");
  revalidatePath("/memorial");
}

/** 留言通过（先审后发） */
export async function approveMessage(formData: FormData) {
  const user = await requireStaff();
  const id = String(formData.get("id") || "");
  if (!id) return;

  await prisma.publicMemorialMessage.update({
    where: { id },
    data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "memorial_msg_approve",
      entity: "PublicMemorialMessage",
      entityId: id,
    },
  });

  revalidatePath("/admin/memorial-review");
}

/** 留言驳回 */
export async function rejectMessage(formData: FormData) {
  const user = await requireStaff();
  const id = String(formData.get("id") || "");
  if (!id) return;

  await prisma.publicMemorialMessage.update({
    where: { id },
    data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "memorial_msg_reject",
      entity: "PublicMemorialMessage",
      entityId: id,
    },
  });

  revalidatePath("/admin/memorial-review");
}

/**
 * 管理员永久删除纪念堂（硬删除）：解除申请引用、删除纪念堂及其留言/花圈/祭品。
 * 与申请人删除语义一致，但受后台角色守卫（admin / super_admin）。
 */
export async function deleteMemorialAdmin(formData: FormData) {
  const user = await requireStaff();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const memorial = await prisma.publicMemorial.findUnique({ where: { id } });
  if (!memorial) return;
  const app = await prisma.publicMemorialApplication.findFirst({ where: { memorialId: id } });

  await prisma.$transaction(async (tx) => {
    if (app) {
      // 先解除引用，否则 FK 阻止删除纪念堂
      await tx.publicMemorialApplication.update({
        where: { id: app.id },
        data: { memorialId: null, status: "REJECTED" },
      });
    }
    await tx.publicMemorial.delete({ where: { id } });
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "memorial_admin_delete",
      entity: "PublicMemorial",
      entityId: id,
    },
  });

  revalidatePath("/admin/memorial-review");
  revalidatePath("/memorial");
}

/**
 * 管理员永久删除申请（硬删除）：若申请已关联上线纪念堂，则一并删除纪念堂；
 * 否则仅删除申请记录。
 */
export async function deleteApplicationAdmin(formData: FormData) {
  const user = await requireStaff();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const app = await prisma.publicMemorialApplication.findUnique({
    where: { id },
    include: { memorial: true },
  });
  if (!app) return;

  await prisma.$transaction(async (tx) => {
    if (app.memorialId && app.memorial) {
      await tx.publicMemorialApplication.update({
        where: { id },
        data: { memorialId: null },
      });
      await tx.publicMemorial.delete({ where: { id: app.memorial.id } });
    }
    await tx.publicMemorialApplication.delete({ where: { id } });
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "memorial_admin_delete_app",
      entity: "PublicMemorialApplication",
      entityId: id,
    },
  });

  revalidatePath("/admin/memorial-review");
  revalidatePath("/memorial");
}
