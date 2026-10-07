"use client";

import { MATERIAL_RECIPES, LIGHT_ANGLE, type MaterialTheme, type TriTone } from "@/lib/decor-3d";

/**
 * 材质样式工具：`(材质主题, 主光方向) → CSS background-image`。
 *
 * ## 它存在的原因
 *
 * 每根柱、每道枋、每层台基都要一串渐变。若让各构件各自拼字符串：
 *   ① "同一个材质在不同构件里长得不一样"（有人写 180deg、有人写 90deg）；
 *   ② 换材质要走遍所有构件改代码；
 *   ③ 主光换方向时，明暗逻辑会自相矛盾（光从右来、物体却全左亮）。
 *
 * 所以材质只有一张配方表（`lib/decor-3d.ts` 的 `MATERIAL_RECIPES`），
 * 本文件只负责**把配方与主光方向接起来**。
 *
 * ## 为什么不用 CSS 类 / 不抽到样式表
 *
 * 三点色是**运行时算出来的**（模板可以自带材质、色温还会偏移一档），
 * 静态类名表达不了"这 15 个色值组合成的渐变"。内联 `backgroundImage`
 * 是唯一能在 SSR 阶段就定稿、且**没有水合 mismatch 风险**的做法
 * （见 `lib/decor-skin.ts` 文件头关于"为什么用变量不用 context"的同源论证）。
 */

/** 取某材质的配方结果（含主光角度修正） */
export function materialFill(
  t: TriTone,
  recipe: keyof typeof MATERIAL_RECIPES,
  angle?: number,
): string {
  const fn = MATERIAL_RECIPES[recipe];
  const css = fn(t);
  if (angle === undefined) return css;
  // 只改第一条 linear-gradient 的角度（radial / repeating 的角度语义不同，不碰）
  return css.replace(/linear-gradient\(180deg,/, `linear-gradient(${angle}deg,`);
}

/**
 * 由「主光方向」推出各材质该用的渐变角度。
 *
 * 为什么只调 `lacquer`（柱身横向渐变）与 `wood`：
 *   - `gilt` 是"顶部高光"，无论光从哪来都会在顶上（物理上说得通）；
 *   - `stone` / `brocade` 以纹理为主，角度差几度看不出来；
 *   - 真正会被"光从右来却左亮"看破的，只有竖向柱体的横向受光面。
 * 只调该调的，改坏面最小。
 */
export function lightAngles(space: { light: { key: keyof typeof LIGHT_ANGLE } }) {
  const a = LIGHT_ANGLE[space.light.key] ?? 180;
  return {
    /** 柱身（横向渐变，角度最关键） */
    pillar: a,
    /** 梁枋（竖向渐变，基本不随方向变，只让顶部受光略偏） */
    beam: 180,
    /** 石材 / 地面（纹理为主） */
    stone: 180,
    /** 金属（径向高光） */
    metal: 180,
  };
}

/**
 * 结构构件的通用 CSS 片段。
 *
 * `preserve-3d` 是必须的：结构构件要参与空间层的 `translate3d`，
 * 少了它子元素会被拍平，柱础/斗拱的层叠立刻变成"贴纸"。
 */
export const PART_BASE = {
  position: "absolute" as const,
  left: "50%",
  bottom: 0,
  transformStyle: "preserve-3d" as const,
  pointerEvents: "none" as const,
};

/** 把材质主题 + 主光方向，预先算成各构件的 fill 字符串（避免每个构件各调一次） */
export function buildFills(m: MaterialTheme, key: keyof typeof LIGHT_ANGLE) {
  const ang = lightAngles({ light: { key } });
  return {
    pillar: materialFill(m.pillar, "lacquer", ang.pillar),
    pillarPlain: materialFill(m.pillar, "lacquer"),
    beam: materialFill(m.beam, "wood", ang.beam),
    beamPlain: materialFill(m.beam, "wood"),
    stone: materialFill(m.stone, "stone", ang.stone),
    metal: materialFill(m.metal, "gilt", ang.metal),
    floor: materialFill(m.floor, "stone"),
  };
}
