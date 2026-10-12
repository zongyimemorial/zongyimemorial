"use client";

import { useState } from "react";
import { createClanPost } from "@/app/(public)/clan/actions";

const field =
  "w-full rounded-md border border-brand-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";

const TOPICS = ["寻根问祖", "家族事务", "联谊交流", "字辈讨论"];

export default function ClanComposer({
  isLoggedIn,
  idVerified,
}: {
  isLoggedIn: boolean;
  idVerified: boolean;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState("联谊交流");

  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border border-dashed border-brand-200 bg-brand-100/70 p-6 text-center text-sm text-brand-400">
        <a href="/login" className="text-accent-600 hover:underline">登录</a>
        后可发布话题（实名认证后可发帖，营造可信宗亲社区）
      </div>
    );
  }
  if (!idVerified) {
    return (
      <div className="rounded-xl border border-dashed border-brand-200 bg-brand-100/70 p-6 text-center text-sm text-brand-400">
        发帖需先完成
        <a href="/console/realname" className="text-accent-600 hover:underline">实名认证</a>
      </div>
    );
  }

  return (
    <form
      className="rounded-xl border border-brand-200 bg-brand-100/70 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const fd = new FormData(e.currentTarget);
        fd.set("topic", topic);
        const res = await createClanPost(fd);
        setBusy(false);
        setMsg({ ok: res.ok, text: res.message });
        if (res.ok) (e.target as HTMLFormElement).reset();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">姓氏圈子 *</label>
          <input name="surname" required placeholder="如：林" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">话题分类</label>
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t)}
                className={`rounded-full border px-3 py-1 text-xs ${topic === t ? "border-accent-400 bg-accent-50 text-accent-700" : "border-brand-200 text-brand-500"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-brand-700">标题 *</label>
        <input name="title" required maxLength={60} placeholder="一句话说明议题" className={field} />
      </div>
      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-brand-700">内容 *</label>
        <textarea name="body" required rows={4} className={field} placeholder="详细描述您的寻根线索、家族事务或联谊提议…" />
      </div>
      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      )}
      <button
        disabled={busy}
        className="mt-4 rounded-md bg-brand-800 px-6 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? "提交中…" : "发布话题（先审后显，+5积分）"}
      </button>
    </form>
  );
}
