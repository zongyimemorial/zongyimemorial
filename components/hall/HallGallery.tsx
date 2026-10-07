"use client";

import { useEffect, useState } from "react";

/**
 * 馆内相册：网格陈列 + 点击灯箱放大 + 键盘左右切换。
 */
export default function HallGallery({
  photos,
  portrait,
}: {
  photos: string[];
  portrait?: string;
}) {
  const [idx, setIdx] = useState<number | null>(null);
  const ordered = portrait
    ? [portrait, ...photos.filter((p) => p !== portrait)]
    : photos;

  useEffect(() => {
    if (idx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIdx(null);
      if (e.key === "ArrowRight") setIdx((i) => (i === null ? i : (i + 1) % ordered.length));
      if (e.key === "ArrowLeft")
        setIdx((i) => (i === null ? i : (i - 1 + ordered.length) % ordered.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, ordered.length]);

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {ordered.map((u, i) => (
          <button
            key={u + i}
            type="button"
            onClick={() => setIdx(i)}
            className="group relative overflow-hidden rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={u}
              alt={`照片${i + 1}`}
              className="aspect-square w-full object-cover transition group-hover:scale-105"
            />
            {u === portrait && (
              <span className="absolute left-1 top-1 rounded bg-accent-600/90 px-1 py-0.5 text-[10px] text-white">
                遗像
              </span>
            )}
          </button>
        ))}
      </div>

      {idx !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/88 p-4"
          onClick={() => setIdx(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ordered[idx]}
            alt={`照片${idx + 1}`}
            className="max-h-[78vh] max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="mt-4 flex items-center gap-4 text-sm text-white/85">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIdx((i) => (i === null ? i : (i - 1 + ordered.length) % ordered.length));
              }}
              className="rounded-full border border-white/30 px-4 py-1.5 hover:bg-white/10"
            >
              ← 上一张
            </button>
            <span>
              {idx + 1} / {ordered.length}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIdx((i) => (i === null ? i : (i + 1) % ordered.length));
              }}
              className="rounded-full border border-white/30 px-4 py-1.5 hover:bg-white/10"
            >
              下一张 →
            </button>
          </div>
          <button
            type="button"
            className="absolute right-6 top-6 rounded-full bg-white/90 px-3 py-1 text-sm text-brand-900"
            onClick={() => setIdx(null)}
          >
            关闭
          </button>
        </div>
      )}
    </>
  );
}
