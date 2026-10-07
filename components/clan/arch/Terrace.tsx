import * as React from "react";
import { DEF_FLAGSTONE_PATTERN, DEF_MARBLE } from "./defs";
import { C_MARBLE } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 月台 / 台基 / 台阶 / 栏杆
 *
 * 三种形制：
 *  - none     无台基（直接落地）
 *  - platform 素台基（低平，无栏杆）
 *  - moon     月台（高台基 + 三级踏步 + 望柱栏板，大祠标配）
 *
 * 画法要点：汉白玉是**暖白**，若台基也用暖白就必然与宣纸底糊在一起。
 * 因此台基必须靠三样东西"浮"出来：
 *  1. 底部的地面投影（椭圆 + 深色描边）
 *  2. 台基立面的**深色压边**（下沿一条重色）
 *  3. 台面上沿的**高光白线**
 * 缺任何一样，台基就会在浅底上消失。
 *
 * viewBox 0 0 1200 200。
 */
export default function ClanTerrace({
  form = "platform",
  size = "detail",
  className,
  style,
}: ArchBaseProps & { form?: "none" | "platform" | "moon" }) {
  const thumb = isThumb(size);
  if (form === "none") return null;

  const marble = `url(#${DEF_MARBLE})`;
  const stone = `url(#${DEF_FLAGSTONE_PATTERN})`;
  const EDGE = "#a9a49a"; // 比 C_MARBLE.dark 更重，保证在浅底上可见

  /** 望柱栏板（月台两侧） */
  const railing = (x0: number, x1: number) => {
    const posts = thumb ? 4 : 7;
    const gap = (x1 - x0) / (posts - 1);
    return (
      <g key={`${x0}-${x1}`}>
        {/* 地栿 */}
        <rect x={x0} y={114} width={x1 - x0} height={11} fill={EDGE} />
        {/* 栏板 */}
        <rect x={x0} y={90} width={x1 - x0} height={24} fill={marble} opacity={0.95} stroke={EDGE} strokeWidth="1" />
        {/* 栏板上的云纹浮雕（缩略图省略） */}
        {!thumb &&
          Array.from({ length: posts - 1 }).map((_, i) => (
            <path
              key={i}
              d={`M${x0 + gap * (i + 0.22)} 102 q${gap * 0.16} -7 ${gap * 0.32} 0`}
              fill="none"
              stroke={EDGE}
              strokeWidth="1.1"
              opacity={0.7}
            />
          ))}
        {/* 望柱 + 云头柱头 */}
        {Array.from({ length: posts }).map((_, i) => (
          <g key={i}>
            <rect x={x0 + i * gap - 5} y={68} width={10} height={48} rx={2} fill={marble} stroke={EDGE} strokeWidth="1" />
            <circle cx={x0 + i * gap} cy={66} r={thumb ? 5 : 6} fill={marble} stroke={EDGE} strokeWidth="0.9" />
          </g>
        ))}
      </g>
    );
  };

  return (
    <svg
      viewBox="0 0 1200 200"
      className={className} style={style}
      role="img"
      aria-label="月台台基"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* 地面投影：让台基从宣纸底上"立"起来 */}
      <ellipse cx={600} cy={178} rx={600} ry={20} fill="rgba(58,50,38,0.20)" />
      <rect x={0} y={172} width={1200} height={8} fill="rgba(58,50,38,0.18)" />

      {/* 台基主体（大理石渐变） */}
      <rect x={0} y={112} width={1200} height={62} fill={marble} stroke={EDGE} strokeWidth="1.8" />
      {/* 台面上沿高光 */}
      <rect x={0} y={112} width={1200} height={7} fill="#ffffff" opacity={0.95} />
      {/* 立面石板缝 */}
      <rect x={0} y={122} width={1200} height={52} fill={stone} opacity={0.55} />
      {/* 立面受光/暗部 */}
      <rect x={0} y={122} width={1200} height={10} fill="rgba(255,255,255,0.35)" />
      <rect x={0} y={156} width={1200} height={18} fill="rgba(58,50,38,0.16)" />
      {/* 下沿重色压边（关键：没有它就与底色糊在一起） */}
      <rect x={0} y={166} width={1200} height={8} fill={EDGE} opacity={0.85} />

      {/* 中间三级踏步（自上而下逐级外扩） */}
      {Array.from({ length: 3 }).map((_, i) => {
        const w = 300 + i * 40;
        const x = (1200 - w) / 2;
        const y = 118 + i * 18;
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={18} fill={marble} stroke={EDGE} strokeWidth="1.2" />
            {/* 踏面受光高光 */}
            <rect x={x} y={y} width={w} height={4} fill="rgba(255,255,255,0.98)" />
            {/* 踢面阴影 */}
            <rect x={x} y={y + 14} width={w} height={4} fill="rgba(58,50,38,0.18)" />
            {/* 踏面两端垂带石 */}
            <rect x={x} y={y} width={14} height={18} fill={EDGE} opacity={0.55} />
            <rect x={x + w - 14} y={y} width={14} height={18} fill={EDGE} opacity={0.55} />
          </g>
        );
      })}

      {/* 月台档（垂带石，斜置） */}
      <path d="M442 118 L448 176 L430 176 L420 118 Z" fill={EDGE} opacity={0.92} />
      <path d="M758 118 L752 176 L770 176 L780 118 Z" fill={EDGE} opacity={0.92} />

      {/* 栏杆（仅月台形制） */}
      {form === "moon" && (
        <>
          {railing(60, 424)}
          {railing(776, 1140)}
        </>
      )}
    </svg>
  );
}
