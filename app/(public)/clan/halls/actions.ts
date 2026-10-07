"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CLAN_DEFAULT_DECOR } from "@/lib/clan-decor";
import { issueGrant } from "@/lib/decor-grant";
import { currentOrigin } from "@/lib/origin";
import { saveHallImage } from "@/lib/upload";
import { MATERIAL_TYPES, type MaterialItem, type ProofsPayload } from "@/lib/hall-review";

/**
 * 设立宗祠（免费，需实名认证）。
 * 建好后跳转到宗祠管理台继续装修。
 *
 * 2026-10 审核改造：宗祠仅走「标准通道」补充基础佐证材料
 * （宗族关系证明 / 族谱记载 / 祠堂历史照片或证明），统一先审后显
 * （isPublic 在建馆时为 false，后台通过后置 true —— 修掉此前
 * 「pending 却 isPublic:true」直接公开的合规口子）。
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

  const applicantIdCard = String(formData.get("applicantIdCard") || "").trim().slice(0, 18);
  const applicantPhone = String(formData.get("applicantPhone") || "").trim().slice(0, 11);
  const applicantRealName = String(formData.get("applicantRealName") || "").trim().slice(0, 30);

  if (!surname) redirect(`${origin}/clan/halls/new?err=${encodeURIComponent("请填写姓氏")}`);
  if (!hallName) redirect(`${origin}/clan/halls/new?err=${encodeURIComponent("请填写宗祠名称")}`);
  if (!name) redirect(`${origin}/clan/halls/new?err=${encodeURIComponent("请填写堂号")}`);

  // 宗祠基础佐证材料（标准通道）：文本说明 + 可选图片（file 在 server action 里直接落盘）
  const clanTypes = ["clan_relation", "genealogy_record", "clan_history_photo"] as const;
  const materials: MaterialItem[] = [];
  let hasAny = false;
  for (const type of clanTypes) {
    const value = String(formData.get(`mat_${type}`) || "").trim().slice(0, 200);
    const file = formData.get(`file_${type}`);
    let url: string | undefined;
    if (file instanceof File && file.size > 0) {
      try {
        url = await saveHallImage(file, user!.id!, "proofs");
      } catch {
        redirect(`${origin}/clan/halls/new?err=${encodeURIComponent(`${MATERIAL_TYPES[type].label}图片上传失败`)}`);
      }
    }
    if (value || url) {
      hasAny = true;
      materials.push({ type, label: MATERIAL_TYPES[type].label, value: value || undefined, url: url || undefined });
    }
  }
  if (!hasAny) {
    redirect(
      `${origin}/clan/halls/new?err=${encodeURIComponent("请提供至少一项宗祠佐证材料（宗族关系证明 / 族谱记载 / 祠堂历史照片或证明）")}`,
    );
  }

  const proofs: ProofsPayload = {
    applicantRealName: applicantRealName || undefined,
    applicantIdCard,
    applicantPhone,
    relation: "宗亲",
    materials,
    promiseSigned: true,
  };

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
      isPublic: false, // 先审后显：修掉「pending 却直接公开」的合规口子
      reviewChannel: "standard",
      proofs: proofs as object,
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
