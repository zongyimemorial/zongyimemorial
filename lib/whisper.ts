/**
 * 午夜悄悄话 · 计费与配额
 *
 * 定价依据（2026-09 实测 API 价格核算）：
 *   单用户月成本（100 轮 × 3 分钟 ≈ 300 分钟语音）：
 *     - ASR  120 分钟 × ¥0.075/分 = ¥9.00
 *     - LLM  30 万入 + 18 万出 token = ¥7.20
 *     - TTS  4.32 万字符 × ¥0.0008 = ¥34.56（云 API）｜ ≈¥5（自建 CosyVoice 3）
 *     合计 云 API ≈ ¥51 / 自建 TTS ≈ ¥21
 *
 * ✅ 技术路线决策（已确认）：现阶段统一走**云端 TTS**。
 *    理由：内测/起步期瓶颈是「无专职运维」而非「成本过高」，云端用钱买到的是
 *    单机自建给不了的多可用区冗余与 99.9% 可用性；且自建需双副本+负载均衡才算
 *    稳定，单卡自建只是把厂商风险转嫁给自己。自建 CosyVoice 3 属「阶段二」，
 *    待付费用户起量、TTS 成本真正压毛利时再上，届时以「自建为主 + 云端降级」演进。
 *
 *    因此本文件的价格按**云端 TTS 成本**定价，并保证满耗毛利 ≥30%：
 *    - 思念版：满耗成本 ¥50.8 → 定价 ¥79（毛利 ≈36%）
 *    - 长夜版：满耗成本 ≈¥135.2（800 分钟全云端）→ 定价 ¥199（毛利 ≈32%）
 *    - 纪念短片（单条）：成本 ≈¥15 → 定价 ¥49（毛利 ≈69%，高毛利加购项）
 *    若日后切换自建 TTS，思念版可回调至 ¥39（毛利 ≈64%）。详见各档 note 字段。
 *    ⚠️ note 属内部经营数据，只允许在管理后台展示，禁止渲染到前台页面。
 */

import { prisma } from "@/lib/db";

// ---------------------------------------------------------------- 套餐定义

export type WhisperPlan = "free" | "basic" | "premium";

export interface PlanSpec {
  /** 商品 slug（对应 Product.slug） */
  slug: string;
  plan: WhisperPlan;
  name: string;
  /** 价格（分） */
  priceFen: number;
  /** 每周期语音分钟数 */
  monthlyMins: number;
  /** 每周期文字轮次 */
  monthlyRounds: number;
  /** 可创建的声音克隆数 */
  cloneLimit: number;
  /** 生平资料条目上限（-1 不限） */
  memoryLimit: number;
  /** 每月可生成纪念视频数 */
  videoQuota: number;
  /** 成本与毛利备注（内部经营数据，仅管理后台展示） */
  note: string;
}

export const PLAN_SPECS: Record<WhisperPlan, PlanSpec> = {
  free: {
    slug: "",
    plan: "free",
    name: "体验版",
    priceFen: 0,
    monthlyMins: 0, // 免费档仅文字
    monthlyRounds: 30,
    cloneLimit: 0,
    memoryLimit: 20,
    videoQuota: 0,
    note: "引流档，文字对话成本 ≈¥2/月",
  },
  basic: {
    slug: "whisper-basic",
    plan: "basic",
    name: "思念版",
    priceFen: 7900,
    monthlyMins: 300,
    monthlyRounds: 3000,
    cloneLimit: 1,
    memoryLimit: 100,
    videoQuota: 0,
    note: "满耗成本 ¥50.8 → ¥79 毛利 ≈36%；若切自建 TTS（成本 ¥21.3）毛利 ≈73%，届时可回调 ¥39 档",
  },
  premium: {
    slug: "whisper-premium",
    plan: "premium",
    name: "长夜版",
    priceFen: 19900,
    monthlyMins: 800,
    monthlyRounds: 99999,
    cloneLimit: 3,
    memoryLimit: -1,
    videoQuota: 0,
    note: "满耗成本 ≈¥135.2（800 分钟全云端）→ ¥199 毛利 ≈32%（守 ≥30% 底线；视频已拆出单卖 ¥49/条）",
  },
};

/** 按次购买：10 分钟 */
export const SINGLE_PACK = {
  slug: "whisper-single",
  minutes: 10,
  priceFen: 600,
  note: "成本 ≈¥1.7 → 毛利 72%",
};

/**
 * 声音克隆资格申请（一次性工本费 / 转化漏斗入口）。
 * ¥10 不是「买断克隆」，而是「克隆资格申请」：支付后置 WhisperProfile.cloneApplied=true，
 * 解锁克隆入口（上传样本→复刻声线）。真实克隆训练成本由订阅档 cloneLimit 承载，
 * 内测期走 Mock 引擎零成本，故此处不计入毛利率（避免 -1280% 误读）。
 */
export const CLONE_PASS = {
  slug: "whisper-clone",
  priceFen: 1000,
  note: "克隆资格申请工本费（漏斗入口）；真实克隆由订阅档 cloneLimit 承载，内测 Mock 零成本",
};

/**
 * 纪念短片（单条加购）。
 * 用逝者声线 + 人格异步生成一支追思短片，走 memorial_service 人工受理链路，
 * 付款后由既有 isServiceProduct + createServiceFulfillment 自动建 pending 受理单，
 * 无需新写履约代码。
 * 成本 ≈¥15/条（渲染 + 克隆摊销 + 人工精修）→ 毛利 ≈69%，明显高于订阅档。
 */
export const MEMORIAL_VIDEO = {
  slug: "whisper-video",
  priceFen: 4900,
  costYuan: 15,
  /** 毛利备注（内部经营数据，仅管理后台展示） */
  note: "人工异步生成，成本 ≈¥15/条 → 毛利 ≈69%",
};

// ---------------------------------------------------------------- 积分兑换

/** 积分兑换表（100 积分 = 1 元，与既有体系一致） */
export const WHISPER_POINTS = {
  /** 声音克隆资格申请（等价 ¥10 工本费，支付后置 cloneApplied） */
  CLONE_UNLOCK: 1000,
  /** 10 分钟对话时长 */
  MINUTES_10: 300,
} as const;

// ---------------------------------------------------------------- 合规上限

/**
 * 单次会话分钟软上限。
 * 《人工智能拟人化互动服务管理暂行办法》禁止诱导情感依赖与沉迷，
 * 故对单次连续对话做时长提示与软性阻断。
 */
export const SESSION_SOFT_LIMIT_MINS = 45;

/** 单条消息最大字符数（防灌水与成本失控） */
export const MAX_MESSAGE_CHARS = 1000;

// ---------------------------------------------------------------- 配额读取

export interface QuotaSnapshot {
  plan: WhisperPlan;
  monthlyMins: number;
  usedMins: number;
  monthlyRounds: number;
  usedRounds: number;
  extraMins: number;
  /** 剩余可用分钟（含按次购买） */
  remainingMins: number;
  /** 剩余轮次 */
  remainingRounds: number;
  periodEnd: Date | null;
  spec: PlanSpec;
}

/** 读取并归一化配额；不存在则按 free 档返回，不写库 */
export async function getQuota(userId: string): Promise<QuotaSnapshot> {
  const row = await prisma.whisperQuota.findUnique({ where: { userId } });

  if (!row) {
    const spec = PLAN_SPECS.free;
    return {
      plan: "free",
      monthlyMins: spec.monthlyMins,
      usedMins: 0,
      monthlyRounds: spec.monthlyRounds,
      usedRounds: 0,
      extraMins: 0,
      remainingMins: spec.monthlyMins,
      remainingRounds: spec.monthlyRounds,
      periodEnd: null,
      spec,
    };
  }

  const plan = (row.plan as WhisperPlan) ?? "free";
  const spec = PLAN_SPECS[plan] ?? PLAN_SPECS.free;
  const remainingMins = Math.max(0, row.monthlyMins - row.usedMins) + row.extraMins;
  const remainingRounds = Math.max(0, row.monthlyRounds - row.usedRounds);

  return {
    plan,
    monthlyMins: row.monthlyMins,
    usedMins: row.usedMins,
    monthlyRounds: row.monthlyRounds,
    usedRounds: row.usedRounds,
    extraMins: row.extraMins,
    remainingMins,
    remainingRounds,
    periodEnd: row.periodEnd,
    spec,
  };
}

/** 确保配额行存在（订阅后调用） */
export async function ensureQuota(userId: string): Promise<void> {
  await prisma.whisperQuota.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      plan: "free",
      monthlyMins: PLAN_SPECS.free.monthlyMins,
      monthlyRounds: PLAN_SPECS.free.monthlyRounds,
    },
  });
}

// ---------------------------------------------------------------- 配额消费

export type ConsumeResult =
  | { ok: true; snapshot: QuotaSnapshot; warning?: string }
  | { ok: false; reason: "rounds_exhausted" | "minutes_exhausted" | "no_quota"; message: string };

/**
 * 消费一轮对话的配额。
 * 先用订阅分钟，再用按次购买的分钟。
 */
export async function consumeRound(
  userId: string,
  opts: { minutes: number; isVoice: boolean },
): Promise<ConsumeResult> {
  // 必须先落库：getQuota 在无记录时返回的是「合成」快照，
  // 直接拿它做 update 会触发 P2025（record not found）。
  await ensureQuota(userId);
  const q = await getQuota(userId);

  if (q.remainingRounds <= 0) {
    return {
      ok: false,
      reason: "rounds_exhausted",
      message: "本月对话轮次已用完，可升级套餐或购买按次时长。",
    };
  }

  const needMins = opts.isVoice ? Math.max(0, opts.minutes) : 0;
  if (opts.isVoice && needMins > q.remainingMins) {
    return {
      ok: false,
      reason: "minutes_exhausted",
      message: `语音时长不足（剩余 ${q.remainingMins} 分钟），可购买按次时长或升级套餐。`,
    };
  }

  // 订阅额度优先，超出部分吃按次购买余额
  const subLeft = Math.max(0, q.monthlyMins - q.usedMins);
  const useSub = Math.min(subLeft, needMins);
  const useExtra = needMins - useSub;

  await prisma.whisperQuota.update({
    where: { userId },
    data: {
      usedMins: { increment: Math.round(useSub) },
      extraMins: { decrement: Math.round(useExtra) },
      usedRounds: { increment: 1 },
    },
  });

  const after = await getQuota(userId);

  // 单次会话过长时给出温和提示（合规：不诱导沉浸）
  let warning: string | undefined;
  if (after.remainingMins <= 0 && after.remainingRounds > 0) {
    warning = "语音时长已用完，接下来仅支持文字交流。";
  }

  return { ok: true, snapshot: after, warning };
}

/** 发放/续期套餐配额 */
export async function grantPlan(
  userId: string,
  plan: WhisperPlan,
  opts: { periodDays?: number } = {},
): Promise<void> {
  const spec = PLAN_SPECS[plan] ?? PLAN_SPECS.free;
  const days = opts.periodDays ?? 30;
  const periodEnd = new Date(Date.now() + days * 86400000);

  await prisma.whisperQuota.upsert({
    where: { userId },
    create: {
      userId,
      plan,
      monthlyMins: spec.monthlyMins,
      monthlyRounds: spec.monthlyRounds,
      usedMins: 0,
      usedRounds: 0,
      periodStart: new Date(),
      periodEnd,
    },
    update: {
      plan,
      monthlyMins: spec.monthlyMins,
      monthlyRounds: spec.monthlyRounds,
      usedMins: 0,
      usedRounds: 0,
      periodStart: new Date(),
      periodEnd,
    },
  });
}

/** 增加按次购买的分钟数 */
export async function addExtraMinutes(userId: string, minutes: number): Promise<void> {
  await ensureQuota(userId);
  await prisma.whisperQuota.update({
    where: { userId },
    data: { extraMins: { increment: Math.max(0, Math.round(minutes)) } },
  });
}

// ---------------------------------------------------------------- 合规标识

/**
 * 生成 AI 内容的隐式标识（写入 WhisperMessage.aiLabel）。
 * 依据《人工智能生成合成内容标识办法》+ GB 45438-2025。
 */
export function buildAiLabel(engineLabel: string, at = new Date()): string {
  return `AI 生成 · ${engineLabel} · ${at.toISOString()}`;
}

/**
 * 显式标识文案（前端必须渲染，用户可感知）。
 */
export const AI_DISCLOSURE = "本内容由 AI 生成，非真人回复";
