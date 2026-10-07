"use client";

import type { CSSProperties } from "react";
import { unitToPx } from "@/lib/decor-3d";

/**
 * Prop3D 的共享原子件。
 *
 * ## 为什么陈设也要「拆成层」而不是画成一个 div
 *
 * v1 的 `Prop3D` 里，一件挂饰最多 4 个 div（灯笼＝挂钩+盖+身+流苏），
 * 结果是"所有付费档的灯笼长得一样"—— 用户分不清 `¥5` 的素灯笼和
 * `¥39` 的宫灯，装修的付费动机就不存在了。
 *
 * v2 把**层数当作精细度的硬指标**（写进 `verify-decor-prop3d.mjs` 断言）：
 * 素灯笼 10 层、宫灯 16 层。层数不是目的，是为了让"贵的那盏"在
 * 结构上真的更复杂 —— 有箍、有锦、有流苏、有地面光斑。
 *
 * ## 三条硬约束（与 Structure3D 同源，勿破）
 *
 * ① **纯 div + CSS**：不引任何图片 / SVG 文件 / emoji（emoji 对 color 不生效，
 *    正是"选不同挂灯看起来一样"的元凶，见 v1 的注释）。
 * ② **绝不画业务内容**：这里只画"物件"，遗像/堂号/名讳由调用方以 children 传入。
 * ③ **一律 `pointer-events-none`**：陈设不能挡住底下的献祭按钮。
 */

/** 陈设外框：所有构件都从这里派生（与 Structure3D 的 NODE 保持一致的定位语义） */
export const PROP_NODE = {
  position: "absolute" as const,
  left: "50%",
  bottom: 0,
  transformStyle: "preserve-3d" as const,
  pointerEvents: "none" as const,
};

/**
 * 把两点色做成一枚"圆柱体"的横向渐变。
 *
 * 为什么不用三色：陈设的材质主题由 `OrnamentSpec.color` 单个色值给，
 * 没有 `MaterialTheme` 的 TriTone（那是结构件的待遇）。
 * 于是用固定比例的明暗推导：受光面 34%、本色 62%、背光面 100%。
 * 这个比例与 `MATERIAL_RECIPES.lacquer` **保持一致** —— 否则同一根朱红柱子
 * 在结构层是"左亮"，在陈设里是"中亮"，用户会觉得柱子换了位置。
 */
export function roundShade(color: string): string {
  return `linear-gradient(90deg, rgba(0,0,0,.42) 0%, ${color} 34%, ${color} 62%, rgba(0,0,0,.5) 100%)`;
}

/** 同一色值的"提亮 / 压暗"（用 overlay 层而不是算 HSL，避免多字节不一致） */
export const BRIGHTEN = "linear-gradient(180deg, rgba(255,248,230,.30), transparent 62%)";
export const DARKEN = "linear-gradient(180deg, transparent 40%, rgba(0,0,0,.34))";

/**
 * 陈设的公共落影。
 *
 * 与结构件的 `boxShadow` 分工一致：`0 0 0 1px` 是**描边**（把物件从背景墙上抠出来），
 * `2px 3px` 是**落影**（把物件按在地上）。实测少了描边，深色陈设贴深色墙会"融"进去。
 */
export const PROP_SHADOW =
  "0 0 0 1px rgba(0,0,0,.40), 2px 3px 10px rgba(0,0,0,.42)";

/** 更轻的落影（小件 / 挂件用，避免满屏都是重影） */
export const PROP_SHADOW_LIGHT = "0 0 0 1px rgba(0,0,0,.30), 1px 2px 6px rgba(0,0,0,.32)";

/**
 * 一束"香烟 / 水汽"：用 `clip-path` 波浪 + 上淡下浓的渐变。
 *
 * 三层错开摆放（不同高度 / 不同透明度）就有"袅袅"的感觉 ——
 * 比动画更划算：动画在隧道环境下掉帧，静态错位在任何设备上都成立。
 */
export function Smoke({
  x,
  h,
  w,
  color = "rgba(220,220,215,.5)",
  skew = 0,
  delay = 0,
}: {
  x: number;
  h: number;
  w: number;
  color?: string;
  skew?: number;
  delay?: number;
}) {
  return (
    <div
      data-part="smoke"
      style={{
        position: "absolute",
        left: x,
        bottom: 0,
        width: w,
        height: h,
        transform: `skewX(${skew}deg)`,
        opacity: 1 - delay * 0.22,
        background: `linear-gradient(0deg, ${color}, transparent 82%)`,
        clipPath:
          "polygon(42% 100%, 58% 100%, 72% 74%, 56% 52%, 66% 28%, 50% 0%, 34% 28%, 44% 52%, 28% 74%)",
        filter: "blur(1.5px)",
      }}
    />
  );
}

/** 一缕流苏（灯笼 / 幡旗的下垂装饰） */
export function Tassel({
  x,
  h,
  w,
  color,
  alpha = 0.92,
}: {
  x: number;
  h: number;
  w: number;
  color: string;
  alpha?: number;
}) {
  return (
    <div
      data-part="tassel"
      style={{
        position: "absolute",
        left: x,
        bottom: 0,
        width: w,
        height: h,
        borderRadius: `0 0 ${w}px ${w}px`,
        background: `linear-gradient(180deg, ${color}, rgba(0,0,0,.45))`,
        opacity: alpha,
      }}
    />
  );
}

/** 地面的光斑 / 影斑（灯笼与香炉都要用它"落地"） */
export function GroundPool({
  containerW,
  widthUnit,
  color,
  opacity = 0.34,
}: {
  containerW: number;
  widthUnit: number;
  color: string;
  opacity?: number;
}) {
  const w = unitToPx(widthUnit, containerW);
  return (
    <div
      data-part="pool"
      style={{
        position: "absolute",
        left: "50%",
        bottom: 0,
        width: w,
        height: w * 0.22,
        marginLeft: -w / 2,
        borderRadius: "50%",
        background: `radial-gradient(ellipse, ${color}, transparent 72%)`,
        opacity,
        filter: "blur(2px)",
        transform: "rotateX(74deg)",
        transformOrigin: "center bottom",
      }}
    />
  );
}

/**
 * 描金细边（匾额 / 楹联 / 牌位都用）。
 *
 * 用 `box-shadow: inset 0 0 0 Npx` 而不是 `border` —— border 会撑开盒子、
 * 改变实测宽高，而断言恰好按宽高判"构件是否成形"（曾把栏杆量成 0 宽）。
 */
export function giltEdge(px: number, color = "rgba(212,175,55,.85)"): string {
  return `inset 0 0 0 ${px}px ${color}`;
}

/** 供部件共用的 flex 竖排容器（灯 / 幡 / 瓶 都是"从上往下摞"） */
export const stackColumn: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  position: "relative",
};
