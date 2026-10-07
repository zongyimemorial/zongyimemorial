import * as React from "react";
import { C_GOLD, C_VERMILION } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 幡旗一对（长幡）
 *
 * 祠堂天井两侧的竖幡：顶部横挑杆 + 长条旗身 + 底部飘带与坠饰。
 * 旗面竖排文字（沿用 ClanOrnamentSpec.banner-pair 的 text: [string, string]）。
 *
 * 注意：这里**不使用 fixed 定位**（旧实现用 fixed，长页面滚动时幡会跟着飘走）。
 * 由调用方决定绝对定位的容器，本组件只负责画。
 *
 * viewBox 0 0 360 480。
 */
export default function ClanBannerPair({
  color,
  size = "detail",
  className,
  style,
  text = ["祖", "宗"],
}: ArchBaseProps & { text?: [string, string] }) {
  const thumb = isThumb(size);
  const red = color ?? C_VERMILION.base;

  const banner = (x: number, chars: string[]) => (
    <g key={x}>
      {/* 横挑杆（从柱上挑出的木杆） */}
      <rect x={x - 22} y={16} width={62} height={9} rx={2} fill="#4a3a22" />
      {/* 挑杆端头（云头） */}
      <circle cx={x + 46} cy={20} r={6} fill={C_GOLD.base} stroke={C_GOLD.dark} strokeWidth="0.8" />

      {/* 旗身：上宽下略窄，底端呈燕尾 */}
      <path
        d={`M${x - 6} 26 L${x + 58} 26 L${x + 58} 322 L${x + 26} 300 L${x - 6} 322 Z`}
        fill={red}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="1.2"
      />
      {/* 旗面受光边 */}
      <path d={`M${x - 3} 29 L${x + 6} 29 L${x + 6} 314 L${x - 3} 318 Z`} fill="rgba(255,255,255,0.16)" />

      {/* 旗面文字（竖排） */}
      {chars.map((ch, i) => (
        <text
          key={i}
          x={x + 26}
          y={74 + i * 78}
          textAnchor="middle"
          fontSize={thumb ? 24 : 34}
          fill={C_GOLD.light}
          style={{ writingMode: "vertical-rl" as const }}
        >
          {ch}
        </text>
      ))}

      {/* 旗面回纹边饰（缩略图省略） */}
      {!thumb &&
        Array.from({ length: 5 }).map((_, i) => (
          <path
            key={i}
            d={`M${x + 2} ${172 + i * 32} h12 v-9 h-7`}
            fill="none"
            stroke="rgba(212,175,55,0.55)"
            strokeWidth="1.2"
          />
        ))}

      {/* 旗杆 */}
      <rect x={x + 24} y={26} width={6} height={424} fill="#6b4a24" />

      {/* 底部坠饰（三缕穗） */}
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${x + 20 + i * 8} 450 q${i === 1 ? 0 : i === 0 ? -3 : 3} 22 ${i === 1 ? 1 : i === 0 ? -1 : 1} 36`}
          fill="none"
          stroke={C_GOLD.base}
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
    </g>
  );

  return (
    <svg
      viewBox="0 0 360 480"
      className={className} style={style}
      role="img"
      aria-label="幡旗"
      preserveAspectRatio="xMidYMax meet"
    >
      {banner(56, [...text[0]])}
      {banner(248, [...text[1]])}
    </svg>
  );
}
