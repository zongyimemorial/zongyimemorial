import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";
import { formatYuan } from "@/lib/utils";
import AutoRefresh from "@/components/admin/AutoRefresh";
import {
  getTrafficMetrics,
  getActiveUsers,
  getChannelMetrics,
  getFunnelMetrics,
  getRetentionCohorts,
  getTrendSeries,
  getRegionDistribution,
  getDeviceDistribution,
  getRevenueMetrics,
} from "@/lib/analytics";

export const metadata = { title: "运营监控" };

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("zh-CN", { hour12: false });
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
// formatYuan(fen) 内部已做 /100，这里不能再除一次，否则金额缩水 100 倍
const fenToYuan = (f: number) => `¥${formatYuan(f)}`;

// ---------------------------------------------------------------------------
// 轻量可视化（纯 CSS，无外部依赖）
// ---------------------------------------------------------------------------

/** 横向条形（占比填充），用于渠道/地域/设备 */
function HBar({ value, max, label }: { value: number; max: number; label: string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${w}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-brand-700">{label}</span>
    </div>
  );
}

/** 竖向迷你柱状（近 30 天趋势） */
function MiniBars({ points, unit }: { points: { day: string; v: number }[]; unit?: string }) {
  const max = Math.max(1, ...points.map((p) => p.v));
  return (
    <div className="flex h-28 items-end gap-[2px]" title={`单位：${unit || "次"}`}>
      {points.map((p) => {
        const h = p.v > 0 ? Math.max(3, Math.round((p.v / max) * 100)) : 0;
        return (
          <div
            key={p.day}
            className="flex-1 rounded-t bg-brand-400/80"
            style={{ height: `${h}%` }}
            title={`${p.day}：${p.v}${unit || ""}`}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 页面
// ---------------------------------------------------------------------------

export default async function AdminDashboard() {
  const me = await getCurrentUser();
  const iAmSuper = me ? isSuperAdmin(me.role) : false;

  const now = new Date();
  const today = startOfDay(now);
  const d7 = new Date(today.getTime() - 7 * 24 * 3600 * 1000);

  const [
    revAll,
    revToday,
    rev7,
    userAll,
    userToday,
    hallActive,
    clanAll,
    hallPending,
    clanPending,
    modPending,
    liveLive,
    liveUpcoming,
    liveEnded,
    fortuneTopup,
    fortuneSpend,
    pointEarn,
    pointRedeem,
    mTribToday,
    mTribAll,
    cTribToday,
    cTribAll,
    altarToday,
    altarAll,
    // 分析层
    traffic,
    active,
    channels,
    funnel,
    cohorts,
    trend,
    regions,
    devices,
    revenue,
  ] = await Promise.all([
    prisma.order.aggregate({ where: { status: "paid" }, _sum: { payAmount: true }, _count: { _all: true } }),
    prisma.order.aggregate({ where: { status: "paid", createdAt: { gte: today } }, _sum: { payAmount: true }, _count: { _all: true } }),
    prisma.order.aggregate({ where: { status: "paid", createdAt: { gte: d7 } }, _sum: { payAmount: true }, _count: { _all: true } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.memorialHall.count({ where: { status: "active" } }),
    prisma.clanHall.count(),
    prisma.memorialHall.count({ where: { status: "pending" } }),
    prisma.clanHall.count({ where: { status: "pending" } }),
    prisma.moderationQueue.count({ where: { status: "pending" } }),
    prisma.liveSession.count({ where: { status: "live" } }),
    prisma.liveSession.count({ where: { status: "scheduled" } }),
    prisma.liveSession.count({ where: { status: "ended" } }),
    prisma.fortuneLog.aggregate({ where: { kind: "topup" }, _sum: { amount: true } }),
    prisma.fortuneLog.aggregate({ where: { kind: "spend" }, _sum: { amount: true } }),
    prisma.pointLog.aggregate({ where: { kind: "earn" }, _sum: { amount: true } }),
    prisma.pointLog.aggregate({ where: { kind: "redeem" }, _sum: { amount: true } }),
    prisma.memorialTribute.count({ where: { createdAt: { gte: today } } }),
    prisma.memorialTribute.count(),
    prisma.clanTribute.count({ where: { createdAt: { gte: today } } }),
    prisma.clanTribute.count(),
    prisma.offeringOnAltar.count({ where: { createdAt: { gte: today } } }),
    prisma.offeringOnAltar.count(),
    // 分析层
    getTrafficMetrics(30),
    getActiveUsers(),
    getChannelMetrics(),
    getFunnelMetrics(30),
    getRetentionCohorts(30),
    getTrendSeries(30),
    getRegionDistribution(12),
    getDeviceDistribution(),
    getRevenueMetrics(),
  ]);

  const tribToday = mTribToday + cTribToday + altarToday;
  const tribAll = mTribAll + cTribAll + altarAll;

  const kpis = [
    { label: "今日成交额", value: `¥${formatYuan(revToday._sum.payAmount ?? 0)}`, note: `${revToday._count._all} 笔` },
    { label: "近 7 日成交额", value: `¥${formatYuan(rev7._sum.payAmount ?? 0)}`, note: `${rev7._count._all} 笔` },
    { label: "累计成交额", value: `¥${formatYuan(revAll._sum.payAmount ?? 0)}`, note: `共 ${revAll._count._all} 笔订单` },
    { label: "今日新增用户", value: String(userToday), note: `累计注册 ${userAll}` },
  ];

  const content = [
    { label: "纪念馆（已开通）", value: String(hallActive), note: `待审 ${hallPending} 座` },
    { label: "宗祠总数", value: String(clanAll), note: `待审 ${clanPending} 座` },
    { label: "内容待审核", value: String(modPending), note: "审核队列" },
    { label: "今日供奉次数", value: String(tribToday), note: `累计 ${tribAll} 次` },
  ];

  const biz = [
    { label: "直播中", value: String(liveLive), note: `预告 ${liveUpcoming} · 回放 ${liveEnded}` },
    { label: "福币累计充值", value: `${fortuneTopup._sum.amount ?? 0} 福币`, note: `消费 ${fortuneSpend._sum.amount ?? 0} 福币` },
    { label: "积分累计发放", value: String(pointEarn._sum.amount ?? 0), note: `兑换 ${Math.abs(pointRedeem._sum.amount ?? 0)}` },
  ];

  // 漏斗
  const funnelSteps = [
    { name: "访问会话", value: funnel.visitStart },
    { name: "注册", value: funnel.register },
    { name: "建馆/建祠", value: funnel.createHall },
    { name: "付费用户", value: funnel.firstPay },
  ];
  const funnelMax = Math.max(1, funnel.visitStart);

  // 渠道条形最大值
  const chanMax = Math.max(1, ...channels.map((c) => c.visits));
  const regionMax = Math.max(1, ...regions.map((r) => r.uv));
  const deviceMax = Math.max(1, ...devices.map((d) => d.cnt));

  const deviceLabel: Record<string, string> = {
    mobile: "移动端",
    desktop: "桌面端",
    tablet: "平板",
    unknown: "未知",
  };

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-brand-900">运营监控</h1>
        <AutoRefresh />
      </div>
      <p className="mb-6 text-sm text-brand-500">
        平台实时经营数据大盘（每次刷新直读数据库，每 60 秒自动更新）。新增流量获客、渠道来源、转化漏斗、用户留存与地域设备分析。
      </p>

      {/* 1. 核心指标 */}
      <h2 className="mb-3 text-sm font-semibold text-brand-700">核心指标</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((c) => (
          <div key={c.label} className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
            <div className="text-sm text-brand-500">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">{c.value}</div>
            <div className="mt-2 text-xs text-brand-500">{c.note}</div>
          </div>
        ))}
      </div>

      {/* 2. 流量与获客 */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-brand-700">流量与获客（近 30 日）</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">访问会话</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{traffic.visits}</div>
          <div className="mt-2 text-xs text-brand-500">独立会话数</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">浏览量 PV</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{traffic.pv}</div>
          <div className="mt-2 text-xs text-brand-500">页面浏览次数</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">独立访客 UV</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{traffic.uv}</div>
          <div className="mt-2 text-xs text-brand-500">
            新访客 {traffic.newVisitors} · 回头 {traffic.returningVisitors}
          </div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">DAU / WAU</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">
            {active.dau} <span className="text-base text-brand-500">/ {active.wau}</span>
          </div>
          <div className="mt-2 text-xs text-brand-500">今日 / 近 7 日活跃</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">MAU</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{active.mau}</div>
          <div className="mt-2 text-xs text-brand-500">近 30 日活跃访客</div>
        </div>
      </div>

      {/* 3. 渠道来源 */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-brand-700">渠道来源（推广核心）</h2>
      <div className="overflow-x-auto rounded-xl border border-brand-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-brand-100/80 text-left text-xs text-brand-600">
            <tr>
              <th className="px-4 py-3 font-medium">渠道</th>
              <th className="px-4 py-3 font-medium">访问占比</th>
              <th className="px-4 py-3 text-right font-medium">访问</th>
              <th className="px-4 py-3 text-right font-medium">注册</th>
              <th className="px-4 py-3 text-right font-medium">注册率</th>
              <th className="px-4 py-3 text-right font-medium">首购用户</th>
              <th className="px-4 py-3 text-right font-medium">首购 GMV</th>
              <th className="px-4 py-3 text-right font-medium">首购率</th>
              <th className="px-4 py-3 text-right font-medium">首购客单价</th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-brand-400">
                  暂无渠道数据（运行 scripts/backfill-analytics.mjs 生成演示数据）
                </td>
              </tr>
            )}
            {channels.map((c) => (
              <tr key={c.channel} className="border-t border-brand-100">
                <td className="px-4 py-3 font-medium text-brand-900">{c.label}</td>
                <td className="px-4 py-3">
                  <HBar value={c.visits} max={chanMax} label={pct(c.visits / chanMax)} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-brand-700">{c.visits}</td>
                <td className="px-4 py-3 text-right tabular-nums text-brand-700">{c.regs}</td>
                <td className="px-4 py-3 text-right tabular-nums text-brand-700">{pct(c.regRate)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-brand-700">{c.fpUsers}</td>
                <td className="px-4 py-3 text-right tabular-nums text-brand-700">{fenToYuan(c.fpGmvFen)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-brand-700">{pct(c.fpRate)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-brand-700">{fenToYuan(c.fpArppuFen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. 转化漏斗 */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-brand-700">转化漏斗（近 30 日）</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-100/40 p-5">
          {funnelSteps.map((s, i) => {
            const w = Math.max(4, Math.round((s.value / funnelMax) * 100));
            const prev = i === 0 ? s.value : funnelSteps[i - 1].value;
            const stepRate = prev > 0 ? s.value / prev : 0;
            return (
              <div key={s.name}>
                <div className="mb-1 flex items-center justify-between text-xs text-brand-600">
                  <span>{s.name}</span>
                  <span className="tabular-nums">
                    {s.value} · {i === 0 ? "基准" : `步转化 ${pct(stepRate)}`}
                  </span>
                </div>
                <div className="h-7 overflow-hidden rounded-lg bg-brand-100">
                  <div className="flex h-full items-center justify-end rounded-lg bg-brand-500 px-2 text-xs font-medium text-white" style={{ width: `${w}%` }}>
                    {w > 12 ? pct(s.value / funnelMax) : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-4 self-start">
          <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
            <div className="text-sm text-brand-500">访问→注册</div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">{pct(funnel.visitStart ? funnel.register / funnel.visitStart : 0)}</div>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
            <div className="text-sm text-brand-500">注册→建馆</div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">{pct(funnel.register ? funnel.createHall / funnel.register : 0)}</div>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
            <div className="text-sm text-brand-500">建馆→付费</div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">{pct(funnel.createHall ? funnel.firstPay / funnel.createHall : 0)}</div>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
            <div className="text-sm text-brand-500">访问→付费</div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">{pct(funnel.visitStart ? funnel.firstPay / funnel.visitStart : 0)}</div>
          </div>
        </div>
      </div>

      {/* 4.5 营收分析（订单/金额口径，与转化漏斗分层） */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-brand-700">
        营收分析（订单 / 金额口径）
        <span className="ml-2 font-normal text-brand-400">与上方转化漏斗分层：漏斗算「人」，此处算「订单与金额」</span>
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">累计 GMV</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{fenToYuan(revenue.gmvFen)}</div>
          <div className="mt-2 text-xs text-brand-500">付费订单 {revenue.orders} 笔</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">付费订单数</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{revenue.orders}</div>
          <div className="mt-2 text-xs text-brand-500">由 {revenue.payers} 位付费用户贡献</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">付费用户数（去重）</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{revenue.payers}</div>
          <div className="mt-2 text-xs text-brand-500">付费渗透率 {pct(revenue.payPenetration)}</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">客单价（AOV）</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{fenToYuan(revenue.aovFen)}</div>
          <div className="mt-2 text-xs text-brand-500">GMV ÷ 订单数</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">人均付费（ARPPU）</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{fenToYuan(revenue.arppuFen)}</div>
          <div className="mt-2 text-xs text-brand-500">GMV ÷ 付费用户</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">人均订单（复购倍数）</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{revenue.repeatRate.toFixed(1)}</div>
          <div className="mt-2 text-xs text-brand-500">订单数 ÷ 付费用户</div>
        </div>
      </div>

      {/* 5. 用户留存 */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-brand-700">用户留存（按注册日分群）</h2>
      <div className="overflow-x-auto rounded-xl border border-brand-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-brand-100/80 text-left text-xs text-brand-600">
            <tr>
              <th className="px-4 py-3 font-medium">注册日</th>
              <th className="px-4 py-3 text-right font-medium">新增</th>
              <th className="px-4 py-3 text-right font-medium">D1 回访</th>
              <th className="px-4 py-3 text-right font-medium">D7 回访</th>
              <th className="px-4 py-3 text-right font-medium">D30 回访</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-brand-400">近 30 日暂无注册分群</td>
              </tr>
            )}
            {cohorts.map((c) => (
              <tr key={c.cohortDay} className="border-t border-brand-100">
                <td className="px-4 py-3 font-medium text-brand-900">{c.cohortDay}</td>
                <td className="px-4 py-3 text-right tabular-nums text-brand-700">{c.size}</td>
                <td className="px-4 py-3 text-right tabular-nums text-brand-700">{c.size ? `${c.d1} (${pct(c.d1 / c.size)})` : "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-brand-700">{c.size ? `${c.d7} (${pct(c.d7 / c.size)})` : "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-brand-700">{c.size ? `${c.d30} (${pct(c.d30 / c.size)})` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 6. 运营趋势 */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-brand-700">运营趋势（近 30 日）</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-brand-200 bg-brand-100/40 p-5">
          <div className="mb-2 text-sm text-brand-600">每日新增用户</div>
          <MiniBars points={trend.map((t) => ({ day: t.day, v: t.newUsers }))} unit="人" />
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/40 p-5">
          <div className="mb-2 text-sm text-brand-600">每日新增馆/祠</div>
          <MiniBars points={trend.map((t) => ({ day: t.day, v: t.newHalls }))} unit="座" />
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/40 p-5">
          <div className="mb-2 text-sm text-brand-600">每日 GMV</div>
          <MiniBars points={trend.map((t) => ({ day: t.day, v: Math.round(t.gmvFen / 100) }))} unit="元" />
        </div>
      </div>

      {/* 7. 地域 & 设备 */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-brand-700">地域 & 设备（近 30 日）</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-brand-200 bg-brand-100/40 p-5">
          <div className="mb-3 text-sm text-brand-600">访客地域分布（按 UV）</div>
          {regions.length === 0 ? (
            <div className="py-6 text-center text-xs text-brand-400">暂无地域数据</div>
          ) : (
            <div className="space-y-2">
              {regions.map((r) => (
                <div key={r.region} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs text-brand-700">{r.region}</span>
                  <div className="flex-1">
                    <HBar value={r.uv} max={regionMax} label={String(r.uv)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/40 p-5">
          <div className="mb-3 text-sm text-brand-600">设备分布</div>
          {devices.length === 0 ? (
            <div className="py-6 text-center text-xs text-brand-400">暂无设备数据</div>
          ) : (
            <div className="space-y-2">
              {devices.map((d) => (
                <div key={d.device} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs text-brand-700">{deviceLabel[d.device] || d.device}</span>
                  <div className="flex-1">
                    <HBar value={d.cnt} max={deviceMax} label={String(d.cnt)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 8. 内容与祭献 */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-brand-700">内容与祭献</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {content.map((c) => (
          <div key={c.label} className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
            <div className="text-sm text-brand-500">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">{c.value}</div>
            <div className="mt-2 text-xs text-brand-500">{c.note}</div>
          </div>
        ))}
      </div>

      {/* 业务活动 */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-brand-700">业务活动</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {biz.map((c) => (
          <div key={c.label} className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
            <div className="text-sm text-brand-500">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">{c.value}</div>
            <div className="mt-2 text-xs text-brand-500">{c.note}</div>
          </div>
        ))}
      </div>

      {/* 快捷入口 */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-brand-700">快捷入口</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/admin/ledger/halls"
          className="rounded-xl border border-brand-200 bg-brand-100/70 p-5 transition hover:border-brand-500"
        >
          <div className="text-sm font-semibold text-brand-900">纪念馆消费台帐</div>
          <div className="mt-1 text-xs text-brand-500">各馆消费汇总与下钻</div>
        </Link>
        <Link
          href="/admin/ledger/clans"
          className="rounded-xl border border-brand-200 bg-brand-100/70 p-5 transition hover:border-brand-500"
        >
          <div className="text-sm font-semibold text-brand-900">宗祠消费台帐</div>
          <div className="mt-1 text-xs text-brand-500">各祠消费汇总与下钻</div>
        </Link>
        <Link
          href="/admin/orders"
          className="rounded-xl border border-brand-200 bg-brand-100/70 p-5 transition hover:border-brand-500"
        >
          <div className="text-sm font-semibold text-brand-900">订单管理</div>
          <div className="mt-1 text-xs text-brand-500">交易与发货状态</div>
        </Link>
        <Link
          href="/admin/review"
          className="rounded-xl border border-brand-200 bg-brand-100/70 p-5 transition hover:border-brand-500"
        >
          <div className="text-sm font-semibold text-brand-900">内容审核</div>
          <div className="mt-1 text-xs text-brand-500">{modPending} 条待处理</div>
        </Link>

        {/* 系统级快捷入口：仅超级管理员可见 */}
        {iAmSuper && (
          <>
            <Link
              href="/admin/accounts"
              className="rounded-xl border border-amber-300 bg-amber-50 p-5 transition hover:border-amber-500"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                账号管理
                <span className="rounded bg-amber-200 px-1 text-[10px]">超管</span>
              </div>
              <div className="mt-1 text-xs text-amber-600">管理员账号增删改与权限</div>
            </Link>
            <Link
              href="/admin/audit"
              className="rounded-xl border border-amber-300 bg-amber-50 p-5 transition hover:border-amber-500"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                操作审计
                <span className="rounded bg-amber-200 px-1 text-[10px]">超管</span>
              </div>
              <div className="mt-1 text-xs text-amber-600">全量管理员操作日志</div>
            </Link>
          </>
        )}
      </div>

      <p className="mt-8 text-xs text-brand-400">数据截至 {fmtDate(now)}</p>
    </div>
  );
}
