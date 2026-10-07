"use client";

import { useState, useTransition } from "react";

/**
 * 社区回帖表单（折叠式，范本：components/clan/ClanReply.tsx）
 */
export default function CommunityReplyForm({
  postId,
  createReply,
}: {
  postId: string;
  createReply: (formData: FormData) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("postId", postId);
      fd.set("content", content);
      const r = await createReply(fd);
      setMsg(r.message || "");
      if (r.ok) {
        setContent("");
        setOpen(false);
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-brand-500 hover:underline"
      >
        回复
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="写下你的回复…"
        maxLength={1000}
        className="h-16 w-full resize-none rounded-lg border border-gray-200 p-2 text-sm outline-none focus:border-brand-400"
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-brand-700 px-3 py-1 text-xs text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {busy ? "…" : "回复"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-400 hover:underline"
        >
          取消
        </button>
      </div>
      {msg && <p className="mt-1 text-xs text-red-500">{msg}</p>}
    </form>
  );
}
