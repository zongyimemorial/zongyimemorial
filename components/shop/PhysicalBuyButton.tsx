"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PhysicalBuyButton({
  productId,
  label = "立即购买",
  quantity = 1,
}: {
  productId: string;
  label?: string;
  quantity?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!form.name || !form.phone || !form.address) {
      setErr("请填写完整收货信息");
      return;
    }
    setLoading(true);
    setErr("");
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, quantity, shippingAddress: form }),
    });
    if (res.status === 401 || res.status === 403) {
      router.push("/login");
      return;
    }
    const d = await res.json();
    if (d.orderNo) router.push(`/pay/${d.orderNo}`);
    else setErr(d.error || "下单失败");
    setLoading(false);
  }

  return (
    <div className="text-right">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-brand-800 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
      >
        {label}
      </button>
      {open && (
        <div className="mt-4 rounded-lg border border-brand-200 bg-gray-50 p-4 text-left">
          <div className="mb-3 text-sm font-medium text-brand-700">收货信息</div>
          <input
            placeholder="收货人"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="mb-2 w-full rounded border border-brand-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="手机号"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="mb-2 w-full rounded border border-brand-300 px-3 py-2 text-sm"
          />
          <textarea
            placeholder="详细地址"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="mb-2 w-full rounded border border-brand-300 px-3 py-2 text-sm"
          />
          {err && <p className="mb-2 text-xs text-red-500">{err}</p>}
          <button
            onClick={submit}
            disabled={loading}
            className="w-full rounded-md bg-brand-800 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading ? "处理中…" : "提交并去支付"}
          </button>
        </div>
      )}
    </div>
  );
}
