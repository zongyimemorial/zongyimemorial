"use client";

import { useState } from "react";
import {
  lightMemorial,
  postMemorialMessage,
  offerPublicFree,
} from "@/app/(public)/memorial/actions";
import { FREE_PUBLIC_OFFERINGS, type FreeOfferingDef } from "@/lib/memorial";

interface Msg {
  id: string;
  nickname: string | null;
  content: string;
  createdAt: Date;
}

/**
 * 公益馆祭拜面板：献花点亮 + 平台免费祭品 + 公众留言（先审后发）。
 * 大花圈献祭已独立为 PublicWreathOffer 横幅（置于 3D 厅堂下方），此处不再重复。
 */
export default function MemorialTribute({
  slug,
  initialLight,
  initialOffering,
  messages,
}: {
  slug: string;
  initialLight: number;
  initialOffering: number;
  messages: Msg[];
}) {
  const [light, setLight] = useState(initialLight);
  const [lit, setLit] = useState(false);
  const [content, setContent] = useState("");
  const [nickname, setNickname] = useState("");
  const [pending, setPending] = useState(false);
  const [msgState, setMsgState] = useState<{ sent?: boolean; error?: string }>({});

  // —— 公众免费祭品 ——
  const [offering, setOffering] = useState(initialOffering);
  const [offeringFlash, setOfferingFlash] = useState<FreeOfferingDef | null>(null);

  async function onLight() {
    if (lit) return;
    const res = await lightMemorial(slug);
    if (res.ok) {
      setLight(res.lightCount ?? light + 1);
      setLit(true);
    }
  }

  async function onMessage(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsgState({});
    const fd = new FormData();
    fd.set("content", content);
    fd.set("nickname", nickname);
    const res = await postMemorialMessage(slug, fd);
    setPending(false);
    if (res.ok) {
      setMsgState({ sent: true });
      setContent("");
      setNickname("");
    } else {
      setMsgState({ error: res.error ?? "提交失败，请稍后再试" });
    }
  }

  async function onOffering(def: FreeOfferingDef) {
    const res = await offerPublicFree(slug, def.type);
    if (res.ok) {
      setOffering((n) => n + 1);
      setOfferingFlash(def);
      setTimeout(() => setOfferingFlash(null), 1500);
    }
  }

  return (
    <section className="mt-8 space-y-6">
      {/* 献花点亮 */}
      <div className="flex flex-col items-center gap-3 rounded-xl border border-brand-200 bg-brand-100/60 p-6 text-center">
        <button
          type="button"
          onClick={onLight}
          disabled={lit}
          className={
            "flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition " +
            (lit
              ? "cursor-default bg-amber-100 text-amber-700"
              : "bg-brand-700 text-white hover:bg-brand-800")
          }
        >
          <span aria-hidden="true">{lit ? "🕯️" : "🕯"}</span>
          {lit ? "已点亮，思念长明" : "献花点亮"}
        </button>
        <p className="text-sm text-brand-500">
          已有 <b className="text-brand-800">{light}</b> 次点亮
        </p>
      </div>

      {/* 公众免费祭品（平台免费祭品，随时可献，无上限） */}
      <div className="rounded-xl border border-brand-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-brand-800">免费祭品</h2>
          <span className="text-xs text-brand-400">已献 {offering} 次</span>
        </div>
        <p className="mt-1 text-xs text-brand-400">
          平台的免费祭品，公众随时都可以献祭 · 无需登录、无每日上限
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FREE_PUBLIC_OFFERINGS.map((def) => (
            <button
              key={def.type}
              onClick={() => onOffering(def)}
              className="flex flex-col items-center gap-1 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-4 text-center transition hover:border-amber-300 hover:bg-amber-50"
            >
              <span className="text-2xl" aria-hidden="true">
                {def.icon}
              </span>
              <span className="text-sm text-brand-700">{def.label}</span>
            </button>
          ))}
        </div>
        {offeringFlash && (
          <p className="mt-3 text-center text-xs text-emerald-600">
            已献上 {offeringFlash.label}，感谢你的缅怀 🌿
          </p>
        )}
      </div>

      {/* 留言板（先审后发） */}
      <div className="rounded-xl border border-brand-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-brand-800">
          公众留言{messages.length > 0 ? `（${messages.length}）` : ""}
        </h2>

        {messages.length === 0 ? (
          <p className="mt-2 text-sm text-brand-400">暂无公开留言，成为第一个缅怀的人。</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="rounded-lg border border-brand-200 bg-brand-100/50 p-3">
                <div className="mb-1 text-xs text-brand-400">
                  {m.nickname || "匿名缅怀者"} · {new Date(m.createdAt).toLocaleDateString("zh-CN")}
                </div>
                <p className="whitespace-pre-wrap text-sm text-brand-700">{m.content}</p>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onMessage} className="mt-5 space-y-3">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="昵称（可选，默认匿名缅怀者）"
            className="w-full rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={3}
            placeholder="写下你的缅怀与敬意…"
            className="w-full rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-brand-400">留言将先经人工审核后公开</span>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-brand-700 px-4 py-2 text-sm text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {pending ? "提交中…" : "提交留言"}
            </button>
          </div>
          {msgState.sent && (
            <p className="text-xs text-emerald-600">已提交，审核通过后将公开展示，感谢你的缅怀。</p>
          )}
          {msgState.error && <p className="text-xs text-red-600">{msgState.error}</p>}
        </form>
      </div>
    </section>
  );
}
