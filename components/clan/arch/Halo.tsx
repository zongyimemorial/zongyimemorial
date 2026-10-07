import * as React from "react";
import { C_GOLD } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 云龙光晕（头顶瑞气）
 *
 * 神龛 / 寝堂上方的金色氤氲。用多层同心 radialGradient 叠出光晕，
 * 中心最亮、向外衰减；再点缀几朵云纹（用弧线勾勒，工笔感）。
 *
 * 缩略图只保留 1 层光晕（radialGradient 的合成开销比 path 大）。
 *
 * viewBox 0 0 600 300。
 */
export default function ClanHalo({
  color,
  size = "detail",
  className,
  style,
}: ArchBaseProps) {
  const thumb = isThumb(size);
  const gold = color ?? C_GOLD.base;

  /** 云纹（如意云头）：一段弧 + 一段内收弧 */
  const cloud = (x: number, y: number, s: number, o: number) => (
    <path
      key={`${x}-${y}`}
      d={`M${x} ${y} q${14 * s} ${-14 * s} ${28 * s} 0 q${14 * s} ${14 * s} ${28 * s} 0
          q${-8 * s} ${10 * s} ${-28 * s} ${10 * s} q${-20 * s} 0 ${-28 * s} ${-10 * s} Z`}
      fill="none"
      stroke={gold}
      strokeWidth={1.6 * s}
      opacity={o}
    />
  );

  return (
    <svg
      viewBox="0 0 600 300"
      className={className} style={style}
      role="img"
      aria-label="云龙光晕"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="carch-halo-a" cx="50%" cy="52%" r="50%">
          <stop offset="0%" stopColor="#fff6d8" stopOpacity="0.95" />
          <stop offset="45%" stopColor={gold} stopOpacity="0.5" />
          <stop offset="100%" stopColor={gold} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="carch-halo-b" cx="50%" cy="52%" r="50%">
          <stop offset="0%" stopColor={gold} stopOpacity="0.4" />
          <stop offset="100%" stopColor={gold} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 外层柔光 */}
      {!thumb && <ellipse cx={300} cy={156} rx={286} ry={142} fill="url(#carch-halo-b)" />}
      {/* 内层亮芯 */}
      <ellipse cx={300} cy={156} rx={thumb ? 150 : 176} ry={thumb ? 74 : 88} fill="url(#carch-halo-a)" />

      {/* 云纹（缩略图省略） */}
      {!thumb && (
        <>
          {cloud(64, 92, 1, 0.5)}
          {cloud(452, 92, 1, 0.5)}
          {cloud(148, 200, 0.8, 0.42)}
          {cloud(376, 200, 0.8, 0.42)}
          {cloud(258, 58, 0.72, 0.36)}
        </>
      )}
    </svg>
  );
}
