import { prisma } from "@/lib/db";

/**
 * 电子讣告发布配额。
 *
 * 配额语义：**一次购买/兑换 = 可发布 1 份讣告**（单次服务，非订阅）。
 * 与 `OfferingHolding` 同源的「消耗式」范式：购买 increment，发布 decrement。
 *
 * 剩余份数一律 `purchased - used` **现算**，不落派生列 ——
 * 与全站「同一个事实只允许一个判据」纪律一致（落派生列必有一天与真相错位）。
 */

/** 供 `grantObituaryQuota` / `consumeObituaryQuota` 复用的最小 db 契约（可传事务 tx）。 */
type ObituaryDb = {
  obituaryQuota: {
    upsert: (a: unknown) => Promise<unknown>;
    updateMany: (a: unknown) => Promise<unknown>;
  };
};

/**
 * 发放讣告发布配额（货币购买 / 积分兑换共用）。
 *
 * ⚠️ **必须传 `tx`**（在 `simulatePay` 的事务里）：用全局 prisma 会写到事务外，
 *    主事务一回滚就变成"订单没付成、配额却发了"。
 *
 * 两条路（买 / 兑）都调这一个函数、落到同一张 `ObituaryQuota` 表 ——
 * 因此"用积分换的配额"与"花钱买的配额"在控制台完全等价。
 *
 * @returns 发放后的剩余可发布份数
 */
export async function grantObituaryQuota(
  userId: string,
  qty: number,
  db?: ObituaryDb,
): Promise<number> {
  const n = Math.max(1, Math.round(Number(qty) || 1));
  const c = (db ?? prisma) as unknown as NonNullable<ObituaryDb>;

  const row = (await c.obituaryQuota.upsert({
    where: { userId },
    create: { userId, purchased: n, used: 0 },
    update: { purchased: { increment: n } },
    select: { purchased: true, used: true },
  })) as { purchased: number; used: number };

  return Math.max(0, row.purchased - row.used);
}

/** 读取剩余可发布份数（不存在则 0，不写库）。 */
export async function obituaryQuotaLeft(userId: string): Promise<number> {
  const row = await prisma.obituaryQuota.findUnique({
    where: { userId },
    select: { purchased: true, used: true },
  });
  return row ? Math.max(0, row.purchased - row.used) : 0;
}

/**
 * 原子消耗 1 份发布配额。
 *
 * 用 updateMany 的**条件写**（used < purchased）+ count 检测，而不是"先查后减"：
 * 后者在并发下会出现两个请求都读到还够、都减 1 → 超发。
 * Prisma 不支持字段间比较，故先读 `purchased` 作上界**常量**，
 * 由数据库行锁保证不超发（与 `consumeOffering` 同构，无 TOCTOU）。
 *
 * @returns true = 消耗成功；false = 配额不足
 */
export async function consumeObituaryQuota(
  userId: string,
  db?: ObituaryDb,
): Promise<boolean> {
  const c = (db ?? prisma) as unknown as NonNullable<ObituaryDb>;

  const row = (await prisma.obituaryQuota.findUnique({
    where: { userId },
    select: { purchased: true, used: true },
  })) as { purchased: number; used: number } | null;

  if (!row || row.used >= row.purchased) return false;

  const res = (await c.obituaryQuota.updateMany({
    where: { userId, used: { lt: row.purchased } },
    data: { used: { increment: 1 } },
  })) as { count: number };

  return res.count > 0;
}
