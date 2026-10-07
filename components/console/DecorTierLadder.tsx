"use client";

/**
 * 档次阶梯 —— 让用户一眼看到"我在哪一档、升上一档还要多少"。
 *
 * ## 它解决什么
 *
 * 装修的最大阻力不是"贵"，而是**看不出贵在哪**。素材墙按分类平铺，
 * 用户不知道"我现在这套算入门还是算豪华"、"再多花 20 块能好到什么程度"。
 * 阶梯把四档并排摆出来、高亮当前档，装修动机才有落点。
 *
 * ## 分层约束（重要）
 *
 * 本组件**不 import `lib/decor-3d.ts`**。
 *
 * 结构档位（`StructureTier`）住在表现层 `decor-3d.ts`，而数据层
 * `hall-decor.ts` 用的是**手抄的** `SPACE_DEFAULT_TIER` 表 —— 这是刻意的：
 * 不让数据层反向依赖表现层。工坊的阶梯属于"消费端"，同理必须守这条线：
 * 档位/价格**全部由 props 传入**（`DecorStudio` 用 `templateStructure()` /
 * `templatePriceFen()` 现算），本组件只负责画。
 *
 * 好处是数据一变，阶梯自动跟着变，不会出现"阶梯说豪华档、素材墙却没有豪华素材"
 * 这种两处口径漂移。
 */

/** 一档的展示数据（由调用方现算传入） */
export type TierLadderRung = {
  /** 档位标识（同时用作 data-tier-level） */
  key: "free" | "entry" | "mid" | "lux";
  /** 档位名 */
  label: string;
  /** 价格区间文案，如 "¥5–15" */
  range: string;
  /** 该档可选模板数 */
  count: number;
  /** 是不是用户当前所在档 */
  current: boolean;
};

export default function DecorTierLadder({
  rungs,
  premiumCount = 0,
  className = "",
}: {
  rungs: TierLadderRung[];
  /** 高级订阅档模板数（有标价但靠订阅生效），0 时不显示提示 */
  premiumCount?: number;
  className?: string;
}) {
  if (rungs.length === 0) return null;

  return (
    <div data-tier-ladder className={"mt-3 rounded-lg border border-gray-200 bg-white p-3 " + className}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-brand-700">装修档次阶梯</span>
        <span className="text-[11px] text-brand-400">免费足够庄重，越往上空间形态与光线越讲究</span>
      </div>

      {/*
        四档并排。不用 flex-wrap 而用 grid-cols-2 sm:grid-cols-4：
        窄屏 2×2、宽屏一行四档 —— 一行四档时"阶梯感"最强（左素右华），
        所以宽屏优先保住一行。
      */}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rungs.map((r) => (
          <div
            key={r.key}
            data-tier-level={r.key}
            data-tier-current={r.current ? "true" : "false"}
            className={
              "rounded-md border px-2.5 py-2 transition " +
              (r.current
                ? // 当前档：描金高亮。刻意不用 accent 色 —— 那是 DecorStudioGuide 的色调，
                  // 两块挨着会分不清谁是谁
                  "border-amber-300 bg-amber-50/70 ring-1 ring-amber-200"
                : "border-gray-200 bg-gray-50/60")
            }
          >
            <div className="flex items-center gap-1.5">
              <span
                className={
                  "text-xs font-medium " + (r.current ? "text-amber-800" : "text-brand-700")
                }
              >
                {r.label}
              </span>
              {r.current && (
                <span className="rounded bg-amber-200/70 px-1 py-0.5 text-[9px] text-amber-900">
                  当前
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-brand-500">{r.range}</div>
            <div className="mt-0.5 text-[10px] text-brand-400">{r.count} 套可选</div>
          </div>
        ))}
      </div>

      {premiumCount > 0 && (
        <p data-tier-premium-hint className="mt-2 text-[10px] text-brand-400">
          另有 {premiumCount} 套「高级订阅」模板（标价 ¥18–20，订阅期内直接可用，已在对应档位内计数）
        </p>
      )}
    </div>
  );
}
