"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Lottie } from "lottie-react";
import { lottieForCover } from "@/lib/offering-lottie";

/**
 * 祭品墨金 Lottie 微动图。
 * - 根据 coverImage 自动匹配对应 Lottie；无匹配时渲染 fallback（原图/emoji/空底）。
 * - 入视口才挂载并加载 Lottie JSON（避免一次拉取几十个动画）。
 * - 尊重 prefers-reduced-motion：降级为静态首帧。
 */
export default function LottieIcon({
  cover,
  alt,
  className,
  fallback,
}: {
  cover: string | null | undefined;
  alt?: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const lottie = cover ? lottieForCover(cover) : null;
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [data, setData] = useState<object | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !ref.current || !lottie) return;
    if (typeof window !== "undefined" && window.matchMedia) {
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "160px" }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [mounted, lottie]);

  // 入视后按需拉取 Lottie JSON（避免首屏一次性加载几十个动画）
  useEffect(() => {
    if (!visible || !lottie || data) return;
    let alive = true;
    fetch(lottie)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => alive && setData(j))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [visible, lottie, data]);

  /*
    兜底：**动画画不出东西时退回底图，绝不留下空白盒子。**

    为什么要这一步（2026-10 真实事故）：
      /mall/decor-tpl-plain 顶部一大片空白，看着像"布局留白"，实际是封面容器
      （aspect-[16/9]）里的 Lottie **渲染出了一个空的 <g>** ——
      组件照样挂上了 svg、尺寸也对，就是没有任何图形，视觉上就是一片空白。
      排查中确认了生成器的 `or` 笔误（外径写进了旋转位）并修好，但仍有部分图标
      渲染为空，根因未定位。与其赌"所有 Lottie 数据都正确"，
      不如让组件自己保证"要么有动画，要么有底图"。

    判定方式：等一帧之后数容器里真正可绘制的基本图元；
    为 0 就说明这帧什么都没画出来（或整个动画是空的）→ 换 fallback。
  */
  const [emptyAnim, setEmptyAnim] = useState(false);
  useEffect(() => {
    if (!data || emptyAnim) return;
    const t = setTimeout(() => {
      const svg = ref.current?.querySelector("svg");
      if (!svg) return;
      /*
        ⚠️ 必须**排除 <defs> 里的元素**。
        lottie-web 即使一个图形都没画，也会在 <defs> 里放一个 clipPath 的 <rect>
        （画布裁剪框）。把它算进去会让计数恒 ≥1，"空动画"永远检测不到 ——
        实测踩过：检测器写了 `querySelectorAll("path, rect, …")`，于是这个
        `aspect-[16/9]` 的封面盒子一直空白，兜底却从不生效。
      */
      const defs = svg.querySelector("defs");
      const drawn = [...svg.querySelectorAll("path, rect, circle, ellipse, polygon, polyline")].filter(
        (el) => !defs || !defs.contains(el),
      );
      if (drawn.length === 0) setEmptyAnim(true);
    }, 600);
    return () => clearTimeout(t);
  }, [data, emptyAnim]);

  if (!lottie || emptyAnim) return <>{fallback ?? null}</>;

  return (
    <div ref={ref} className={className} role="img" aria-label={alt}>
      {mounted && visible && data && (
        <Lottie
          src={data}
          loop
          autoplay={!reduced}
          style={{ width: "100%", height: "100%" }}
        />
      )}
    </div>
  );
}
