"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CLAN_DEFAULT_DECOR } from "@/lib/clan-decor";
import { issueGrant } from "@/lib/decor-grant";
import { currentOrigin } from "@/lib/origin";
import { track, acqChannelFromCookie } from "@/lib/analytics";
import { saveHallImage } from "@/lib/upload";
import {
  CLAN_CHANNEL_META,
  MATERIAL_TYPES,
  SUPPLEMENT_DAYS,
  validateClanSubmission,
  type ClanChannelKey,
  type MaterialItem,
  type ProofsPayload,
} from "@/lib/hall-review";

/**
 * 设立宗祠（免费，需实名认证）。
 * 建好后跳转到宗祠管理台继续装修。
 *
 * 2026-10 审核改造：宗祠与纪念馆同构，支持三通道分层审核
 * （标准 / 替代 / 特殊申述），统一先审后显（isPublic 在建馆时为 false，
 * 后台通过后置 true；申述通道仅创建者可见，60 天补传期后转公开）。
 * 材料类型与服务端上传（saveHallImage）沿用旧宗祠表单的可用模式，不引入新端点。
 */
export async function createClanHall(formData: FormData) {
  const user = await getCurrentUser();
  const origin = (await currentOrigin()) ?? "";
  if (!user?.id) redirect(`${origin}/login?from=/clan/halls/new`);
  if (!user!.idVerified) {
    redirect(`${origin}/clan/halls/new?err=${encodeURIComponent("设立宗祠需先完成实名认证")}`);
  }

  // 审核通道：默认 standard，非法值回落 standard（与纪念馆 createMemorialHall 同口径）
  const channelRaw = String(formData.get("channel") || "standard");
  const channel: ClanChannelKey = (CLAN_CHANNEL_META as Record<string, unknown>)[channelRaw]
    ? (channelRaw as ClanChannelKey)
    : "standard";

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
  if (!/^\d{17}[\dXx]$/.test(applicantIdCard)) {
    redirect(`${origin}/clan/halls/new?err=${encodeURIComponent("经办人身份证号格式不正确")}`);
  }
  if (!/^1\d{10}$/.test(applicantPhone)) {
    redirect(`${origin}/clan/halls/new?err=${encodeURIComponent("经办人手机号格式不正确")}`);
  }

  // 宗祠佐证材料：按所选通道的 materialTypes 取文本说明 + 可选图片（file 在 server action 里直接落盘）
  const meta = CLAN_CHANNEL_META[channel];
  const materials: MaterialItem[] = [];
  for (const type of meta.materialTypes) {
    const value = String(formData.get(`mat_${type}`) || "").trim().slice(0, 200);
    const file = formData.get(`file_${type}`);
    let url: string | undefined;
    if (file instanceof File && file.size > 0) {
      try {
        url = await saveHallImage(file, user!.id!, "proofs");
      } catch {
        redirect(`${origin}/clan/halls/new?err=${encodeURIComponent(`${MATERIAL_TYPES[type as keyof typeof MATERIAL_TYPES].label}图片上传失败`)}`);
      }
    }
    if (value || url) {
      materials.push({
        type,
        label: MATERIAL_TYPES[type as keyof typeof MATERIAL_TYPES].label,
        value: value || undefined,
        url: url || undefined,
      });
    }
  }

  // 特殊申述通道：宗族关系说明（文本）+ 真实性承诺书（图片，服务端上传）
  const relationProof = String(formData.get("relationProof") || "").trim().slice(0, 200);
  let promiseLetter: string | undefined;
  const promiseFile = formData.get("file_promiseLetter");
  if (promiseFile instanceof File && promiseFile.size > 0) {
    try {
      promiseLetter = await saveHallImage(promiseFile, user!.id!, "proofs");
    } catch {
      redirect(`${origin}/clan/halls/new?err=${encodeURIComponent("真实性承诺书图片上传失败")}`);
    }
  }
  const promiseSigned =
    formData.get("promiseSigned") === "on" || formData.get("promiseSigned") === "true";

  const proofs: ProofsPayload = {
    applicantRealName: applicantRealName || undefined,
    applicantIdCard,
    applicantPhone,
    relation: "宗亲",
    relationProof: relationProof || undefined,
    materials,
    promiseLetter,
    // 非申述通道沿用旧口径（始终视为已具结）；申述通道以勾选为准
    promiseSigned: channel === "appeal" ? promiseSigned : true,
  };

  // 通道材料规则 + 合规底线（appeal 还需关系说明 + 承诺书）
  const v = validateClanSubmission(channel, proofs);
  if (!v.ok) {
    redirect(`${origin}/clan/halls/new?err=${encodeURIComponent(v.error || "材料校验未通过")}`);
  }

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
      reviewChannel: channel,
      // 特殊申述通道：设 60 天补传截止（实时判定，无 cron）
      ...(channel === "appeal"
        ? { supplementDeadline: new Date(Date.now() + SUPPLEMENT_DAYS * 24 * 60 * 60 * 1000) }
        : {}),
      proofs: proofs as object,
    },
    select: { id: true },
  });

  // 分析埋点：建祠转化（渠道归因读首访 acq_channel cookie）
  await track({
    type: "create_clan",
    userId: user!.id!,
    channel: await acqChannelFromCookie(),
    path: "/clan/halls/new",
  });

  /*
    建馆赠品：新宗祠自动获赠一套模板（永久免费，见 lib/decor-grant.ts）。
    仅在"建成这一刻"发放 —— 用户口径是「只在建新馆时免费赠送一套」。
  */
  await issueGrant("clan", hall.id);

  revalidatePath("/clan/halls");
  redirect(`${origin}/console/clan-halls/${hall.id}?created=1`);
}
