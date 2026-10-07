import * as React from "react";
import { C_BRICK, C_GOLD, C_MARBLE, C_TILE, C_VERMILION } from "./palette";

/**
 * 宗祠场景共享 <defs>
 *
 * 每个「场景」（详情页一段分镜 / 一个缩略图框）只需挂一次，
 * 其内部所有构件通过 url(#...) 引用这些渐变色。
 *
 * 为什么集中挂载：SVG 的 id 是全局作用域。若每个构件各自定义 <linearGradient id="gold">，
 * 同页多个构件会互相覆盖。集中且固定命名（前缀 clan-arch-）可确保整页唯一。
 */

export const DEF_ROOF = "clan-arch-roof"; // 黛瓦
export const DEF_ROOF_DARK = "clan-arch-roof-dark"; // 檐底阴影
export const DEF_PILLAR = "clan-arch-pillar"; // 朱红立柱（横向渐变造圆柱感）
export const DEF_WALL = "clan-arch-wall"; // 青砖
export const DEF_GOLD = "clan-arch-gold"; // 金饰
export const DEF_MARBLE = "clan-arch-marble"; // 汉白玉
export const DEF_BRICK_PATTERN = "clan-arch-brick-pat"; // 砖缝
export const DEF_FLAGSTONE_PATTERN = "clan-arch-flagstone-pat"; // 石板缝

export default function ClanArchDefs({ withPattern = true }: { withPattern?: boolean }) {
  return (
    <defs>
      {/* 黛瓦：上受光、下檐底 */}
      <linearGradient id={DEF_ROOF} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={C_TILE.light} />
        <stop offset="52%" stopColor={C_TILE.base} />
        <stop offset="100%" stopColor={C_TILE.dark} />
      </linearGradient>
      <linearGradient id={DEF_ROOF_DARK} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={C_TILE.base} />
        <stop offset="100%" stopColor={C_TILE.dark} />
      </linearGradient>

      {/* 朱红立柱：横向渐变（左暗、中受光、右暗）才有圆柱体积感 */}
      <linearGradient id={DEF_PILLAR} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={C_VERMILION.dark} />
        <stop offset="34%" stopColor={C_VERMILION.light} />
        <stop offset="70%" stopColor={C_VERMILION.base} />
        <stop offset="100%" stopColor={C_VERMILION.dark} />
      </linearGradient>

      {/* 青砖墙 */}
      <linearGradient id={DEF_WALL} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={C_BRICK.light} />
        <stop offset="60%" stopColor={C_BRICK.base} />
        <stop offset="100%" stopColor={C_BRICK.dark} />
      </linearGradient>

      {/* 金箔：上高光、中金、下暗 */}
      <linearGradient id={DEF_GOLD} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={C_GOLD.light} />
        <stop offset="45%" stopColor={C_GOLD.base} />
        <stop offset="100%" stopColor={C_GOLD.dark} />
      </linearGradient>

      {/* 汉白玉 */}
      <linearGradient id={DEF_MARBLE} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={C_MARBLE.light} />
        <stop offset="100%" stopColor={C_MARBLE.dark} />
      </linearGradient>

      {withPattern && (
        <>
          {/* 砖缝：错缝砌法（上行走通缝，下行错半砖） */}
          <pattern
            id={DEF_BRICK_PATTERN}
            width="72"
            height="34"
            patternUnits="userSpaceOnUse"
          >
            <rect width="72" height="34" fill="transparent" />
            <path
              d="M0 0 H72 M0 34 H72 M0 0 V34 M36 0 V17 M0 17 H72 M72 17 V34"
              stroke="rgba(0,0,0,0.13)"
              strokeWidth="1.4"
              fill="none"
            />
          </pattern>

          {/* 石板缝：方正大块 */}
          <pattern
            id={DEF_FLAGSTONE_PATTERN}
            width="112"
            height="68"
            patternUnits="userSpaceOnUse"
          >
            <rect width="112" height="68" fill="transparent" />
            <path
              d="M0 0 H112 M0 68 H112 M0 0 V68 M112 0 V68"
              stroke="rgba(0,0,0,0.16)"
              strokeWidth="1.6"
              fill="none"
            />
          </pattern>
        </>
      )}
    </defs>
  );
}