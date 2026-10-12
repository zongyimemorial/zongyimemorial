"use client";

import { useState, useTransition } from "react";

/**
 * 邀请链接卡片（馆主可见）。
 * 复制邀请码到剪贴板，亲友凭码加入社区。
 */
export default function CommunityInviteCard({
  inviteCode,
  hallId,
  clanHallId,
  regenerate,
}: {
  inviteCode: string;
  hallId?: string;
  clanHallId?: string;
  regenerate: (formData: FormData) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, startTransition] = useTransition();

  const joinUrl = hallId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/halls/${hallId}/community?code=${inviteCode}`
    : `${typeof window !== "undefined" ? window.location.origin : ""}/clan/halls/${clanHallId}/community?code=${inviteCode}`;

  const onCopy = () => {
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const onCopyCode = () => {
    navigator.clipboard.writeText(inviteCode).then(() => {
      setMsg("邀请码已复制");
      setTimeout(() => setMsg(""), 2000);
    });
  };

  const onRegenerate = () => {
    startTransition(async () => {
      const fd = new FormData();
      if (hallId) fd.set("hallId", hallId);
      if (clanHallId) fd.set("clanHallId", clanHallId);
      const r = await regenerate(fd);
      setMsg(r.message || "已更新");
    });
  };

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
      <h3 className="text-sm font-semibold text-brand-700">邀请亲朋好友</h3>
      <p className="mt-1 text-xs text-brand-500">
        把下面的链接或邀请码分享给亲友，他们凭码即可加入社区参与交流。
      </p>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={joinUrl}
          className="flex-1 rounded-lg border border-brand-200 bg-brand-100/70 px-3 py-2 text-xs text-gray-600"
        />
        <button
          type="button"
          onClick={onCopy}
          className="rounded-lg bg-brand-700 px-3 py-2 text-xs text-white hover:bg-brand-800"
        >
          {copied ? "已复制!" : "复制链接"}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={inviteCode}
          className="flex-1 rounded-lg border border-brand-200 bg-brand-100/70 px-3 py-2 text-xs text-gray-600 font-mono"
        />
        <button
          type="button"
          onClick={onCopyCode}
          className="rounded-lg border border-brand-300 px-3 py-2 text-xs text-brand-700 hover:bg-brand-100"
        >
          复制邀请码
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={busy}
          className="rounded-lg border border-brand-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
        >
          {busy ? "…" : "重新生成"}
        </button>
      </div>

      {msg && <p className="mt-2 text-xs text-emerald-600">{msg}</p>}
    </div>
  );
}
