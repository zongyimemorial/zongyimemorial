"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { markAllRead } from "@/lib/notify";
import { prisma } from "@/lib/db";
import { POINTS_VALID_MONTHS } from "@/lib/points";

/** 控制台「全部标为已读」：通知看板的小操作，只动当前用户自己的数据 */
export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await markAllRead(user.id!);
  revalidatePath("/console");
}

/**
 * 控制台「我的服务」：提交/更新受理单需求资料。
 * 只动当前用户自己的受理单（id 归属校验），且不允许改已 done/rejected 的单。
 */
export async function submitServiceIntake(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const id = String(formData.get("id") || "");
  if (!id) return;

  const intake = String(formData.get("intake") || "").trim();
  const contact = String(formData.get("contact") || "").trim();

  const existing = await prisma.serviceFulfillment.findUnique({
    where: { id },
    select: { userId: true, status: true },
  });
  // 归属校验 + 终态保护：只能改自己名下、且尚未完成/驳回的单
  if (!existing || existing.userId !== user.id) return;
  if (existing.status === "done" || existing.status === "rejected") return;

  await prisma.serviceFulfillment.update({
    where: { id },
    data: { intake, contact, updatedAt: new Date() },
  });
  revalidatePath("/console");
}

/**
 * 控制台「我的服务」：撤回一张「待受理」(pending) 的受理单。
 *
 * 约束（与 submitServiceIntake 同源）：
 *  - 仅本人名下；
 *  - 仅当状态为 `pending`（管理员尚未受理）时可撤回 —— 一旦受理中/已完成/已驳回则不可撤回。
 *
 * 撤回时**原路退回**已支付的代价：
 *  - 积分兑换（redemptionId）：退回积分并把兑换单置 `revoked`（与积分兑换失败真退积分同源）；
 *  - 现金订单（orderId）：内测为模拟支付、无真实资金流动，仅将该订单标记 `refunded`。
 *
 * 撤回后状态置 `cancelled`，保留记录便于追溯，不物理删除。
 */
export async function withdrawServiceFulfillment(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const id = String(formData.get("id") || "");
  if (!id) return;

  const existing = await prisma.serviceFulfillment.findUnique({
    where: { id },
    select: { userId: true, status: true, orderId: true, redemptionId: true },
  });
  // 归属校验 + 仅未受理可撤回
  if (!existing || existing.userId !== user.id) return;
  if (existing.status !== "pending") return;

  await prisma.$transaction(async (tx) => {
    // 1) 积分兑换：原路退回积分 + 兑换单置 revoked
    if (existing.redemptionId) {
      const redemption = await tx.pointRedemption.findUnique({
        where: { id: existing.redemptionId },
        select: { points: true, status: true },
      });
      if (redemption && redemption.status !== "revoked") {
        const expireAt = new Date();
        expireAt.setMonth(expireAt.getMonth() + POINTS_VALID_MONTHS);
        await tx.user.update({
          where: { id: user.id! },
          data: { points: { increment: redemption.points } },
        });
        await tx.pointLog.create({
          data: {
            userId: user.id!,
            kind: "adjust",
            amount: redemption.points,
            reason: `撤回服务受理退回：${id}`,
            refId: existing.redemptionId,
            expireAt,
          },
        });
        await tx.pointRedemption.update({
          where: { id: existing.redemptionId },
          data: { status: "revoked" },
        });
      }
    }

    // 2) 现金订单：内测模拟支付无真实资金，仅标记已退款
    if (existing.orderId) {
      await tx.order.updateMany({
        where: { id: existing.orderId, status: "paid" },
        data: { status: "refunded" },
      });
    }

    // 3) 受理单置为已撤回（保留记录）
    await tx.serviceFulfillment.update({
      where: { id },
      data: { status: "cancelled", updatedAt: new Date() },
    });
  });

  revalidatePath("/console");
}
