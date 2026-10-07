"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { spendPoints, earnPoints, REDEEM_DAILY_LIMIT, dailyRedeemedPoints } from "@/lib/points";
import { grantOffering } from "@/lib/offerings";
import { issueDecorEntitlement, resolveDecorEntitlement } from "@/lib/decor-products";
import { grantObituaryQuota } from "@/lib/obituary";
import { isServiceProduct, createServiceFulfillment } from "@/lib/service";

export type RedeemState = { error?: string; ok?: boolean };

/**
 * 用积分兑换虚拟商品。纪念馆类自动开通纪念馆空间。
 */
export async function redeemItem(_prev: RedeemState, formData: FormData): Promise<RedeemState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const productId = String(formData.get("productId") || "");
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.status !== "active") {
    return { error: "商品不存在或已下架" };
  }
  if (product.pointsPrice == null) {
    return { error: "该商品不支持积分兑换" };
  }
  // 实体商品不开放积分兑换（第一阶段积分仅用于虚拟产品）
  if (product.type === "physical_goods") {
    return { error: "实体商品暂不支持积分兑换" };
  }

  // 每日兑换上限（含本次）。单次不再设独立上限：兑换按商品自身积分价扣一次分，
  // 不可能超过自身价（详见 lib/points.ts 的 REDEEM_DAILY_LIMIT 注释）。
  const redeemedToday = await dailyRedeemedPoints(user.id!);
  if (redeemedToday + product.pointsPrice > REDEEM_DAILY_LIMIT) {
    return {
      error: `今日已兑换 ${redeemedToday} 积分，超出每日上限（${REDEEM_DAILY_LIMIT} 积分），请明日再试`,
    };
  }

  const ok = await spendPoints({
    userId: user.id!,
    amount: product.pointsPrice,
    reason: `积分兑换：${product.name}`,
  });
  if (!ok) {
    return { error: "积分不足，无法兑换" };
  }

  const redemption = await prisma.pointRedemption.create({
    data: {
      userId: user.id!,
      productId: product.id,
      points: product.pointsPrice,
      status: "done",
    },
  });

  // 虚拟祭品 / 纪念物品：积分兑换与商城购买走**同一份库存**，
  // 兑换即入库，之后在纪念馆/宗祠祭拜时消耗。
  if (product.type === "virtual_flower" || product.type === "tribute_item") {
    await grantOffering(user.id!, product.id, 1);
  }

  // 纪念馆类：自动开通空间
  // ⚠️ 2026-10 起建馆免费（/halls/new），memorial_hall 商品已全部下架，
  //    正常流程走不到这里（redeemItem 已在上方拦 status !== "active"）。
  //    保留为防御路径：若管理员重新激活商品，兑换行为仍然正确。
  if (product.type === "memorial_hall") {
    await prisma.memorialHall.create({
      data: {
        ownerUserId: user.id!,
        name: `${product.name}空间`,
        deceasedName: "待补充",
        description: "由积分兑换自动开通，请尽快完善逝者信息。",
        isPublic: false,
        status: "active",
        orderId: null,
      },
    });
  }

  /*
    空间装修（纪念馆/宗祠模板与装饰套件）：解锁权益。
    ⚠️ 这条分支**不能漏** —— 漏了就是"扣了积分、写了一条兑换记录，但什么都没到手"。
    与货币购买走同一个 `issueDecorEntitlement`，所以两条路在界面上完全等价
    （不会出现"用积分换的锁还在"）。
    注意：装修是**馆**的属性，但这里刻意 spread 到该用户名下所有对应类型的馆，
    理由见 lib/decor-products.ts 的 issueDecorEntitlement 注释。
  */
  if (product.type === "decor") {
    const ent = resolveDecorEntitlement(product.slug);
    if (!ent) {
      /*
        解析不出来说明商品配置有误（例如 slug 前缀写错）。
        这里**必须真退积分**：只把 status 改成 revoked 是自欺欺人 ——
        积分已经扣了、余额不会回来，用户照样拿不到东西。
        退回比让用户吃哑巴亏强，而且能立刻在流水里看到。
      */
      await earnPoints({
        userId: user.id!,
        amount: product.pointsPrice,
        reason: `装修商品配置异常退回：${product.name}`,
        kind: "adjust",
        refId: redemption.id,
      });
      await prisma.pointRedemption.update({
        where: { id: redemption.id },
        data: { status: "revoked" },
      });
      return { error: "该装修商品配置有误，积分已退回，请联系管理员" };
    }
    await issueDecorEntitlement(user.id!, ent);
  }

  /*
    电子讣告发布：积分兑换同样发放**发布配额**，与货币购买走同一个 `grantObituaryQuota`，
    落到同一张 ObituaryQuota 表 —— 两条路在控制台完全等价。

    ⚠️ 必须 `&& slug === "e-obituary"`：memorial_service 类型下还有传记代写 /
    纪念视频 / 扫码云碑，只判 type 会让兑换"追思视频"的用户静默拿到讣告配额。

    ⚠️ 发放失败必须**真退积分**（只改 status 是自欺欺人 —— 积分已扣、用户没拿到东西）。
    与上方 decor 分支同源。
  */
  if (product.type === "memorial_service" && product.slug === "e-obituary") {
    try {
      await grantObituaryQuota(user.id!, 1);
    } catch {
      await earnPoints({
        userId: user.id!,
        amount: product.pointsPrice,
        reason: `电子讣告配额发放异常退回：${product.name}`,
        kind: "adjust",
        refId: redemption.id,
      });
      await prisma.pointRedemption.update({
        where: { id: redemption.id },
        data: { status: "revoked" },
      });
      return { error: "电子讣告配额发放失败，积分已退回，请稍后重试" };
    }
  }

  /*
    服务受理类商品（云祭扫 / 非讣告纪念服务）：人工服务，无自动履约能力。
    积分兑换成功后自动建一张 `pending` 受理单。与货币路径同源（simulatePay 分支）。

    用 isServiceProduct 统一判定，避免把 e-obituary（走 ObituaryQuota）误纳入。

    ⚠️ 建单失败必须**真退积分**：只改 status 是自欺欺人 —— 积分已扣、用户没拿到受理单。
  */
  if (isServiceProduct(product)) {
    try {
      await createServiceFulfillment({
        userId: user.id!,
        productId: product.id,
        slug: product.slug,
        productName: product.name,
        type: product.type,
        redemptionId: redemption.id,
      });
    } catch {
      await earnPoints({
        userId: user.id!,
        amount: product.pointsPrice,
        reason: `服务受理单创建失败退回：${product.name}`,
        kind: "adjust",
        refId: redemption.id,
      });
      await prisma.pointRedemption.update({
        where: { id: redemption.id },
        data: { status: "revoked" },
      });
      return { error: "服务受理创建失败，积分已退回，请稍后重试" };
    }
  }

  revalidatePath("/points");
  revalidatePath("/halls");
  revalidatePath("/console");
  revalidatePath("/console/obituaries");
  return { ok: true, error: undefined };
}
