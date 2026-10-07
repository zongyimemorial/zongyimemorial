"use client";

import { useState } from "react";

type Msg = { role: "user" | "bot"; text: string };

export default function CustomerService() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "bot",
      text: "您好，我是宗忆堂内测智能客服（本地规则引擎）。请问有什么可以帮您？试试问：怎么开通纪念馆？",
    },
  ]);
  const [loading, setLoading] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const r = await fetch("/api/customer-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      const data = await r.json();
      setMsgs((m) => [...m, { role: "bot", text: data.answer || "（无回复）" }]);
    } catch {
      setMsgs((m) => [...m, { role: "bot", text: "网络错误，请稍后再试。" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-brand-800 text-sm text-white shadow-lg hover:bg-brand-900"
        aria-label="在线客服"
      >
        {open ? "×" : "客服"}
      </button>
      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex h-96 w-80 flex-col rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 px-4 py-2 text-sm font-medium text-brand-900">
            宗忆堂 · 在线客服（内测）
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <span
                  className={
                    m.role === "user"
                      ? "inline-block rounded bg-brand-700 px-2 py-1 text-white"
                      : "inline-block rounded bg-gray-100 px-2 py-1 text-brand-800"
                  }
                >
                  {m.text}
                </span>
              </div>
            ))}
            {loading && <div className="text-left text-xs text-brand-400">客服输入中…</div>}
          </div>
          <div className="flex gap-2 border-t border-gray-100 p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="输入问题…"
              className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm"
            />
            <button
              onClick={send}
              className="rounded bg-brand-800 px-3 py-1 text-sm text-white hover:bg-brand-900"
            >
              发送
            </button>
          </div>
        </div>
      )}
    </>
  );
}
