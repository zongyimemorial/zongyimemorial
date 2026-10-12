"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 滚动入场淡入组件（克制冷静）。
 *
 * 用 IntersectionObserver 监听元素进入视口，加 `.is-visible` 触发
 * globals.css 里 `.reveal` 的淡入上浮过渡。离开视口后可复位（once=false）。
 *
 * 设计取舍：
 * - 不引入 framer-motion 等依赖，纯 CSS 过渡 + 一个轻量 IO，零新增包；
 * - 默认 `once`，元素入场一次后不再闪烁；
 * - 不支持 IO 的环境（极旧浏览器）直接显示，避免内容永久隐藏；
 * - `prefers-reduced-motion` 下 globals.css 已把 .reveal 强制置为可见。
 *
 * 用法：
 *   <Reveal delay={120}><article>...</article></Reveal>
 * delay 用于列表的 stagger（逐张错开入场）。
 */
export default function Reveal({
  children,
  className = "",
  delay = 0,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) io.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);

  return (
    <div
      ref={ref}
      className={`reveal${visible ? " is-visible" : ""}${className ? " " + className : ""}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
