import * as React from "react";
import { DEF_MARBLE, DEF_PILLAR } from "./defs";
import { C_MARBLE, C_VERMILION } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 檐柱一对（含柱础与雀替）
 *
 * 工笔圆柱的要点：**横向渐变**（左暗 → 中受光 → 右暗），而不是纯色。
 * 柱础用汉白玉鼓形础 + 方形座，柱头加雀替（承托梁枋的角撑）。
 *
 * 比例：真实檐柱「柱高 ≈ 9~11 倍柱径」，但正立面局部截取时若照搬会太细长。
 * 这里取 **柱高 ≈ 7 倍柱径** 的写意比例（PILLAR_W=42 / PILLAR_H=290），
 * 既保住"柱"的挺拔，又不会在页面上缩成一根面条。
 *
 * viewBox 0 0 420 400。
 */
export default function ClanPillarPair({
  color,
  size = "detail",
  palette,
  className,
  style,
}: ArchBaseProps) {
  const thumb = isThumb(size);
  const red = palette?.pillar ?? C_VERMILION;
  const body = color ?? `url(#${DEF_PILLAR})`;

  // 柱径 76 / 柱高 290 ≈ 真实檐柱的粗壮感；两柱贴边，让画幅被柱身占满
  const PILLAR_TOP = 48;
  const PILLAR_H = 290;
  const PILLAR_W = 76;

  const pillar = (x: number) => (
    <g key={x}>
      {/* 柱身（横向渐变 → 圆柱） */}
      <rect x={x} y={PILLAR_TOP} width={PILLAR_W} height={PILLAR_H} rx={4} fill={body} stroke={red.dark} strokeWidth="1.1" />
      {/* 柱身高光条（受光面） */}
      <rect x={x + PILLAR_W * 0.3} y={PILLAR_TOP + 6} width={PILLAR_W * 0.16} height={PILLAR_H - 12} rx={3} fill={C_VERMILION.light} opacity={0.35} />

      {/* 柱头：上端木箍 */}
      <rect x={x - 5} y={PILLAR_TOP - 14} width={PILLAR_W + 10} height={16} rx={3} fill={red.light} stroke={red.dark} strokeWidth="1" />
      {!thumb && <rect x={x - 5} y={PILLAR_TOP - 14} width={PILLAR_W + 10} height={4} rx={2} fill="rgba(255,255,255,0.22)" />}

      {/* 雀替：柱头两侧的角撑（工笔重点细节） */}
      <path
        d={`M${x + PILLAR_W} ${PILLAR_TOP + 10} q30 8 34 36 q-21 1 -34 -13 Z`}
        fill={red.dark}
        stroke={red.dark}
        strokeWidth="0.9"
      />
      <path
        d={`M${x} ${PILLAR_TOP + 10} q-30 8 -34 36 q21 1 34 -13 Z`}
        fill={red.dark}
        stroke={red.dark}
        strokeWidth="0.9"
      />
      {!thumb && (
        <>
          {/* 雀替上的卷云浮雕 */}
          <path
            d={`M${x + PILLAR_W + 6} ${PILLAR_TOP + 22} q12 4 15 16`}
            fill="none"
            stroke={C_VERMILION.light}
            strokeWidth="1.1"
            opacity={0.6}
          />
          <path
            d={`M${x - 6} ${PILLAR_TOP + 22} q-12 4 -15 16`}
            fill="none"
            stroke={C_VERMILION.light}
            strokeWidth="1.1"
            opacity={0.6}
          />
        </>
      )}

      {/* 柱础：鼓形石础（鼓腹外凸） */}
      <path
        d={`M${x - 6} ${PILLAR_TOP + PILLAR_H - 6} q${PILLAR_W / 2 + 6} -14 ${PILLAR_W + 12} 0 v20 q-${PILLAR_W / 2 + 6} 12 -${PILLAR_W + 12} 0 Z`}
        fill={`url(#${DEF_MARBLE})`}
        stroke={C_MARBLE.dark}
        strokeWidth="1.1"
      />
      {/* 方形柱座 */}
      <rect
        x={x - 13}
        y={PILLAR_TOP + PILLAR_H + 14}
        width={PILLAR_W + 26}
        height={15}
        rx={2}
        fill={`url(#${DEF_MARBLE})`}
        stroke={C_MARBLE.dark}
        strokeWidth="1.1"
      />
      {/* 座下投影 */}
      <rect x={x - 13} y={PILLAR_TOP + PILLAR_H + 29} width={PILLAR_W + 26} height={6} fill="rgba(0,0,0,0.24)" />
    </g>
  );

  return (
    <svg
      viewBox="0 0 420 400"
      className={className} style={style}
      role="img"
      aria-label="朱红立柱"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* 柱间额枋（顶部横木） */}
      <rect x={6} y={16} width={408} height={26} rx={3} fill={red.dark} />
      <rect x={6} y={16} width={408} height={6} fill="rgba(255,255,255,0.16)" />
      {!thumb && (
        /* 梁枋彩画：金色卷云线（青绿旋子彩画的简化） */
        <path
          d="M40 33 q20 -11 40 0 q20 11 40 0 q20 -11 40 0 q20 11 40 0 q20 -11 40 0 q20 11 40 0 q20 -11 40 0"
          fill="none"
          stroke="#d4af37"
          strokeWidth="1.8"
          opacity={0.9}
        />
      )}

      {pillar(20)}
      {pillar(324)}
    </svg>
  );
}
