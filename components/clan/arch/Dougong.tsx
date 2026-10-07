import * as React from "react";
import { DEF_GOLD } from "./defs";
import { C_GOLD, C_OCHRE, C_VERMILION } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 斗拱（檐下承托构件）
 *
 * 真实斗拱是「斗」+「拱」交错叠垒的木构，三踩/五踩层层出挑。
 * 此处简化为三踩单元横向重复 —— 重复是工笔彩绘里最快建立
 * 「这是中国古建筑」观感的手法。
 *
 * 画法要点：斗拱若整片金色，远看只是一条黄线。
 * 真实斗拱是**朱红拱身 + 青绿垫板 + 金线描边**（旋子彩画的简化），
 * 因此这里：拱身走朱红/赭石渐变，斗走金色，边线用墨金 outline。
 *
 * viewBox 0 0 1200 110：细长横条，专为檐下排列设计。
 */
export default function ClanDougong({
  color,
  size = "detail",
  palette,
  className,
  style,
  count,
}: ArchBaseProps & { count?: number }) {
  const thumb = isThumb(size);
  const gold = color ?? `url(#${DEF_GOLD})`;
  const wood = palette?.beam ?? C_OCHRE;
  const red = palette?.pillar ?? C_VERMILION;
  const edge = "#4a3510"; // 墨金描边，保证在任何底色上都看得见

  const total = count ?? (thumb ? 7 : 12);
  const span = 1160;
  const startX = (1200 - span) / 2;
  const gap = total > 1 ? span / (total - 1) : 0;

  /** 单组三踩斗拱：坐斗 + 昂 + 横拱 */
  const unit = (x: number) => (
    <g key={x} transform={`translate(${x} 0)`}>
      {/* 垫板（斗拱背后的深色木板，把斗拱从屋面上"托"出来） */}
      <rect x={-22} y={30} width={44} height={44} fill={red.dark} opacity={0.55} />

      {/* 坐斗（底部大方斗） */}
      <rect x={-16} y={66} width={32} height={24} rx={2} fill={gold} stroke={edge} strokeWidth="1.1" />
      {/* 坐斗上的斗耳分界 */}
      {!thumb && <path d="M-6 70 V86 M6 70 V86" fill="none" stroke={edge} strokeWidth="0.8" opacity={0.6} />}

      {/* 昂（斜向出挑，嘴尖朝外） */}
      <path d={`M-11 66 L-6 40 L6 40 L11 66 Z`} fill={wood.base} stroke={edge} strokeWidth="1" />
      <path d={`M-6 40 L0 30 L6 40 Z`} fill={gold} stroke={edge} strokeWidth="0.9" />

      {/* 华拱（第一层横拱，最长） */}
      <rect x={-38} y={28} width={76} height={12} rx={2} fill={red.base} stroke={edge} strokeWidth="1" />
      {/* 拱头卷杀（两端收分） */}
      <path d={`M-38 28 L-44 34 L-38 40 Z`} fill={red.dark} stroke={edge} strokeWidth="0.8" />
      <path d={`M38 28 L44 34 L38 40 Z`} fill={red.dark} stroke={edge} strokeWidth="0.8" />

      {!thumb && (
        <>
          {/* 第二层横拱（五踩感） */}
          <rect x={-24} y={14} width={48} height={11} rx={2} fill={wood.base} stroke={edge} strokeWidth="0.9" />
          {/* 散斗四枚（架在横拱上） */}
          <rect x={-42} y={20} width={10} height={9} rx={1.5} fill={gold} stroke={edge} strokeWidth="0.7" />
          <rect x={-30} y={8} width={10} height={9} rx={1.5} fill={gold} stroke={edge} strokeWidth="0.7" />
          <rect x={20} y={8} width={10} height={9} rx={1.5} fill={gold} stroke={edge} strokeWidth="0.7" />
          <rect x={32} y={20} width={10} height={9} rx={1.5} fill={gold} stroke={edge} strokeWidth="0.7" />
          {/* 拱身彩画金线 */}
          <path d="M-30 36 H30 M-18 20 H18" fill="none" stroke={C_GOLD.light} strokeWidth="1" opacity={0.85} />
        </>
      )}

      {/* 斗与拱之间的暗部 */}
      <rect x={-9} y={56} width={18} height={10} fill="rgba(0,0,0,0.28)" />
    </g>
  );

  return (
    <svg
      viewBox="0 0 1200 110"
      className={className} style={style}
      role="img"
      aria-label="斗拱"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* 额枋（斗拱坐在其上） */}
      <rect x={0} y={92} width={1200} height={18} fill={wood.dark} />
      {!thumb && <rect x={0} y={92} width={1200} height={4} fill="rgba(255,255,255,0.14)" />}
      {!thumb && <rect x={0} y={104} width={1200} height={6} fill="rgba(0,0,0,0.24)" />}

      {Array.from({ length: total }).map((_, i) => unit(Math.round(startX + i * gap)))}
    </svg>
  );
}
