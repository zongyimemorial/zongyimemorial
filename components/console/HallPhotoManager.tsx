"use client";

import { useRef, useState } from "react";
import {
  addHallPhoto,
  moveHallPhoto,
  removeHallPhoto,
  setHallPortrait,
} from "@/app/console/halls/[id]/actions";

type Photo = { url: string; portrait?: boolean };

/** 照片管理动作集合（默认 = 纪念馆，宗祠可传入自己的实现） */
export type PhotoActions = {
  addHallPhoto: (fd: FormData) => Promise<{ ok: boolean; message?: string }>;
  removeHallPhoto: (fd: FormData) => Promise<{ ok: boolean; message?: string }>;
  setHallPortrait: (fd: FormData) => Promise<{ ok: boolean; message?: string }>;
  moveHallPhoto: (fd: FormData) => Promise<{ ok: boolean; message?: string }>;
};

const HALL_PHOTO_ACTIONS: PhotoActions = {
  addHallPhoto: addHallPhoto as unknown as PhotoActions["addHallPhoto"],
  removeHallPhoto: removeHallPhoto as unknown as PhotoActions["removeHallPhoto"],
  setHallPortrait: setHallPortrait as unknown as PhotoActions["setHallPortrait"],
  moveHallPhoto: moveHallPhoto as unknown as PhotoActions["moveHallPhoto"],
};

export type HallPhotoManagerProps = {
  hallId: string;
  photos: string[];
  portrait?: string;
  /**
   * 是否可上传 20MB 高清原片。
   *
   * ⚠️ 字段名曾是 `isPremium`，2026-10 改名为 `hdUpload` —— 因为这条权限
   * 已不再只由高级订阅授予：**持有有效容量包（storageUntil 有效）同样享有**。
   * 沿用旧名会让调用方以为传 `premiumActive` 即可，漏掉容量包这条来源。
   * 服务端口径见 lib/storage.ts 的 `hasHdUpload()`（唯一判据）。
   */
  hdUpload: boolean;
  /** 上传接口地址。默认 = 纪念馆上传接口 */
  uploadUrl?: string;
  /** 提交时 id 的字段名 */
  idField?: string;
  /** 标题 */
  title?: string;
  /** 说明 */
  hint?: string;
  /** 「设为封面」按钮文案 */
  portraitLabel?: string;
  /** 空态文案 */
  emptyHint?: string;
  /** 提交动作 */
  actions?: PhotoActions;
};

export default function HallPhotoManager({
  hallId,
  photos,
  portrait,
  hdUpload,
  uploadUrl,
  idField = "hallId",
  title = "逝者照片 · 遗像与相册",
  hint = "上传逝者生前照片。点「设为遗像」会在纪念空间显著位置展示；相册按顺序陈列。",
  portraitLabel = "遗像",
  emptyHint = "还没有照片，先上传一张逝者的正面照作为遗像吧。",
  actions = HALL_PHOTO_ACTIONS,
}: HallPhotoManagerProps) {
  const [list, setList] = useState<Photo[]>(
    photos.map((u) => ({ url: u, portrait: u === portrait })),
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [urlInput, setUrlInput] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const maxMB = hdUpload ? 20 : 8;
  const endpoint = uploadUrl ?? `/api/halls/${hallId}/upload`;

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setMsg(null);
    let okCount = 0;
    for (const file of Array.from(files)) {
      /*
        容量判定交给**服务端**（字节配额，见 app/api/halls/[id]/upload/route.ts）。
        客户端不再按张数拦截 —— 那会与"字节配额"口径分叉
        （面板还有空间、客户端却按 500 张卡住）。
        客户端只做单张体积预检，省一次注定失败的往返。
      */
      if (file.size > maxMB * 1024 * 1024) {
        setMsg({
          ok: false,
          text: `单张不能超过 ${maxMB}MB${hdUpload ? "" : "，购买存储容量包可上传 20MB 高清原片"}`,
        });
        break;
      }
      try {
        const fd = new FormData();
        fd.set("file", file);
        setPct(0);
        // 用 XHR 以获得上传进度
        const res = await new Promise<{ ok: boolean; url?: string; error?: string }>((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", endpoint);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100));
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
        if (res.ok && res.url) {
          okCount++;
          setList((l) => [...l, { url: res.url! }]);
        } else {
          setMsg({ ok: false, text: res.error || "上传失败" });
          break;
        }
      } catch {
        setMsg({ ok: false, text: "上传失败，请重试" });
        break;
      }
    }
    setUploading(false);
    setPct(0);
    if (fileRef.current) fileRef.current.value = "";
    if (okCount > 0) setMsg({ ok: true, text: `已上传 ${okCount} 张照片` });
  }

  async function onAddUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!urlInput.trim()) return;
    const fd = new FormData();
    fd.set(idField, hallId);
    fd.set("url", urlInput.trim());
    const res = await actions.addHallPhoto(fd);
    setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "已添加" : "添加失败") });
    if (res.ok) {
      setList((l) => [...l, { url: urlInput.trim() }]);
      setUrlInput("");
    }
  }

  async function onRemove(url: string) {
    const fd = new FormData();
    fd.set(idField, hallId);
    fd.set("url", url);
    const res = await actions.removeHallPhoto(fd);
    setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "已删除" : "删除失败") });
    if (res.ok) setList((l) => l.filter((p) => p.url !== url).map((p) => ({ ...p, portrait: p.portrait && url !== portrait })));
  }

  async function onPortrait(url: string) {
    const fd = new FormData();
    fd.set(idField, hallId);
    fd.set("url", url);
    const res = await actions.setHallPortrait(fd);
    setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "已更新" : "操作失败") });
    if (res.ok) setList((l) => l.map((p) => ({ ...p, portrait: p.url === url })));
  }

  async function onMove(url: string, dir: "up" | "down") {
    const a = list.findIndex((p) => p.url === url);
    const b = dir === "up" ? a - 1 : a + 1;
    if (a < 0 || b < 0 || b >= list.length) return;
    const fd = new FormData();
    fd.set(idField, hallId);
    fd.set("url", url);
    fd.set("dir", dir);
    const res = await actions.moveHallPhoto(fd);
    if (res.ok) {
      const next = [...list];
      [next[a], next[b]] = [next[b], next[a]];
      setList(next);
    }
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-brand-900">{title}</h2>
          <p className="mt-1 text-xs text-brand-400">{hint}</p>
        </div>
        <span className="text-xs text-brand-400">
          {list.length} 张{hdUpload ? "（高清原片）" : "（标准）"}
        </span>
      </div>

      {/* 上传区 */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          uploadFiles(e.dataTransfer.files);
        }}
        className="mt-4 rounded-lg border-2 border-dashed border-gray-200 bg-brand-50/40 p-6 text-center transition hover:border-accent-300"
      >
        <div className="text-2xl">🖼️</div>
        <p className="mt-2 text-sm text-brand-700">把照片拖到这里，或</p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="mt-2 rounded-md bg-brand-800 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {uploading ? `上传中 ${pct}%` : "选择照片上传"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          multiple
          hidden
          onChange={(e) => uploadFiles(e.target.files)}
        />
        <p className="mt-2 text-xs text-brand-400">
          支持 JPG / PNG / WebP / GIF / AVIF，单张不超过 {maxMB}MB
          {hdUpload ? "（高清原片）" : "；购买存储容量包可上传 20MB 高清原片"}
          ，总容量见下方「存储空间」面板。
        </p>
        {uploading && (
          <div className="mx-auto mt-3 h-1.5 w-56 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full bg-accent-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* URL 添加（备选） */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-brand-500 hover:text-brand-700">
          或通过图片链接添加（外链）
        </summary>
        <form onSubmit={onAddUrl} className="mt-2 flex gap-2">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://… 或 /uploads/…"
            className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm"
          />
          <button className="rounded-md border border-gray-300 px-4 py-2 text-sm text-brand-700 hover:bg-gray-50">
            添加
          </button>
        </form>
      </details>

      {msg && (
        <p className={"mt-3 text-sm " + (msg.ok ? "text-green-600" : "text-red-500")}>{msg.text}</p>
      )}

      {/* 照片墙 */}
      {list.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {list.map((p, i) => (
            <div key={p.url} className="group relative overflow-hidden rounded-lg border border-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={`照片${i + 1}`}
                className="aspect-square w-full cursor-zoom-in object-cover"
                onClick={() => setZoom(p.url)}
              />
              {p.portrait && (
                <span className="absolute left-1.5 top-1.5 rounded bg-accent-600/90 px-1.5 py-0.5 text-[10px] text-white">
                  {portraitLabel}
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-1 bg-black/55 p-1.5 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onPortrait(p.url)}
                  className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-brand-900 hover:bg-white"
                >
                  {p.portrait ? `取消${portraitLabel}` : `设为${portraitLabel}`}
                </button>
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => onMove(p.url, "up")}
                    className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-brand-900 hover:bg-white"
                  >
                    ← 前移
                  </button>
                )}
                {i < list.length - 1 && (
                  <button
                    type="button"
                    onClick={() => onMove(p.url, "down")}
                    className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-brand-900 hover:bg-white"
                  >
                    后移 →
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(p.url)}
                  className="rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-600"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {list.length === 0 && (
        <p className="mt-4 text-sm text-brand-400">{emptyHint}</p>
      )}

      {/* 灯箱 */}
      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setZoom(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="查看照片" className="max-h-full max-w-full rounded-lg object-contain" />
          <button
            type="button"
            className="absolute right-6 top-6 rounded-full bg-white/90 px-3 py-1 text-sm text-brand-900"
            onClick={() => setZoom(null)}
          >
            关闭
          </button>
        </div>
      )}
    </section>
  );
}
