"use client";

import { useRef, useState } from "react";

// 轻量 3D 全景宗祠：拖拽平移宽幅全景图模拟环视（VR 简化版，无需 WebGL）
export default function PanoramaView({ src, title }: { src: string; title: string }) {
  const [offset, setOffset] = useState(0);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const frameRef = useRef<HTMLDivElement | null>(null);

  function onDown(x: number) {
    dragging.current = true;
    lastX.current = x;
  }
  function onMove(x: number) {
    if (!dragging.current || !frameRef.current) return;
    const frameW = frameRef.current.clientWidth;
    const delta = x - lastX.current;
    lastX.current = x;
    setOffset((o) => Math.max(-(frameW * 1.6), Math.min(0, o + delta)));
  }

  return (
    <div
      ref={frameRef}
      className="relative h-72 cursor-grab select-none overflow-hidden rounded-xl bg-[#1c150e] active:cursor-grabbing sm:h-80"
      onMouseDown={(e) => onDown(e.clientX)}
      onMouseMove={(e) => onMove(e.clientX)}
      onMouseUp={() => (dragging.current = false)}
      onMouseLeave={() => (dragging.current = false)}
      onTouchStart={(e) => onDown(e.touches[0].clientX)}
      onTouchMove={(e) => onMove(e.touches[0].clientX)}
      onTouchEnd={() => (dragging.current = false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={title}
        draggable={false}
        className="absolute left-0 top-1/2 h-[110%] w-[260%] -translate-y-1/2 object-cover transition-[none]"
        style={{ transform: `translateX(${offset}px) translateY(-50%)` }}
      />
      {/* 顶部渐隐提示 */}
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs text-white/80">
        🏛️ 3D 全景宗祠 · 拖拽环视
      </div>
      {/* 底部场景名 */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-4 py-1 text-sm text-white">
        {title}
      </div>
    </div>
  );
}
