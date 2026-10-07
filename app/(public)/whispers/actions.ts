"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export type WhisperActionResult = { ok: boolean; message?: string; profileId?: string };

/**
 * 在指定纪念馆下开设「午夜悄悄话」装置。
 *
 * 前置：
 *   - 已登录
 *   - 是该纪念馆的馆主
 *   - 该纪念馆尚未开设装置（hallId 唯一）
 * 新装置一律 status=pending / enabled=false，需完成授权与资料后送审。
 */
export async function createWhisperProfile(formData: FormData): Promise<WhisperActionResult> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const hallId = String(formData.get("hallId") || "");
  const personaName = String(formData.get("personaName") || "").trim().slice(0, 30);
  const personTitle = String(formData.get("personTitle") || "").trim().slice(0, 20);

  if (!hallId) return { ok: false, message: "请选择纪念馆" };

  const hall = await prisma.memorialHall.findUnique({
    where: { id: hallId },
    select: { id: true, ownerUserId: true, name: true, deceasedName: true, status: true },
  });
  if (!hall) return { ok: false, message: "纪念馆不存在" };
  if (hall.ownerUserId !== user.id) return { ok: false, message: "只有馆主可以开设装置" };

  const exists = await prisma.whisperProfile.findUnique({ where: { hallId }, select: { id: true } });
  if (exists) {
    return { ok: true, message: "该纪念馆已开设追思装置", profileId: exists.id };
  }

  const profile = await prisma.whisperProfile.create({
    data: {
      ownerUserId: user.id,
      hallId,
      personaName: personaName || hall.deceasedName,
      personTitle: personTitle || null,
      status: "pending",
      enabled: false,
      mode: "voice",
    },
  });

  // 附带一份免费预设声线与形象，便于立刻试用
  const presets = await prisma.whisperVoice.findMany({ where: { isPreset: true }, take: 1 });
  if (presets[0]) {
    await prisma.whisperProfile.update({
      where: { id: profile.id },
      data: { voiceId: presets[0].id },
    });
  }

  revalidatePath("/console");
  revalidatePath("/console/whispers", "layout");
  revalidatePath("/whispers");
  return { ok: true, message: "已开设追思装置，请继续完善资料与家属授权", profileId: profile.id };
}
