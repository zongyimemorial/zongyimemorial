"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { TOPUP_PRESETS, MIN_TOPUP, MAX_TOPUP } from "@/lib/fortune";

/**
 * 充值面板（客户端）。
 *
 * ⚠️ 档位展示**从 lib/fortune.ts 导入**，不在这里手抄 ——
 * 本仓库反复出现「同一个事实有两个判据」（见 AGENTS.md 的 withDark /
 * data-page-skin / premiumUntil 四处），福币要开局就收敛。
 * 赠送额预览也走同一条规则（`bonusFor`），但**最终以服务端快照为准**
 * （履约只读 snapshot，不重算）。
 */
export type TopupTierView = { pay: number; bonus: number };

export type WalletPanelProps = {
  /** 档位表（由服务端从 lib/fortune.ts 传入） */
  tiers: TopupTierView[];
  /** 建单 action（**传引用，不传闭包** —— 服务端组件不能把函数传给客户端组件） */
  createOrder: (yuan: number) => Promise<{ ok: boolean; orderNo?: string; error?: string }>;
};

/** 与 lib/fortune.ts 的 bonusFor 同规则的前端预览（仅用于显示，不参与履约） */
function previewBonus(yuan: number, tiers: TopupTierView[]): number {
  let bonus = 0;
  for (const t of tiers) if (yuan >= t.pay) bonus = t.bonus;
  return bonus;
}

export default function WalletPanel({ tiers, createOrder }: WalletPanelProps) {
  const router = useRouter();
  const [amount, setAmount] = useState<number>(100);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const bonus = useMemo(() => previewBonus(amount, tiers), [amount, tiers]);
  const total = amount + bonus;

  async function submit() {
    setErr("");
    if (!Number.isInteger(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
      setErr(`充值金额须为 ${MIN_TOPUP}–${MAX_TOPUP} 的整数`);
      return;
    }
    setLoading(true);
    try {
      const res = await createOrder(amount);
      if (res.ok && res.orderNo) {
        router.push(`/pay/${res.orderNo}`);
      } else {
        setErr(res.error || "下单失败");
      }
    } catch {
      setErr("网络错误");
    } finally {
      setLoading(false);
    }
  }

  function onCustomChange(v: string) {
    setCustom(v);
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) setAmount(n);
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-5" data-wallet-panel>
      <h2 className="mb-1 text-base font-semibold text-brand-900">充值福币</h2>
      <p className="mb-4 text-xs text-brand-500">
        1 福币 = 1 元人民币，永久有效。最低充值 {MIN_TOPUP} 元，最高 {MAX_TOPUP} 元。
      </p>

      {/* 固定面值 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TOPUP_PRESETS.map((p) => {
          const active = amount === p;
          const b = previewBonus(p, tiers);
          return (
            <button
              key={p}
              type="button"
              data-topup-preset={p}
              onClick={() => {
                setAmount(p);
                setCustom("");
              }}
              className={`rounded-lg border px-4 py-2 text-sm transition ${
                active
                  ? "border-accent-400 bg-accent-50 font-semibold text-accent-700"
                  : "border-gray-200 text-brand-700 hover:border-accent-400"
              }`}
            >
              {p} 元
              {b > 0 && (
                <span className="ml-1 text-xs font-normal text-accent-600">送 {b}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 自定义金额 */}
      <div className="mb-4">
        <label className="mb-1 block text-xs text-brand-500" htmlFor="topup-custom">
          自定义金额（{MIN_TOPUP}–{MAX_TOPUP} 元）
        </label>
        <input
          id="topup-custom"
          data-topup-custom
          type="number"
          inputMode="numeric"
          min={MIN_TOPUP}
          max={MAX_TOPUP}
          step={1}
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder={`如 150（按不超过该金额的最高档赠送）`}
          className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-brand-900 outline-none focus:border-accent-400"
        />
      </div>

      {/* 本单预览 */}
      <div
        className="mb-4 rounded-md border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-brand-800"
        data-topup-preview
      >
        充值 <span className="font-semibold">{amount || 0}</span> 元
        {bonus > 0 ? (
          <>
            ，赠送 <span className="font-semibold text-accent-700">{bonus}</span> 福币
          </>
        ) : (
          <span className="text-brand-500">（该金额无赠送）</span>
        )}
        ，实得 <span className="font-bold">{total}</span> 福币
      </div>

      <button
        onClick={submit}
        disabled={loading}
        data-topup-submit
        className="rounded-md bg-brand-800 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {loading ? "处理中…" : `去支付 ${amount || 0} 元`}
      </button>
      {err && <p className="mt-2 text-xs text-red-500">{err}</p>}

      {/* 阶梯政策表 */}
      <div className="mt-6 border-t border-gray-100 pt-4">
        <h3 className="mb-2 text-xs font-medium text-brand-600">充值优惠政策</h3>
        <table className="w-full text-xs" data-topup-tiers>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.pay} className="text-brand-600">
                <td className="py-1">充 {t.pay} 元</td>
                <td className="py-1 text-accent-600">送 {t.bonus} 福币</td>
                <td className="py-1 text-brand-400">实得 {t.pay + t.bonus} 福币</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-brand-400">
          自定义金额按「不超过该金额的最高档」赠送。
        </p>
      </div>
    </div>
  );
}
