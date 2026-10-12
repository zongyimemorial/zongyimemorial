"use client";

import { useState, useTransition, useRef } from "react";

/**
 * 社区发帖表单（客户端组件）。
 *
 * 支持：文本 + 图片上传 + 视频 URL 嵌入 + 视频直接上传。
 * 范本：components/clan/ClanComposer.tsx。
 *
 * 上传走 /api/community/upload，返回 url 后追加到 mediaUrls 数组。
 */

type MediaItem = { type: "image" | "video"; url: string };

export default function CommunityComposer({
  hallId,
  clanHallId,
  createPost,
}: {
  hallId?: string;
  clanHallId?: string;
  createPost: (formData: FormData) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  const scope = hallId ? { hallId } : { clanHallId };

  const onUploadImage = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("kind", "image");
        if (hallId) fd.set("hallId", hallId);
        if (clanHallId) fd.set("clanHallId", clanHallId);
        const r = await fetch("/api/community/upload", { method: "POST", body: fd });
        const j = await r.json();
        if (!j.ok) { setMsg(j.error || "图片上传失败"); return; }
        setMedia((m) => [...m, { type: "image" as const, url: j.url as string }].slice(0, 9));
      }
    } catch {
      setMsg("网络异常，请重试");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onUploadVideo = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const file = files[0];
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", "video");
      if (hallId) fd.set("hallId", hallId);
      if (clanHallId) fd.set("clanHallId", clanHallId);
      const r = await fetch("/api/community/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) { setMsg(j.error || "视频上传失败"); return; }
      setMedia((m) => [...m, { type: "video" as const, url: j.url as string }].slice(0, 9));
    } catch {
      setMsg("网络异常，视频可能过大");
    } finally {
      setUploading(false);
      if (videoFileRef.current) videoFileRef.current.value = "";
    }
  };

  const onAddVideoUrl = () => {
    const u = videoUrl.trim();
    if (!u) return;
    setMedia((m) => [...m, { type: "video" as const, url: u }].slice(0, 9));
    setVideoUrl("");
  };

  const removeMedia = (i: number) => setMedia((m) => m.filter((_, idx) => idx !== i));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && media.length === 0) {
      setMsg("请输入文字或添加图片/视频");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      if (hallId) fd.set("hallId", hallId);
      if (clanHallId) fd.set("clanHallId", clanHallId);
      fd.set("content", content);
      fd.set("mediaUrls", JSON.stringify(media));
      const r = await createPost(fd);
      setMsg(r.message || (r.ok ? "发布成功" : "发布失败"));
      if (r.ok) {
        setContent("");
        setMedia([]);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-brand-200 bg-brand-100/70 p-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="想说点什么？分享一段回忆、一张老照片、或一段视频…"
        maxLength={2000}
        className="h-24 w-full resize-none rounded-lg border border-brand-200 p-3 text-sm outline-none focus:border-brand-400"
      />

      {media.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {media.map((m, i) => (
            <div key={i} className="relative">
              {m.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-500">
                  🎬 视频
                </div>
              )}
              <button
                type="button"
                onClick={() => removeMedia(i)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => onUploadImage(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || media.length >= 9}
          className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs text-brand-600 hover:bg-gray-50 disabled:opacity-50"
        >
          📷 添加图片
        </button>

        <input
          ref={videoFileRef}
          type="file"
          accept="video/mp4,video/webm"
          className="hidden"
          onChange={(e) => onUploadVideo(e.target.files)}
        />
        <button
          type="button"
          onClick={() => videoFileRef.current?.click()}
          disabled={uploading || media.length >= 9}
          className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs text-brand-600 hover:bg-gray-50 disabled:opacity-50"
        >
          🎬 上传视频
        </button>

        <input
          type="text"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="或粘贴视频链接（B站/YouTube）"
          className="flex-1 rounded-lg border border-brand-200 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
        />
        <button
          type="button"
          onClick={onAddVideoUrl}
          disabled={media.length >= 9}
          className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs text-brand-600 hover:bg-gray-50 disabled:opacity-50"
        >
          添加链接
        </button>
      </div>

      {uploading && <p className="mt-2 text-xs text-brand-400">正在上传…</p>}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-gray-400">{content.length}/2000 · 最多 9 个附件</span>
        <button
          type="submit"
          disabled={busy || uploading}
          className="rounded-lg bg-brand-700 px-5 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {busy ? "发布中…" : "发布"}
        </button>
      </div>

      {msg && (
        <p className={`mt-2 text-xs ${msg.includes("成功") ? "text-emerald-600" : "text-red-500"}`}>{msg}</p>
      )}
    </form>
  );
}
