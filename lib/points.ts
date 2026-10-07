import { prisma } from "@/lib/db";

/** 内测初始赠送积分 */
export const INITIAL_POINTS = 2000;

/* ===== 积分获取政策（规划文档 3.5.1） ===== */
/** 虚拟祭品消费 1 元 = 3 积分（主要积分来源） */
export const POINTS_PER_YUAN = 3;
/** 创建纪念馆一次性奖励 */
export const HALL_CREATE_POINTS = 50;
/** 每日登录祭拜奖励 */
export const DAILY_LOGIN_POINTS = 5;
/** 邀请好友注册奖励（每人） */
export const INVITE_REGISTER_POINTS = 20;
/** 完善逝者档案一次性奖励 */
export const PROFILE_COMPLETE_POINTS = 30;
/** 发布追思留言奖励（每条） */
export const TRIBUTE_MESSAGE_POINTS = 2;
/** 追思留言每日上限（条） */
export const TRIBUTE_MESSAGE_DAILY_CAP = 10;

/* ===== 积分兑换政策（规划文档 3.5.2） =====
 * 第一阶段积分仅用于兑换虚拟产品，不涉及任何实体商品。
 */
/** 基础祭品：100 积分 = 1 元虚拟商品（标准兑换率） */
export const REDEEM_RATE_BASIC = 100;
/** 进阶祭品：150 积分 = 1 元虚拟商品（高价值商品溢价兑换） */
export const REDEEM_RATE_ADVANCED = 150;
/** 纪念馆模板：200 积分 = 1 元虚拟商品（定制化产品） */
export const REDEEM_RATE_HALL = 200;
/**
 * 每日兑换上限（积分）。
 *
 * 历史：2026-10「礼器重定价」曾把单次上限锁死在 1000，导致全部 memorial_service /
 * storage / 高价值 decor 等 49 个在售商品（积分价 > 1000）永远兑不出来。
 * 现改为「单次不设上限（按商品自身积分价判定，自然不超过自身价）+ 日上限 5 万」：
 *  - 单次护栏无实际意义：积分只能靠消费/签到缓慢积累（1 元 = 3 分，攒 5 万分需
 *    消费约 ¥1.6 万），刷不动；独立单次上限只会把高价值商品误杀。
 *  - 真正的护栏是单日累计，5 万可覆盖除最贵容量包（storage-50g = 59000 分、
 *    storage-500g 更高）之外的所有在售商品；容量包需分日兑换（页面会提示上限）。
 */
export const REDEEM_DAILY_LIMIT = 50000;
/** 积分有效期（月） */
export const POINTS_VALID_MONTHS = 12;

export type PointKind = "earn" | "redeem" | "adjust";

/**
 * 发放积分并记录流水。amount 为正数表示收入。
 */
export async function earnPoints(params: {
  userId: string;
  amount: number;
  reason: string;
  refId?: string;
  kind?: PointKind;
}) {
  const amount = Math.max(0, Math.round(params.amount));
  if (amount <= 0) return;
  // 积分有效期：自发放起 12 个月（规划文档 4.2）
  const expireAt = new Date();
  expireAt.setMonth(expireAt.getMonth() + POINTS_VALID_MONTHS);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: params.userId },
      data: { points: { increment: amount } },
    }),
    prisma.pointLog.create({
      data: {
        userId: params.userId,
        kind: params.kind ?? "earn",
        amount,
        reason: params.reason,
        refId: params.refId,
        expireAt,
      },
    }),
  ]);
}

/**
 * 扣减积分并记录流水。返回 true 表示成功；余额不足返回 false。
 */
export async function spendPoints(params: {
  userId: string;
  amount: number;
  reason: string;
  refId?: string;
}): Promise<boolean> {
  const amount = Math.max(0, Math.round(params.amount));
  if (amount <= 0) return true;
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { points: true },
  });
  if (!user || user.points < amount) return false;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: params.userId },
      data: { points: { decrement: amount } },
    }),
    prisma.pointLog.create({
      data: {
        userId: params.userId,
        kind: "redeem",
        amount: -amount,
        reason: params.reason,
        refId: params.refId,
      },
    }),
  ]);
  return true;
}

/** 注册时赠送初始积分（若已有余额则跳过，避免重复发放） */
export async function grantInitialPointsOnRegister(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { points: true },
  });
  if (!user) return;
  if (user.points <= 0) {
    await earnPoints({
      userId,
      amount: INITIAL_POINTS,
      reason: "新用户注册赠礼",
      kind: "earn",
    });
  }
}

/** 消费金额（分）换算可获积分：1 元 = 3 积分 */
export function pointsFromSpend(payAmountFen: number): number {
  return Math.floor(payAmountFen / 100) * POINTS_PER_YUAN;
}

/** 今日 0 点 */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 每日登录祭拜奖励：每天首次进入控制台发 5 积分（同日重复进入不重复发放）。
 */
export async function ensureDailyLoginPoints(userId: string) {
  const existed = await prisma.pointLog.findFirst({
    where: {
      userId,
      reason: "每日登录祭拜",
      createdAt: { gte: startOfToday() },
    },
    select: { id: true },
  });
  if (existed) return;
  await earnPoints({
    userId,
    amount: DAILY_LOGIN_POINTS,
    reason: "每日登录祭拜",
    kind: "earn",
  });
}

/** 统计用户今日已兑换消耗的积分（用于每日兑换上限） */
export async function dailyRedeemedPoints(userId: string): Promise<number> {
  const agg = await prisma.pointLog.aggregate({
    where: {
      userId,
      kind: "redeem",
      createdAt: { gte: startOfToday() },
    },
    _sum: { amount: true },
  });
  return Math.abs(agg._sum.amount ?? 0);
}

/* ===== 邀请好友（社交裂变，规划文档 4.1） ===== */

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomInviteCode(len = 8): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return s;
}

/** 获取（必要时生成）用户的专属邀请码 */
export async function ensureInviteCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { inviteCode: true },
  });
  if (user?.inviteCode) return user.inviteCode;

  // 生成唯一邀请码（重试几次）
  for (let i = 0; i < 8; i++) {
    const code = randomInviteCode();
    const dup = await prisma.user.findUnique({ where: { inviteCode: code } });
    if (!dup) {
      await prisma.user.update({ where: { id: userId }, data: { inviteCode: code } });
      return code;
    }
  }
  // 极端兜底：用 id 派生
  const fallback = userId.slice(-8).toUpperCase();
  await prisma.user.update({ where: { id: userId }, data: { inviteCode: fallback } });
  return fallback;
}

/**
 * 处理邀请关系：新用户注册时若填写了邀请码，
 * 给邀请人发放 INVITE_REGISTER_POINTS 积分（同一邀请人可累计）。
 * 返回是否成功建立邀请关系。
 */
export async function applyInviteOnRegister(params: {
  newUserId: string;
  inviteCode?: string;
}): Promise<boolean> {
  const code = (params.inviteCode || "").trim().toUpperCase();
  if (!code) return false;

  const inviter = await prisma.user.findUnique({
    where: { inviteCode: code },
    select: { id: true },
  });
  if (!inviter || inviter.id === params.newUserId) return false;

  await prisma.user.update({
    where: { id: params.newUserId },
    data: { invitedById: inviter.id },
  });
  await earnPoints({
    userId: inviter.id,
    amount: INVITE_REGISTER_POINTS,
    reason: "邀请好友注册",
    refId: params.newUserId,
  });
  return true;
}

/* ===== 积分有效期处理（规划文档 4.2/4.4） ===== */

/**
 * 处理过期积分：把已过 expireAt 且未作废的收入侧流水标记为作废，
 * 并按金额扣减用户余额（作废流水以 kind="expire" 记账，满足台账与税务核查）。
 * 采用懒执行：在用户进入控制台/积分页时调用，避免依赖常驻定时任务。
 */
export async function expirePointsForUser(userId: string): Promise<number> {
  const now = new Date();
  const overdue = await prisma.pointLog.findMany({
    where: { userId, kind: "earn", expired: false, expireAt: { lt: now } },
    select: { id: true, amount: true },
  });
  if (overdue.length === 0) return 0;

  const total = overdue.reduce((s, r) => s + r.amount, 0);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { points: true },
  });
  // 余额不足时按剩余余额扣减，避免出现负余额
  const deduct = Math.min(total, user?.points ?? 0);

  await prisma.$transaction([
    prisma.pointLog.updateMany({
      where: { id: { in: overdue.map((r) => r.id) } },
      data: { expired: true },
    }),
    ...(deduct > 0
      ? [
          prisma.user.update({
            where: { id: userId },
            data: { points: { decrement: deduct } },
          }),
          prisma.pointLog.create({
            data: {
              userId,
              kind: "expire",
              amount: -deduct,
              reason: "积分过期作废（有效期 12 个月）",
            },
          }),
        ]
      : []),
  ]);
  return deduct;
}
