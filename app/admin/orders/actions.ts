"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function markShipped(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.order.update({
    where: { id },
    data: { shipStatus: "shipped" },
  });
  revalidatePath("/admin/orders");
}
