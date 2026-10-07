"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { issueGrant } from "@/lib/decor-grant";
import { currentOrigin } from "@/lib/origin";

/**
 * 免费申请建馆（2026-10 商业模式调整：纪念馆/宗祠均免费建立，需实名认证）。
 *
 * 与旧付费通道（商城 ¥98/¥198 商品 → 订单支付回调建馆，见 lib/pay.ts 的
 * memorial_hall 分支）的区别**只在"不收钱"**，三项合规要求一字不松：
 *   ① 实名门槛（MZ/T 173—2025 是监管要求，与是否收费无关）；
 *   ② 建馆证明材料五字段（逝者姓名 / 火化证明 / 关系 / 经办人身份证 / 手机号）；
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
    select: { idVerified: true },
  });
  if (!dbUser?.idVerified) {
    redirect(`${origin}/halls/new?err=${encodeURIComponent("申请建馆需先完成实名认证")}`);
  }

  const deceasedName = String(formData.get("deceasedName") || "").trim().slice(0, 30);
  const fireProof = String(formData.get("fireProof") || "").trim().slice(0, 60);
  const relation = String(formData.get("relation") || "").trim().slice(0, 20);
  const applicantIdCard = String(formData.get("applicantIdCard") || "").trim().slice(0, 18);
  const applicantPhone = String(formData.get("applicantPhone") || "").trim().slice(0, 11);

  // MZ/T 173—2025 材料校验（与 /api/orders 的 memorial_hall 分支逐字同口径）
  if (!deceasedName || !fireProof || !relation) {
    redirect(`${origin}/halls/new?err=${encodeURIComponent("请完整填写逝者姓名、火化证明编号与逝者关系")}`);
  }
  if (!/^1\d{10}$/.test(applicantPhone)) {
    redirect(`${origin}/halls/new?err=${encodeURIComponent("经办人手机号格式不正确")}`);
  }
  if (!/^\d{17}[\dXx]$/.test(applicantIdCard)) {
    redirect(`${origin}/halls/new?err=${encodeURIComponent("经办人身份证号格式不正确")}`);
  }

  const hall = await prisma.memorialHall.create({
    data: {
      ownerUserId: user.id,
      name: `${deceasedName}纪念馆`,
      deceasedName,
      description: "建馆申请已提交，证明材料审核通过后对公众展示。",
      isPublic: false,
      status: "pending",
      /*
        证明材料冻结在馆上（快照口径，与付费通道一致）——
        用户日后的实名信息变更不回溯改写这份材料。
      */
      proofs: {
        fireProof,
        applicantIdCard,
        applicantPhone,
        relation,
        realName: true,
      },
    },
    select: { id: true },
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
