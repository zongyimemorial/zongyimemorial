"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 敬献大花圈入口（馆内场景下方）。
 *
 * 规则：
 *   - 付费商品（grand-wreath，¥199），复用通用下单链路 /api/orders（带 targetHallId），
 *     下单成功跳 /pay/[orderNo] 完成支付；支付成功由 simulatePay 履约入馆；
 *   - 同馆同时最多 2 个有效花圈（服务端下单/履约双重校验，这里只做前置提示）；
 *   - 未登录 → 跳登录页。
 */
export default function WreathOffer({
  hallId,
  productId,
  priceLabel,
  activeCount,
  maxCount = 2,
  isLoggedIn,
  earliestExpiry,
}: {
  hallId: string;
  productId: string;
  /** 展示用价格文案，如 "¥199"（服务端按商品表现算，前端绝不传金额） */
  priceLabel: string;
  activeCount: number;
  maxCount?: number;
  isLoggedIn: boolean;
  /** 最早一朵花圈的凋谢时间（ISO），满位时提示何时腾出名额 */
  earliestExpiry?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const full = activeCount >= maxCount;

  async function offer() {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1, targetHallId: hallId, targetKind: "hall" }),
      });
      if (res.status === 401 || res.status === 403) {
        router.push("/login");
        return;
      }
      const d = await res.json();
      if (d.orderNo) {
        router.push(`/pay/${d.orderNo}`);
      } else {
        setErr(d.error || "下单失败，请稍后再试");
      }
    } catch {
      setErr("网络错误");
    } finally {
      setLoading(false);
    }
  }

  const expiryHint =
    full && earliestExpiry
      ? `名额已满（${activeCount}/${maxCount}），最早的花圈将于 ${new Date(earliestExpiry).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} 凋谢`
      : `馆内花圈 ${activeCount}/${maxCount}`;

  return (
    <div className="mb-6 flex flex-col items-center gap-2 rounded-xl border border-amber-200/60 bg-gradient-to-b from-amber-50/80 to-brand-100/70 p-4 sm:flex-row sm:justify-between">
      <div className="text-center sm:text-left">
        <p className="text-sm font-semibold text-brand-900">敬献大花圈</p>
        <p className="mt-0.5 text-xs text-brand-400">
          素白菊大花圈 · 陈列于遗像下方 · 敬献后保留 3 天 · {expiryHint}
        </p>
        {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
      </div>
      <button
        onClick={offer}
        disabled={loading || full}
        className="shrink-0 rounded-lg bg-brand-800 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        title={full ? "花圈位已满" : undefined}
      >
        {full ? "花圈位已满" : loading ? "处理中…" : `敬献花圈（${priceLabel}）`}
      </button>
    </div>
  );
}
