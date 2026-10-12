"use client";

import { useState } from "react";
import { signupActivity } from "@/app/(public)/clan/actions";

export default function ActivitySignup({
  activityId,
  isLoggedIn,
  full,
  finished,
}: {
  activityId: string;
  isLoggedIn: boolean;
  full: boolean;
  finished: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (finished) {
    return <span className="text-xs text-brand-300">活动已结束</span>;
  }

  if (!isLoggedIn) {
    return (
      <a href="/login" className="rounded-md border border-brand-300 px-4 py-1.5 text-xs text-brand-700 hover:bg-brand-50">
        登录后报名
      </a>
    );
  }

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          disabled={full}
          className="rounded-md bg-brand-800 px-4 py-1.5 text-xs text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {full ? "名额已满" : "立即报名"}
        </button>
      ) : (
        <form
          className="mt-3 grid gap-2 rounded-lg bg-brand-50/60 p-3 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const fd = new FormData(e.currentTarget);
            fd.set("activityId", activityId);
            const res = await signupActivity(fd);
            setBusy(false);
            setMsg({ ok: res.ok, text: res.message });
            if (res.ok) setOpen(false);
          }}
        >
          <input name="name" required placeholder="姓名 *" className="rounded-md border border-brand-200 px-3 py-1.5 text-sm" />
          <input name="phone" required placeholder="联系电话 *" className="rounded-md border border-brand-200 px-3 py-1.5 text-sm" />
          <input name="note" placeholder="同行人数/备注" className="rounded-md border border-brand-200 px-3 py-1.5 text-sm" />
          <div className="flex items-center gap-3 sm:col-span-3">
            <button disabled={busy} className="rounded-md bg-brand-800 px-4 py-1.5 text-xs text-white disabled:opacity-50">
              {busy ? "提交中…" : "确认报名"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-brand-400">
              取消
            </button>
          </div>
        </form>
      )}
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      )}
    </div>
  );
}
