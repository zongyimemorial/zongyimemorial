"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { LiveStatus } from "@prisma/client";

const CATEGORIES = ["公祭仪式", "生态安葬仪式", "宗祠落成", "祭祖大典", "追悼会"];

export async function createLive(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("标题必填");
  const status = String(formData.get("status") || "scheduled") as LiveStatus;
  const streamUrl = String(formData.get("streamUrl") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const embedType = String(formData.get("embedType") || "video") === "iframe" ? "iframe" : "video";

  await prisma.liveSession.create({
    data: {
      title,
      description: String(formData.get("description") || ""),
      status,
      category: CATEGORIES.includes(category) ? category : null,
      embedType,
      streamUrl: streamUrl || null,
      startedAt: status === "live" ? new Date() : null,
      endedAt: status === "ended" ? new Date() : null,
    },
  });

  revalidatePath("/admin/live");
  revalidatePath("/live");
  redirect("/admin/live");
}
