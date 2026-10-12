"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { LiveStatus } from "@prisma/client";

const CATEGORIES = ["公祭仪式", "生态安葬仪式", "宗祠落成", "祭祖大典", "追悼会"];

/** 能进直播后台的角色（新建/编辑/删除共用同一口径，别各写一份） */
async function requireLiveAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) {
    redirect("/console");
  }
  return user;
}

/** 表单里的 status 只可能是这三个；非法值一律当「预告」，避免写进脏枚举 */
function normalizeStatus(v: string): LiveStatus {
  return v === "live" || v === "ended" ? v : "scheduled";
}

function normalizeEmbedType(v: string) {
  return v === "iframe" ? "iframe" : "video";
}

function readFields(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("标题必填");
  const category = String(formData.get("category") || "").trim();
  return {
    title,
    description: String(formData.get("description") || ""),
    status: normalizeStatus(String(formData.get("status") || "scheduled")),
    category: CATEGORIES.includes(category) ? category : null,
    embedType: normalizeEmbedType(String(formData.get("embedType") || "video")),
    streamUrl: String(formData.get("streamUrl") || "").trim() || null,
  };
}

export async function createLive(formData: FormData) {
  await requireLiveAdmin();
  const f = readFields(formData);
  const now = new Date();

  await prisma.liveSession.create({
    data: {
      ...f,
      // 创建时就按所选状态落时间戳：直接建「直播中」/「回放」也能自洽。
      startedAt: f.status === "scheduled" ? null : now,
      endedAt: f.status === "ended" ? now : null,
    },
  });

  revalidatePath("/admin/live");
  revalidatePath("/live");
  redirect("/admin/live");
}

/**
 * 编辑既有直播。
 *
 * ⚠️ 这个 action 的存在本身就是「修 bug」：此前全站只有 createLive，
 * 直播一旦创建，标题/地址/状态全改不了 —— 而公开的《直播指引》明确让主办方
 * 「先设预告，当天再改成直播中，结束后改成回放」。
 * 指引承诺了一个做不到的操作，等于把用户引到死角（只能去改数据库）。
 * 现在补齐编辑能力，并在这里实现时间戳状态机，让指引那句话变成真的。
 *
 * 时间戳状态机（startedAt / endedAt）：
 *   scheduled → 两个都清空（回到「还没开始」，与指引「预告期可反复改」一致）
 *   live      → 首次开播写 startedAt；从「回放」改回「直播中」则清 endedAt（重新开播）
 *   ended     → 写 endedAt；若此前从未开播过，startedAt 也补上（保底，避免"结束了却没开始"）
 * 这样「改状态即自动记入开播/结束时间」才真正成立。
 */
export async function updateLive(formData: FormData) {
  await requireLiveAdmin();
  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("缺少直播 id");
  const f = readFields(formData);

  const before = await prisma.liveSession.findUnique({
    where: { id },
    select: { startedAt: true, endedAt: true },
  });
  if (!before) throw new Error("直播不存在");

  const now = new Date();
  let startedAt = before.startedAt;
  let endedAt = before.endedAt;

  if (f.status === "scheduled") {
    startedAt = null;
    endedAt = null;
  } else if (f.status === "live") {
    if (!startedAt) startedAt = now;
    endedAt = null;
  } else {
    // ended
    if (!startedAt) startedAt = now;
    endedAt = endedAt ?? now;
  }

  await prisma.liveSession.update({
    where: { id },
    data: { ...f, startedAt, endedAt },
  });

  revalidatePath("/admin/live");
  revalidatePath("/live");
  revalidatePath(`/live/${id}`);
  redirect("/admin/live");
}

/** 删除（误建的直播总得能撤掉，否则那条脏数据永远挂在直播大厅里） */
export async function deleteLive(formData: FormData) {
  await requireLiveAdmin();
  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("缺少直播 id");

  await prisma.liveSession.delete({ where: { id } });

  revalidatePath("/admin/live");
  revalidatePath("/live");
}
