"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const VALID_STATUS = ["pending", "processing", "done", "rejected"];

/**
 * 后台「服务工单」：受理 / 完成 / 驳回，并写入处理备注。
 * 仅 admin / editor 可操作。
 */
export async function updateServiceFulfillment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  const adminNote = String(formData.get("adminNote") || "").trim();
  if (!id) return;
  if (!VALID_STATUS.includes(status)) return;

  await prisma.serviceFulfillment.update({
    where: { id },
    data: { status, adminNote, updatedAt: new Date() },
  });
  revalidatePath("/admin/services");
}
