import * as React from "react";
import { DEF_GOLD, DEF_PILLAR } from "./defs";
import { C_VERMILION } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 朱漆板门（含门钉与铺首衔环）
 *
 * 双扇对开，中缝一道；每扇 5×5 门钉阵；中央一对铺首（兽面衔环）。
 * 门钉是判断「这是祠堂大门」的关键符号，不能省。
 *
 * viewBox 0 0 400 460。
 */
export default function ClanDoor({
  color,
  size = "detail",
  palette,
  className,
  style,
}: ArchBaseProps) {
  const thumb = isThumb(size);
  const red = palette?.pillar ?? C_VERMILION;
  const body = color ?? `url(#${DEF_PILLAR})`;

  // 门钉：缩略图降为 4×4，且略大以免糊成一片
  const perRow = thumb ? 4 : 5;
  const rows = thumb ? 4 : 5;
  const startX = 46;
  const startY = 74;
  const stepX = (400 - 92 - 12) / (perRow - 1);
  const stepY = 240 / (rows - 1);
  const r = thumb ? 5 : 4.2;

  const studs = (offsetX: number) =>
    Array.from({ length: rows }).flatMap((_, ry) =>
      Array.from({ length: perRow }).map((_, rx) => (
        <circle
          key={`${ry}-${rx}`}
          cx={offsetX + startX + rx * stepX}
          cy={startY + ry * stepY}
          r={r}
          fill={`url(#${DEF_GOLD})`}
          stroke={palette?.gold?.dark ?? "#6b4a12"}
          strokeWidth="0.7"
        />
      )),
    );

  return (
    <svg
      viewBox="0 0 400 460"
      className={className} style={style}
      role="img"
      aria-label="朱漆板门"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* 门框（石质/木质门套） */}
      <rect x={16} y={20} width={368} height={420} rx={3} fill={red.dark} />
      <rect x={26} y={30} width={348} height={404} rx={2} fill="rgba(0,0,0,0.28)" />

      {/* 左扇 */}
      <rect x={30} y={34} width={170} height={396} rx={2} fill={body} stroke={red.dark} strokeWidth="1.4" />
      {/* 右扇 */}
      <rect x={200} y={34} width={170} height={396} rx={2} fill={body} stroke={red.dark} strokeWidth="1.4" />

      {/* 中缝 */}
      <rect x={198} y={34} width={4} height={396} fill="rgba(0,0,0,0.5)" />

      {/* 门钉 */}
      {studs(0)}
      {studs(170)}

      {/* 铺首衔环：左右各一 */}
      {[
        { cx: 132, cy: 300 },
        { cx: 268, cy: 300 },
      ].map((p, i) => (
        <g key={i}>
          {/* 兽面 */}
          <circle cx={p.cx} cy={p.cy} r={thumb ? 17 : 19} fill={`url(#${DEF_GOLD})`} stroke="#6b4a12" strokeWidth="1.2" />
          <circle cx={p.cx} cy={p.cy} r={thumb ? 11 : 13} fill="rgba(0,0,0,0.22)" />
          {!thumb && (
            <>
              {/* 双目 */}
              <circle cx={p.cx - 5} cy={p.cy - 4} r={2} fill="#5b3a10" />
              <circle cx={p.cx + 5} cy={p.cy - 4} r={2} fill="#5b3a10" />
              {/* 口鼻 */}
              <path d={`M${p.cx - 5} ${p.cy + 4} q5 4 10 0`} fill="none" stroke="#5b3a10" strokeWidth="1.2" />
            </>
          )}
          {/* 衔环 */}
          <circle cx={p.cx} cy={p.cy + (thumb ? 26 : 30)} r={thumb ? 8 : 10} fill="none" stroke={`url(#${DEF_GOLD})`} strokeWidth={thumb ? 3 : 3.6} />
        </g>
      ))}

      {/* 门槛 */}
      <rect x={20} y={430} width={360} height={16} rx={2} fill={red.dark} />
      <rect x={20} y={430} width={360} height={4} fill="rgba(255,255,255,0.14)" />
    </svg>
  );
}