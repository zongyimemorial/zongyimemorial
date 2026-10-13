"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { findAppByToken } from "@/lib/memorial";

/**
 * 申请人（家属/近亲属）凭管理凭证免登录操作。
 * 三条动作均按 manageToken 鉴权，不要求登录。
 *
 * 语义：撤回=软操作（申请撤回即移除队列；纪念堂置 TAKEN_DOWN 保留记录）；
 *       删除=硬删除（永久，含审计）。
 */

/** 撤回申请：仅对尚未上线（PENDING/REJECTED）的申请生效，删除申请记录。 */
export async function applicantWithdrawApplication(formData: FormData) {
  const token = String(formData.get("token") || "");
  const app = await findAppByToken(token);
  if (!app) return;
  // 已上线（有关联 memorial）的申请不可"只删申请"，须先撤下/删除纪念堂
  if (app.status === "APPROVED" && app.memorial) return;
  if (app.status !== "PENDING" && app.status !== "REJECTED") return;

  await prisma.publicMemorialApplication.delete({ where: { id: app.id } });

  await prisma.auditLog.create({
    data: {
      action: "memorial_applicant_withdraw",
      entity: "PublicMemorialApplication",
      entityId: app.id,
    },
  });

  revalidatePath("/memorial/application/manage");
  revalidatePath("/admin/memorial-review");
}

/** 撤下纪念堂：将已上线的纪念堂置 TAKEN_DOWN（软下架，保留记录）。 */
export async function applicantTakedownMemorial(formData: FormData) {
  const token = String(formData.get("token") || "");
  const reason = String(formData.get("reason") || "").slice(0, 200);
  const app = await findAppByToken(token);
  if (!app || !app.memorial) return;
  if (app.memorial.status !== "APPROVED") return;

  await prisma.publicMemorial.update({
    where: { id: app.memorial.id },
    data: { status: "TAKEN_DOWN", takedownReason: reason || "家属申请撤回" },
  });

  await prisma.auditLog.create({
    data: {
      action: `memorial_applicant_takedown${reason ? `:${reason}` : ""}`,
      entity: "PublicMemorial",
      entityId: app.memorial.id,
    },
  });

  revalidatePath("/memorial/application/manage");
  revalidatePath("/memorial");
  revalidatePath("/admin/memorial-review");
}

/** 删除纪念堂（永久）：硬删除纪念堂及其留言/花圈/祭品，并删除申请记录。 */
export async function applicantDeleteMemorial(formData: FormData) {
  const token = String(formData.get("token") || "");
  const app = await findAppByToken(token);
  if (!app) return;

  await prisma.$transaction(async (tx) => {
    if (app.memorialId) {
      // 先解除申请对纪念堂的引用，否则 FK 阻止删除纪念堂
      await tx.publicMemorialApplication.update({
        where: { id: app.id },
        data: { memorialId: null },
      });
    }
    if (app.memorial) {
      await tx.publicMemorial.delete({ where: { id: app.memorial.id } });
    }
    await tx.publicMemorialApplication.delete({ where: { id: app.id } });
  });

  await prisma.auditLog.create({
    data: {
      action: "memorial_applicant_delete",
      entity: "PublicMemorial",
      entityId: app.memorialId ?? app.id,
    },
  });

  revalidatePath("/memorial/application/manage");
  revalidatePath("/memorial");
  revalidatePath("/admin/memorial-review");
}
