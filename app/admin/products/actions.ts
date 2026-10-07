"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { ProductType } from "@prisma/client";

export async function createProduct(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");

  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("名称必填");
  const type = (String(formData.get("type") || "physical_goods") as ProductType);
  const price = Math.max(0, parseInt(String(formData.get("price") || "0"), 10) || 0);
  const categoryId = String(formData.get("categoryId") || "");
  const description = String(formData.get("description") || "");

  await prisma.product.create({
    data: {
      name,
      slug: "p-" + Date.now().toString(36),
      type,
      price,
      categoryId,
      description,
      status: "active",
      stockType: "unlimited",
    },
  });

  revalidatePath("/admin/products");
  revalidatePath("/mall");
  redirect("/admin/products");
}
