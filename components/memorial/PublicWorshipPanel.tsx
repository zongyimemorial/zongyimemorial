"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  lightMemorial,
  postMemorialMessage,
  offerPublicFree,
} from "@/app/(public)/memorial/actions";
import { FREE_PUBLIC_OFFERINGS, type FreeOfferingDef } from "@/lib/memorial";
import { SOUND, playTone } from "@/lib/ritual-effects";

type Effect = { key: number; kind: string };

/*
  公益馆的动效表：键是**祭品 type**（flower/incense/candle/elegy），不是 slug。
  因此它对应共享模块里的 MEMORIAL_EFFECT_KIND，而不是 EFFECT_KIND ——
  两套键空间不同，强行合并会让公益馆的动效全部回落到 offering。
  SOUND / playTone 则是完全通用的，已统一到 lib/ritual-effects.ts。
*/
const EFFECT_KIND: Record<string, string> = {
  flower: "flower",
  incense: "incense",
  candle: "candle",
  elegy: "prayer",
};


/**
 * 公益馆祭拜面板（参照收费馆 WorshipPanel 的暗色祭拜舞台 + 供台 + 动效视觉）。
 *
 * 与收费馆的本质差异（合规隔离，零商业化）：
 *   - 全部祭品均为平台免费提供，公众**免登录、随时可献、无每日上限**；
 *   - 不设「持有 / 用尽 / 去商城」等付费态，也不跳转登录；
 *   - 供台陈列的是平台免费祭品目录（🌼 白菊 / 🪔 清香 / 🕯️ 长明灯 / 🎗️ 挽联），
 *     与上方 3D 厅堂供案同源。
 */
export default function PublicWorshipPanel({
  slug,
  initialLight,
  initialOffering,
  altarItems = [],
  messages,
}: {
  slug: string;
  initialLight: number;
  initialOffering: number;
  /** 供台陈列的祭品（与 3D 厅堂供案同源，传平台免费祭品目录） */
  altarItems?: { id: string; glyph: string }[];
  messages: { id: string; nickname: string | null; content: string; createdAt: Date }[];
}) {
  const router = useRouter();
  const [effects, setEffects] = useState<Effect[]>([]);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [light, setLight] = useState(initialLight);
  const [lit, setLit] = useState(false);
  const [offering, setOffering] = useState(initialOffering);
  const seq = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const fire = useCallback((kind: string) => {
    const key = ++seq.current;
    setEffects((e) => [...e, { key, kind }]);
    const t = setTimeout(() => setEffects((e) => e.filter((x) => x.key !== key)), 4600);
    timers.current.push(t);
  }, []);

  const showToast = useCallback((m: string) => {
    setToast(m);
    const t = setTimeout(() => setToast(""), 2600);
    timers.current.push(t);
  }, []);

  async function offer(def: FreeOfferingDef) {
    if (busy === def.type) return;
    setBusy(def.type);
    const res = await offerPublicFree(slug, def.type);
    setBusy("");
    if (res.ok) {
      const kind = EFFECT_KIND[def.type] ?? "offering";
      fire(kind);
      playTone(SOUND[kind] ?? SOUND.offering);
      setOffering((n) => n + 1);
      showToast(`已献上${def.label}，感谢你的缅怀 🌿`);
    } else {
      showToast(res.error ?? "献祭失败，请稍后再试");
    }
  }

  async function onLight() {
    if (lit) return;
    const res = await lightMemorial(slug);
    if (res.ok) {
      setLight(res.lightCount ?? light + 1);
      setLit(true);
      fire("candle");
      playTone(SOUND.candle);
    }
  }

  async function submitMessage() {
    if (busy === "message") return;
    const text = msgText.trim();
    if (!text) return;
    setBusy("message");
    const fd = new FormData();
    fd.set("content", text);
    const res = await postMemorialMessage(slug, fd);
    setBusy("");
    if (res.ok) {
      fire("message");
      playTone(SOUND.prayer);
      setMsgText("");
      setShowInput(false);
      showToast("已提交，审核通过后将公开展示，感谢你的缅怀");
    } else {
      showToast(res.error ?? "提交失败，请稍后再试");
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-brand-200/70 bg-brand-100/70 shadow-sm">
      {/* 祭拜舞台（与收费馆 WorshipPanel 同源视觉：暗色厅堂 + 供台 + 烛台） */}
      <div className="relative h-64 overflow-hidden bg-gradient-to-b from-[#2b2118] via-[#3a2c1e] to-[#1c150e] sm:h-72">
        {/* 烛台 */}
        <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 gap-14">
          {[0, 1].map((i) => (
            <div key={i} className="relative flex flex-col items-center">
              <div className="candle-flame h-7 w-4 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-gradient-to-b from-amber-200 via-orange-400 to-red-500 opacity-70" />
              <div className="h-16 w-2.5 rounded-sm bg-gradient-to-b from-amber-100/90 to-amber-800" />
              <div className="h-2 w-10 rounded-full bg-amber-900/80" />
            </div>
          ))}
        </div>
        {/* 供台：平台免费祭品（与 3D 厅堂供案同源，公众随时可献） */}
        <div className="absolute bottom-0 left-1/2 w-[min(94%,560px)] -translate-x-1/2">
          {altarItems.length > 0 && (
            <div className="mb-1 flex items-center justify-between px-2">
              <span className="text-[11px] text-amber-200/70">
                供台 · 平台免费祭品
              </span>
            </div>
          )}
          <div className="flex min-h-[44px] items-end justify-center gap-1.5 rounded-t-md bg-gradient-to-b from-[#5a4632] to-[#3a2c1e] px-3 py-1.5 shadow-lg">
            {altarItems.map((a) => (
              <span key={a.id} className="text-xl drop-shadow" title={a.glyph}>
                {a.glyph}
              </span>
            ))}
            {altarItems.length === 0 && (
              <span className="text-[11px] text-amber-100/40">供台空空，献上一份心意</span>
            )}
          </div>
        </div>
        {/* 动效层 */}
        <div className="pointer-events-none absolute inset-0">
          {effects.map((e) => (
            <div key={e.key} className="absolute inset-0">
              {e.kind === "incense" && (
                <>
                  <div className="smoke absolute bottom-24 left-1/2 h-20 w-3 -translate-x-1/2 rounded-full bg-gradient-to-t from-brand-50/25 to-transparent" />
                  <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-2xl">🙏</div>
                </>
              )}
              {e.kind === "candle" && (
                <div className="candle-light absolute bottom-24 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-amber-300/30 blur-xl" />
              )}
              {e.kind === "flower" && (
                <div className="absolute bottom-16 left-1/2 flex -translate-x-1/2 gap-3">
                  {["🌸", "🌼", "🌷"].map((f, i) => (
                    <span key={i} className="bloom inline-block text-3xl" style={{ animationDelay: `${i * 0.25}s` }}>
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {e.kind === "prayer" && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-3xl">
                  <span className="candle-light absolute -left-4 -top-3 inline-block h-14 w-14 rounded-full bg-amber-300/25 blur-lg" />
                  <span className="float-up relative inline-block">🙏</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-black/30 px-3 py-1 text-xs text-white/80">
          平台免费祭品 · 公众随时可献
        </div>
      </div>

      {/* 祭品面板：平台免费祭品，免登录、随时可献、无上限 */}
      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-lg font-semibold text-brand-900">
            祭品 · 一键祭拜
            <span className="ml-2 text-base font-normal text-brand-500">已献 {offering} 次</span>
          </span>
          <span className="text-sm text-brand-500">免登录 · 平台免费提供 · 无每日上限</span>
        </div>

        <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
          {FREE_PUBLIC_OFFERINGS.map((def) => (
            <button
              key={def.type}
              onClick={() => offer(def)}
              disabled={busy === def.type}
              title={`献上${def.label} · 平台免费`}
              className="flex flex-col items-center gap-1 rounded-lg border border-brand-200 bg-brand-50/80 px-1 py-2.5 text-2xl shadow-sm transition hover:border-accent-300 hover:bg-accent-50 disabled:opacity-30"
            >
              <span>{busy === def.type ? "…" : def.icon}</span>
              <span className="text-sm text-brand-700">{def.label}</span>
            </button>
          ))}
        </div>

        {/* 献花点亮 */}
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-brand-200 bg-brand-100/70 p-5 text-center">
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

        {/* 留言板（先审后发） */}
        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-100/70 p-5 shadow-sm">
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

          {showInput ? (
            <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/70 p-3">
              <textarea
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="写下你的缅怀与敬意…（审核通过后公开）"
                className="w-full rounded-md border border-brand-200 px-3 py-2 text-base outline-none focus:border-brand-500"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => setShowInput(false)}
                  className="rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-600"
                >
                  取消
                </button>
                <button
                  onClick={submitMessage}
                  disabled={busy === "message"}
                  className="rounded-md bg-brand-800 px-4 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {busy === "message" ? "提交中…" : "提交留言"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowInput(true)}
              className="mt-4 w-full rounded-md border border-brand-300 bg-white px-4 py-2 text-sm text-brand-700 hover:bg-brand-50"
            >
              写下缅怀留言
            </button>
          )}
        </div>
      </div>

      {/* Toast 反馈 */}
      {toast && (
        <div className="pointer-events-none fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-full bg-brand-900/90 px-5 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
