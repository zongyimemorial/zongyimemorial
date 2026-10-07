"use client";

import type { CSSProperties } from "react";
import { unitToPx, type Prop3DSpec } from "@/lib/decor-3d";

/**
 * 一件陈设的渲染契约。
 *
 * ## 为什么要有 `Prop3DContext` 而不是每个 kind 自己算尺寸
 *
 * v1 里每个分支第一行都是 `const base = unitToPx(7 * p.scale, containerW)`。
 * 升级到 12 个新 kind 后，如果各自再算一遍，必然出现：
 *   - 有的按 `7 * scale`、有的按 `8 * scale` → 同一档位下大小不一；
 *   - 换个容器宽度，有的跟着变、有的写死 px → 响应式下错位。
 *
 * 所以基准尺寸只算一次，放进 context —— **"基准单位"是全局唯一的**。
 *
 * ## `detail` 从哪来
 *
 * 陈设不像结构件那样自带档位数组，它的精细度应当**跟着空间档位走**：
 * 免费空间（`basic`）里的灯笼不必画流苏；豪华空间（`imperial`）才给全套。
 * 这样"买了豪华模板，连灯笼都更精致"是自动成立的，不用逐个素材配置。
 */
export type Prop3DContext = {
  /** 基准尺寸（px）：`7 * scale` 换算后的像素值，所有部件按它取比例 */
  base: number;
  /** 容器宽度（px），需要按空间单位换算时用 */
  containerW: number;
  /** 精细度 0/1/2 —— 来自空间的 `structureTier`，控制层数 */
  detail: 0 | 1 | 2;
  /** 主色（取自 `OrnamentSpec.color`） */
  color: string;
  /** 文字（匾额 / 楹联 / 幡旗用） */
  text?: string;
  /** 件数（灯笼 / 石狮 / 牌位格数用） */
  count: number;
};

export type Prop3DRenderer = (ctx: Prop3DContext) => React.ReactNode;

/** 由 Prop3DSpec + 空间档位造出 context */
export function makeCtx(
  p: Prop3DSpec,
  containerW: number,
  detail: 0 | 1 | 2,
  fallbackColor = "#8a6a3e",
): Prop3DContext {
  return {
    base: unitToPx(7 * p.scale, containerW),
    containerW,
    detail,
    color: p.color ?? fallbackColor,
    text: p.text,
    count: Math.max(1, p.count ?? 1),
  };
}

/** 部件公共的竖排堆叠样式 */
export const COL: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  position: "relative",
};
