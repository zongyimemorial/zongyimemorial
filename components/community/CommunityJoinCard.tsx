"use client";

import { useState, useTransition } from "react";

/**
 * 非成员看到的加入入口（输入邀请码加入社区）。
 */
export default function CommunityJoinCard({
  presetCode,
  joinCommunity,
}: {
  presetCode?: string;
  joinCommunity: (formData: FormData) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [code, setCode] = useState(presetCode ?? "");
  const [msg, setMsg] = useState("");
  const [busy, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setMsg("请输入邀请码");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("code", code);
      const r = await joinCommunity(fd);
      setMsg(r.message || (r.ok ? "加入成功" : "加入失败"));
      if (r.ok) setTimeout(() => window.location.reload(), 800);
    });
  };

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
        🔒
      </div>
      <h2 className="text-lg font-semibold text-gray-800">亲友交流社区</h2>
      <p className="mt-1.5 text-sm text-gray-500">
        这是馆主邀请亲友私密交流的空间。请输入馆主分享给你的邀请码加入社区。
      </p>
      <form onSubmit={onSubmit} className="mx-auto mt-4 flex max-w-xs items-center gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="输入邀请码"
          className="flex-1 rounded-lg border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {busy ? "加入中…" : "加入"}
        </button>
      </form>
      {msg && (
        <p className={`mt-3 text-xs ${msg.includes("成功") ? "text-emerald-600" : "text-red-500"}`}>{msg}</p>
      )}
    </div>
  );
}
