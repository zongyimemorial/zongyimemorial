import * as React from "react";
import { DEF_GOLD } from "./defs";
import { C_GOLD } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 匾额（横匾）
 *
 * 三种样式：
 *  - plain    素匾：木底描金边（常见宗祠）
 *  - imperial 御赐匾：金底朱字「御赐」上下款，配云龙边
 *  - ancestral 祖德匾：深木底，字最大，用于享堂正中
 *
 * 匾额四周有「框」有「华带」（边框上下的雕饰带），这是匾额的辨识特征。
 *
 * viewBox 0 0 480 130。
 */
export default function ClanPlaque({
  text,
  variant = "plain",
  color,
  size = "detail",
  className,
  style,
  fontFamily,
}: ArchBaseProps & {
  text: string;
  variant?: "plain" | "imperial" | "ancestral";
  fontFamily?: string;
}) {
  const thumb = isThumb(size);
  const gold = color ?? C_GOLD.base;

  const bg =
    variant === "imperial"
      ? `url(#${DEF_GOLD})`
      : variant === "ancestral"
        ? "#4a2f18"
        : "#6b4423";

  const textColor = variant === "imperial" ? "#6b1610" : C_GOLD.light;

  return (
    <svg
      viewBox="0 0 480 130"
      className={className} style={style}
      role="img"
      aria-label={text}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* 华带（上下雕饰带） */}
      <rect x={4} y={4} width={472} height={14} rx={3} fill={C_GOLD.dark} opacity={0.9} />
      <rect x={4} y={112} width={472} height={14} rx={3} fill={C_GOLD.dark} opacity={0.9} />

      {/* 匾底 */}
      <rect x={4} y={16} width={472} height={98} rx={4} fill={bg} />
      {variant === "imperial" && (
        /* 金底上的云纹（简化为两道波纹） */
        <>
          <path d="M24 46 q20 -10 40 0 q20 10 40 0" fill="none" stroke="rgba(107,22,16,0.22)" strokeWidth="2.4" />
          <path d="M376 86 q20 -10 40 0 q20 10 40 0" fill="none" stroke="rgba(107,22,16,0.22)" strokeWidth="2.4" />
        </>
      )}

      {/* 内框（描金细边） */}
      <rect x={16} y={28} width={448} height={74} rx={3} fill="none" stroke={gold} strokeWidth={thumb ? 2 : 2.6} />
      {/* 内框下方的分隔双线（御赐匾的小款区分隔） */}
      {variant === "imperial" && !thumb && (
        <>
          <path d="M32 52 H448" stroke="rgba(107,22,16,0.34)" strokeWidth="1.1" />
          <path d="M32 98 H448" stroke="rgba(107,22,16,0.34)" strokeWidth="1.1" />
        </>
      )}

      {/* 匾文 */}
      <text
        x={240}
        y={88}
        textAnchor="middle"
        fontSize={thumb ? 34 : 44}
        fill={textColor}
        fontFamily={fontFamily ?? '"Songti SC","SimSun",serif'}
        letterSpacing="0.16em"
        style={{ fontWeight: 600 }}
      >
        {text}
      </text>

      {/* 御赐匾：上下小款 */}
      {variant === "imperial" && !thumb && (
        <>
          <text x={240} y={42} textAnchor="middle" fontSize={11} fill="rgba(107,22,16,0.72)" letterSpacing="0.3em">
            御 赐
          </text>
          <text x={240} y={108} textAnchor="middle" fontSize={10} fill="rgba(107,22,16,0.72)" letterSpacing="0.3em">
            光 绪 年 立
          </text>
        </>
      )}

      {/* 两侧挂钉（缩略图省略） */}
      {!thumb && (
        <>
          <circle cx={16} cy={65} r={4} fill={gold} stroke={C_GOLD.dark} strokeWidth="0.8" />
          <circle cx={464} cy={65} r={4} fill={gold} stroke={C_GOLD.dark} strokeWidth="0.8" />
        </>
      )}
    </svg>
  );
}
