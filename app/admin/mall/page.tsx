import { prisma } from "@/lib/db";

export const metadata = { title: "商城经营测算" };

/**
 * 虚拟祭品商城 · 经营测算（内部，仅管理后台可见）
 *
 * ⚠️ 本页含定价、成本、毛利与 GMV 等经营数据，禁止渲染到前台页面。
 *
 * 与「午夜悄悄话 · 经营测算」同源思路，但成本结构完全不同：
 * 悄悄话是「按分钟计费的云服务」（ASR/LLM/TTS 每单都有真金白银的算力成本）；
 * 虚拟祭品是**数字商品**——一次生产、无限复制，单位边际成本≈0。
 * 它的毛利不来自「省成本」，而来自「根本没有可变成本」，只需承担：
 *   - 支付通道费（正式接入微信/支付宝约 0.6%/笔；内测 simulate 通道为 0）
 *   - 一次性的内容/美术研发摊销（不计入单笔边际成本）
 *   - 极低的存储/带宽摊薄
 */

// 单位边际成本模型（元/笔）。数字商品：可变成本近乎为 0。
const UNIT_COST = {
  gateway: 0.006, // 支付通道费率（微信/支付宝，正式接入后）；simulate 模式下为 0
  storageCdn: 0.0003, // 存储/带宽摊薄
};
const MARGIN_FULL = 1 - UNIT_COST.gateway; // 正式通道 ≈99.4%
const MARGIN_SIM = 1; // 内测 simulate 通道 100%

/** 五档定价体系的内部说明（顺序即展示顺序） */
const TIER_META: { key: string; label: string; note: string }[] = [
  { key: "free", label: "免费祭品", note: "基础礼仪兜底：上香/献花/三鞠躬/留言等。零收入，做留存与转化，不计入毛利考核" },
  { key: "basic", label: "基础祭品", note: "鲜花果品香烛茶酒，单价低、走量，文明祭扫默认表达" },
  { key: "advanced", label: "进阶供品", note: "纸扎衣物冥币花圈，客单中高，传统祭扫刚需" },
  { key: "ceremony", label: "仪式体验", note: "烟花/诵经/音乐仪式，强情绪溢价，毛利贡献主力" },
  { key: "custom", label: "场景定制", note: "建馆/传记/域名/视频，高客单、低频，工程化交付" },
];

/** 商品 type 中文名（用于真实经营数据分布） */
const TYPE_LABELS: Record<string, string> = {
  decor: "装修素材",
  tribute_item: "祭品",
  memorial_service: "纪念服务",
  virtual_flower: "虚拟鲜花",
  whisper_plan: "悄悄话套餐",
  storage: "存储扩容",
  physical_goods: "实体商品",
  subscription: "订阅",
  cloud_worship: "云祭扫",
};

function yuan(fen: number): string {
  return `¥${(fen / 100).toFixed(fen % 100 === 0 ? 0 : 2)}`;
}
function pct(margin: number): number {
  return Math.round(margin * 100);
}

export default async function MallOpsPage() {
  // —— 真实数据：在售商品全量轻量拉取（137 行，内存聚合零压力） ——
  const active = await prisma.product.findMany({
    where: { status: "active" },
    select: { tier: true, price: true, pointsPrice: true, type: true, isFree: true },
  });

  const byTier = new Map<string, { n: number; pmin: number; pmax: number; pts: number }>();
  const byType = new Map<string, number>();
  let freeCount = 0;
  for (const p of active) {
    if (p.isFree) freeCount += 1;
    const tk = p.tier ?? "uncategorized";
    const t = byTier.get(tk) ?? { n: 0, pmin: Infinity, pmax: 0, pts: 0 };
    t.n += 1;
    t.pmin = Math.min(t.pmin, p.price);
    t.pmax = Math.max(t.pmax, p.price);
    if (p.pointsPrice != null) t.pts += 1;
    byTier.set(tk, t);
    byType.set(p.type, (byType.get(p.type) ?? 0) + 1);
  }
  const totalCount = active.length;

  // —— 真实数据：已付订单 GMV ——
  const paid = await prisma.order.aggregate({
    _sum: { payAmount: true },
    _count: true,
    where: { status: "paid" },
  });
  const gmvFen = paid._sum.payAmount ?? 0;
  const paidN = paid._count;
  const aov = paidN > 0 ? gmvFen / paidN : 0;

  const typeRows = Array.from(byType.entries()).sort((a, b) => b[1] - a[1]);

  // 渲染列表：以 TIER_META 顺序为主，追加其中未覆盖的 tier（如空 tier 归为「未分类」）
  const tierRows = TIER_META.map((m) => ({ m, s: byTier.get(m.key) }));
  for (const key of byTier.keys()) {
    if (!TIER_META.find((x) => x.key === key)) {
      tierRows.push({ m: { key, label: "未分类", note: "—" }, s: byTier.get(key)! });
    }
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-brand-900">虚拟祭品商城 · 经营测算</h1>
      <p className="mb-6 text-sm text-brand-500">
        定价、成本与毛利内部数据。前台收费页只展示价格与权益，不展示本页任何内容。
        虚拟祭品是<b className="text-brand-700">数字商品、边际成本≈0</b>
        （一次生产无限复制），与「午夜悄悄话」按分钟计费的云服务成本结构不同——
        本商城的毛利来自「几乎没有可变成本」，仅扣支付通道费（内测 simulate 通道为 0）。
        下列商品计数、价格区间、GMV 均实时取自数据库。
      </p>

      {/* 单位成本模型 */}
      <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
        <h2 className="text-sm font-semibold text-brand-900">单位边际成本模型（数字商品）</h2>
        <div className="mt-3 grid gap-3 text-xs text-brand-600 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-3">
            可变生产成本（内容/算力）<br />
            <b className="text-brand-900">≈ ¥0 / 笔</b>
            <span className="mt-1 block text-[10px] opacity-70">
              一次生产、无限复制，无单笔材料/算力
            </span>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            支付通道费<br />
            <b className="text-brand-900">¥{UNIT_COST.gateway.toFixed(3)} / 笔</b>
            <span className="mt-1 block text-[10px] opacity-70">
              内测 simulate 通道为 0；正式微信/支付宝约 0.6%
            </span>
          </div>
          <div className="rounded-lg bg-brand-800 p-3 text-white">
            结论 · 毛利率<br />
            <b>≈{pct(MARGIN_SIM)}%（simulate）</b>
            <span className="mt-1 block text-[10px] opacity-70">
              正式通道 ≈{pct(MARGIN_FULL)}%（扣 0.6% 通道费）
            </span>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-brand-400">
          注：内容/美术为一次性研发摊销，不计入单笔边际成本；若按「分摊到 N 个付费用户」口径，
          单用户摊薄成本随销量上升而趋近 0。故商城毛利远高于实体电商，定价空间主要服务于
          <b className="text-brand-600">分层转化</b>（免费兜底 → 低价走量 → 高客单低频）。
        </p>
      </section>

      {/* 定价体系与毛利 */}
      <section className="mt-6 overflow-x-auto rounded-xl border border-brand-200 bg-brand-100/70 p-5">
        <h2 className="text-sm font-semibold text-brand-900">定价体系与毛利（按产品线，实时数据）</h2>
        <table className="mt-3 w-full min-w-[820px] text-left text-xs">
          <thead className="text-brand-400">
            <tr className="border-b border-brand-200">
              <th className="py-2">产品线</th>
              <th className="py-2">在售数</th>
              <th className="py-2">定价区间</th>
              <th className="py-2">边际成本 / 笔</th>
              <th className="py-2">毛利率</th>
              <th className="py-2">积分兑换占比</th>
              <th className="py-2">内部备注</th>
            </tr>
          </thead>
          <tbody className="text-brand-700">
            {tierRows.map(({ m, s }) => {
              const n = s?.n ?? 0;
              const ptsRate = n > 0 && s ? Math.round((s.pts / n) * 100) : 0;
              return (
                <tr key={m.key} className="border-b border-gray-50">
                  <td className="py-2.5 font-medium text-brand-900">{m.label}</td>
                  <td className="py-2.5">{n}</td>
                  <td className="py-2.5">
                    {s ? `${yuan(s.pmin)} – ${yuan(s.pmax)}` : "—"}
                  </td>
                  <td className="py-2.5">
                    <span className="text-brand-400">
                      ≈¥{(UNIT_COST.gateway * (s ? s.pmax / 100 : 0)).toFixed(3)}（simulate 为 0）
                    </span>
                  </td>
                  <td className="py-2.5">
                    <span className="rounded bg-green-50 px-1.5 py-0.5 font-semibold text-green-700">
                      ≈{pct(MARGIN_SIM)}%
                    </span>
                  </td>
                  <td className="py-2.5">
                    {ptsRate > 0 ? (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">
                        {ptsRate}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2.5 text-brand-500">{m.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-relaxed text-brand-400">
          毛利率 =（定价 − 单位边际成本）/ 定价。数字商品单位边际成本≈0，故毛利率接近 100%
          （simulate 通道 100%，正式通道扣 0.6% 后 ≈99.4%）。「积分兑换占比」高表示该产品线
          大量开放积分兑换（积分由用户行为获取、兑换商品=平台让利），是拉新/促活的重要让渡渠道。
        </p>
      </section>

      {/* 真实经营数据 */}
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <h2 className="text-sm font-semibold text-brand-900">在售商品结构</h2>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xl font-semibold text-brand-900">{totalCount}</div>
              <div className="text-[11px] text-brand-400">在售总数</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xl font-semibold text-brand-900">{freeCount}</div>
              <div className="text-[11px] text-brand-400">免费祭品</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xl font-semibold text-brand-900">{totalCount - freeCount}</div>
              <div className="text-[11px] text-brand-400">收费商品</div>
            </div>
          </div>
          <h3 className="mt-4 text-xs font-medium text-brand-700">按商品类型分布</h3>
          <div className="mt-2 space-y-1.5 text-xs text-brand-600">
            {typeRows.map(([type, n]) => (
              <div key={type} className="flex items-center justify-between border-b border-gray-50 py-1">
                <span>{TYPE_LABELS[type] ?? type}</span>
                <span className="font-medium text-brand-900">{n} 件</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <h2 className="text-sm font-semibold text-brand-900">累计交易（已付订单）</h2>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xl font-semibold text-brand-900">{yuan(gmvFen)}</div>
              <div className="text-[11px] text-brand-400">GMV（累计）</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xl font-semibold text-brand-900">{paidN}</div>
              <div className="text-[11px] text-brand-400">已付订单</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xl font-semibold text-brand-900">{yuan(Math.round(aov))}</div>
              <div className="text-[11px] text-brand-400">客单价</div>
            </div>
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-brand-400">
            当前支付走内测 <b className="text-brand-600">simulate</b> 通道（不真实扣款），GMV 为模拟流水，
            仅用于验证交易链路与经营看板；正式接入微信/支付宝后此处即为真实营收。
            数字商品毛利结构决定了：在不增加可变成本的前提下，营收增长≈利润增长。
          </p>
        </div>
      </section>
    </div>
  );
}
