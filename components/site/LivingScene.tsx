"use client";

import { useMemo } from "react";

type LivingSceneProps = {
  /** 底层真实场景图（同时作为视频 poster） */
  image: string;
  /** 可选：真实动态视频（自动播放/静音/循环），无视频时退化为缓推图片 */
  video?: string;
  /** 有语义时传 alt；纯装饰留空 */
  alt?: string;
  className?: string;
  /** 浮光粒子数量 */
  particles?: number;
  /** 图片模式是否缓慢推近（默认：无视频时开启） */
  kenburns?: boolean;
};

/**
 * 粒子参数用确定性伪随机生成，保证服务端与客户端渲染一致（避免 hydration 抖动）。
 */
function makeParticles(count: number) {
  let s = 42;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: count }, () => ({
    left: 4 + rnd() * 92,
    top: 10 + rnd() * 82,
    size: 1.5 + rnd() * 2.5,
    dur: 7 + rnd() * 8,
    delay: -rnd() * 14,
    drift: rnd() * 44 - 22,
    opacity: 0.35 + rnd() * 0.45,
  }));
}

/**
 * LivingScene —— 「真实动态场景」层：
 * 底层 AI 写实场景图（或视频）+ 暖金呼吸光晕 + 薄雾流动 + 浮光粒子。
 * 系统开启「减少动态效果」时全部动画自动降级为静态（见 globals.css）。
 */
export default function LivingScene({
  image,
  video,
  alt = "",
  className = "",
  particles = 14,
  kenburns,
}: LivingSceneProps) {
  const dots = useMemo(() => makeParticles(particles), [particles]);
  const drift = kenburns ?? !video;

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden={alt === "" ? true : undefined}
    >
      {video ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={video}
          poster={image}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={alt}
          className={`absolute inset-0 h-full w-full object-cover ${drift ? "living-kenburns" : ""}`}
        />
      )}
      {/* 暖金呼吸光晕：呼应烛光/香火的暖色中心 */}
      <div className="living-glow absolute inset-0 bg-[radial-gradient(ellipse_at_50%_62%,rgba(216,184,120,0.20),transparent_62%)]" />
      {/* 薄雾流动：两层错相漂移 */}
      <div
        className="living-mist absolute inset-x-[-12%] bottom-0 h-2/5 bg-gradient-to-t from-brand-50/10 to-transparent blur-md"
        style={{ animationDuration: "22s" }}
      />
      <div
        className="living-mist absolute inset-x-[-12%] bottom-0 h-1/3 bg-gradient-to-t from-accent-200/10 to-transparent blur-lg"
        style={{ animationDuration: "31s", animationDelay: "-9s" }}
      />
      {/* 浮光粒子：萤火般的暖金光点缓缓上升 */}
      {dots.map((d, i) => (
        <span
          key={i}
          className="living-particle absolute rounded-full bg-accent-200"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            opacity: 0,
            boxShadow: "0 0 6px rgba(216,184,120,0.9)",
            ["--p-dur" as string]: `${d.dur.toFixed(2)}s`,
            ["--p-delay" as string]: `${d.delay.toFixed(2)}s`,
            ["--p-drift" as string]: `${d.drift.toFixed(1)}px`,
            ["--p-opacity" as string]: d.opacity.toFixed(2),
          }}
        />
      ))}
    </div>
  );
}
