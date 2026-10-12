import Link from "next/link";
import {
  allSuites,
  suitePriceFen,
  suitePriceYuan,
  suiteItemEntries,
  SUITE_BENEFIT_TIERS,
  PRICE_BRACKETS,
  bracketOf,
  type SuiteBenefitTierKey,
  type DecorSuite,
} from "@/lib/decor-suites";
import { fubFromFen, fubOnly } from "@/lib/fortune";

export const metadata = { title: "装修方案 · 三层九档套装" };

const TIER_BADGE: Record<SuiteBenefitTierKey, string> = {
  free: "bg-green-50 text-green-700 border-green-200",
  standard: "bg-brand-50 text-brand-700 border-brand-200",
  premium: "bg-amber-50 text-amber-700 border-amber-200",
};

const TIER_LABEL_SHORT: Record<SuiteBenefitTierKey, string> = {
  free: "免费层",
  standard: "标准层",
  premium: "尊享层",
};

/**
 * 价格标签（**福币口径**）：1 福币 = 1 元人民币。
 * 输入仍是分（lib/decor-suites 的口径），输出福币。
 *
 * ⚠️ 这里**委托 `fubFromFen`/`fubOnly`**，不再自己写 `(fen/100).toFixed(...)` ——
 * 手写版判据是 `fen % 100 === 0 ? 0 : 2`（两位小数），
 * 与 `fubFromFen` 的 0.1 元精度**不是同一个口径**：
 * 150 分手写得 "1.50 福币"、统一入口得 "1.5 福币"，同一件素材两处显示不同。
 */
function fubLabel(fen: number) {
  return fubOnly(fubFromFen(fen));
}

export default async function SuitesPage({
  searchParams,
}: {
  searchParams: Promise<{ bracket?: string; target?: string }>;
}) {
  const { bracket: bracketParam, target: targetParam } = await searchParams;
  const target = targetParam === "hall" || targetParam === "clan" ? targetParam : "all";
  const bracket = bracketParam || "all";

  const buildHref = (patch: { bracket?: string; target?: string }) => {
    const params = new URLSearchParams();
    const b = patch.bracket ?? bracket;
    const t = patch.target ?? target;
    if (b && b !== "all") params.set("bracket", b);
    if (t && t !== "all") params.set("target", t);
    const q = params.toString();
    return q ? `/suites?${q}` : "/suites";
  };

  // 过滤：端 + 九档
  const filtered = allSuites().filter((s) => {
    if (target !== "all" && s.target !== target) return false;
    if (bracket !== "all" && bracketOf(suitePriceFen(s)) !== bracket) return false;
    return true;
  });

  const countByBracket = (key: string) =>
    allSuites().filter((s) => bracketOf(suitePriceFen(s)) === key).length;
  const countByTarget = (t: "hall" | "clan") => allSuites().filter((s) => s.target === t).length;

  const card = (s: DecorSuite) => {
    const total = suitePriceFen(s);
    const items = suiteItemEntries(s);
    const missing = items.filter((i) => !i.found).length;
    return (
      <Link
        key={s.id}
        href={`/suites/${s.id}`}
        data-suite-id={s.id}
        data-suite-tier={s.tier}
        data-suite-target={s.target}
        data-suite-bracket={bracketOf(total)}
        data-suite-price={total}
        className="group flex flex-col overflow-hidden rounded-xl border border-brand-200 bg-brand-100/70 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
      >
        <div
          className="relative flex h-28 items-center justify-center"
          style={{ background: s.preview.background, color: s.preview.color }}
        >
          <span className="text-3xl drop-shadow">{s.preview.icon}</span>
          <span
            className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[11px] ${TIER_BADGE[s.tier]}`}
          >
            {TIER_LABEL_SHORT[s.tier]}
          </span>
          <span className="absolute left-2 top-2 rounded-full bg-black/30 px-2 py-0.5 text-[11px] text-white">
            {s.target === "hall" ? "纪念馆" : "宗祠"}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold text-brand-900">{s.name}</h3>
            <span className="shrink-0 text-sm font-bold text-brand-700">{fubLabel(total)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-brand-500">{s.desc}</p>
          <div className="mt-3 flex items-center justify-between text-[11px] text-brand-400">
            <span>含 {s.items.length} 件 · {items.length} 项可购</span>
            {missing > 0 ? (
              <span className="text-red-500">⚠ {missing} 项未上架</span>
            ) : (
              <span className="text-green-600">全部可购</span>
            )}
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="container-page max-w-6xl py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-brand-900">装修方案 · 三层九档套装</h1>
        <p className="mt-2 max-w-3xl text-brand-500">
          按 <b>免费 / 标准 / 尊享</b> 三层权益，与 <b>九档价格区间</b> 交叉定位，挑一套你想要的纪念馆或宗祠装修。
          每套方案由若干模板 / 套件组成，点开即可逐项去商城购买。
        </p>
      </header>

      {/* 九档价格区间筛选导航 */}
      <div className="mb-4">
        <div className="mb-2 text-sm font-semibold text-brand-900">九档价格区间</div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildHref({ bracket: "all" })}
            className={
              bracket === "all"
                ? "rounded-lg border border-brand-800 bg-brand-800 px-3 py-1.5 text-sm text-white"
                : "rounded-lg border border-brand-200 bg-brand-100/70 px-3 py-1.5 text-sm text-brand-600 hover:border-brand-300"
            }
          >
            全部
          </Link>
          {PRICE_BRACKETS.map((b) => (
            <Link
              key={b.key}
              href={buildHref({ bracket: b.key })}
              className={
                bracket === b.key
                  ? "rounded-lg border border-brand-800 bg-brand-800 px-3 py-1.5 text-sm text-white"
                  : "rounded-lg border border-brand-200 bg-brand-100/70 px-3 py-1.5 text-sm text-brand-600 hover:border-brand-300"
              }
            >
              {b.label}
              <span className="ml-1 text-[11px] opacity-60">{countByBracket(b.key)}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* 端筛选 */}
      <div className="mb-8">
        <div className="mb-2 text-sm font-semibold text-brand-900">适用端</div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildHref({ target: "all" })}
            className={
              target === "all"
                ? "rounded-lg border border-brand-800 bg-brand-800 px-3 py-1.5 text-sm text-white"
                : "rounded-lg border border-brand-200 bg-brand-100/70 px-3 py-1.5 text-sm text-brand-600 hover:border-brand-300"
            }
          >
            全部（{allSuites().length}）
          </Link>
          <Link
            href={buildHref({ target: "hall" })}
            className={
              target === "hall"
                ? "rounded-lg border border-brand-800 bg-brand-800 px-3 py-1.5 text-sm text-white"
                : "rounded-lg border border-brand-200 bg-brand-100/70 px-3 py-1.5 text-sm text-brand-600 hover:border-brand-300"
            }
          >
            纪念馆（{countByTarget("hall")}）
          </Link>
          <Link
            href={buildHref({ target: "clan" })}
            className={
              target === "clan"
                ? "rounded-lg border border-brand-800 bg-brand-800 px-3 py-1.5 text-sm text-white"
                : "rounded-lg border border-brand-200 bg-brand-100/70 px-3 py-1.5 text-sm text-brand-600 hover:border-brand-300"
            }
          >
            宗祠（{countByTarget("clan")}）
          </Link>
        </div>
      </div>

      {/* 三层权益层区块 */}
      {SUITE_BENEFIT_TIERS.map((tier) => {
        const list = filtered.filter((s) => s.tier === tier.key);
        if (list.length === 0) return null;
        return (
          <section key={tier.key} className="mb-10" data-tier-section={tier.key}>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-xl font-semibold text-brand-900">{tier.label}</h2>
              <span className="text-sm text-brand-400">{tier.desc}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-brand-500">
                {list.length} 套
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{list.map(card)}</div>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-brand-200 bg-gray-50 p-10 text-center text-brand-400">
          当前筛选条件下没有匹配的套装，换个价格区间或端试试。
        </div>
      )}

      <div className="mt-8 text-center">
        <Link href="/mall" className="text-sm text-brand-600 hover:underline">
          ← 返回纪念商城
        </Link>
      </div>
    </div>
  );
}
