"use client";

import { useState } from "react";
import { replyClanPost } from "@/app/(public)/clan/actions";

export default function ClanReply({
  postId,
  isLoggedIn,
}: {
  postId: string;
  isLoggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isLoggedIn) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-accent-600 hover:underline">
        回帖
      </button>
    );
  }

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="text-xs text-accent-600 hover:underline">
        {open ? "收起" : "回帖"}
      </button>
      {open && (
        <div className="mt-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="友善交流，理性协商…（回帖先审后显）"
            className="w-full rounded-md border border-brand-200 px-3 py-2 text-sm"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={async () => {
                setBusy(true);
                const res = await replyClanPost(postId, text);
                setBusy(false);
                setMsg(res.message);
                if (res.ok) setText("");
              }}
              disabled={busy || !text.trim()}
              className="rounded-md bg-brand-800 px-4 py-1.5 text-xs text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "提交中…" : "提交回帖"}
            </button>
            {msg && <span className="text-xs text-brand-400">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
