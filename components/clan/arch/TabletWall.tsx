import * as React from "react";
import { C_GOLD, C_NANMU, C_VERMILION } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 牌位墙（神主牌列）
 *
 * 真实祠堂寝堂供奉「神主牌」：木质、圆首（弧顶）、下有趺座、朱漆描金，
 * 按**昭穆次序**排列 —— 中间为始祖/正位（最高），两侧依次降低。
 * 牌面留白处写「某氏历代先祖之位」。
 *
 * 也用于公网「祭祀记录」：把每一条献祭记录刻一块牌位（names 传入脱敏名号）。
 *
 * viewBox 0 0 900 340。
 */
export default function ClanTabletWall({
  color,
  size = "detail",
  className,
  style,
  count = 7,
  names,
}: ArchBaseProps & { count?: number; names?: string[] }) {
  const thumb = isThumb(size);
  const wood = color ?? C_NANMU.base;
  const gold = C_GOLD.base;

  return (
    <svg
      viewBox="0 0 900 340"
      className={className} style={style}
      role="img"
      aria-label="牌位墙"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* 神龛背板（后墙的深色木壁） */}
      <rect x={20} y={40} width={860} height={280} rx={4} fill="rgba(0,0,0,0.26)" />
      {/* 龛内顶部横枋 */}
      <rect x={20} y={40} width={860} height={20} rx={3} fill={wood} stroke={C_NANMU.dark} strokeWidth="1.2" />
      {/* 供台（牌位所立之台） */}
      <rect x={40} y={292} width={820} height={26} rx={3} fill={wood} stroke={C_NANMU.dark} strokeWidth="1.4" />
      <rect x={40} y={292} width={820} height={5} fill="rgba(255,255,255,0.14)" />

      {Array.from({ length: count }).map((_, i) => {
        const center = (count - 1) / 2;
        const dist = Math.abs(i - center); // 离中间的距离
        const isCenter = dist < 0.5;

        // 昭穆序：中间最高，向两侧递减
        const h = (isCenter ? 232 : 232 - dist * 26) * (thumb ? 0.92 : 1);
        // 牌宽随高度等比收分（高牌宽身、矮牌窄身），避免矮牌像方块
        const w = Math.round((isCenter ? 72 : 62) * (thumb ? 0.92 : 1));
        const gapTotal = 820 - 40;
        const step = count > 1 ? gapTotal / (count - 1) : 0;
        const x = 40 + i * step + (step - w) / 2;
        const y = 292 - h;

        const label = names?.[i];

        return (
          <g key={i}>
            {/* 牌身（楠木渐变：左暗右亮，造木牌厚度） */}
            <rect x={x} y={y} width={w} height={h} fill={wood} stroke={C_NANMU.dark} strokeWidth={thumb ? 1 : 1.4} />
            {/* 牌身左侧受光 / 右侧暗部 */}
            <rect x={x} y={y} width={w * 0.22} height={h} fill="rgba(255,255,255,0.14)" />
            <rect x={x + w * 0.82} y={y} width={w * 0.18} height={h} fill="rgba(0,0,0,0.2)" />
            {/* 圆首（弧顶） */}
            <path
              d={`M${x} ${y + 6} q${w / 2} -16 ${w} 0 Z`}
              fill={wood}
              stroke={C_NANMU.dark}
              strokeWidth={thumb ? 1 : 1.4}
            />
            {/* 朱漆底（牌面凹槽，朱红才是神主牌的正式色） */}
            <rect x={x + 6} y={y + 14} width={w - 12} height={h - 32} rx={2} fill={C_VERMILION.dark} />
            <rect x={x + 6} y={y + 14} width={w - 12} height={h - 32} rx={2} fill="rgba(0,0,0,0.18)" />
            {/* 描金内框（双线，中间主位更重） */}
            <rect
              x={x + 8}
              y={y + 16}
              width={w - 16}
              height={h - 36}
              rx={1}
              fill="none"
              stroke={isCenter ? gold : "rgba(212,175,55,0.62)"}
              strokeWidth={thumb ? 1 : isCenter ? 2.2 : 1.3}
            />
            {!thumb && (
              <rect
                x={x + 12}
                y={y + 20}
                width={w - 24}
                height={h - 44}
                rx={1}
                fill="none"
                stroke="rgba(212,175,55,0.35)"
                strokeWidth="1"
              />
            )}

            {/* 牌面文字：有 names 时刻名字（祭祀记录），否则写「神位」 */}
            {!thumb && (
              <text
                x={x + w / 2}
                y={y + 30}
                textAnchor="middle"
                fontSize={isCenter ? 17 : 15}
                fill={gold}
                style={{ writingMode: "vertical-rl" as const }}
                textLength={Math.min(h - 58, label ? label.length * 17 : 85)}
                lengthAdjust="spacingAndGlyphs"
              >
                {label ?? "先祖神位"}
              </text>
            )}

            {/* 趺座（牌下的小座，比牌身宽） */}
            <rect x={x - 7} y={292} width={w + 14} height={9} rx={2} fill={wood} stroke={C_NANMU.dark} strokeWidth="1" />
            <rect x={x - 7} y={292} width={w + 14} height={3} fill="rgba(255,255,255,0.16)" />
          </g>
        );
      })}

      {/* 居中主位的金光（缩略图省略） */}
      {!thumb && (
        <ellipse
          cx={450}
          cy={180}
          rx={54}
          ry={130}
          fill="rgba(212,175,55,0.14)"
        />
      )}
    </svg>
  );
}
