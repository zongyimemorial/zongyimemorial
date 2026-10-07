"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CLAN_DEFAULT_DECOR } from "@/lib/clan-decor";
import { issueGrant } from "@/lib/decor-grant";
import { currentOrigin } from "@/lib/origin";

/**
 * 设立宗祠（免费，需实名认证）。
 * 建好后跳转到宗祠管理台继续装修。
 */
export async function createClanHall(formData: FormData) {
  const user = await getCurrentUser();
  const origin = (await currentOrigin()) ?? "";
  if (!user?.id) redirect(`${origin}/login?from=/clan/halls/new`);
  if (!user!.idVerified) {
    redirect(`${origin}/clan/halls/new?err=${encodeURIComponent("设立宗祠需先完成实名认证")}`);
  }

  const surname = String(formData.get("surname") || "").trim().slice(0, 10);
  const hallName = String(formData.get("hallName") || "").trim().slice(0, 40);
  const name = String(formData.get("name") || "").trim().slice(0, 20);
  const originPlace = String(formData.get("origin") || "").trim().slice(0, 60);
  const ancestorName = String(formData.get("ancestorName") || "").trim().slice(0, 20);
  const ancestorTitle = String(formData.get("ancestorTitle") || "").trim().slice(0, 30);
  const description = String(formData.get("description") || "").trim().slice(0, 2000);
  const generationPoem = String(formData.get("generationPoem") || "").trim().slice(0, 2000);

  if (!surname) redirect(`${origin}/clan/halls/new?err=${encodeURIComponent("请填写姓氏")}`);
  if (!hallName) redirect(`${origin}/clan/halls/new?err=${encodeURIComponent("请填写宗祠名称")}`);
  if (!name) redirect(`${origin}/clan/halls/new?err=${encodeURIComponent("请填写堂号")}`);

  const hall = await prisma.clanHall.create({
    data: {
      ownerUserId: user!.id!,
      surname,
      hallName,
      name,
      origin: originPlace || null,
      ancestorName: ancestorName || null,
      ancestorTitle: ancestorTitle || null,
      description: description || null,
      generationPoem: generationPoem || null,
      archive: { photos: [] },
      templateConfig: { decor: { slots: { ...CLAN_DEFAULT_DECOR }, unlocked: [] } },
      status: "pending",
      isPublic: true,
    },
    select: { id: true },
  });

  /*
    建馆赠品：新宗祠自动获赠一套模板（永久免费，见 lib/decor-grant.ts）。
    仅在"建成这一刻"发放 —— 用户口径是「只在建新馆时免费赠送一套」。
  */
  await issueGrant("clan", hall.id);

  revalidatePath("/clan/halls");
  redirect(`${origin}/console/clan-halls/${hall.id}?created=1`);
}
