/**
 * 宗祠建筑构件（arch）层
 *
 * 这一层是「工笔彩绘风格祠堂」的绘制底座。每个组件都是一个纯内联 SVG，
 * 零外部资源，可在「详情页」与「工坊缩略图」两处按 size 档位复用。
 */

export { default as ClanArchDefs } from "./defs";
export {
  DEF_ROOF,
  DEF_ROOF_DARK,
  DEF_PILLAR,
  DEF_WALL,
  DEF_GOLD,
  DEF_MARBLE,
  DEF_BRICK_PATTERN,
  DEF_FLAGSTONE_PATTERN,
} from "./defs";

export * from "./palette";
export { isThumb, archId } from "./types";
export type { ArchBaseProps, ArchSize } from "./types";

/* ---------- 建筑骨架 ---------- */
export { default as ClanRoof } from "./Roof";
export { default as ClanDougong } from "./Dougong";
export { default as ClanPillarPair } from "./PillarPair";
export { default as ClanDoor } from "./Door";
export { default as ClanGate } from "./Gate";
export { default as ClanTerrace } from "./Terrace";

/* ---------- 檐下与堂内陈设（对应 10 个 clan-orn-* 挂饰） ---------- */
export { default as ClanLantern } from "./Lantern";
export { default as ClanCenser } from "./Censer";
export { default as ClanStoneLion } from "./StoneLion";
export { default as ClanTabletWall } from "./TabletWall";
export { default as ClanBannerPair } from "./BannerPair";
export { default as ClanPlaque } from "./Plaque";
export { default as ClanHalo } from "./Halo";
export { default as ClanAltar } from "./Altar";
