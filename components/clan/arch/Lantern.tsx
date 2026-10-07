import * as React from "react";
import { C_GOLD, C_VERMILION } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 宫灯一对（檐下悬挂）
 *
 * 形制：吊线 → 灯盖 → 灯身（腰鼓形，朱红）→ 灯裙 → 灯穗。
 * 灯身用 radialGradient 造「透光」感（中心亮、边缘暗）。
 * 复用 globals.css 的 .lantern-rise 动画（缩略图关闭）。
 *
 * viewBox 0 0 400 300。
 */
export default function ClanLantern({
  color,
  size = "detail",
  className,
  style,
  count = 2,
}: ArchBaseProps & { count?: number }) {
  const thumb = isThumb(size);
  const red = color ?? C_VERMILION.base;

  const lantern = (x: number) => (
    <g key={x} className={thumb ? undefined : "lantern-rise"}>
      {/* 吊线 */}
      
      {/* 灯盖（小圆盘） */}
      

      {/* 吊线 */}
      <rect x={x - 1.2} y={0} width={2.4} height={12} fill="#8a7a5a" />
      {/* 灯盖（宝盖，比灯身宽） */}
      <ellipse cx={x} cy={16} rx={32} ry={8} fill={C_GOLD.base} stroke={C_GOLD.dark} strokeWidth="1.1" />
      {/* 灯盖顶钮 */}
      <circle cx={x} cy={9} r={5} fill={C_GOLD.light} stroke={C_GOLD.dark} strokeWidth="0.9" />

      {/* 灯身：腰鼓形 */}
      <path
        d={`M${x - 30} 22 q30 -14 60 0 q7 54 0 108 q-30 14 -60 0 q-7 -54 0 -108 Z`}
        fill={red}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="1.2"
      />
      {/* 透光（中心亮） */}
      <ellipse cx={x - 7} cy={76} rx={17} ry={36} fill="rgba(255,220,150,0.34)" />
      {/* 灯身上的竖棱（竹骨） */}
      {[-14, 0, 14].map((dx, i) => (
        <path
          key={i}
          d={`M${x + dx} 20 q4 56 0 112`}
          fill="none"
          stroke="rgba(0,0,0,0.16)"
          strokeWidth="1.4"
        />
      ))}
      {/* 灯身「福」字位（缩略图省略） */}
      {!thumb && (
        <text x={x} y={90} textAnchor="middle" fontSize={36} fill={C_GOLD.light} opacity={0.95}>
          福
        </text>
      )}

      {/* 灯裙 */}
      <path d={`M${x - 28} 130 q28 12 56 0 l-5 16 q-23 10 -46 0 Z`} fill={C_GOLD.base} stroke={C_GOLD.dark} strokeWidth="0.9" />

      {/* 灯穗（三缕） */}
      {[-9, 0, 9].map((dx, i) => (
        <path
          key={i}
          d={`M${x + dx} 146 q${i === 1 ? 0 : dx > 0 ? 2 : -2} 26 ${i === 1 ? 1 : dx > 0 ? -1 : 1} 42`}
          fill="none"
          stroke={C_GOLD.base}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      ))}
    </g>
  );

  return (
    <svg
      viewBox="0 0 400 300"
      className={className} style={style}
      role="img"
      aria-label="宫灯"
      preserveAspectRatio="xMidYMin meet"
    >
      {count >= 2 ? (
        <>
          {lantern(90)}
          {lantern(310)}
        </>
      ) : (
        lantern(200)
      )}
    </svg>
  );
}
