"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { earnPoints, spendPoints, TRIBUTE_MESSAGE_POINTS } from "@/lib/points";
import { maskIdentity } from "@/lib/mask";
import { consumeOffering, refundOffering, topUpFreeOfferings } from "@/lib/offerings";
import { notifyOwnerOfTribute } from "@/lib/notify";

/**
 * 宗祠祭祀 / 消费记录
 *
 * 设计要点：
 *  - 记录写入时冻结「身份快照」：displayName（脱敏，公开展示）、
 *    realNameSnap / contactSnap（完整值，仅馆主在管理台可见）。
 *    冻结而非实时联表，是为了避免用户日后修改 realName 导致历史记录身份漂移。
 *  - amountFen 恒为 0：现金供奉统一走商城下单流程，金额绝不从前端接收，
 *    从根本上杜绝伪造金额入账。本 action 只处理「免费祭品」与「积分供奉」。
 *  - 免费祭品发积分（+2），与纪念馆祭拜规则一致。
 */

type OfferingType = "incense" | "flower" | "candle" | "offering" | "wine" | "message" | "music";

/** 免费祭品 slug → 宗祠祭祀类型 */
const SLUG_TO_TYPE: Record<string, OfferingType> = {
  "free-incense": "incense",
  "free-food": "offering",
  "free-rice": "offering",
  "free-fruit": "offering",
  "free-tea": "offering",
  "free-clean": "offering",
  "free-flower": "flower",
  "free-wreath": "flower",
  "free-lotus": "candle",
  "free-lantern": "candle",
  "free-candle": "candle",
  "free-star": "candle",
  "free-moon": "candle",
  "free-wine": "wine",
  "free-message": "message",
  "free-letter": "message",
  "free-poem": "message",
  "free-story": "message",
  "free-music": "music",
  "free-song": "music",
  "free-bell": "music",
  "free-chime": "music",
  "free-scripture": "music",
  "free-prayer": "message",
  "free-bow": "message",
  "free-tree": "offering",
  "free-willow": "offering",
  "free-kite": "message",
  "free-dove": "message",
  "free-firework": "candle",
};

/**
 * 献祭（统一入口）。
 * 免费祭品 → 不扣分、发 +2 积分；积分供奉 → 扣对应积分。
 * 返回前端的消息既有成功也有失败文案。
 */
export async function offerClanTribute(
  clanHallId: string,
  productId: string,
  message?: string,
): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录后再献祭" };

  const [hall, product] = await Promise.all([
    prisma.clanHall.findUnique({ where: { id: clanHallId } }),
    prisma.product.findUnique({ where: { id: productId } }),
  ]);
  if (!hall || hall.status !== "active") return { ok: false, message: "该宗祠暂不可献祭" };
  // 准入看 isRitual（能不能献祭），不看 isFree（收不收费）——
  // 收费礼器只要配了积分价，同样可以在宗祠用积分供奉。
  if (!product || product.status !== "active" || !product.isRitual)
    return { ok: false, message: "该祭品暂不可用" };

  const text = (message ?? "").trim().slice(0, 200);

  // ---- 消耗库存 ----
  // 重构前这里靠「30 秒冷却 + 免费每日 30 次上限」防刷，且收费品只是"扣分即祭"。
  // 现在统一为消耗制：先扣一份库存，再记账。（冷却与日上限随之删除 ——
  // 每日配额已比 30 次上限严格得多，两套机制并存只会让行为无法解释。
  // 配额数值见 lib/offerings.ts 的 FREE_DAILY_QUOTA，此处不复述，避免两处对不上。）
  if (product.isFree) await topUpFreeOfferings(user.id);

  const consumed = await consumeOffering(user.id, productId);
  if (!consumed.ok) {
    return {
      ok: false,
      message: product.isFree
        ? consumed.reason === "no_holding"
          ? "今日免费祭品尚未补充，请稍后重试"
          : `今日「${product.name}」已用尽，明日再续`
        : "库存不足，请先到商城敬献或用积分兑换",
    };
  }

  // ---- 积分供奉：扣减积分（失败则回滚已扣的库存）----
  let pointsCost = 0;
  if (!product.isFree) {
    if (product.pointsPrice == null || product.pointsPrice <= 0) {
      await refundOffering(user.id, productId);
      return { ok: false, message: "该供奉需通过商城下单，暂不支持直接献祭" };
    }
    pointsCost = product.pointsPrice;
    const paid = await spendPoints({
      userId: user.id,
      amount: pointsCost,
      reason: `宗祠供奉：${product.name}`,
      refId: clanHallId,
    });
    if (!paid) {
      // 先扣库存后扣分，所以积分不足时必须把库存还回去，否则用户白丢一件祭品
      await refundOffering(user.id, productId);
      return { ok: false, message: `积分不足，需 ${pointsCost} 积分` };
    }
  }

  // ---- 身份快照（脱敏展示 + 馆主可见完整值）----
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { realName: true, phone: true, email: true },
  });
  const ident = maskIdentity(dbUser);

  await prisma.$transaction([
    prisma.clanTribute.create({
      data: {
        clanHallId,
        userId: user.id,
        productId,
        type: SLUG_TO_TYPE[product.slug] ?? "offering",
        displayName: ident.display,
        realNameSnap: ident.realName,
        contactSnap: ident.contact,
        amountFen: 0, // 现金恒为 0，绝不从前端接收
        pointsCost,
        message: text || null,
      },
    }),
    // 供台陈列：与流水分开记账。本表只存 productId，绝不带身份字段。
    prisma.offeringOnAltar.create({
      data: { clanHallId, userId: user.id, productId },
    }),
  ]);

  // ---- 免费献祭发积分（+2），与纪念馆留言规则一致 ----
  // 放在扣库存成功之后：库存不足已被拦在上面，不会出现"没献上也发分"
  if (product.isFree) {
    await earnPoints({
      userId: user.id,
      amount: TRIBUTE_MESSAGE_POINTS,
      reason: text ? "宗祠留言献祭" : "宗祠祭祀",
      refId: clanHallId,
    });
  }

  // 站内信：族亲来祭祀，通知祠主（自己献自己的不发）。事务已提交，通知失败不影响主流程。
  await notifyOwnerOfTribute({
    ownerUserId: hall.ownerUserId,
    actorUserId: user.id,
    hallName: hall.name,
    hallLink: `/clan/halls/${clanHallId}`,
    actionLabel: text ? "留下了一段追思留言" : `敬献了「${product.name}」`,
    actorDisplay: ident.display,
  });

  revalidatePath(`/clan/halls/${clanHallId}`);
  revalidatePath(`/console/clan-halls/${clanHallId}`);

  return {
    ok: true,
    message: text ? "祭文已送达，心意已达" : `${product.name}已献上，心意已达`,
  };
}

/**
 * 撤供：清空**本人**摆在宗祠供台上的供品。
 *
 * 与纪念馆侧同口径 —— 只撤自己的，避免任何访客一键清空别人的供奉陈列。
 */
export async function clearClanAltar(
  clanHallId: string,
): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录后再操作" };

  const res = await prisma.offeringOnAltar.updateMany({
    where: { clanHallId, userId: user.id, clearedAt: null },
    data: { clearedAt: new Date() },
  });

  revalidatePath(`/clan/halls/${clanHallId}`);
  return { ok: true, message: res.count > 0 ? `已撤下 ${res.count} 件供品` : "供台已是空的" };
}
