import * as React from "react";
import { DEF_GOLD, DEF_MARBLE } from "./defs";
import { C_GOLD, C_MARBLE, C_OCHRE } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 香案（供桌）
 *
 * 享堂神龛前的长条供桌：翘头案面、束腰、马蹄腿。
 * 案上陈设烛台一对、香炉、果盘（桃/橘）、清茶。
 *
 * 这一件是「献祭面板」的载体 —— 详情页会把献祭按钮组渲染在案前。
 *
 * viewBox 0 0 900 260。
 */
export default function ClanAltar({
  color,
  size = "detail",
  className,
  style,
}: ArchBaseProps) {
  const thumb = isThumb(size);
  const wood = color ?? C_OCHRE.base;

  // 案面高度（留给上方陈设）
  const TOP = 118;

  return (
    <svg
      viewBox="0 0 900 260"
      className={className} style={style}
      role="img"
      aria-label="香案供桌"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* ---------- 案上陈设 ---------- */}
      {/* 烛台一对 */}
      {[220, 680].map((x, i) => (
        <g key={i}>
          {/* 烛台座 */}
          <ellipse cx={x} cy={TOP - 2} rx={20} ry={6} fill={C_GOLD.base} stroke={C_GOLD.dark} strokeWidth="0.9" />
          <rect x={x - 3} y={TOP - 46} width={6} height={44} fill={C_GOLD.base} stroke={C_GOLD.dark} strokeWidth="0.7" />
          {/* 烛身（红） */}
          <rect x={x - 5} y={TOP - 84} width={10} height={40} rx={2} fill="#b2352a" stroke="#5d130d" strokeWidth="0.8" />
          {/* 火苗（复用 .candle-flame 动画） */}
          <ellipse
            cx={x}
            cy={TOP - 92}
            rx={5}
            ry={9}
            fill="#ffd982"
            className={thumb ? undefined : "candle-flame"}
          />
          {!thumb && <ellipse cx={x} cy={TOP - 90} rx={2.4} ry={4.6} fill="#fff8e0" />}
        </g>
      ))}

      {/* 香炉（案上小炉） */}
      <g>
        <path
          d={`M420 ${TOP - 34} q30 26 0 34 q-30 -8 0 -34 Z`}
          fill={C_GOLD.base}
          stroke={C_GOLD.dark}
          strokeWidth="1.1"
        />
        <rect x={420 - 26} y={TOP - 36} width={52} height={7} rx={3} fill={C_GOLD.light} stroke={C_GOLD.dark} strokeWidth="0.8" />
        {/* 三炷香 */}
        {[-8, 0, 8].map((dx, i) => (
          <rect key={i} x={420 + dx - 1} y={TOP - 62} width={2} height={26} fill="#a8773f" opacity={0.9} />
        ))}
        {/* 香烟 */}
        {!thumb && (
          <path
            d={`M420 ${TOP - 64} q-6 -16 4 -28 q8 -12 0 -22`}
            fill="none"
            stroke="rgba(200,195,186,0.6)"
            strokeWidth="2.4"
            strokeLinecap="round"
            className="smoke"
          />
        )}
      </g>

      {/* 果盘一对 */}
      {[320, 580].map((x, i) => (
        <g key={i}>
          <ellipse cx={x} cy={TOP} rx={30} ry={8} fill={C_GOLD.base} stroke={C_GOLD.dark} strokeWidth="0.9" />
          <ellipse cx={x - 10} cy={TOP - 8} rx={11} ry={9} fill="#e07a3c" stroke="#a8521f" strokeWidth="0.8" />
          <ellipse cx={x + 10} cy={TOP - 8} rx={11} ry={9} fill="#e07a3c" stroke="#a8521f" strokeWidth="0.8" />
          <ellipse cx={x} cy={TOP - 18} rx={11} ry={9} fill="#e88b4a" stroke="#a8521f" strokeWidth="0.8" />
        </g>
      ))}

      {/* ---------- 案面（翘头） ---------- */}
      <rect x={40} y={TOP} width={820} height={20} rx={3} fill={wood} stroke="rgba(0,0,0,0.35)" strokeWidth="1.4" />
      {/* 案面受光 */}
      <rect x={40} y={TOP} width={820} height={6} fill="rgba(255,255,255,0.2)" />
      {/* 翘头（两端上翘的小段） */}
      <path d={`M40 ${TOP} q-16 -4 -18 -16 q12 6 18 6 Z`} fill={wood} stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      <path d={`M860 ${TOP} q16 -4 18 -16 q-12 6 -18 6 Z`} fill={wood} stroke="rgba(0,0,0,0.3)" strokeWidth="1" />

      {/* ---------- 束腰 ---------- */}
      <rect x={64} y={TOP + 20} width={772} height={16} fill={wood} opacity={0.82} />
      {/* 束腰上的回纹 */}
      {!thumb &&
        Array.from({ length: 9 }).map((_, i) => (
          <path
            key={i}
            d={`M${100 + i * 84} ${TOP + 30} h20 v-6 h-12`}
            fill="none"
            stroke="rgba(212,175,55,0.5)"
            strokeWidth="1.2"
          />
        ))}

      {/* ---------- 马蹄腿（四条） ---------- */}
      {[110, 300, 600, 790].map((x, i) => (
        <path
          key={i}
          d={`M${x} ${TOP + 36} l6 68 q1 12 14 14 l22 0 q-10 -6 -12 -16 l-4 -66 Z`}
          fill={wood}
          stroke="rgba(0,0,0,0.34)"
          strokeWidth="1.2"
        />
      ))}

      {/* ---------- 牙板（腿间横板） ---------- */}
      <path
        d={`M116 ${TOP + 56} q334 22 668 0 l0 12 q-334 20 -668 0 Z`}
        fill={wood}
        opacity={0.72}
      />

      {/* ---------- 地面投影 ---------- */}
      <ellipse cx={450} cy={TOP + 124} rx={400} ry={12} fill="rgba(0,0,0,0.16)" />

      {/* 汉白玉台前地（让案子站在地面上） */}
      <rect x={0} y={TOP + 118} width={900} height={8} fill={`url(#${DEF_MARBLE})`} opacity={0.5} stroke={C_MARBLE.dark} strokeWidth="0.6" />
    </svg>
  );
}
