"use client";

import { useState } from "react";
import { submitForReview, toggleEnabled } from "@/app/console/whispers/[id]/actions";

const field =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";

export default function SubmitForReview({
  profileId,
  status,
  enabled,
  hasConsent,
  hasPrompt,
  banner,
}: {
  profileId: string;
  status: string;
  enabled: boolean;
  hasConsent: boolean;
  hasPrompt: boolean;
  banner?: string;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = hasConsent && hasPrompt;
  const approved = status === "active";

  const gate = !hasConsent
    ? "缺少家属授权"
    : !hasPrompt
      ? "缺少人格提示词"
      : "资料已就绪";

  async function run(fn: (fd: FormData) => Promise<{ ok: boolean; message?: string }>, extra?: Record<string, string>) {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("profileId", profileId);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    try {
      const res = await fn(fd);
      setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "已完成" : "操作失败") });
      if (res.ok) window.location.reload();
    } catch {
      setMsg({ ok: false, text: "请求失败，请重试" });
    }
    setBusy(false);
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-6">
      <h2 className="text-sm font-semibold text-brand-900">
        提交审核与开关 <span className="ml-1 font-normal text-brand-400">最后一步</span>
      </h2>
      <p className="mt-1 text-xs text-brand-400">
        平台会人工核验资料的真实性与授权的完整性。审核通过后，需手动开启对话，家人才可进入。
      </p>

      {/* 检查清单 */}
      <ul className="mt-4 space-y-2 text-xs">
        <Check ok={hasConsent} text="已完成家属授权（《民法典》994 条前置）" />
        <Check ok={hasPrompt} text="已生成 / 保存人格提示词" />
        <Check ok={status !== "rejected"} text="审核状态非「已驳回」" warn={status === "rejected"} />
        <Check ok={approved} text="已通过平台审核" pending={!approved && status === "pending"} />
      </ul>

      {banner && (
        <p className="mt-3 rounded-lg bg-brand-50/60 px-4 py-2 text-xs text-brand-600">{banner}</p>
      )}

      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => run(submitForReview)}
          disabled={busy || !ready}
          className="rounded-md bg-brand-800 px-6 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy
            ? "提交中…"
            : status === "pending"
              ? "重新提交审核"
              : approved
                ? "修改后重新送审"
                : "提交审核"}
        </button>

        {approved && (
          <button
            type="button"
            onClick={() => run(toggleEnabled, { enabled: enabled ? "false" : "true" })}
            disabled={busy}
            className={
              "rounded-md px-6 py-2 text-sm text-white disabled:opacity-50 " +
              (enabled
                ? "bg-gray-500 hover:bg-gray-600"
                : "bg-emerald-600 hover:bg-emerald-700")
            }
          >
            {busy ? "处理中…" : enabled ? "关闭追思对话" : "开启追思对话"}
          </button>
        )}

        {!ready && <span className="text-xs text-amber-600">{gate}，暂不可提交</span>}
      </div>

      {/* 合规存档说明 */}
      <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-[11px] leading-relaxed text-slate-600">
        <b>合规存档：</b>本装置的授权记录、人格资料、对话日志与 AI 标识将保存不少于 6 个月；
        对话内容用于安全审计与投诉处理，不作商业用途。家属可随时在「家属授权」区块撤回授权，
        撤回后装置立即关闭。依据《人工智能生成合成内容标识办法》，所有 AI 生成内容均带
        显式标识与隐式元数据。
      </p>
    </section>
  );
}

function Check({ ok, text, warn, pending }: { ok: boolean; text: string; warn?: boolean; pending?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <span className={ok ? "text-emerald-600" : warn ? "text-red-500" : "text-amber-500"}>
        {ok ? "✓" : warn ? "✕" : pending ? "…" : "○"}
      </span>
      <span className={ok ? "text-brand-600" : "text-brand-500"}>{text}</span>
    </li>
  );
}
