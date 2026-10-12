"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { offerPublicWreath } from "@/app/(public)/memorial/actions";
import { PUBLIC_WREATH_MAX } from "@/lib/memorial";

interface Wreath {
  id: string;
  nickname: string | null;
  message: string | null;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * 公众免费敬献大花圈横幅（参照收费馆 WreathOffer 排版）。
 *
 * 与收费馆差异：
 *   - 完全免费、免登录（收费馆需 ¥199 且登录）；
 *   - 同馆同时最多 2 个（服务端双重校验，这里只做前置提示）；
 *   - 献祭后陈列 3 天，读侧懒清理自动消失；
 *   - 献祭成功后 router.refresh()，让上方 3D 厅堂里的花圈同步出现。
 */
export default function PublicWreathOffer({
  slug,
  initialWreaths,
}: {
  slug: string;
  initialWreaths: Wreath[];
}) {
  const router = useRouter();
  const [wreaths, setWreaths] = useState<Wreath[]>(initialWreaths);
  const [nick, setNick] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState("");

  const full = wreaths.length >= PUBLIC_WREATH_MAX;

  async function onOffer() {
    if (full || pending) return;
    setPending(true);
    setErr("");
    const res = await offerPublicWreath(slug, msg, nick);
    setPending(false);
    if (res.ok) {
      // 乐观补一条 3 天过期的花圈（服务端懒清理会接手）；随后刷新让 3D 厅堂同步
      setWreaths((prev) =>
        [
          ...prev,
          {
            id: `tmp-${Date.now()}`,
            nickname: nick.trim() || null,
            message: msg.trim() || null,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
          },
        ].slice(-PUBLIC_WREATH_MAX),
      );
      setNick("");
      setMsg("");
      router.refresh();
    } else {
      setErr(res.error ?? "献花圈失败，请稍后再试");
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-200/70 bg-gradient-to-b from-amber-50/80 to-brand-100/70 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-brand-900">敬献大花圈</h2>
          <p className="mt-0.5 text-xs text-brand-400">
            素白菊大花圈 · 陈列于遗像下方 · 敬献后保留 3 天 · 馆内 {wreaths.length}/{PUBLIC_WREATH_MAX}
          </p>
        </div>
        <span className="rounded-full bg-brand-800 px-3 py-1 text-xs text-amber-100">
          平台免费提供 · 免登录
        </span>
      </div>

      {/* 已献花圈陈列（与上方 3D 厅堂内的花圈同源） */}
      {wreaths.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {wreaths.map((w) => (
            <li
              key={w.id}
              className="rounded-lg border border-amber-200 bg-gradient-to-b from-white to-brand-50 p-3"
            >
              <div className="flex items-center gap-2 text-2xl">🥀</div>
              {w.message ? (
                <p className="mt-1 text-sm text-brand-700">「{w.message}」</p>
              ) : (
                <p className="mt-1 text-sm text-brand-300">—— 无声的哀思 ——</p>
              )}
              <p className="mt-1 text-xs text-brand-400">
                {w.nickname || "匿名缅怀者"} · 留展至{" "}
                {new Date(w.expiresAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
              </p>
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="mt-4 rounded-lg bg-brand-100/60 p-3 text-center text-xs text-brand-500">
          花圈位已满（同时最多 {PUBLIC_WREATH_MAX} 个），最早的花圈 3 天后凋谢腾出名额
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="署名（可选，默认匿名缅怀者）"
            className="w-full rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            rows={2}
            placeholder="挽言（可选，展示在花圈缎带上）"
            className="w-full rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-brand-400">免登录 · 平台免费提供</span>
            <button
              onClick={onOffer}
              disabled={pending}
              className="rounded-md bg-brand-800 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "献上中…" : "免费敬献花圈"}
            </button>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}
