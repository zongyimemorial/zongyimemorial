"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { markAllRead } from "@/lib/notify";
import { prisma } from "@/lib/db";

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
