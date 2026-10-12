"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { issueGrant } from "@/lib/decor-grant";
import { currentOrigin } from "@/lib/origin";
import { track, acqChannelFromCookie } from "@/lib/analytics";
import {
  CHANNEL_META,
  SUPPLEMENT_DAYS,
  validateSubmission,
  type ChannelKey,
  type MaterialItem,
  type ProofsPayload,
} from "@/lib/hall-review";

/**
 * 免费申请建馆（2026-10 商业模式调整：纪念馆/宗祠均免费建立，需实名认证）。
 *
 * 与旧付费通道（商城 ¥98/¥198 商品 → 订单支付回调建馆，见 lib/pay.ts 的
 * memorial_hall 分支）的区别**只在"不收钱"**，三项合规要求一字不松：
 *   ① 实名门槛（MZ/T 173—2025 是监管要求，与是否收费无关）；
 *   ② 多渠道替代核验（三通道分层，不再死守火化证明一种材料）；
 *   ③ status=pending + 人工审核通过才公开（admin/review 的 reviewHall，
 *      与付费通道、宗祠设立共用同一条审核流）。
 *
 * 免费版永久保存；装修升级（素材/模板/套件）另计 —— 到期回退免费档，
 * 详见 lib/hall-decor.ts 的 entitlements（#224）。
 */
export async function createMemorialHall(formData: FormData) {
  const user = await getCurrentUser();
  const origin = (await currentOrigin()) ?? "";
  if (!user?.id) redirect(`${origin}/login?from=/halls/new`);

  /*
    实名门槛：重新查 DB，不用 session 里的 idVerified ——
    session 可能是实名认证前的旧值（认证在别的页面完成后，
    本会话的 JWT/cookie 未刷新时它还停留在 false，反之亦然）。
    与 /api/orders 的 needRealname 判定同口径：两条建馆路径的门禁必须一致。
  */
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { idVerified: true, realName: true },
  });
  if (!dbUser?.idVerified) {
    redirect(`${origin}/halls/new?err=${encodeURIComponent("申请建馆需先完成实名认证")}`);
  }

  const deceasedName = String(formData.get("deceasedName") || "").trim().slice(0, 30);
  const channelRaw = String(formData.get("channel") || "standard");
  const channel: ChannelKey = (CHANNEL_META as Record<string, unknown>)[channelRaw]
    ? (channelRaw as ChannelKey)
    : "standard";
  const relation = String(formData.get("relation") || "").trim().slice(0, 20);
  const applicantIdCard = String(formData.get("applicantIdCard") || "")
    .trim()
    .slice(0, 18);
  const applicantPhone = String(formData.get("applicantPhone") || "").trim().slice(0, 11);
  const applicantRealName = String(formData.get("applicantRealName") || dbUser.realName || "")
    .trim()
    .slice(0, 30);
  const relationProof = String(formData.get("relationProof") || "").trim().slice(0, 200);
  const promiseLetter = String(formData.get("promiseLetter") || "").trim().slice(0, 300);
  const promiseSigned =
    formData.get("promiseSigned") === "on" || formData.get("promiseSigned") === "true";

  // 共同字段校验（与 /api/orders 的 memorial_hall 分支逐字同口径）
  if (!deceasedName || !relation) {
    redirect(`${origin}/halls/new?err=${encodeURIComponent("请完整填写逝者姓名与逝者关系")}`);
  }
  if (!/^1\d{10}$/.test(applicantPhone)) {
    redirect(`${origin}/halls/new?err=${encodeURIComponent("经办人手机号格式不正确")}`);
  }
  if (!/^\d{17}[\dXx]$/.test(applicantIdCard)) {
    redirect(`${origin}/halls/new?err=${encodeURIComponent("经办人身份证号格式不正确")}`);
  }

  // 解析客户端组装的 materials JSON（结构化文本条目 + 可选图片 URL）
  let materials: MaterialItem[] = [];
  try {
    const raw = String(formData.get("materials") || "[]");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      materials = arr
        .filter(
          (m: { type?: unknown; value?: unknown; url?: unknown }) =>
            m && typeof m.type === "string" && (m.value?.toString().trim() || m.url?.toString().trim()),
        )
        .map((m: { type: string; label?: unknown; value?: unknown; url?: unknown }) => ({
          type: m.type,
          label: typeof m.label === "string" ? m.label : m.type,
          value: typeof m.value === "string" ? m.value.slice(0, 200) : undefined,
          url: typeof m.url === "string" ? m.url.slice(0, 300) : undefined,
        }));
    }
  } catch {
    redirect(`${origin}/halls/new?err=${encodeURIComponent("材料数据格式错误，请重试")}`);
  }

  const proofs: ProofsPayload = {
    applicantRealName: applicantRealName || undefined,
    applicantIdCard,
    applicantPhone,
    relation,
    relationProof: relationProof || undefined,
    materials,
    promiseLetter: promiseLetter || undefined,
    promiseSigned,
  };

  // 通道材料规则 + 合规底线（appeal 还需关系证明 + 承诺书）
  const v = validateSubmission(channel, proofs);
  if (!v.ok) {
    redirect(`${origin}/halls/new?err=${encodeURIComponent(v.error || "材料校验未通过")}`);
  }

  const hall = await prisma.memorialHall.create({
    data: {
      ownerUserId: user.id,
      name: `${deceasedName}纪念馆`,
      deceasedName,
      description: "建馆申请已提交，证明材料审核通过后对公众展示。",
      isPublic: false,
      status: "pending",
      reviewChannel: channel,
      proofs: proofs as object,
      // 特殊申述通道：设 60 天补传截止（实时判定，无 cron）
      ...(channel === "appeal"
        ? {
            supplementDeadline: new Date(
              Date.now() + SUPPLEMENT_DAYS * 24 * 60 * 60 * 1000,
            ),
          }
        : {}),
    },
    select: { id: true },
  });

  // 分析埋点：建馆转化（渠道归因读首访 acq_channel cookie）
  await track({
    type: "create_hall",
    userId: user.id,
    channel: await acqChannelFromCookie(),
    path: "/halls/new",
  });

  /*
    建馆赠品：新馆自动获赠一套模板（永久免费）。
    免费通道没有支付事务，issueGrant 失败的极端情形也只是"馆建成、赠品未发"，
    可由后台补发 —— 与付费通道"必须传 tx"的约束不冲突（那边是事务内调用）。
  */
  await issueGrant("hall", hall.id);

  revalidatePath("/halls");
  redirect(`${origin}/console/halls/${hall.id}`);
}
