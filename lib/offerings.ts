import { prisma } from "@/lib/db";

/**
 * 供奉体系的库存核心。
 *
 * 背景：重构前「是否拥有祭品」是隐式的 —— 直接查 OrderItem（买过 = 永久无限用），
 * 于是同一件祭品可以无限次祭拜。改成消耗制后，拥有关系显式落在 OfferingHolding：
 *   获得（购买 / 积分兑换 / 每日免费补货）→ quantity 增加
 *   祭拜                                        → quantity 减 1，为 0 时不可再点
 */

/** 免费祭品每日配额（每件各自计数）。回到纪念馆/宗祠时懒补货到该值。 */
export const FREE_DAILY_QUOTA = 3;

/** 供台最多陈列几件（只摆最近的，防止被刷屏成一排小图标） */
export const ALTAR_MAX_ITEMS = 12;

/** 自然日 0 点（服务器本地时区，与 lib/points.ts 的口径保持一致） */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 懒补货：把该用户所有「免费礼器」的库存补到每日配额。
 *
 * 幂等且并发安全：
 *  - 先用 freeTopUpDate === 今天 过滤掉今天已补过的行，正常情况下不会重复写库；
 *  - update 分支用**覆盖写**（设为配额）而非 increment。
 *    即使两个请求同时越过过滤，结果也收敛到配额，不会累加成 6。
 *
 * 返回实际补货的商品数（供调试与测试断言）。
 */
export async function topUpFreeOfferings(userId: string): Promise<number> {
  const day = startOfToday();

  const freeProducts = await prisma.product.findMany({
    where: { isFree: true, isRitual: true, status: "active" },
    select: { id: true },
  });
  if (freeProducts.length === 0) return 0;
  const ids = freeProducts.map((p) => p.id);

  // 今天已补过的：跳过
  const doneRows = await prisma.offeringHolding.findMany({
    where: { userId, productId: { in: ids }, freeTopUpDate: day },
    select: { productId: true },
  });
  const done = new Set(doneRows.map((r) => r.productId));

  const todo = ids.filter((id) => !done.has(id));
  if (todo.length === 0) return 0;

  await prisma.$transaction(
    todo.map((productId) =>
      prisma.offeringHolding.upsert({
        where: { userId_productId: { userId, productId } },
        create: { userId, productId, quantity: FREE_DAILY_QUOTA, freeTopUpDate: day },
        update: { quantity: FREE_DAILY_QUOTA, freeTopUpDate: day },
      }),
    ),
  );

  return todo.length;
}

export type ConsumeResult =
  | { ok: true; remaining: number }
  | { ok: false; reason: "no_stock" | "no_holding" };

/**
 * 原子消耗一件祭品。
 *
 * 用 updateMany 的**条件写**（quantity > 0）+ count 检测，而不是"先查后减"：
 * 后者在并发下会出现两个请求都读到 1、都认为够用、都减 1 → 变成 -1。
 * 条件写由数据库行锁保证，count === 0 即代表库存不足，无 TOCTOU。
 */
export async function consumeOffering(
  userId: string,
  productId: string,
): Promise<ConsumeResult> {
  const res = await prisma.offeringHolding.updateMany({
    where: { userId, productId, quantity: { gt: 0 } },
    data: { quantity: { decrement: 1 } },
  });

  if (res.count === 0) {
    // 区分「从未持有」与「持有但用尽」，前者文案应引导去获得
    const exists = await prisma.offeringHolding.findUnique({
      where: { userId_productId: { userId, productId } },
      select: { id: true },
    });
    return { ok: false, reason: exists ? "no_stock" : "no_holding" };
  }

  const row = await prisma.offeringHolding.findUnique({
    where: { userId_productId: { userId, productId } },
    select: { quantity: true },
  });
  return { ok: true, remaining: row?.quantity ?? 0 };
}

/**
 * 回滚一次消耗（用于"先扣库存、后扣积分"且积分失败时的补偿）。
 * 只做 increment，不承担业务校验。
 */
export async function refundOffering(userId: string, productId: string): Promise<void> {
  await prisma.offeringHolding.updateMany({
    where: { userId, productId },
    data: { quantity: { increment: 1 } },
  });
}

/**
 * 发放祭品到库存（购买 / 积分兑换）。
 * 与每日免费补货不同，这里用 increment —— 购买是叠加，不是覆盖。
 */
export async function grantOffering(
  userId: string,
  productId: string,
  quantity = 1,
): Promise<number> {
  const qty = Math.max(1, Math.round(quantity));
  const row = await prisma.offeringHolding.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId, quantity: qty },
    update: { quantity: { increment: qty } },
    select: { quantity: true },
  });
  return row.quantity;
}
