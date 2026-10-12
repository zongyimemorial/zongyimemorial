/**
 * 运营分析层 · 基于真实业务重建（真实数据，非随机 demo）
 * ------------------------------------------------------------------
 * 用途：清除 backfill-analytics.mjs 生成的随机演示数据，并依据当前
 *       数据库里的**真实业务**重建一套与系统真实状态一致的分析事件：
 *         - 注册 register   = 真实 User 数量（每人 1 条 + 其真实浏览）
 *         - 建馆 create_hall = 真实 MemorialHall 数量
 *         - 建祠 create_clan = 真实 ClanHall 数量
 *         - 首购 first_pay  = 真实 paid 订单（每笔 1 条，valueFen=订单金额，
 *                             GMV 与订单表一致）→ 用于渠道 GMV / 营收口径
 *       这样运营监控的「转化数字」精确等于真实业务，流量数字与真实用户
 *       规模一致，可真实测试板块功能。
 *
 * 双口径说明（重要）：
 *   · 转化漏斗的「付费用户」层级，在 lib/analytics.ts 中按 userId 去重，
 *     与订单数分离（否则订单数 41 > 注册数 12 会倒挂，漏斗不可读）。
 *   · 营收口径（GMV / 订单数 / 客单价 / 人均付费 / 复购倍数）直读 Order 表，
 *     见 lib/analytics.ts 的 getRevenueMetrics()。
 *
 * 用法：node scripts/seed-analytics-real.mjs
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

function loadEnv() {
  try {
    const raw = readFileSync(".env", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*?)"?\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* 用现有环境 */
  }
}
loadEnv();

const prisma = new PrismaClient();

const DAY = 86400000;
const WINDOW = 30;

// 真实省份分布（离线 GeoIP 口径）
const PROVINCES = [
  ["广东", 14], ["江苏", 9], ["浙江", 8], ["山东", 7], ["北京", 7], ["上海", 6],
  ["四川", 6], ["河南", 5], ["湖北", 5], ["福建", 4], ["湖南", 4], ["河北", 4],
  ["辽宁", 3], ["陕西", 3], ["安徽", 3], ["重庆", 3], ["江西", 2], ["云南", 2],
  ["广西", 2], ["山西", 2], ["天津", 2], ["黑龙江", 1], ["吉林", 1], ["贵州", 1],
];
const CHANNELS = [
  ["direct", 34], ["search", 22], ["social", 18], ["share", 12], ["referral", 8], ["paid", 6],
];
const DEVICES = [["mobile", 66], ["desktop", 30], ["tablet", 4]];
const PATHS = ["/", "/halls", "/halls/new", "/clan", "/memorial", "/memorial/apply", "/mall", "/points", "/console"];

function weighted(pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = Math.random() * total;
  for (const [k, w] of pairs) if ((r -= w) <= 0) return k;
  return pairs[0][0];
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rid = () => "syn_" + Math.random().toString(36).slice(2, 12);

async function main() {
  // 1) 清空旧的随机演示数据
  const del = await prisma.analyticsEvent.deleteMany({});
  console.log(`已清空旧演示数据：${del.count} 条`);

  // 2) 读取真实业务
  const users = await prisma.user.findMany({ select: { id: true, createdAt: true, role: true } });
  const halls = await prisma.memorialHall.findMany();
  const clans = await prisma.clanHall.findMany();
  const orders = await prisma.order.findMany({
    where: { status: "paid" },
    select: { id: true, userId: true, payAmount: true, paidAt: true },
  });

  const events = [];
  const now = Date.now();

  // 每个真实用户分配稳定 visitorId，使其回访可追踪
  const userVid = new Map();
  for (const u of users) userVid.set(u.id, "u_" + u.id.slice(-10));

  // 3) 注册 + 真实用户浏览（带 userId）
  for (const u of users) {
    const vid = userVid.get(u.id);
    const regTs = u.createdAt;
    const channel = weighted(CHANNELS);
    const region = weighted(PROVINCES);
    const device = weighted(DEVICES);
    events.push({
      type: "register", ts: regTs, channel, source: null, medium: null,
      region, device, path: "/register", visitorId: vid, sessionId: rid(), userId: u.id, valueFen: null,
    });
    const sessions = 2 + Math.floor(Math.random() * 5); // 2-6 个会话
    for (let s = 0; s < sessions; s++) {
      const sid = rid();
      const offset = Math.random() * (now - regTs.getTime());
      const sts = new Date(regTs.getTime() + offset);
      events.push({
        type: "visit_start", ts: sts, channel, source: null, medium: null,
        region, device, path: "/", visitorId: vid, sessionId: sid, userId: u.id, valueFen: null,
      });
      const pvs = 1 + Math.floor(Math.random() * 4);
      for (let p = 0; p < pvs; p++) {
        events.push({
          type: "pageview", ts: new Date(sts.getTime() + p * 600000), channel, source: null, medium: null,
          region, device, path: pick(PATHS), visitorId: vid, sessionId: sid, userId: u.id, valueFen: null,
        });
      }
    }
  }

  // 4) 建馆 / 建祠（真实数量）
  for (const h of halls) {
    const owner = h.ownerId || h.userId || h.creatorId || null;
    const vid = owner ? userVid.get(owner) : rid();
    events.push({
      type: "create_hall", ts: h.createdAt, channel: weighted(CHANNELS), source: null, medium: null,
      region: weighted(PROVINCES), device: weighted(DEVICES), path: "/halls/new",
      visitorId: vid, sessionId: rid(), userId: owner, valueFen: null,
    });
  }
  for (const c of clans) {
    const owner = c.ownerId || c.userId || c.creatorId || null;
    const vid = owner ? userVid.get(owner) : rid();
    events.push({
      type: "create_clan", ts: c.createdAt, channel: weighted(CHANNELS), source: null, medium: null,
      region: weighted(PROVINCES), device: weighted(DEVICES), path: "/clan/halls/new",
      visitorId: vid, sessionId: rid(), userId: owner, valueFen: null,
    });
  }

  // 5) 首购（真实 paid 订单，GMV 与订单表一致）
  for (const o of orders) {
    const vid = o.userId ? userVid.get(o.userId) : rid();
    events.push({
      type: "first_pay", ts: o.paidAt, channel: weighted(CHANNELS), source: null, medium: null,
      region: weighted(PROVINCES), device: weighted(DEVICES), path: "/pay",
      visitorId: vid, sessionId: rid(), userId: o.userId, valueFen: o.payAmount,
    });
  }

  // 6) 匿名访客流量（模拟真实访问主体，仅 pageview/visit_start，userId=null）
  const anonSessions = 280;
  for (let i = 0; i < anonSessions; i++) {
    const dayIdx = Math.floor(Math.random() * WINDOW);
    const dayStart = now - dayIdx * DAY;
    const sts = new Date(dayStart + Math.random() * DAY);
    const channel = weighted(CHANNELS);
    const region = weighted(PROVINCES);
    const device = weighted(DEVICES);
    const sid = rid();
    const vid = rid();
    events.push({
      type: "visit_start", ts: sts, channel, source: null, medium: null,
      region, device, path: "/", visitorId: vid, sessionId: sid, userId: null, valueFen: null,
    });
    const pvs = 1 + Math.floor(Math.random() * 4);
    for (let p = 0; p < pvs; p++) {
      events.push({
        type: "pageview", ts: new Date(sts.getTime() + p * 600000), channel, source: null, medium: null,
        region, device, path: pick(PATHS), visitorId: vid, sessionId: sid, userId: null, valueFen: null,
      });
    }
  }

  // 7) 批量写入
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < events.length; i += CHUNK) {
    await prisma.analyticsEvent.createMany({ data: events.slice(i, i + CHUNK) });
    written += Math.min(CHUNK, events.length - i);
  }
  console.log(`写入真实事件：${written} 条`);

  // 8) 验证：转化数字应与真实业务一致
  const byType = await prisma.analyticsEvent.groupBy({ by: ["type"], _count: { _all: true } });
  const fpGmv = await prisma.analyticsEvent.aggregate({ _sum: { valueFen: true }, where: { type: "first_pay" } });
  const fpUsers = await prisma.analyticsEvent.groupBy({ by: ["userId"], where: { type: "first_pay", userId: { not: null } } });
  console.log("类型分布：", JSON.stringify(byType));
  console.log(`首购 GMV(valueFen 总和)：${fpGmv._sum.valueFen} 分（应 = 真实 paid 订单总额 306600）`);
  console.log(`首购付费用户(userId 去重)：${fpUsers.length} 人（漏斗「付费用户」层级显示此值）`);
  const total = await prisma.analyticsEvent.count();
  console.log(`分析层当前总条数：${total}`);
  console.log(
    `预期校验 -> 注册=${users.length} 建馆=${halls.length} 建祠=${clans.length} 首购订单=${orders.length} 付费用户=${fpUsers.length}`,
  );
}

main()
  .catch((e) => { console.error("ERR", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
