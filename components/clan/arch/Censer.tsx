import * as React from "react";
import { C_BRONZE } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 青铜香炉（含三缕青烟）
 *
 * 形制取「三足双耳鼎式炉」：圆腹、三蹄足、两侧方耳、口沿外撇。
 * 青烟复用 app/globals.css 的 .smoke 动画（smoke-rise 3.2s），
 * 三缕错开 animation-delay —— 这是全站已有的动效，零新增 CSS。
 *
 * viewBox 0 0 260 300。
 */
export default function ClanCenser({
  color,
  size = "detail",
  className,
  style,
}: ArchBaseProps) {
  const thumb = isThumb(size);
  const bronze = color ?? C_BRONZE.base;

  return (
    <svg
      viewBox="0 0 260 300"
      className={className} style={style}
      role="img"
      aria-label="青铜香炉"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* ---------- 青烟（三缕，错开延迟） ---------- */}
      {[0, 1, 2].map((i) => (
        <g key={i} className={thumb ? undefined : "smoke"} style={thumb ? undefined : { animationDelay: `${i * 1.07}s` }}>
          <path
            d={`M${118 + i * 12} 92 q-${8 + i * 2} -22 ${4 + i * 2} -40 q${10 + i * 2} -20 ${-2} -38`}
            fill="none"
            stroke="rgba(210,205,196,0.62)"
            strokeWidth={thumb ? 2.6 : 3.4}
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* ---------- 双耳（絅耳：自口沿向**外侧**伸出后下垂，不是竖在腹上的兔耳） ---------- */}
      {/* 左耳：从口沿 (54,124) 向左外挑到 (18,112)，再向下环回 */}
      <path
        d="M56 126 C40 122 22 116 16 104 C12 96 18 88 26 90 C32 92 34 100 30 106"
        fill="none"
        stroke={C_BRONZE.dark}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M56 126 C40 122 22 116 16 104 C12 96 18 88 26 90 C32 92 34 100 30 106"
        fill="none"
        stroke={bronze}
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* 右耳：镜像 */}
      <path
        d="M204 126 C220 122 238 116 244 104 C248 96 242 88 234 90 C228 92 226 100 230 106"
        fill="none"
        stroke={C_BRONZE.dark}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M204 126 C220 122 238 116 244 104 C248 96 242 88 234 90 C228 92 226 100 230 106"
        fill="none"
        stroke={bronze}
        strokeWidth="6"
        strokeLinecap="round"
      />

      {/* ---------- 口沿（外撇） ---------- */}
      <path d="M44 120 q86 -16 172 0 l7 16 q-93 15 -186 0 Z" fill={C_BRONZE.light} stroke={C_BRONZE.dark} strokeWidth="1.5" />
      {/* 口沿内暗（中空感） */}
      <ellipse cx={130} cy={122} rx={80} ry={10} fill="rgba(0,0,0,0.36)" />

      {/* ---------- 炉腹（圆腹） ---------- */}
      <path
        d="M58 138 q14 74 72 74 q58 0 72 -74 q-72 -12 -144 0 Z"
        fill={bronze}
        stroke={C_BRONZE.dark}
        strokeWidth="1.6"
      />
      {/* 腹部受光（左上） */}
      <ellipse cx={100} cy={176} rx={26} ry={30} fill={C_BRONZE.light} opacity={0.3} />
      {/* 腹部弦纹两道 */}
      <path d="M62 156 q68 12 136 0" fill="none" stroke={C_BRONZE.dark} strokeWidth="1.2" opacity={0.7} />
      <path d="M66 186 q64 10 128 0" fill="none" stroke={C_BRONZE.dark} strokeWidth="1.2" opacity={0.55} />

      {/* ---------- 饕餮纹（缩略图省略） ---------- */}
      {!thumb && (
        <g opacity={0.55}>
          <path d="M96 168 q10 -10 20 0 q10 10 20 0" fill="none" stroke={C_BRONZE.dark} strokeWidth="2" />
          <circle cx={104} cy={172} r={3} fill={C_BRONZE.dark} />
          <circle cx={128} cy={172} r={3} fill={C_BRONZE.dark} />
        </g>
      )}

      {/* ---------- 三足（蹄足） ---------- */}
      {[
        { x: 86, w: 20 },
        { x: 120, w: 22 },
        { x: 156, w: 20 },
      ].map((f, i) => (
        <g key={i}>
          <path
            d={`M${f.x} 206 q${f.w / 2} 32 -2 58 l${-f.w + 4} 0 q-8 -28 -2 -58 Z`}
            fill={bronze}
            stroke={C_BRONZE.dark}
            strokeWidth="1.4"
          />
          {/* 足端外撇（蹄） */}
          <ellipse cx={f.x + f.w / 2 - 1} cy={264} rx={f.w / 2 + 5} ry={7} fill={C_BRONZE.light} stroke={C_BRONZE.dark} strokeWidth="1.2" />
        </g>
      ))}

      {/* ---------- 地面投影 ---------- */}
      <ellipse cx={130} cy={274} rx={92} ry={11} fill="rgba(0,0,0,0.18)" />
    </svg>
  );
}
