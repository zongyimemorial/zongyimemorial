"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SimulatePayButton({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function pay() {
    setLoading(true);
    try {
      const res = await fetch(`/api/payments/simulate/${orderNo}`, {
        method: "POST",
      });
      const d = await res.json();
      if (d.status === "paid" || d.orderNo) {
        setDone(true);
        setTimeout(() => router.push("/console"), 900);
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md bg-green-50 px-4 py-3 text-center text-sm text-green-700">
        ✅ 支付成功，正在跳转…
      </div>
    );
  }

  return (
    <button
      onClick={pay}
      disabled={loading}
      className="w-full rounded-md bg-brand-800 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
    >
      {loading ? "支付中…" : "确认模拟支付（内测）"}
    </button>
  );
}
