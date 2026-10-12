"use client";

import { useRef, useState } from "react";
import {
  deleteVoice,
  selectVoice,
  unlockCloneWithPoints,
  uploadVoiceSample,
} from "@/app/console/whispers/[id]/actions";

export type VoiceRow = {
  id: string;
  name: string;
  provider: string;
  sampleUrl: string | null;
  sampleSeconds: number;
  status: string;
  isPreset: boolean;
  tier: string;
  points: number | null;
};

export type VoiceClonerProps = {
  profileId: string;
  voices: VoiceRow[];
  selectedVoiceId: string | null;
  /** 是否已完成家属授权（未授权则禁止上传样本） */
  hasConsent: boolean;
  /** 当前套餐可创建的克隆声线数 */
  cloneLimit: number;
  /** 是否已支付 ¥10 克隆资格申请（工本费/漏斗入口），置位后解锁克隆入口 */
  cloneApplied?: boolean;
  planName: string;
  userPoints: number;
  cloneUnlockPoints: number;
};

const field =
  "w-full rounded-md border border-brand-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";

export default function VoiceCloner({
  profileId,
  voices,
  selectedVoiceId,
  hasConsent,
  cloneLimit,
  cloneApplied = false,
  planName,
  userPoints,
  cloneUnlockPoints,
}: VoiceClonerProps) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [audition, setAudition] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [seconds, setSeconds] = useState(0);

  const presets = voices.filter((v) => v.isPreset);
  const clones = voices.filter((v) => !v.isPreset);
  const cloneFull = cloneLimit > 0 && clones.length >= cloneLimit;
  // 克隆资格闸门 = 订阅档自带额度 OR 已申请资格（cloneApplied）。
  // 方案 B：免费档不再「首克隆放开」，必须订阅或支付 ¥10 资格申请才解锁入口。
  const canClone = hasConsent && (cloneLimit > 0 || cloneApplied);

  /** 本地读取音频时长（用于提示样本是否达标） */
  function probeDuration(file: File) {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const d = Math.round(audio.duration || 0);
      setSeconds(d);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      setSeconds(0);
      URL.revokeObjectURL(url);
    };
    audio.src = url;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg({ ok: false, text: "请选择声音样本文件" });
      return;
    }

    setBusy("upload");
    setMsg(null);
    setPct(0);

    const fd = new FormData(form);
    fd.set("profileId", profileId);
    fd.set("sample", file);
    fd.set("sampleSeconds", String(seconds));

    try {
      // 走 XHR 以获得上传进度（样本文件可能较大）
      const res = await uploadWithProgress(
        `/api/whispers/${profileId}/upload`,
        fd,
        setPct,
      );
      if (res.ok) {
        setMsg({ ok: true, text: "样本已上传，声线已创建。可在下方「试听」并选用。" });
        form.reset();
        setFileName("");
        setSeconds(0);
        // 刷新服务端数据
        window.location.reload();
      } else {
        setMsg({ ok: false, text: res.error || "上传失败" });
      }
    } catch {
      setMsg({ ok: false, text: "上传失败，请重试" });
    }
    setBusy(null);
    setPct(0);
  }

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

  function onSelect(voiceId: string) {
    const fd = new FormData();
    fd.set("profileId", profileId);
    fd.set("voiceId", voiceId);
    return run("select-" + voiceId, () => selectVoice(fd));
  }

  function onDelete(voiceId: string) {
    const fd = new FormData();
    fd.set("profileId", profileId);
    fd.set("voiceId", voiceId);
    return run("del-" + voiceId, () => deleteVoice(fd));
  }

  function onUnlock() {
    const fd = new FormData();
    fd.set("profileId", profileId);
    return run("unlock", () => unlockCloneWithPoints(fd));
  }

  return (
    <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-brand-900">
            声音克隆 <span className="ml-1 font-normal text-brand-400">让 AI 用他/她的声音说话</span>
          </h2>
          <p className="mt-1 text-xs text-brand-400">
            上传 10 秒以上的清晰录音（无背景音乐、单人说话）。样本属敏感个人信息，仅用于本装置的语音合成。
            你可随时在下方删除样本文件，删除后不影响已生成的声线。
          </p>
        </div>
        <span className="text-xs text-brand-400">
          {clones.length}
          {cloneLimit > 0 ? ` / ${cloneLimit}` : ""} 个克隆声线 · 当前「{planName}」
        </span>
      </div>

      {/* —— 合规闸门 —— */}
      {!hasConsent && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <p className="font-medium">尚未完成家属授权，无法创建声线</p>
          <p className="mt-1 text-amber-700">
            声音克隆属《个人信息保护法》定义的敏感个人信息（声纹），依《民法典》994 条须取得近亲属同意。
            请先在下方「家属授权」区块完成授权。
          </p>
        </div>
      )}
      {hasConsent && cloneFull && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <p className="font-medium">
            「{planName}」最多创建 {cloneLimit} 个克隆声线，已达上限
          </p>
          <p className="mt-1 text-amber-700">可删除已有声线，或升级套餐获得更多额度。</p>
        </div>
      )}
      {hasConsent && !cloneApplied && cloneLimit === 0 && clones.length === 0 && (
        <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50/60 px-4 py-3 text-xs text-brand-700">
          <p className="font-medium">当前「{planName}」不含声音克隆额度</p>
          <p className="mt-1">
            可用 <b>{cloneUnlockPoints}</b> 积分申请一次克隆资格（当前积分 {userPoints}），
            或升级至「思念版 / 长夜版」（订阅档直接含克隆额度）。
          </p>
          <p className="mt-1 text-brand-400">克隆资格为一次性工本费，仅解锁克隆入口；真实声线复刻由订阅档承载。</p>
          <button
            type="button"
            onClick={onUnlock}
            disabled={busy !== null || userPoints < cloneUnlockPoints}
            className="mt-2 rounded-md bg-accent-600 px-4 py-1.5 text-xs text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {busy === "unlock"
              ? "申请中…"
              : userPoints < cloneUnlockPoints
                ? `积分不足（需 ${cloneUnlockPoints}）`
                : `用 ${cloneUnlockPoints} 积分申请克隆资格`}
          </button>
        </div>
      )}
      {hasConsent && cloneApplied && cloneLimit === 0 && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
          克隆资格已申请（¥10 工本费 / 积分兑换），可上传样本复刻声线。
        </div>
      )}

      {/* —— 上传样本 —— */}
      <form onSubmit={onSubmit} className="mt-4 rounded-lg border border-dashed border-brand-200 bg-brand-50/40 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">声线名称 *</label>
            <input
              name="voiceName"
              maxLength={30}
              className={field}
              placeholder="如：父亲的声音"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">声音样本 *</label>
            <input
              ref={fileRef}
              type="file"
              accept="audio/mpeg,audio/wav,audio/x-wav,audio/webm,audio/ogg,audio/mp4,audio/x-m4a,audio/aac"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setFileName(f.name);
                probeDuration(f);
              }}
              className="block w-full text-xs text-brand-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-800 file:px-3 file:py-2 file:text-xs file:text-white hover:file:bg-brand-700"
            />
            {fileName && (
              <p className={"mt-1 text-xs " + (seconds > 0 && seconds < 10 ? "text-amber-600" : "text-brand-400")}>
                {fileName}
                {seconds > 0 ? ` · 约 ${seconds} 秒` : ""}
                {seconds > 0 && seconds < 10 ? "（建议 10 秒以上，太短会影响音色还原）" : ""}
              </p>
            )}
          </div>
        </div>

        <p className="mt-3 text-xs text-brand-400">
          支持 MP3 / WAV / M4A / OGG / WebM，单个文件不超过 20MB。
        </p>

        {busy === "upload" && (
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div className="h-full bg-accent-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-brand-400">上传中 {pct}%</p>
          </div>
        )}

        <button
          disabled={busy !== null || !canClone || cloneFull}
          className="mt-4 rounded-md bg-brand-800 px-6 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy === "upload" ? "上传中…" : "上传样本并创建声线"}
        </button>
      </form>

      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      )}

      {/* —— 预设声线 —— */}
      <div className="mt-6">
        <p className="text-xs font-semibold text-brand-800">系统预设声线（可直接选用）</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {presets.map((v) => (
            <VoiceCard
              key={v.id}
              voice={v}
              active={selectedVoiceId === v.id}
              busy={busy !== null}
              onSelect={() => onSelect(v.id)}
              onAudition={() => setAudition(v.sampleUrl)}
            />
          ))}
          {presets.length === 0 && (
            <p className="text-xs text-brand-400">暂无预设声线。</p>
          )}
        </div>
      </div>

      {/* —— 克隆声线 —— */}
      <div className="mt-6">
        <p className="text-xs font-semibold text-brand-800">我的克隆声线</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {clones.map((v) => (
            <VoiceCard
              key={v.id}
              voice={v}
              active={selectedVoiceId === v.id}
              busy={busy !== null}
              onSelect={() => onSelect(v.id)}
              onAudition={() => setAudition(v.sampleUrl)}
              onDelete={() => onDelete(v.id)}
            />
          ))}
          {clones.length === 0 && (
            <p className="text-xs text-brand-400">
              还没有克隆声线。上传一段他/她生前的录音，AI 就能用相似的声音回应家人。
            </p>
          )}
        </div>
      </div>

      {/* —— 试听浮层 —— */}
      {audition && (
        <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50/60 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-brand-800">样本试听</p>
            <button
              type="button"
              onClick={() => setAudition(null)}
              className="text-xs text-brand-500 hover:text-brand-700"
            >
              关闭
            </button>
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={audition} controls className="mt-2 w-full" />
          <p className="mt-2 text-xs text-brand-400">
            试听的是你上传的原始样本。对话时由合成引擎按此音色朗读 AI 生成的文字。
            样本文件可在声线卡片中随时删除（删除后声线仍可用）。
          </p>
        </div>
      )}
    </section>
  );
}

function VoiceCard({
  voice,
  active,
  busy,
  onSelect,
  onAudition,
  onDelete,
}: {
  voice: VoiceRow;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  onAudition: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={
        "rounded-lg border p-3 transition " +
        (active ? "border-accent-400 bg-accent-50/40" : "border-brand-200 bg-brand-100/70 hover:border-brand-200")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-brand-900">
            {voice.name}
            {active && (
              <span className="ml-2 rounded bg-accent-600 px-1.5 py-0.5 text-[10px] text-white">
                使用中
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-brand-400">
            {voice.isPreset ? "系统预设" : voice.provider === "mock" ? "本地模拟引擎" : "云端克隆"}
            {voice.sampleSeconds > 0 ? ` · 样本 ${Math.round(voice.sampleSeconds)} 秒` : ""}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {voice.sampleUrl && (
          <button
            type="button"
            onClick={onAudition}
            className="rounded border border-brand-300 px-2.5 py-1 text-xs text-brand-700 hover:bg-gray-50"
          >
            试听
          </button>
        )}
        {!active && (
          <button
            type="button"
            onClick={onSelect}
            disabled={busy}
            className="rounded bg-brand-800 px-2.5 py-1 text-xs text-white hover:bg-brand-700 disabled:opacity-50"
          >
            选用
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            删除
          </button>
        )}
      </div>
    </div>
  );
}

/** XHR 上传（带进度回调） */
function uploadWithProgress(
  url: string,
  fd: FormData,
  onProgress: (pct: number) => void,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        resolve({ ok: false, error: "上传失败：返回格式异常" });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "网络异常，请重试" });
    xhr.send(fd);
  });
}
