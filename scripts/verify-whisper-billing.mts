/**
 * 阶段2 验收：收费链路
 *   下单 → 模拟支付 → 配额到账 → 积分返利
 *   以及按次购买、声音克隆资格、配额消费与耗尽
 */
import { PrismaClient } from "@prisma/client";
import { createOrder } from "@/lib/orders";
import { simulatePay } from "@/lib/pay";
import {
  getQuota,
  grantPlan,
  addExtraMinutes,
  consumeRound,
  PLAN_SPECS,
  SINGLE_PACK,
  WHISPER_POINTS,
} from "@/lib/whisper";
import { spendPoints, earnPoints } from "@/lib/points";
import { isPremium, isPremiumUntil } from "@/lib/premium";

const prisma = new PrismaClient();

let pass = 0, fail = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) { pass++; console.log(`PASS  ${name}  ${extra}`); }
  else { fail++; console.log(`FAIL  ${name}  ${extra}`); }
}

const EMAIL = "user@test.com";
const user = await prisma.user.findUnique({ where: { email: EMAIL } });
if (!user) throw new Error("测试用户不存在");

console.log(`\n测试用户：${user.email}\n`);

// ---------- 0. 重置状态 ----------
await prisma.whisperQuota.deleteMany({ where: { userId: user.id } });
await prisma.user.update({
  where: { id: user.id },
  data: { points: 2000, premiumUntil: null },
});
console.log("已重置配额与积分\n");

// ---------- 1. 定价常量自洽 ----------
check("思念版定价 ¥59（云 TTS 成本下不亏）", PLAN_SPECS.basic.priceFen === 5900);
check("长夜版定价 ¥99", PLAN_SPECS.premium.priceFen === 9900);
check("按次 10 分钟 ¥6", SINGLE_PACK.priceFen === 600 && SINGLE_PACK.minutes === 10);
check("思念版含 300 分钟", PLAN_SPECS.basic.monthlyMins === 300);
check("长夜版含 900 分钟", PLAN_SPECS.premium.monthlyMins === 900);
check("长夜版放开资料条数上限", PLAN_SPECS.premium.memoryLimit === -1);
check("免费档无语音时长", PLAN_SPECS.free.monthlyMins === 0);

// ---------- 2. 未订阅时是 free 档 ----------
let q = await getQuota(user.id);
check("未订阅 → free 档", q.plan === "free", `plan=${q.plan}`);
check("free 档轮次 30", q.remainingRounds === 30, `剩余 ${q.remainingRounds}`);
check("free 档无语音分钟", q.remainingMins === 0);

// ---------- 3. 免费档尝试语音对话 → 应被拒 ----------
let r = await consumeRound(user.id, { minutes: 3, isVoice: true });
check("free 档语音对话被拒", !r.ok, r.ok ? "" : r.message);
if (!r.ok) check("拒绝原因正确", r.reason === "minutes_exhausted", r.reason);

// ---------- 4. 免费档文字对话 → 应通过 ----------
await prisma.whisperQuota.deleteMany({ where: { userId: user.id } });
r = await consumeRound(user.id, { minutes: 0, isVoice: false });
check("free 档文字对话通过", r.ok);
if (r.ok) check("轮次已扣减（30→29）", r.snapshot.remainingRounds === 29, `剩余 ${r.snapshot.remainingRounds}`);

// ---------- 5. 走真实下单+支付：思念版 ----------
const basicProduct = await prisma.product.findUnique({ where: { slug: "whisper-basic" } });
check("思念版商品存在", !!basicProduct);
if (basicProduct) {
  const order = await createOrder({ userId: user.id, productId: basicProduct.id });
  check("订单创建成功", order.status === "pending", order.orderNo);
  check("订单金额正确 ¥59", order.payAmount === 5900, `实得 ${order.payAmount} 分`);

  const paid = await simulatePay(order.orderNo);
  check("支付成功", paid.status === "paid");

  // 校验支付记录
  const pm = await prisma.payment.findFirst({ where: { orderId: order.id } });
  check("支付记录已写入", pm?.status === "success", `channel=${pm?.channel}`);

  // 校验配额到账
  q = await getQuota(user.id);
  check("支付后 → basic 档", q.plan === "basic", `plan=${q.plan}`);
  check("语音分钟到账 300", q.remainingMins === 300, `剩余 ${q.remainingMins}`);
  check("周期结束时间已设置", !!q.periodEnd);

  // 校验用户级 premium 授予
  const after = await prisma.user.findUnique({ where: { id: user.id } });
  check("用户 premiumUntil 已授予", isPremium(after), `${after?.premiumUntil?.toISOString().slice(0, 10)}`);

  // 校验消费返积分：¥59 → 59×3 = 177 分
  const expectEarn = Math.floor(5900 / 100) * 3;
  const pts = await prisma.pointLog.findFirst({
    where: { userId: user.id, reason: { contains: order.orderNo } },
  });
  check(`消费返积分 ${expectEarn}`, pts?.amount === expectEarn, `实得 ${pts?.amount}`);
}

// ---------- 6. 订阅后语音对话可通过并扣分钟 ----------
r = await consumeRound(user.id, { minutes: 3, isVoice: true });
check("basic 档语音对话通过", r.ok);
if (r.ok) {
  check("分钟已扣减（300→297）", r.snapshot.usedMins === 3, `已用 ${r.snapshot.usedMins}`);
  check("剩余分钟 297", r.snapshot.remainingMins === 297, `剩余 ${r.snapshot.remainingMins}`);
}

// ---------- 7. 按次购买 ----------
const singleProduct = await prisma.product.findUnique({ where: { slug: "whisper-single" } });
check("按次商品存在", !!singleProduct);
if (singleProduct) {
  const order = await createOrder({ userId: user.id, productId: singleProduct.id });
  await simulatePay(order.orderNo);
  q = await getQuota(user.id);
  check("按次购买 +10 分钟", q.extraMins === 10, `extraMins=${q.extraMins}`);
  check("剩余分钟含按次 307", q.remainingMins === 307, `剩余 ${q.remainingMins}`);
}

// ---------- 8. 升级长夜版 ----------
const premiumProduct = await prisma.product.findUnique({ where: { slug: "whisper-premium" } });
check("长夜版商品存在", !!premiumProduct);
if (premiumProduct) {
  const order = await createOrder({ userId: user.id, productId: premiumProduct.id });
  await simulatePay(order.orderNo);
  q = await getQuota(user.id);
  check("升级后 → premium 档", q.plan === "premium", `plan=${q.plan}`);
  // 订阅额度重置为 900，但已购买的按次分钟（10）应保留累加
  check("语音分钟 900 + 保留按次 10 = 910", q.remainingMins === 910, `剩余 ${q.remainingMins}`);
  check("订阅额度已重置为 900", q.monthlyMins === 900, `monthlyMins=${q.monthlyMins}`);
  check("轮次放开", q.remainingRounds > 9000, `剩余 ${q.remainingRounds}`);
}

// ---------- 9. 分钟耗尽时的降级 ----------
await prisma.whisperQuota.update({
  where: { userId: user.id },
  data: { usedMins: 900, extraMins: 0 },
});
r = await consumeRound(user.id, { minutes: 5, isVoice: true });
check("分钟耗尽后语音被拒", !r.ok);
if (!r.ok) check("拒绝原因=minutes_exhausted", r.reason === "minutes_exhausted", r.reason);
r = await consumeRound(user.id, { minutes: 0, isVoice: false });
check("分钟耗尽后文字仍可用", r.ok);

// ---------- 10. 积分兑换 ----------
await prisma.user.update({ where: { id: user.id }, data: { points: 2000 } });
const p1 = await spendPoints({
  userId: user.id,
  amount: WHISPER_POINTS.CLONE_UNLOCK,
  reason: "兑换声音克隆资格",
});
check(`积分兑换克隆资格（${WHISPER_POINTS.CLONE_UNLOCK} 分）`, p1);
let u = await prisma.user.findUnique({ where: { id: user.id } });
check("积分已扣减 2000→1000", u?.points === 1000, `实得 ${u?.points}`);

const p2 = await spendPoints({
  userId: user.id,
  amount: WHISPER_POINTS.MINUTES_10,
  reason: "兑换 10 分钟时长",
});
check(`积分兑换 10 分钟（${WHISPER_POINTS.MINUTES_10} 分）`, p2);
await addExtraMinutes(user.id, 10);
q = await getQuota(user.id);
check("兑换后按次分钟 +10", q.extraMins === 10, `extraMins=${q.extraMins}`);

const p3 = await spendPoints({
  userId: user.id,
  amount: 99999,
  reason: "超额兑换",
});
check("积分不足时兑换失败", !p3);

// ---------- 11. premium 工具函数 ----------
check("isPremiumUntil(null) = false", !isPremiumUntil(null));
check("isPremiumUntil(过去) = false", !isPremiumUntil(new Date(Date.now() - 86400000)));
check("isPremiumUntil(未来) = true", isPremiumUntil(new Date(Date.now() + 86400000)));

// ---------- 收尾：重置为 premium 便于后续走查 ----------
await grantPlan(user.id, "premium");
await prisma.user.update({ where: { id: user.id }, data: { points: 2000 } });

console.log(`\n通过 ${pass}/${pass + fail}`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
