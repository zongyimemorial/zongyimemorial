import geoip from "geoip-lite";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

// ===========================================================================
// 运营分析采集层（P0 · 2026-11）
//
// 全站轻量分析：数据落本平台 Postgres，不外发。服务于
//   ① 了解网站实际运营状况
//   ② 为今后推广收集与分析数据（渠道 / 留存 / 裂变 / 节奏）
//
// 合规：仅存随机 visitorId、粗略省份、channel；不存姓名/手机/邮箱。
// ===========================================================================

export type AnalyticsType =
  | "pageview"
  | "visit_start"
  | "register"
  | "create_hall"
  | "create_clan"
  | "first_pay"
  | "share_open"
  | "share_click";

export interface TrackInput {
  type: AnalyticsType | string;
  channel?: string;
  source?: string | null;
  medium?: string | null;
  region?: string | null;
  device?: string;
  path?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  valueFen?: number | null;
}

/** 单条或批量写入分析事件（服务端转化点调用） */
export async function track(events: TrackInput | TrackInput[]) {
  const list = Array.isArray(events) ? events : [events];
  if (list.length === 0) return;
  await prisma.analyticsEvent.createMany({
    data: list.map((e) => ({
      type: e.type,
      channel: e.channel ?? "direct",
      source: e.source ?? null,
      medium: e.medium ?? null,
      region: e.region ?? null,
      device: e.device ?? "unknown",
      path: e.path ?? null,
      visitorId: e.visitorId ?? null,
      sessionId: e.sessionId ?? null,
      userId: e.userId ?? null,
      valueFen: e.valueFen ?? null,
    })),
    skipDuplicates: false,
  });
}

// ---------------------------------------------------------------------------
// 渠道分类口径
// 优先级：share 令牌 → UTM(付费/外链) → Referer(社交/搜索/外链) → 直接
// ---------------------------------------------------------------------------
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function classifyChannel(opts: {
  referer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  share?: string | null;
}): { channel: string; source: string | null; medium: string | null } {
  const ref = (opts.referer || "").toLowerCase();
  const us = (opts.utmSource || "").toLowerCase();
  const um = (opts.utmMedium || "").toLowerCase();

  if (opts.share) {
    return { channel: "share", source: "分享链接", medium: "share" };
  }
  if (us || um) {
    const isPaid = /(ad|cpc|paid|sem|feed|投放)/.test(um) || /(ad|cpc|paid|sem|投放)/.test(us);
    return {
      channel: isPaid ? "paid" : "referral",
      source: us || null,
      medium: um || null,
    };
  }
  if (ref) {
    const host = hostOf(ref);
    if (
      /(weixin|wechat|micromessenger|qq\.com|weibo|douyin|tiktok|kuaishou|toutiao|xiaohongshu|zhihu|baidu.*tieba|m\.weibo|sina)/.test(
        ref,
      )
    ) {
      return { channel: "social", source: host, medium: null };
    }
    if (/(baidu|so\.com|sogou|bing|google|sm\.cn|360)/.test(ref)) {
      return { channel: "search", source: host, medium: null };
    }
    return { channel: "referral", source: host, medium: null };
  }
  return { channel: "direct", source: null, medium: null };
}

/** UA → 设备类型 */
export function deviceFromUA(ua = ""): string {
  const u = ua.toLowerCase();
  if (/tablet|ipad|kindle|playbook|silk/.test(u)) return "tablet";
  if (/mobi|iphone|android|blackberry|windows phone|webos|opera mini|harmony/.test(u)) return "mobile";
  return "desktop";
}

const REGION_CN: Record<string, string> = {
  BJ: "北京", SH: "上海", TJ: "天津", CQ: "重庆", HE: "河北", SX: "山西",
  NM: "内蒙古", LN: "辽宁", JL: "吉林", HL: "黑龙江", JS: "江苏", ZJ: "浙江",
  AH: "安徽", FJ: "福建", JX: "江西", SD: "山东", HA: "河南", HB: "湖北",
  HN: "湖南", GD: "广东", GX: "广西", HI: "海南", SC: "四川", GZ: "贵州",
  YN: "云南", XZ: "西藏", SN: "陕西", GS: "甘肃", QH: "青海", NX: "宁夏",
  XJ: "新疆", TW: "台湾", HK: "香港", MO: "澳门",
};

/** IP → 粗略省份（离线 GeoIP，无外部请求）。非 CN 返回「海外」，私有 IP 返回 null */
export function regionFromIp(ip?: string | null): string | null {
  if (!ip) return null;
  const clean = ip.split(",")[0].trim();
  if (!clean || clean === "127.0.0.1" || clean.startsWith("192.168.") || clean.startsWith("10.")) {
    return null;
  }
  const r = geoip.lookup(clean);
  if (!r) return null;
  if (r.country === "CN") return REGION_CN[r.region ?? ""] || r.region || "其他";
  return "海外";
}

const CHANNEL_LABEL: Record<string, string> = {
  direct: "直接访问",
  search: "搜索引擎",
  social: "社交媒体",
  share: "分享链接",
  referral: "外部引荐",
  paid: "付费推广",
};
export function channelLabel(ch: string): string {
  return CHANNEL_LABEL[ch] || ch;
}

/** 服务端转化点读取首访归因渠道（由 /api/collect 写入的 acq_channel cookie） */
export async function acqChannelFromCookie(): Promise<string> {
  const c = await cookies();
  return c.get("acq_channel")?.value || "direct";
}

// ===========================================================================
// 聚合查询（后台大盘使用）
// ===========================================================================

/** 本地时区 YYYY-MM-DD（pg DATE 返回本地零点 Date，不能用 toISOString 否则会偏移一天） */
function fmtDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toDay(v: unknown): string {
  return v instanceof Date ? fmtDay(v) : String(v ?? "").slice(0, 10);
}

export interface TrafficMetrics {
  visits: number; // 会话数（visit_start 去重 sessionId）
  pv: number;
  uv: number;
  newVisitors: number;
  returningVisitors: number;
  devices: { device: string; cnt: number }[];
}

export async function getTrafficMetrics(days: number): Promise<TrafficMetrics> {
  const since = new Date(Date.now() - days * 86400000);
  const [summary, devices, nr] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT
         COUNT(DISTINCT "sessionId") FILTER (WHERE type='visit_start') AS visits,
         COUNT(*) FILTER (WHERE type='pageview') AS pv,
         COUNT(DISTINCT "visitorId") FILTER (WHERE type IN ('pageview','visit_start')) AS uv
       FROM "AnalyticsEvent" WHERE ts >= $1`,
      since,
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT device, COUNT(*) AS cnt FROM "AnalyticsEvent"
       WHERE ts >= $1 AND type='pageview' GROUP BY device ORDER BY cnt DESC`,
      since,
    ),
    prisma.$queryRawUnsafe<any[]>(
      `WITH win AS (
         SELECT DISTINCT "visitorId" FROM "AnalyticsEvent"
         WHERE ts >= $1 AND "visitorId" IS NOT NULL AND type IN ('pageview','visit_start')
       ),
       firsts AS (SELECT "visitorId", MIN(ts) AS first_ts FROM "AnalyticsEvent" GROUP BY "visitorId")
       SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE f.first_ts < $1) AS returning
       FROM win JOIN firsts f ON win."visitorId" = f."visitorId"`,
      since,
    ),
  ]);
  const s = summary[0] || { visits: 0, pv: 0, uv: 0 };
  const total = Number(nr[0]?.total || 0);
  const returning = Number(nr[0]?.returning || 0);
  return {
    visits: Number(s.visits || 0),
    pv: Number(s.pv || 0),
    uv: Number(s.uv || 0),
    newVisitors: total - returning,
    returningVisitors: returning,
    devices: devices.map((d) => ({ device: d.device, cnt: Number(d.cnt) })),
  };
}

export interface ChannelRow {
  channel: string;
  label: string;
  visits: number;
  regs: number;
  regRate: number; // 注册转化（注册/访问）
  fpUsers: number; // 首购用户数
  fpGmvFen: number;
  fpRate: number; // 首购转化（首购用户/访问）
  fpArppuFen: number; // 首购客单价
}

export async function getChannelMetrics(): Promise<ChannelRow[]> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT channel,
       COUNT(DISTINCT "sessionId") FILTER (WHERE type='visit_start') AS visits,
       COUNT(*) FILTER (WHERE type='register') AS regs,
       COUNT(DISTINCT "userId") FILTER (WHERE type='first_pay') AS fp_users,
       COALESCE(SUM("valueFen") FILTER (WHERE type='first_pay'),0) AS fp_gmv
     FROM "AnalyticsEvent"
     GROUP BY channel
     ORDER BY visits DESC NULLS LAST`,
  );
  return rows.map((r) => {
    const visits = Number(r.visits || 0);
    const regs = Number(r.regs || 0);
    const fpUsers = Number(r.fp_users || 0);
    const fpGmv = Number(r.fp_gmv || 0);
    return {
      channel: r.channel,
      label: channelLabel(r.channel),
      visits,
      regs,
      regRate: visits ? regs / visits : 0,
      fpUsers,
      fpGmvFen: fpGmv,
      fpRate: visits ? fpUsers / visits : 0,
      fpArppuFen: fpUsers ? fpGmv / fpUsers : 0,
    };
  });
}

export interface FunnelRow {
  visitStart: number;
  register: number;
  createHall: number; // 建馆 + 建祠 合并
  firstPay: number; // 付费用户数（按 userId 去重，口径与订单数分离）
}

/**
 * 转化漏斗：每个层级统一以「人/用户」为单位。
 * first_pay 在采集层是「每笔 paid 订单一条事件」，漏斗必须按 userId 去重，
 * 否则会出现 41(订单) > 12(注册) 的倒挂，漏斗不可读。
 * 营收口径（订单数 / GMV / 客单价）见 getRevenueMetrics，直读 Order 表。
 */
export async function getFunnelMetrics(days: number): Promise<FunnelRow> {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT type,
            COUNT(*) AS c,
            COUNT(DISTINCT "userId") FILTER (WHERE type='first_pay') AS fp_users
     FROM "AnalyticsEvent"
     WHERE ts >= $1 AND type IN ('visit_start','register','create_hall','create_clan','first_pay')
     GROUP BY type`,
    since,
  );
  const m: Record<string, number> = {};
  let fpUsers = 0;
  for (const r of rows) {
    m[r.type] = Number(r.c || 0);
    if (r.fp_users) fpUsers = Number(r.fp_users);
  }
  return {
    visitStart: m["visit_start"] || 0,
    register: m["register"] || 0,
    createHall: (m["create_hall"] || 0) + (m["create_clan"] || 0),
    firstPay: fpUsers,
  };
}

export interface RevenueMetrics {
  orders: number; // 付费订单数
  payers: number; // 付费用户数（去重）
  gmvFen: number; // GMV（分）
  aovFen: number; // 客单价 = GMV / 订单
  arppuFen: number; // 人均付费 = GMV / 付费用户
  repeatRate: number; // 人均订单 = 订单 / 付费用户（复购倍数）
  payPenetration: number; // 付费渗透率 = 付费用户 / 总注册用户
}

/**
 * 营收分析（订单/金额口径）：直读 Order 表（GMV 的真实唯一来源），
 * 与转化漏斗（人口径）双口径分层，互不污染。
 */
export async function getRevenueMetrics(): Promise<RevenueMetrics> {
  const [agg, payersRows, userCount] = await Promise.all([
    prisma.order.aggregate({
      where: { status: "paid", payAmount: { gt: 0 } },
      _count: { _all: true },
      _sum: { payAmount: true },
    }),
    prisma.order.groupBy({
      by: ["userId"],
      where: { status: "paid", payAmount: { gt: 0 } },
    }),
    prisma.user.count(),
  ]);
  const orders = agg._count._all;
  const gmv = Number(agg._sum.payAmount ?? 0);
  const payers = payersRows.length;
  return {
    orders,
    payers,
    gmvFen: gmv,
    aovFen: orders ? gmv / orders : 0,
    arppuFen: payers ? gmv / payers : 0,
    repeatRate: payers ? orders / payers : 0,
    payPenetration: userCount ? payers / userCount : 0,
  };
}

export interface CohortRow {
  cohortDay: string;
  size: number;
  d1: number;
  d7: number;
  d30: number;
}

/** 按注册日 cohort 的 D1/D7/D30 回访率（基于已登录用户回访事件） */
export async function getRetentionCohorts(days: number): Promise<CohortRow[]> {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `WITH regs AS (
       SELECT id AS uid, DATE("createdAt") AS cd FROM "User" WHERE "createdAt" >= $1
     ),
     events AS (
       SELECT DISTINCT "userId" AS uid, DATE(ts) AS ed FROM "AnalyticsEvent"
       WHERE "userId" IS NOT NULL AND type IN ('pageview','visit_start') AND ts >= $1
     )
     SELECT r.cd AS cohort_day,
            COUNT(DISTINCT r.uid) AS size,
            COUNT(DISTINCT r.uid) FILTER (WHERE e.ed > r.cd AND e.ed <= r.cd + 1) AS d1,
            COUNT(DISTINCT r.uid) FILTER (WHERE e.ed > r.cd AND e.ed <= r.cd + 7) AS d7,
            COUNT(DISTINCT r.uid) FILTER (WHERE e.ed > r.cd AND e.ed <= r.cd + 30) AS d30
     FROM regs r LEFT JOIN events e ON e.uid = r.uid
     GROUP BY r.cd ORDER BY r.cd`,
    since,
  );
  return rows.map((r) => ({
    cohortDay: toDay(r.cohort_day),
    size: Number(r.size || 0),
    d1: Number(r.d1 || 0),
    d7: Number(r.d7 || 0),
    d30: Number(r.d30 || 0),
  }));
}

export interface TrendPoint {
  day: string;
  newUsers: number;
  newHalls: number;
  gmvFen: number;
}

/** 近 days 天：每日新增用户 / 新增馆（纪念馆+宗祠）/ 每日 GMV */
export async function getTrendSeries(days: number): Promise<TrendPoint[]> {
  const since = new Date(Date.now() - days * 86400000);
  const [users, halls, gmv] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT DATE("createdAt") AS d, COUNT(*) AS v FROM "User" WHERE "createdAt" >= $1 GROUP BY d`,
      since,
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT DATE("createdAt") AS d, COUNT(*) AS v FROM "MemorialHall" WHERE "createdAt" >= $1 GROUP BY d
       UNION ALL
       SELECT DATE("createdAt") AS d, COUNT(*) AS v FROM "ClanHall" WHERE "createdAt" >= $1 GROUP BY d`,
      since,
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT DATE("paidAt") AS d, COALESCE(SUM("payAmount"),0) AS v FROM "Order"
       WHERE "paidAt" >= $1 AND status='paid' GROUP BY d`,
      since,
    ),
  ]);
  const map = new Map<string, TrendPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    map.set(fmtDay(d), { day: fmtDay(d), newUsers: 0, newHalls: 0, gmvFen: 0 });
  }
  for (const r of users) {
    const k = toDay(r.d);
    if (map.has(k)) map.get(k)!.newUsers += Number(r.v);
  }
  for (const r of halls) {
    const k = toDay(r.d);
    if (map.has(k)) map.get(k)!.newHalls += Number(r.v);
  }
  for (const r of gmv) {
    const k = toDay(r.d);
    if (map.has(k)) map.get(k)!.gmvFen += Number(r.v);
  }
  return Array.from(map.values());
}

export async function getRegionDistribution(limit = 12): Promise<{ region: string; uv: number }[]> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COALESCE(region,'未知') AS region,
       COUNT(DISTINCT "visitorId") AS uv
     FROM "AnalyticsEvent"
     WHERE type IN ('pageview','visit_start')
     GROUP BY region ORDER BY uv DESC LIMIT $1`,
    limit,
  );
  return rows.map((r) => ({ region: r.region, uv: Number(r.uv) }));
}

export async function getDeviceDistribution(): Promise<{ device: string; cnt: number }[]> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT device, COUNT(*) AS cnt FROM "AnalyticsEvent" WHERE type='pageview' GROUP BY device ORDER BY cnt DESC`,
  );
  return rows.map((r) => ({ device: r.device, cnt: Number(r.cnt) }));
}

export interface ActiveUsers {
  dau: number;
  wau: number;
  mau: number;
}

/** DAU（今日）/ WAU（近 7 日）/ MAU（近 30 日）活跃访客（按 visitorId 去重） */
export async function getActiveUsers(): Promise<ActiveUsers> {
  const now = Date.now();
  const [dau, wau, mau] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(DISTINCT "visitorId") AS v FROM "AnalyticsEvent"
       WHERE type IN ('pageview','visit_start') AND ts >= $1`,
      new Date(now - 1 * 86400000),
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(DISTINCT "visitorId") AS v FROM "AnalyticsEvent"
       WHERE type IN ('pageview','visit_start') AND ts >= $1`,
      new Date(now - 7 * 86400000),
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(DISTINCT "visitorId") AS v FROM "AnalyticsEvent"
       WHERE type IN ('pageview','visit_start') AND ts >= $1`,
      new Date(now - 30 * 86400000),
    ),
  ]);
  return {
    dau: Number(dau[0]?.v || 0),
    wau: Number(wau[0]?.v || 0),
    mau: Number(mau[0]?.v || 0),
  };
}
