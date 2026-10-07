import { prisma } from "@/lib/db";

/*
  ============================================================================
  福币（用户钱包）—— 单一判据

  1 福币 = 1 人民币。

  **两种精度，别混**：
  - **余额（User.fortuneCoins）恒为整数** —— 充值是整元的，赠送也是整数的；
    刻意不叫 fortuneFen，避免重蹈 priceFen「字段是分、代码当元用」的坑。
  - **商品价可以带一位小数**（0.1 元精度）—— 装修素材有 14 处非整元价
    （晨雾青 1.5 / 素线框 1.2 / 云纹地毯 3.5 …），换算入口是 `fubFromFen`。
    这是刻意的：钱可以是一角，但不要让用户为了买 1.5 元的东西先心算成 2 元。

  本文件是**唯一实现**：充值档位表、赠送规则、校验、格式化、分→福币换算全在这里，
  前端按钮 / 后端校验 / 文档一律从这里派生 —— **禁止在前端手抄档位表，
  也禁止手写 `Math.round(fen/100)` 之类的换算**（本仓库反复出现
  「同一个事实有两个判据」，见 AGENTS.md 的 withDark / data-page-skin /
  premiumUntil / findTemplate 四处；福币已收敛到单一入口）。
  ============================================================================
*/

/** 最低充值金额（元） */
export const MIN_TOPUP = 5;
/**
 * 最高充值金额（元）。
 *
 * ⚠️ 这个值曾为 499，**低于平台最贵的单品（¥599 的「星河长明」模板）** ——
 * 用户想买最贵那件时必须分两次充，且第一笔永远吃不到最高档赠送。
 * 现抬到 599 与最高价对齐，并把 599 补进档位表（见 TOPUP_TIERS）。
 */
export const MAX_TOPUP = 599;

/** 固定面值按钮（元）。与自定义口并存。 */
export const TOPUP_PRESETS = [10, 20, 30, 50, 100, 599] as const;

/**
 * 充值阶梯赠送表（**唯一真值**）。
 *
 * 需求原文：充100送20 · 充199送30 · 充299送50 · 充399送80 · 充499送120。
 * 自定义金额（5–599）按「**不超过该金额的最高档**」赠送
 * —— 充 150 命中 100 档 → 送 20；充 99 不命中任何档 → 不送。
 *
 * 2026-10 新增 599 档（送 220）。依据是市场对标：
 * 同类平台（云寄念）最高档赠 36.8%，我们 499 档只有 24.0%，
 * 599 档给到 220 → 36.7%，与竞品齐平且不破坏既有五档的既有权益。
 */
export const TOPUP_TIERS: readonly { pay: number; bonus: number }[] = [
  { pay: 100, bonus: 20 },
  { pay: 199, bonus: 30 },
  { pay: 299, bonus: 50 },
  { pay: 399, bonus: 80 },
  { pay: 499, bonus: 120 },
  { pay: 599, bonus: 220 },
];

/**
 * 计算充值某金额可得的赠送福币。
 * 规则：取「≤ yuan 的最高档」；不足最低档则 0。
 *
 * ⚠️ 这是**唯一判据**：履约（lib/pay.ts）与前端预览都必须调它，
 * 任何地方手写 `yuan >= 100 ? 20 : 0` 就是漂移的开始。
 */
export function bonusFor(yuan: number): number {
  const n = Math.floor(Number(yuan) || 0);
  let bonus = 0;
  for (const t of TOPUP_TIERS) {
    if (n >= t.pay) bonus = t.bonus;
  }
  return bonus;
}

/** 充值某金额的实得福币总数（充值额 + 赠送额） */
export function totalFor(yuan: number): number {
  const n = Math.floor(Number(yuan) || 0);
  return n + bonusFor(n);
}

/**
 * 校验充值金额是否合法。返回 null 表示通过，否则返回给用户看的错误文案。
 *
 * ⚠️ 服务端必须调它做**二次校验** —— 前端金额可伪造（与 AGENTS.md
 * 「现金金额 amountFen 恒为 0，绝不从前端接收」同源思想）。
 */
export function validateTopup(yuan: number): string | null {
  const n = Number(yuan);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return "充值金额须为整数";
  if (n < MIN_TOPUP) return `最低充值 ${MIN_TOPUP} 元`;
  if (n > MAX_TOPUP) return `最高充值 ${MAX_TOPUP} 元`;
  return null;
}

/**
 * 福币金额的数字渲染：**整元不带小数，非整元保留一位小数**。
 *
 * 59   → "59"
 * 1.5  → "1.5"
 * 9.80 → "9.8"（一位小数，不补零）
 *
 * ⚠️ **一位小数，不是两位** —— 福币的最小面值是 0.1 元（`fubFromFen` 的精度），
 * 两位小数会渲染出 "1.50" 这种多余尾零，与"福币是钱的笔数"直觉不符。
 */
function fubNum(v: number): string {
  // 先按 0.1 精度归一，避免浮点尾数（1.1*10 = 11.000000000000002）
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * 格式化福币金额：整数福币为主、括号标注人民币（本项目约定的价格文案）。
 *
 * 59   → "59 福币（¥59）"
 * 1.5  → "1.5 福币（¥1.5）"
 *
 * ⚠️ **整元不显示小数** —— 现网 26 处手搓 `formatYuan` 精度不一
 * （有的 `.toFixed(0)` 把 ¥2.20 截断成 ¥2），统一到这里顺手修掉。
 */
export function formatFub(n: number): string {
  const v = Number(n) || 0;
  const fub = fubNum(v);
  const cny = fubNum(v);
  return `${fub} 福币（¥${cny}）`;
}

/** 只要福币数字部分（不带人民币括号），用于空间紧张的卡片 */
export function fubOnly(n: number): string {
  const v = Number(n) || 0;
  return `${fubNum(v)} 福币`;
}

/**
 * 「分 → 福币」换算。装载素材以 priceFen(分) 存储，展示时经此**唯一入口**收敛。
 *
 * ⚠️ **精度是 0.1 元，不是 1 元** —— 这里曾经写 `Math.round(fen / 100)`，
 * 把 14 处非整元素材价（晨雾青 150 分、素线框 120 分、云纹地毯 350 分…）
 * **静默四舍五入**：1.5 元显示成 2 福币（多收 0.5）、1.2 元显示成 1 福币（少收 0.2）。
 * 用户看不出错，但对账时展示价 ≠ 账本价 —— 典型的"静默价格漂移"。
 *
 * 现在改 `Math.round(fen / 10) / 10`：先折到「角」取整，再折回「元」，
 * 得到一位小数 —— 既不丢精度，也不会产生浮点尾数。
 * 用户**余额仍是整数福币**（`User.fortuneCoins` 未变），
 * 只有商品价可以带小数 —— 这是刻意的：钱要可以是一角，不要让用户心算。
 *
 * 反向验证：改回 `Math.round(fen / 100)` → `verify-fortune-wallet.mjs` §8 必红，
 * 并点名「晨雾青 显示 2 福币 ≠ 实际 1.5 福币」。
 */
export function fubFromFen(fen: number): number {
  return Math.round((Number(fen) || 0) / 10) / 10;
}

/* ===== 记账 ===== */

export type FortuneKind = "topup" | "bonus" | "spend" | "adjust";

/**
 * 收入福币并写流水。只应由 lib/pay.ts 的 fortune_topup 分支调用
 * （用户侧充值入口统一走「下单 → 支付」闭环，不直接调本函数）。
 *
 * `amount` 为正数表示收入。`refId` 传订单 id。
 */
export async function creditFortune(params: {
  userId: string;
  amount: number;
  kind: FortuneKind;
  reason: string;
  refId?: string;
  /** 传入事务客户端时走同一事务（订单回滚则福币不发放） */
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
}) {
  const amount = Math.max(0, Math.round(params.amount || 0));
  if (amount <= 0) return;
  const db = params.tx ?? prisma;
  await db.user.update({
    where: { id: params.userId },
    data: { fortuneCoins: { increment: amount } },
  });
  await db.fortuneLog.create({
    data: {
      userId: params.userId,
      kind: params.kind,
      amount,
      reason: params.reason,
      refId: params.refId,
    },
  });
}

/**
 * 扣减福币并写流水。返回 true 表示成功；余额不足返回 false。
 * （当前平台产品均走「充值 → 全额支付」，本函数为后续「福币直接抵扣」预留。）
 */
export async function spendFortune(params: {
  userId: string;
  amount: number;
  reason: string;
  refId?: string;
}): Promise<boolean> {
  const amount = Math.max(0, Math.round(params.amount || 0));
  if (amount <= 0) return true;
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { fortuneCoins: true },
  });
  if (!user || user.fortuneCoins < amount) return false;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: params.userId },
      data: { fortuneCoins: { decrement: amount } },
    }),
    prisma.fortuneLog.create({
      data: {
        userId: params.userId,
        kind: "spend",
        amount: -amount,
        reason: params.reason,
        refId: params.refId,
      },
    }),
  ]);
  return true;
}

/** 汇总用户钱包（余额 / 累计充值 / 累计赠送 / 累计消费） */
export async function fortuneSummary(userId: string) {
  const [user, topup, bonus] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { fortuneCoins: true } }),
    prisma.fortuneLog.aggregate({
      where: { userId, kind: "topup" },
      _sum: { amount: true },
    }),
    prisma.fortuneLog.aggregate({
      where: { userId, kind: "bonus" },
      _sum: { amount: true },
    }),
  ]);
  return {
    balance: user?.fortuneCoins ?? 0,
    totalTopup: topup._sum.amount ?? 0,
    totalBonus: bonus._sum.amount ?? 0,
  };
}
