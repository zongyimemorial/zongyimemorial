/**
 * 运营分析层 · 近 30 天合成数据回填
 * ------------------------------------------------------------------
 * 目的：新上线的运营监控大盘（流量/渠道/漏斗/地域/设备）需要历史数据才能
 *       直观演示。本脚本仅向 `AnalyticsEvent` 表写入**合成**访问与转化事件，
 *       不触碰 User / Order / 纪念馆等「真实经营数据」，因此可随时清空、
 *       不影响「了解实际运营状况」类指标与合规边界（仅存随机 visitorId、
 *       粗略省份、channel，不存姓名/手机/邮箱）。
 *
 * 用法：
 *   node scripts/backfill-analytics.mjs          # 追加 30 天合成数据（不删已有）
 *   node scripts/backfill-analytics.mjs --reset  # 清空后重新写入（可重复、幂等）
 *   node scripts/backfill-analytics.mjs --clear  # 仅清空分析层数据
 *
 * 注：留存 cohort 与趋势「新增用户/馆/GMV」来自真实 User/Order 表，本脚本
 *     不生成模拟账号，故这两项在纯演示环境可能为空——属预期行为。
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// ---- 轻量 .env 加载（不依赖 dotenv）----
function loadEnv() {
  try {
    const raw = readFileSync(".env", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*?)"?\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* 无 .env 则用现有环境 */
  }
}
loadEnv();

const prisma = new PrismaClient();

const DAY = 86400000;
const WINDOW = 30; // 回填天数

// 省份（粗略，离线 GeoIP 口径）
const PROVINCES = [
  ["广东", 14], ["江苏", 9], ["浙江", 8], ["山东", 7], ["北京", 7], ["上海", 6],
  ["四川", 6], ["河南", 5], ["湖北", 5], ["福建", 4], ["湖南", 4], ["河北", 4],
  ["辽宁", 3], ["陕西", 3], ["安徽", 3], ["重庆", 3], ["江西", 2], ["云南", 2],
  ["广西", 2], ["山西", 2], ["天津", 2], ["黑龙江", 1], ["吉林", 1], ["贵州", 1],
  ["海外", 3],
];

// 渠道（权重）
const CHANNELS = [
  ["direct", 34], ["search", 22], ["social", 18], ["share", 12], ["referral", 8], ["paid", 6],
];

// 设备（权重）
const DEVICES = [["mobile", 66], ["desktop", 30], ["tablet", 4]];

// 各渠道注册/建馆/首购转化倾向（用于合成漏斗形态）
const CONV = {
  direct:   { reg: 0.10, create: 0.45, pay: 0.38 },
  search:   { reg: 0.14, create: 0.50, pay: 0.42 },
  social:   { reg: 0.09, create: 0.40, pay: 0.35 },
  share:    { reg: 0.22, create: 0.55, pay: 0.48 }, // 裂变质量最高
  referral: { reg: 0.12, create: 0.48, pay: 0.40 },
  paid:     { reg: 0.16, create: 0.52, pay: 0.45 },
};

const PAY_AMOUNTS = [980, 1980, 1980, 6800, 9800, 19800, 52000, 99900];

function weighted(pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = Math.random() * total;
  for (const [k, w] of pairs) {
    if ((r -= w) <= 0) return k;
  }
  return pairs[0][0];
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rid = () => "syn_" + Math.random().toString(36).slice(2, 12);
const uid = () => "u_" + Math.random().toString(36).slice(2, 14);

async function clearAll() {
  const del = await prisma.analyticsEvent.deleteMany({});
  console.log(`已清空分析层数据：${del.count} 条`);
}

async function run() {
  // 1) 预窗口「老访客」种子：让一部分 visitor 的全局首访 < 窗口起点 → 算回头访客
  const returningPool = Array.from({ length: 220 }, () => rid());
  const seedEvents = [];
  const seedDay = Date.now() - 50 * DAY;
  for (const vid of returningPool) {
    seedEvents.push({
      type: "pageview", ts: new Date(seedDay + Math.random() * DAY),
      channel: weighted(CHANNELS), source: null, medium: null,
      region: weighted(PROVINCES), device: weighted(DEVICES),
      path: "/", visitorId: vid, sessionId: rid(), userId: null, valueFen: null,
    });
  }
  await prisma.analyticsEvent.createMany({ data: seedEvents });
  console.log(`写入预窗口老访客种子：${seedEvents.length} 条`);

  // 2) 窗口内逐日生成访问与转化
  const all = [];
  let totalVisits = 0;
  for (let i = WINDOW - 1; i >= 0; i--) {
    const dayStart = Date.now() - i * DAY;
    const growth = 1 + 0.5 * (1 - i / WINDOW); // 缓慢增长
    const dailyVisits = Math.round((70 + Math.random() * 50) * growth);
    for (let v = 0; v < dailyVisits; v++) {
      totalVisits++;
      const isReturning = Math.random() < 0.45;
      const vid = isReturning ? pick(returningPool) : rid();
      const channel = weighted(CHANNELS);
      const region = weighted(PROVINCES);
      const device = weighted(DEVICES);
      const sid = rid();
      const ts = new Date(dayStart + Math.random() * DAY);
      const path = pick(["/", "/halls", "/halls/new", "/clan", "/memorial", "/pricing"]);

      all.push({
        type: "visit_start", ts, channel, source: null, medium: null,
        region, device, path: "/", visitorId: vid, sessionId: sid, userId: null, valueFen: null,
      });
      const pvCount = 1 + Math.floor(Math.random() * 4);
      for (let p = 0; p < pvCount; p++) {
        all.push({
          type: "pageview", ts: new Date(ts.getTime() + p * 60000),
          channel, source: null, medium: null, region, device, path,
          visitorId: vid, sessionId: sid, userId: null, valueFen: null,
        });
      }
      if (channel === "share") {
        all.push({
          type: "share_open", ts, channel, source: "分享链接", medium: "share",
          region, device, path: "/", visitorId: vid, sessionId: sid, userId: null, valueFen: null,
        });
      }

      // 仅新访客在本会话内发生转化（老访客已在前序窗口转化过）
      if (!isReturning) {
        const c = CONV[channel];
        if (Math.random() < c.reg) {
          const newUid = uid();
          all.push({
            type: "register", ts: new Date(ts.getTime() + 1000),
            channel, source: null, medium: null, region, device, path: "/register",
            visitorId: vid, sessionId: sid, userId: newUid, valueFen: null,
          });
          if (Math.random() < c.create) {
            const hallType = Math.random() < 0.7 ? "create_hall" : "create_clan";
            all.push({
              type: hallType, ts: new Date(ts.getTime() + 2000),
              channel, source: null, medium: null, region, device,
              path: hallType === "create_hall" ? "/halls/new" : "/clan/halls/new",
              visitorId: vid, sessionId: sid, userId: newUid, valueFen: null,
            });
            if (Math.random() < c.pay) {
              all.push({
                type: "first_pay", ts: new Date(ts.getTime() + 3000),
                channel, source: null, medium: null, region, device, path: "/pay",
                visitorId: vid, sessionId: sid, userId: newUid,
                valueFen: pick(PAY_AMOUNTS),
              });
            }
          }
        }
      }
    }
  }

  // 3) 批量写入（分块）
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < all.length; i += CHUNK) {
    const slice = all.slice(i, i + CHUNK);
    await prisma.analyticsEvent.createMany({ data: slice });
    written += slice.length;
  }
  console.log(`窗口内写入事件：${written} 条（会话约 ${totalVisits}）`);
}

const flag = process.argv[2];
if (flag === "--clear") {
  await clearAll();
} else if (flag === "--reset") {
  await clearAll();
  await run();
} else {
  await run();
}

const total = await prisma.analyticsEvent.count();
console.log(`分析层当前总条数：${total}`);
await prisma.$disconnect();
