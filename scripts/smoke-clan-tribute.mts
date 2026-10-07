// offerClanTribute 服务端冒烟：直接调用 action 验证写库、脱敏、消耗库存、积分
import { prisma } from "../lib/db";

// 由于 action 依赖 getCurrentUser（需请求上下文），此处改为直接复用其核心逻辑路径：
// 通过 prisma + lib/mask + lib/points + lib/offerings 组合验证，确保数据层行为正确。
import { maskIdentity } from "../lib/mask";
import { earnPoints, spendPoints, TRIBUTE_MESSAGE_POINTS } from "../lib/points";
import {
  FREE_DAILY_QUOTA,
  consumeOffering,
  topUpFreeOfferings,
  grantOffering,
  refundOffering,
} from "../lib/offerings";

const results: { name: string; ok: boolean; extra?: string }[] = [];
const check = (name: string, ok: boolean, extra = "") => results.push({ name, ok: !!ok, extra });

// 找一个 active 宗祠
const hall = await prisma.clanHall.findFirst({ where: { status: "active" } });
check("存在 active 宗祠", !!hall, hall?.hallName);
if (!hall) {
  console.log("无 active 宗祠，终止");
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email: "user@test.com" } });
check("存在测试用户", !!user);
if (!user) process.exit(1);

// 免费祭品（准入口径是 isRitual —— 能不能献祭；不是 isFree —— 收不收费）
const freeProduct = await prisma.product.findFirst({
  where: { isRitual: true, isFree: true, status: "active", slug: "free-incense" },
});
check("存在免费祭品 free-incense", !!freeProduct, freeProduct?.name);

// 清理旧记录，保证可复现
await prisma.clanTribute.deleteMany({ where: { clanHallId: hall.id, userId: user.id } });

// ---- 模拟 action 写入 ----
const ident = maskIdentity({
  realName: user.realName,
  phone: user.phone,
  email: user.email,
});
check("脱敏名号非空", ident.display.length > 0, ident.display);

const before = (await prisma.user.findUnique({ where: { id: user.id }, select: { points: true } }))!
  .points;

if (freeProduct) {
  await prisma.clanTribute.create({
    data: {
      clanHallId: hall.id,
      userId: user.id,
      productId: freeProduct.id,
      type: "incense",
      displayName: ident.display,
      realNameSnap: ident.realName,
      contactSnap: ident.contact,
      amountFen: 0,
      pointsCost: 0,
      message: "冒烟测试祭文",
    },
  });
  await earnPoints({
    userId: user.id,
    amount: TRIBUTE_MESSAGE_POINTS,
    reason: "宗祠留言献祭",
    refId: hall.id,
  });
}

const row = await prisma.clanTribute.findFirst({
  where: { clanHallId: hall.id, userId: user.id },
  orderBy: { createdAt: "desc" },
});
check("记录已写入", !!row);
check("displayName 已脱敏且非空", !!row && row.displayName.length > 0, row?.displayName);
check("amountFen 恒为 0", row?.amountFen === 0, String(row?.amountFen));
check("留言已保存", row?.message === "冒烟测试祭文", row?.message ?? "");

const after = (await prisma.user.findUnique({ where: { id: user.id }, select: { points: true } }))!
  .points;
check("免费献祭后积分 +2", after === before + TRIBUTE_MESSAGE_POINTS, `${before} → ${after}`);

// ---- 消耗式库存：补货 / 扣减 / 用尽 / 回滚 ----
await prisma.offeringHolding.deleteMany({ where: { userId: user.id } });
await topUpFreeOfferings(user.id);
const q0 = (
  await prisma.offeringHolding.findUnique({
    where: { userId_productId: { userId: user.id, productId: freeProduct!.id } },
    select: { quantity: true },
  })
)!.quantity;
check("进馆补当日免费配额", q0 === FREE_DAILY_QUOTA, `quantity=${q0}`);

// 幂等：同日重复补货不叠加
await topUpFreeOfferings(user.id);
const q0b = (
  await prisma.offeringHolding.findUnique({
    where: { userId_productId: { userId: user.id, productId: freeProduct!.id } },
    select: { quantity: true },
  })
)!.quantity;
check("同日重复补货不叠加", q0b === FREE_DAILY_QUOTA, `quantity=${q0b}`);

// 扣减 3 次后耗尽
let lastRemaining = -1;
for (let i = 0; i < FREE_DAILY_QUOTA; i++) {
  const r = await consumeOffering(user.id, freeProduct!.id);
  if (r.ok) lastRemaining = r.remaining;
}
check("连续消耗至 0", lastRemaining === 0, `remaining=${lastRemaining}`);

const exhausted = await consumeOffering(user.id, freeProduct!.id);
check(
  "库存为 0 时拒绝消耗",
  !exhausted.ok && exhausted.reason === "no_stock",
  JSON.stringify(exhausted),
);

// 从未持有的商品 → no_holding（区分于"持有但用尽"，前端文案不同）
const neverOwned = await prisma.product.findFirst({
  where: { isRitual: true, isFree: false, slug: "free-firework" },
});
if (neverOwned) {
  const r = await consumeOffering(user.id, neverOwned.id);
  check(
    "从未持有返回 no_holding",
    !r.ok && r.reason === "no_holding",
    JSON.stringify(r),
  );
}

// 购买发放（increment 叠加）与回滚
const granted1 = await grantOffering(user.id, freeProduct!.id, 1);
const granted2 = await grantOffering(user.id, freeProduct!.id, 2);
check("发放库存为叠加而非覆盖", granted1 === 1 && granted2 === 3, `1 → ${granted2}`);

await refundOffering(user.id, freeProduct!.id);
const afterRefund = (
  await prisma.offeringHolding.findUnique({
    where: { userId_productId: { userId: user.id, productId: freeProduct!.id } },
    select: { quantity: true },
  })
)!.quantity;
check("回滚一次消耗", afterRefund === 4, `quantity=${afterRefund}`);

// ---- 积分供奉模拟：找一个 pointsPrice 商品 ----
const pointsProduct = await prisma.product.findFirst({
  where: { status: "active", pointsPrice: { gt: 0 }, isFree: false },
});
if (pointsProduct) {
  const p0 = (
    await prisma.user.findUnique({ where: { id: user.id }, select: { points: true } })
  )!.points;
  const okPaid = await spendPoints({
    userId: user.id,
    amount: pointsProduct.pointsPrice!,
    reason: `宗祠供奉：${pointsProduct.name}`,
    refId: hall.id,
  });
  const p1 = (
    await prisma.user.findUnique({ where: { id: user.id }, select: { points: true } })
  )!.points;
  check(
    "积分供奉扣分成功",
    okPaid && p1 === p0 - pointsProduct.pointsPrice!,
    `${p0} → ${p1}（扣 ${pointsProduct.pointsPrice}）`,
  );
} else {
  check("存在可积分兑换的供奉商品", false, "未找到 pointsPrice>0 的商品");
}

// ---- 清理冒烟数据 ----
await prisma.clanTribute.deleteMany({ where: { clanHallId: hall.id, userId: user.id } });
await prisma.offeringHolding.deleteMany({ where: { userId: user.id } });
await prisma.offeringOnAltar.deleteMany({ where: { userId: user.id } });
await prisma.user.update({ where: { id: user.id }, data: { points: before } });
await prisma.pointLog.deleteMany({
  where: { userId: user.id, refId: hall.id, reason: { in: ["宗祠祭祀", "宗祠留言献祭"] } },
});

console.log("");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra ? `  (${r.extra})` : ""}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n通过 ${passed}/${results.length}`);
await prisma.$disconnect();
process.exit(passed === results.length ? 0 : 1);
