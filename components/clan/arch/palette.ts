/**
 * 工笔彩绘色板
 *
 * 宗祠建筑的统一配色。取法真实祠堂：
 *  - 黛瓦青砖为骨（冷灰调），朱红梁柱为魂（暖红调），金饰点睛（匾额/门钉/斗拱）。
 *  - 每类材质给「受光 / 本色 / 暗部」三点，供 <linearGradient> 做晕染，
 *    这是工笔「平涂+局部渐变」观感的来源。
 *
 * 全部为十六进制色值，纯内联使用，不依赖 Tailwind 色阶
 * （tailwind.config.ts 只定义了 brand 50/100/500-900 与 accent 500/600）。
 */

/** 单材质的受光 / 本色 / 暗部三点色。
 *
 * ⚠️ 类型定义**已上移到 `lib/decor-3d.ts`**，这里改为 re-export。
 *    为什么：v2 的 3D 场景也要用三点色（材质配方 `MATERIAL_RECIPES`），
 *    若让它从 `components/clan/arch/palette.ts` 取，`lib/` 下的纯值模块
 *    就依赖了组件目录 —— 层级反了。值定义（下面那些 C_* 常量）仍留在本文件，
 *    它们描述的是**宗祠的建筑配色**，属于组件层，不该被提升。
 */
export type { TriTone } from "@/lib/decor-3d";
import type { TriTone } from "@/lib/decor-3d";

/** 黛瓦（屋面） */
export const C_TILE: TriTone = { light: "#5a6670", base: "#3d4850", dark: "#242c33" };
/** 青砖（墙体） */
export const C_BRICK: TriTone = { light: "#8d959b", base: "#7d858b", dark: "#6b7378" };
/** 朱红（立柱 / 大门 / 楹联） */
export const C_VERMILION: TriTone = { light: "#b2352a", base: "#8e2018", dark: "#5d130d" };
/** 赭石（梁枋木构，等于 tailwind accent-500/600） */
export const C_OCHRE: TriTone = { light: "#b98559", base: "#a8744f", dark: "#8f5f3d" };
/** 金（匾额 / 门钉 / 斗拱 / 鎏金） */
export const C_GOLD: TriTone = { light: "#f7e6a8", base: "#d4af37", dark: "#a5801f" };
/** 汉白玉（月台 / 柱础 —— 只用于**建筑构件**） */
export const C_MARBLE: TriTone = { light: "#eceae4", base: "#dfdbd1", dark: "#cfcac0" };
/**
 * 青石 / 花岗岩（石狮 / 抱鼓石 / 门枕石）
 *
 * 石狮绝不能用汉白玉色 —— 汉白玉（#dfdbd1）与宣纸底（#f7f4ec）几乎同色，
 * 狮子会"溶"进背景里看不见。真实祠堂门前的石狮是青灰色花岗岩，
 * 明显比汉白玉深，这样才有镇门的重量感。
 */
export const C_GRANITE: TriTone = { light: "#b4b0a6", base: "#9b978c", dark: "#7a766c" };
/** 青铜（香炉） */
export const C_BRONZE: TriTone = { light: "#8f7d54", base: "#7a6a45", dark: "#5c5036" };
/** 楠木（金丝楠木构件） */
export const C_NANMU: TriTone = { light: "#a07b46", base: "#7d5a2c", dark: "#4d3418" };
/** 夯土（黄泥墙） */
export const C_EARTH: TriTone = { light: "#ddc9a8", base: "#c9b391", dark: "#bda57f" };
/** 白粉墙 */
export const C_PLASTER: TriTone = { light: "#fbfaf7", base: "#f7f6f2", dark: "#efeee8" };

/** 通用中性色 */
export const C_INK = "#2b2b28"; // 墨（正文）
export const C_LINE = "#3a3226"; // 勾线
export const C_PAPER = "#f7f4ec"; // 宣纸（内容底）
export const C_STONE_DARK = "#5c5952"; // 石材暗部

/**
 * 主题板：把「这套宗祠整体是什么调子」抽出来。
 * 决定未显式指定颜色时，屋面 / 立柱 / 金饰 / 墙体的默认取色。
 */
export type ArchPalette = {
  roof: TriTone;
  pillar: TriTone;
  beam: TriTone;
  gold: TriTone;
  wall: TriTone;
};

/** 默认主题板：青砖黛瓦 · 朱红立柱（最常见的宗祠形制） */
export const DEFAULT_PALETTE: ArchPalette = {
  roof: C_TILE,
  pillar: C_VERMILION,
  beam: C_OCHRE,
  gold: C_GOLD,
  wall: C_BRICK,
};

/** 把 TriTone 转成 CSS linearGradient 字符串（上浅下深，受光面在上） */
export function triGradient(t: TriTone, angle = "180deg"): string {
  return `linear-gradient(${angle}, ${t.light} 0%, ${t.base} 52%, ${t.dark} 100%)`;
}

/** 把 TriTone 转成 SVG <linearGradient> 的 stops（配 <ClanArchDefs/> 使用） */
export function triStops(t: TriTone) {
  return [
    { offset: "0%", color: t.light },
    { offset: "52%", color: t.base },
    { offset: "100%", color: t.dark },
  ];
}
