import { formatFub, fubOnly } from "@/lib/fortune";

/*
  ============================================================================
  统一价格展示组件 —— 平台唯一的价格渲染入口

  需求：「平台所有产品的售价全部改为福币 + 积分，1 元福币 = 1 元人民币」。
  文案口径（已确认）：**福币为主、括号标注人民币** —— `59 福币（¥59）`。

  为什么要抽成一个组件：改造前有 26 处手搓 `¥{formatYuan(x)}`，
  且精度不一（有的 `.toFixed(0)` 把 ¥2.20 截断成 ¥2）。统一到这里顺手修掉。

  ⚠️ 「积分可兑」不是价格的一部分，而是**并行的第二种支付方式**
  —— 所以 `points` 单独渲染成次要文字，不与福币价混在一行数字里。
  ============================================================================
*/

export type PriceProps = {
  /** 福币价（整数福币） */
  fub: number;
  /** 积分可兑价（积分「个数」）；不传则不显示 */
  points?: number | null;
  /** 免费品：渲染「免费」而非「0 福币（¥0）」 */
  free?: boolean;
  /** 尺寸 */
  size?: "sm" | "md" | "lg";
  /** 只要福币数字、不带人民币括号（空间紧张的卡片） */
  compact?: boolean;
  className?: string;
};

const SIZE_TEXT: Record<NonNullable<PriceProps["size"]>, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
};

export default function Price({
  fub,
  points,
  free = false,
  size = "md",
  compact = false,
  className = "",
}: PriceProps) {
  const sizeCls = SIZE_TEXT[size];

  if (free || fub <= 0) {
    return (
      <span data-price-free className={`font-semibold text-green-600 ${sizeCls} ${className}`}>
        免费
      </span>
    );
  }

  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`} data-price-fub={fub}>
      <span className={`font-bold text-brand-700 ${sizeCls}`}>
        {compact ? fubOnly(fub) : formatFub(fub)}
      </span>
      {points ? (
        <span className="text-xs text-accent-600" data-price-points={points}>
          {points} 积分可兑
        </span>
      ) : null}
    </span>
  );
}
