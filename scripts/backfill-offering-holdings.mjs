/**
 * 一次性回填：把历史已付款订单里的祭品，转成消耗式库存（OfferingHolding）。
 *
 * ⚠️ 只在供奉体系上线时跑一次，之后不要再跑。
 *
 * 为什么必须回填：重构前「是否拥有祭品」直接查 OrderItem，改成查库存后，
 * 老用户此前买过的祭品若不回填就会凭空消失 —— 用户第一眼就会认为功能坏了。
 *
 * 口径：库存 = 历史已付量 - 已消耗量。功能上线前不存在消耗，故 已付量 即 应剩量。
 * 因为用的是**覆盖写**，重复执行会把已消耗掉的量重置回历史总量 —— 这是本脚本
 * 不能反复运行的根本原因。
 *
 * 运行：node scripts/backfill-offering-holdings.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const rows = await prisma.$queryRaw`
  SELECT o."userId" AS uid, oi."productId" AS pid, SUM(oi.quantity)::int AS qty
  FROM "Order" o
  JOIN "OrderItem" oi ON oi."orderId" = o.id
  JOIN "Product" p ON p.id = oi."productId"
  WHERE o.status = 'paid'
    AND p.type IN ('virtual_flower', 'tribute_item')
  GROUP BY o."userId", oi."productId"
`;

let written = 0;
for (const r of rows) {
  await prisma.offeringHolding.upsert({
    where: { userId_productId: { userId: r.uid, productId: r.pid } },
    create: { userId: r.uid, productId: r.pid, quantity: Number(r.qty) },
    update: { quantity: Number(r.qty) },
  });
  written++;
}

console.log(`回填库存 ${written} 行（来源：已付款订单的 virtual_flower / tribute_item）`);
await prisma.$disconnect();
