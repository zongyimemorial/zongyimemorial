import { prisma } from "@/lib/db";

/**
 * 敬献大花圈（付费祭献陈列）
 *
 * 规则（产品口径，2026-10）：
 *   - 每座馆**同时最多 2 个**有效花圈（写入与履约双重校验，展示端只取 2）；
 *   - 祭献后陈列 **3 天**，到期自动消失；
 *   - 过期不跑定时任务：读侧懒清理（updateMany 置 removedAt）+ 查询条件双保险，
 *     与「appeal 补传截止实时判定」同一思路 —— 状态都是算出来的，不依赖 cron。
 *   - 付费走通用下单链路（/api/orders → simulatePay 履约），商品 slug 固定
 *     `grand-wreath`，价格在商品表维护（¥199，参考市面花圈价格带）。
 */

export const WREATH_PRODUCT_SLUG = "grand-wreath";
export const WREATH_MAX_PER_HALL = 2;
export const WREATH_TTL_MS = 3 * 24 * 3600 * 1000;

/** 懒清理：把已过期但未标记的花圈置为 removedAt（幂等） */
export async function sweepExpiredWreaths(hallId?: string) {
  const now = new Date();
  await prisma.hallWreath.updateMany({
    where: {
      removedAt: null,
      expiresAt: { lte: now },
      ...(hallId ? { hallId } : {}),
    },
    data: { removedAt: now },
  });
}

/** 馆内当前有效花圈数（未撤下且未过期） */
export async function countActiveWreaths(hallId: string): Promise<number> {
  return prisma.hallWreath.count({
    where: { hallId, removedAt: null, expiresAt: { gt: new Date() } },
  });
}

/** 馆内有效花圈（展示用，最多 2 个，新在前） */
export async function listActiveWreaths(hallId: string) {
  await sweepExpiredWreaths(hallId);
  return prisma.hallWreath.findMany({
    where: { hallId, removedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: WREATH_MAX_PER_HALL,
    select: { id: true, message: true, createdAt: true, expiresAt: true },
  });
}

/** 取花圈商品（不存在/下架返回 null） */
export async function getWreathProduct() {
  return prisma.product.findUnique({
    where: { slug: WREATH_PRODUCT_SLUG },
    select: { id: true, name: true, price: true, status: true },
  });
}
