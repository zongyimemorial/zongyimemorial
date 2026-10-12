import Link from "next/link";
import { notFound } from "next/navigation";
import {
  findSuite,
  suiteItemEntries,
  suitePriceFen,
  suitePriceYuan,
  SUITE_BENEFIT_TIERS,
  bracketOf,
} from "@/lib/decor-suites";
import { fubFromFen } from "@/lib/fortune";

export const metadata = { title: "装修方案详情" };

const TIER_LABEL_SHORT: Record<string, string> = {
  free: "免费层",
  standard: "标准层",
  premium: "尊享层",
};

export default async function SuiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const suite = findSuite(id);
  if (!suite) notFound();

  const entries = suiteItemEntries(suite);
  const total = suitePriceFen(suite);
  const bracket = bracketOf(total);
  const missing = entries.filter((e) => !e.found).length;
  const tierLabel = SUITE_BENEFIT_TIERS.find((t) => t.key === suite.tier)?.label ?? suite.tier;

  return (
    <div className="container-page max-w-3xl py-12">
      <Link href="/suites" className="text-sm text-brand-600 hover:underline">
        ← 返回装修方案
      </Link>

      {/* 头部 */}
      <div
        className="mt-4 flex items-center gap-4 rounded-2xl p-6"
        style={{ background: suite.preview.background, color: suite.preview.color }}
      >
        <span className="text-5xl drop-shadow">{suite.preview.icon}</span>
        <div>
          <div className="text-xs opacity-80">
            {suite.target === "hall" ? "纪念馆" : "宗祠"} · {tierLabel}
          </div>
          <h1 className="text-3xl font-semibold">{suite.name}</h1>
          <div className="mt-1 text-lg font-bold" style={{ color: suite.preview.accent }}>
            {suitePriceYuan(suite)}
            <span className="ml-2 text-sm font-normal opacity-70">九档区间 · 第 {bracket.toUpperCase()} 档</span>
          </div>
        </div>
      </div>

      <p className="mt-4 text-brand-600">{suite.desc}</p>

      {missing > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          本方案有 {missing} 项尚未在商城上架，下面对应项会标注「待上架」。
        </div>
      )}

      {/* 所含项清单 */}
      <h2 className="mt-8 text-xl font-semibold text-brand-900">方案包含（{entries.length} 项）</h2>
      <p className="mt-1 text-sm text-brand-400">
        套装本身不单独售卖，下列模板 / 套件请在商城逐项购买，买后永久可用、也可积分兑换。
      </p>

      <ul className="mt-4 space-y-3">
        {entries.map((e, i) => (
          <li
            key={`${e.ref}-${i}`}
            data-suite-item={e.ref}
            data-suite-item-kind={e.kind}
            data-suite-item-found={e.found ? "1" : "0"}
            className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-100/70 p-3"
          >
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-2xl"
              style={{ background: e.preview.background, color: e.preview.color }}
            >
              {e.preview.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-brand-900">{e.name}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-brand-500">
                  {e.kind === "template" ? "空间模板" : "装饰套件"}
                </span>
              </div>
              <div className="text-xs text-brand-400">{e.ref}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold text-brand-700">{fubFromFen(e.priceFen)} 福币</div>
              {e.found ? (
                <Link
                  href={e.href}
                  className="mt-1 inline-block rounded bg-brand-800 px-3 py-1 text-xs text-white hover:bg-brand-700"
                >
                  去购买
                </Link>
              ) : (
                <span className="mt-1 inline-block rounded bg-gray-100 px-3 py-1 text-xs text-brand-400">
                  待上架
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* 合计 */}
      <div className="mt-6 flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 p-4">
        <span className="text-brand-700">方案合计（{entries.length} 项，现算）</span>
        <span className="text-xl font-bold text-brand-800">{suitePriceYuan(suite)}</span>
      </div>

      <div className="mt-6 text-center">
        <Link href="/suites" className="text-sm text-brand-600 hover:underline">
          ← 返回全部方案
        </Link>
      </div>
    </div>
  );
}
