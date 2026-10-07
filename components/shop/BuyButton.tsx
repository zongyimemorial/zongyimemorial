"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function BuyButton({
  productId,
  label = "立即购买",
  quantity = 1,
  targetHallId,
  targetKind,
}: {
  productId: string;
  label?: string;
  quantity?: number;
  /** 容量包：作用的目标馆 id（从控制台面板带入） */
  targetHallId?: string;
  /** 容量包：目标类型 "hall" | "clan" */
  targetKind?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function buy() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity, targetHallId, targetKind }),
      });
      if (res.status === 401 || res.status === 403) {
        router.push("/login");
        return;
      }
      const d = await res.json();
      if (d.orderNo) {
        router.push(`/pay/${d.orderNo}`);
      } else {
        setErr(d.error || "下单失败");
      }
    } catch {
      setErr("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={buy}
        disabled={loading}
        className="rounded-md bg-brand-800 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {loading ? "处理中…" : label}
      </button>
      {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
    </div>
  );
}
