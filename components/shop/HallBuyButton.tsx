"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CreateFlowSteps from "@/components/site/CreateFlowSteps";

// 纪念馆商品购买：下单时收集建馆证明材料（MZ/T 173—2025 合规）
export default function HallBuyButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    deceasedName: "",
    fireProof: "",
    applicantIdCard: "",
    applicantPhone: "",
    relation: "亲属",
  });

  const field = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1, hallInfo: form }),
      });
      const d = await res.json();
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (d.needRealname) {
        router.push("/console/realname");
        return;
      }
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
    <div>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand-800 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
      >
        申请建馆
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6">
            <h2 className="text-lg font-semibold text-brand-900">建馆申请 · 实名材料</h2>
            <p className="mt-1 text-xs text-brand-400">
              依据《网络祭祀要求》（MZ/T 173—2025）：建馆须提供火化证明、经办人身份证、
              手机号及逝者关系，经专人审核后方可开通。
            </p>

            {/*
              步骤条：让用户知道"提交材料"只是第 2 步，
              后面还有支付 → 审核开通 → 装修，别以为填完就建好了。
            */}
            <CreateFlowSteps
              kind="hall"
              steps={["实名认证", "提交材料", "审核开通", "装修纪念馆"]}
              current={1}
            />
            <p className="mt-3 text-[11px] text-brand-400">
              想先了解完整流程？
              <a href="/halls/guide" className="ml-1 font-medium text-accent-600 hover:underline">
                查看《纪念馆创建指引》→
              </a>
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-700">逝者姓名 *</label>
                <input value={form.deceasedName} onChange={set("deceasedName")} className={field} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-700">
                  火化证明编号 / 火化证电子件编号 *
                </label>
                <input value={form.fireProof} onChange={set("fireProof")} className={field} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-700">与逝者关系 *</label>
                <select value={form.relation} onChange={set("relation")} className={field}>
                  {["亲属", "配偶", "子女", "父母", "兄弟姐妹", "朋友", "宗亲", "单位（逝者生平相关）"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-700">
                  经办人身份证号 *
                </label>
                <input
                  value={form.applicantIdCard}
                  onChange={set("applicantIdCard")}
                  placeholder="18位身份证号（加密存储）"
                  className={field}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-700">
                  经办人手机号 *
                </label>
                <input
                  value={form.applicantPhone}
                  onChange={set("applicantPhone")}
                  placeholder="11位手机号"
                  className={field}
                />
              </div>
            </div>
            {err && <p className="mt-3 text-xs text-red-500">{err}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-brand-600"
              >
                取消
              </button>
              <button
                onClick={submit}
                disabled={loading}
                className="rounded-md bg-brand-800 px-5 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? "提交中…" : "提交并支付"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
