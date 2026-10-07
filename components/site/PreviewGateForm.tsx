"use client";

import { useState } from "react";

export default function PreviewGateForm() {
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/preview-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pass }),
      });
      const data = await res.json();
      if (data?.ok) {
        // 关键：用整页硬跳转（window.location.replace），不走 Next 软导航。
        // 隧道抖动时软导航的 RSC 拉取会静默失败、页面卡在门页；
        // 硬跳转由浏览器原生负责，可重试、后退/前进天然可靠，
        // replace() 还会把门页从历史中抹掉，后退不会再退回门口页形成陷阱。
        window.location.replace("/");
        return; // 整页即将重载，不复位 loading
      }
      setError(data?.error || "口令不正确");
      setLoading(false);
    } catch {
      setError("网络异常，请重试");
      setLoading(false);
    }
  }

  return (
    // action/method 为无 JS 兜底：当客户端 JS 未加载时，原生表单提交也能过门
    <form
      onSubmit={onSubmit}
      action="/api/preview-unlock"
      method="POST"
      className="mt-6 flex flex-col gap-3"
    >
      <input
        type="password"
        name="pass"
        autoFocus
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        placeholder="请输入内测口令"
        className="w-full rounded-lg border border-brand-200 px-4 py-3 text-center text-lg outline-none focus:border-brand-500"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-brand-700 py-3 font-medium text-white transition hover:bg-brand-800 disabled:opacity-60"
      >
        {loading ? "验证中…" : "进入内测"}
      </button>
    </form>
  );
}
