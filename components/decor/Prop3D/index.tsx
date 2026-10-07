"use client";

import type { CSSProperties } from "react";
import { propTransform, type Prop3DSpec } from "@/lib/decor-3d";
import { PROP_NODE, PROP_SHADOW_LIGHT } from "./parts";
import { makeCtx, COL, type Prop3DRenderer } from "./types";
import { CaissonLight, Halo, ImperialLantern, Lantern } from "./TopProps";
import {
  AltarTable,
  Candlestick,
  IncenseBurner,
  IncenseTable,
  Shelf,
  Vase,
} from "./AltarProps";
import {
  Banner,
  CoupletPillar,
  NicheWall,
  Plaque,
  Screen,
  ScreenWall,
  ScrollPainting,
  StoneLion,
  TabletWall,
} from "./ArchProps";
import { Curtain, Flower, PlaquePair } from "./MiscProps";

/**
 * `kind → 渲染器` 的**唯一**分发表。
 *
 * ## 为什么要有这张表，而不是一长串 `if (p.kind === ...)`
 *
 * v1 的 `Prop3D` 是一串 `if`，扩 kind 靠"在末尾再补一段"。
 * 三个问题：
 *   ① 没有清单可查 —— 想知道"一共支持几种 kind"只能全文搜 `if (p.kind ===`；
 *   ② 兜底件会在**漏写分支**时静默生效（画个灰方块），没有任何提示；
 *   ③ 2D 层（`HallDecorLayer` / `ClanDecorLayer`）另有一套 `switch`，
 *      两边不同步时，用户会发现"工坊预览有、馆页上没有"（或反过来）。
 *
 * 改成表之后：**表就是清单**，断言可以对着 `PROP_KINDS` 逐个点验；
 * `assertKindCovered()` 在开发期对未知 kind 抛错，不再静默画灰块。
 *
 * ## 与 2D 层的关系
 *
 * 这张表只服务 3D 场景。2D 层（`HallDecorLayer.Ornament` / `ClanOrnament`）
 * 仍是 `switch` —— 那是**页面上的实际观感**（带真实 SVG 构件），
 * 与 3D 预览是两套渲染，故意不共用（3D 要能进 preserve-3d，SVG 不能）。
 * 但**两边的 kind 集合必须一致**：`verify-decor-prop3d.mjs` 会核对
 * `PROP_KINDS` 与两个 2D 层的分支集合（漏一处就是"某个 kind 在某一端不渲染"）。
 */

// ---------------------------------------------------------------------------
// 旧 12 kind（升级后的实现）
// ---------------------------------------------------------------------------
const RENDERERS: Record<string, Prop3DRenderer> = {
  lantern: Lantern,
  "imperial-lantern": ImperialLantern,
  "caisson-light": CaissonLight,
  halo: Halo,
  "incense-burner": IncenseBurner,
  incense: IncenseBurner, // 旧别名，素材里历史的 kind 值
  shelf: Shelf,
  "altar-table": AltarTable,
  "incense-table": IncenseTable,
  vase: Vase,
  flower: Flower,
  candlestick: Candlestick,
  "couplet-pillar": CoupletPillar,
  plaque: Plaque,
  "plaque-pair": PlaquePair,
  banner: Banner,
  "banner-pair": Banner, // 宗祠侧把 banner-pair 走同一渲染器
  "stone-lion": StoneLion,
  "scroll-painting": ScrollPainting,
  screen: Screen,
  "screen-wall": ScreenWall,
  curtain: Curtain,
  "niche-wall": NicheWall,
  "tablet-wall": TabletWall,
};

/**
 * 全部支持的 kind（供断言与"两边是否同步"核对）。
 *
 * 顺序无意义，但**必须包含所有 2D 层也会遇到的 kind**；
 * 新增 kind 时这里漏写 → 3D 会落到兜底件，而 `assertKindCovered` 会在
 * 开发环境把它报出来。
 */
export const PROP_KINDS = Object.keys(RENDERERS);

/** 兜底件：未知 kind 的小方块。**保持存在**，但开发环境会告警。 */
function Fallback({ base, color }: { base: number; color: string }) {
  return (
    <div
      data-part="fallback"
      style={{
        width: base * 0.3,
        height: base * 0.3,
        borderRadius: 2,
        marginLeft: -base * 0.15,
        background: color,
        boxShadow: PROP_SHADOW_LIGHT,
      }}
    />
  );
}

/**
 * 未登记的 kind 在**开发环境**直接抛错。
 *
 * 为什么值得为它写一个函数：静默兜底是本项目最贵的一类 bug
 * （"付费买了东西但什么都没渲染"，页面不报错、断言也可能不覆盖）。
 * 生产环境仍走兜底（不让整个场景因一件挂饰崩掉），开发环境抛错。
 */
function assertKindCovered(kind: string) {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    if (!RENDERERS[kind]) {
      throw new Error(
        `Prop3D: 未登记的挂饰 kind "${kind}"。` +
          `请在 components/decor/Prop3D/index.tsx 的 RENDERERS 里补上渲染器，` +
          `并同步 lib/hall-decor.ts / lib/clan-decor.ts 的联合类型、` +
          `components/hall/HallDecorLayer.tsx / components/clan/ClanDecorLayer.tsx 的 2D 分支。`,
      );
    }
  }
}

export type Prop3DProps = {
  p: Prop3DSpec;
  containerW: number;
  /** 精细度：来自空间结构档位（0 basic / 1 grand / 2 imperial） */
  detail: 0 | 1 | 2;
  /**
   * 布局编辑（公页馆主拖拽）下的手势与视觉。
   * ⚠️ 零回归硬约束：非编辑态（drag 为空）时**不挂任何事件、不加任何样式**，
   *    DOM 属性与改造前逐字节一致（访客看到的世界必须一模一样）。
   */
  drag?: {
    editable: boolean;
    /** 正在被拖的件 id（决定 grabbing 光标） */
    activeId?: string;
    onDown: (e: React.PointerEvent, p: Prop3DSpec) => void;
    onMove: (e: React.PointerEvent) => void;
    onUp: (e: React.PointerEvent) => void;
  };
};

/**
 * 一件陈设：按 `p.kind` 选渲染器，摆到 3D 空间里。
 *
 * ⚠️ 外层必须是**唯一**参与 `propTransform` 的节点。
 *    渲染器内部的一切都相对它定位 —— 若渲染器自己再 translate，
 *    位置就会"双重施加"（v1 的 tablet-wall 踩过：墙冲出画框）。
 */
export function Prop3D({ p, containerW, detail, drag }: Prop3DProps) {
  assertKindCovered(p.kind);
  const Renderer = RENDERERS[p.kind] ?? Fallback;
  const ctx = makeCtx(p, containerW, detail);

  const outer: CSSProperties = {
    ...PROP_NODE,
    transform: propTransform(p, containerW),
    transformOrigin: "center bottom",
    /*
      编辑态才接管指针：PROP_NODE 默认 pointerEvents:none（点击穿透到容器做环视），
      拖拽必须覆盖成 auto。touchAction:none 防触屏滚动抢手势。
      描边用 dashed 金色 —— 让"这件可以拖"一眼可见（3D 变换会带着 outline 一起转，正好）。
    */
    ...(drag?.editable
      ? {
          pointerEvents: "auto" as const,
          touchAction: "none" as const,
          cursor: drag.activeId === p.id ? "grabbing" : "grab",
          outline: "2px dashed rgba(212,175,55,0.85)",
          outlineOffset: "4px",
          borderRadius: "4px",
        }
      : {}),
  };

  return (
    <div
      data-prop={p.kind}
      data-prop-id={p.id}
      data-prop-layer={p.kind}
      data-editing={drag?.editable ? "1" : undefined}
      style={outer}
      onPointerDown={drag?.editable ? (e) => drag.onDown(e, p) : undefined}
      onPointerMove={drag?.editable ? (e) => drag.onMove(e) : undefined}
      onPointerUp={drag?.editable ? (e) => drag.onUp(e) : undefined}
    >
      <Renderer {...ctx} />
    </div>
  );
}

export default Prop3D;
export { COL };
