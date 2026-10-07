"use client";

import { useState } from "react";
import { selectAvatar, setMode, unlockAvatar } from "@/app/console/whispers/[id]/actions";

export type AvatarRow = {
  id: string;
  name: string;
  kind: string;
  imageUrl: string | null;
  tier: string;
  points: number | null;
  isSelected: boolean;
};

export type AvatarPickerProps = {
  profileId: string;
  avatars: AvatarRow[];
  selectedAvatarId: string | null;
  mode: string;
  isPremium: boolean;
  userPoints: number;
  avatarUnlockPoints: number;
};

export default function AvatarPicker({
  profileId,
  avatars,
  selectedAvatarId,
  mode,
  isPremium,
  userPoints,
  avatarUnlockPoints,
}: AvatarPickerProps) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fn();
      setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "已完成" : "操作失败") });
      if (res.ok) window.location.reload();
    } catch {
      setMsg({ ok: false, text: "请求失败，请重试" });
    }
    setBusy(null);
  }

  function onSelect(avatarId: string) {
    const fd = new FormData();
    fd.set("profileId", profileId);
    fd.set("avatarId", avatarId);
    return run("sel-" + avatarId, () => selectAvatar(fd));
  }

  function onUnlock(avatarId: string) {
    const fd = new FormData();
    fd.set("profileId", profileId);
    fd.set("avatarId", avatarId);
    return run("unlock-" + avatarId, () => unlockAvatar(fd));
  }

  function onMode(next: "voice" | "avatar") {
    const fd = new FormData();
    fd.set("profileId", profileId);
    fd.set("mode", next);
    return run("mode-" + next, () => setMode(fd));
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-6">
      <h2 className="text-sm font-semibold text-brand-900">
        交流方式与数字形象
        <span className="ml-1 font-normal text-brand-400">可选择「只闻其声」或「见他/她一面」</span>
      </h2>

      {/* —— 模式切换 —— */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onMode("voice")}
          disabled={busy !== null}
          className={
            "rounded-lg border p-4 text-left transition disabled:opacity-60 " +
            (mode === "voice"
              ? "border-accent-400 bg-accent-50/50"
              : "border-gray-100 hover:border-gray-200")
          }
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🔊</span>
            <span className="text-sm font-medium text-brand-900">纯语音交流</span>
            {mode === "voice" && (
              <span className="ml-auto rounded bg-accent-600 px-1.5 py-0.5 text-[10px] text-white">
                当前
              </span>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-brand-500">
            只播放声音，不显示画面。延迟低、成本低，最贴近「电话那头」的感觉，适合日常说话。
          </p>
        </button>

        <button
          type="button"
          onClick={() => onMode("avatar")}
          disabled={busy !== null}
          className={
            "rounded-lg border p-4 text-left transition disabled:opacity-60 " +
            (mode === "avatar"
              ? "border-accent-400 bg-accent-50/50"
              : "border-gray-100 hover:border-gray-200")
          }
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🖼️</span>
            <span className="text-sm font-medium text-brand-900">形象 + 声音</span>
            {mode === "avatar" && (
              <span className="ml-auto rounded bg-accent-600 px-1.5 py-0.5 text-[10px] text-white">
                当前
              </span>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-brand-500">
            对话时显示静态数字形象（照片级）。形象为「表达性肖像」，
            <b>不做实时口型驱动</b>——这是当前技术条件下唯一兼顾成本与体验的方案。
          </p>
        </button>
      </div>

      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      )}

      {/* —— 形象选择 —— */}
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-brand-800">选择数字形象</p>
          <p className="text-xs text-brand-400">
            {isPremium ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                高级订阅生效中 · 全部形象可用
              </span>
            ) : (
              "标注「积分」的形象需兑换，标注「订阅」的需开通高级订阅"
            )}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {avatars.map((a) => {
            const active = selectedAvatarId === a.id || a.isSelected;
            const locked = a.tier === "points";
            const needSub = a.tier === "premium";
            const cost = a.points ?? avatarUnlockPoints;

            return (
              <div
                key={a.id}
                className={
                  "overflow-hidden rounded-lg border transition " +
                  (active ? "border-accent-400 ring-1 ring-accent-300" : "border-gray-100")
                }
              >
                <div className="relative aspect-[3/4] bg-gray-50">
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.imageUrl}
                      alt={a.name}
                      className={"h-full w-full object-cover " + (locked || needSub ? "opacity-45" : "")}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-brand-300">
                      暂无预览
                    </div>
                  )}
                  {active && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-accent-600 px-1.5 py-0.5 text-[10px] text-white">
                      使用中
                    </span>
                  )}
                  {needSub && !isPremium && (
                    <span className="absolute right-1.5 top-1.5 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">
                      订阅
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium text-brand-900">{a.name}</p>
                  <div className="mt-1.5">
                    {locked ? (
                      <button
                        type="button"
                        onClick={() => onUnlock(a.id)}
                        disabled={busy !== null || userPoints < cost}
                        className="w-full rounded bg-accent-600 px-2 py-1 text-[11px] text-white hover:bg-accent-700 disabled:opacity-50"
                      >
                        {busy === "unlock-" + a.id
                          ? "兑换中…"
                          : userPoints < cost
                            ? `需 ${cost} 积分`
                            : `${cost} 积分解锁`}
                      </button>
                    ) : needSub && !isPremium ? (
                      <a
                        href="/mall/whisper-premium"
                        className="block w-full rounded border border-amber-300 px-2 py-1 text-center text-[11px] text-amber-700 hover:bg-amber-50"
                      >
                        开通高级订阅
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelect(a.id)}
                        disabled={busy !== null || active}
                        className="w-full rounded bg-brand-800 px-2 py-1 text-[11px] text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        {active ? "使用中" : busy === "sel-" + a.id ? "切换中…" : "选用"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {avatars.length === 0 && (
            <p className="col-span-full text-xs text-brand-400">暂无可用形象。</p>
          )}
        </div>
      </div>

      <p className="mt-5 rounded-lg bg-brand-50/60 px-4 py-3 text-xs leading-relaxed text-brand-600">
        <b>关于「数字人」的技术说明：</b>实时口型驱动的数字人视频成本是纯语音的 15–120 倍，
        且当前技术下延迟无法做到自然对话。因此本平台采用「静态形象 + 合成语音」同步展示，
        既保留见面感，又把成本控制在可负担范围。若需要视频，可在「长夜版」套餐中按需生成
        <b>纪念短片</b>（异步渲染，非实时对话）。
      </p>
    </section>
  );
}
