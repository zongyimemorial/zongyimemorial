"use client";

import { aoBand, shaftStyle, spaceTint, unitToPx, type LightRig, type Space3D } from "@/lib/decor-3d";

/**
 * 光影层：v1 只有「一层 multiply 色罩 + 一层 radial 辉光」，一共两层。
 *
 * v2 把它扩成**六层**，因为"豪华感"在 3D 里几乎全部由光决定 ——
 * 结构只是骨架，光才是质感。这也是为什么"付费档观感更好"必须体现在光上：
 * 免费档只有环境光（1 层），豪华档有方向光 + 投影 + 光柱 + 雾 + AO + 高光（6 层）。
 *
 * ## 六层从下到上的顺序（**顺序不能换**）
 *
 *   ① 方向光塑形 —— 用径向渐变模拟来自 `light.key` 的照射
 *   ② 投影       —— 结构件落在地面的影子（在**世界层内**，随视角转动）
 *   ③ 体积光     —— 光柱（`mixBlendMode: screen`，是"发光"不是"遮挡"）
 *   ④ 景深雾     —— 远处压雾（`normal` 混合，是"遮挡"不是"发光"）
 *   ⑤ 环境遮蔽   —— 墙根/柱脚/台基下沿的暗带（"物体接地"的关键）
 *   ⑥ 高光       —— 只在 `detail = 2`（豪华档）出现
 *   ⑦ 色罩       —— 最后压一层 multiply 统一色调
 *
 * ③ 与 ④ 的混合模式**必须是 screen 与 normal**，不能都用 screen：
 * 雾用 screen 会变成"发光的雾"，整个空间像蒙了一层白纱，纵深反而没了。
 *
 * ## 为什么投影在世界层内、其余在容器层
 *
 * 投影属于"物体的影子"，它必须跟着视角一起转（否则拖拽时影子不动 = 一眼假）。
 * 而光柱/雾/AO/高光是**镜头前的效果**，它们不该随视角转动。所以：
 *   - 投影 → 由 `Decor3DScene` 在世界层内渲染（本文件导出 `GroundShadow`）
 *   - 其余 → 本组件渲染在透视容器之外
 */

// ---------------------------------------------------------------------------
// 世界层内的部件（随视角转动）
// ---------------------------------------------------------------------------

/**
 * 地面投影。挂在每个结构/陈设脚下。
 *
 * `rotateX(78deg)` 把它平铺到地上，与地面同一套透视；
 * `filter: blur()` 的半径随 `ao` 增大（光越"硬"，影子边缘越锐）。
 */
export function GroundShadow({
  x,
  z = 0,
  containerW,
  widthUnit = 8,
  ao = 0.2,
}: {
  x: number;
  z?: number;
  containerW: number;
  /** 影子横向尺寸（空间单位） */
  widthUnit?: number;
  ao?: number;
}) {
  const w = unitToPx(widthUnit, containerW);
  const px = unitToPx(x, containerW);
  const pz = unitToPx(z, containerW);
  return (
    <div
      data-shadow="1"
      style={{
        position: "absolute",
        left: "50%",
        bottom: 0,
        width: w,
        height: unitToPx(3.4, containerW),
        marginLeft: -w / 2,
        transform: `translate3d(${px}px, 0, ${pz}px) rotateX(78deg) scale(1.2)`,
        transformOrigin: "center bottom",
        background:
          "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,.48) 0%, rgba(0,0,0,.22) 45%, transparent 72%)",
        filter: `blur(${2 + ao * 4}px)`,
        pointerEvents: "none",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// 镜头前的光效层
// ---------------------------------------------------------------------------

export type LightLayerProps = {
  space: Space3D;
  containerW: number;
  /** 档位细节：0/1/2 —— 决定投影/AO/高光/光柱画不画 */
  detail: 0 | 1 | 2;
};

/**
 * 方向光塑形的径向渐变。
 *
 * 不同 `key` 对应光从不同方向来，用不同位置的径向渐变表达：
 *   - top：从顶部正中打下来（最常见，也最"殿堂"）
 *   - front：从正前方打（人站在门外看进去的感觉）
 *   - left/right：侧面光，明暗对比最强，最"戏剧化"
 *   - ambient：无方向，整体轻微提亮
 */
function shapeGradient(rig: LightRig): string {
  const i = rig.intensity;
  switch (rig.key) {
    case "top":
      return `radial-gradient(ellipse 72% 42% at 50% 0%, rgba(255,246,220,${0.34 * i}), transparent 72%)`;
    case "front":
      return `radial-gradient(circle at 50% 46%, rgba(255,250,235,${0.3 * i}), transparent 64%)`;
    case "left":
      return `radial-gradient(ellipse 60% 70% at 8% 42%, rgba(255,246,220,${0.32 * i}), transparent 70%)`;
    case "right":
      return `radial-gradient(ellipse 60% 70% at 92% 42%, rgba(255,246,220,${0.32 * i}), transparent 70%)`;
    default:
      return `radial-gradient(ellipse 90% 70% at 50% 34%, rgba(255,250,240,${0.16 * i}), transparent 78%)`;
  }
}

/** 色温 → 光柱的颜色（暖光偏黄、月光偏青白） */
function shaftTint(rig: LightRig): string {
  if (rig.temperature === "moonlight") return "196,214,255";
  if (rig.temperature === "cool") return "224,236,255";
  if (rig.temperature === "warm") return "255,238,196";
  return "255,246,224";
}

/**
 * 光影层（镜头前）。
 *
 * ⚠️ **全部 `pointer-events-none`**。这些层盖在场景之上，
 * 若吃掉了鼠标事件，拖拽环视就会在"有光柱的地方失灵" ——
 * 用户会觉得"这地方拖不动"，却看不出原因。
 */
export default function LightLayer({ space, containerW, detail }: LightLayerProps) {
  const rig = space.light;
  const tint = spaceTint(space);
  const ao = aoBand(rig.ao, containerW);
  const shaft = detail >= 1 ? shaftStyle(rig) : null;
  const rgb = shaftTint(rig);

  return (
    <div
      data-light-layer="1"
      data-light-key={rig.key}
      data-light-temp={rig.temperature}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      {/* ① 方向光塑形 */}
      <div style={{ position: "absolute", inset: 0, background: shapeGradient(rig) }} />

      {/* ③ 体积光（光柱）：content 用重复的窄条，个数 = shafts.count */}
      {shaft && rig.shafts && (
        <div
          data-light-shafts={rig.shafts.count}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "space-evenly",
            opacity: 0.9,
          }}
        >
          {Array.from({ length: rig.shafts.count }).map((_, i) => (
            <div
              key={i}
              style={{
                width: "14%",
                height: "100%",
                transform: `rotate(${(i - (rig.shafts!.count - 1) / 2) * 2.4}deg)`,
                background: `linear-gradient(${rig.shafts!.angle}deg, transparent 0%, rgba(${rgb},${0.17 * rig.shafts!.opacity}) 46%, rgba(${rgb},${0.08 * rig.shafts!.opacity}) 58%, transparent 100%)`,
                filter: "blur(6px)",
                mixBlendMode: "screen",
              }}
            />
          ))}
        </div>
      )}

      {/* ④ 景深雾：**normal 混合**（是遮挡不是发光，用 screen 会变成发光的雾） */}
      {rig.fog.density > 0 && (
        <div
          data-light-fog={rig.fog.density.toFixed(2)}
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, transparent 38%, ${rig.fog.color} 100%)`,
            opacity: rig.fog.density * 0.5,
          }}
        />
      )}

      {/* ⑤ 环境遮蔽：上（檐下）与下（墙根）两条暗带 */}
      {ao.opacity > 0 && (
        <>
          <div
            data-light-ao="top"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: ao.width * 1.6,
              background: "linear-gradient(180deg, rgba(0,0,0,.55), transparent)",
              opacity: ao.opacity,
              filter: "blur(8px)",
            }}
          />
          <div
            data-light-ao="bottom"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: ao.width * 0.9,
              background: "linear-gradient(0deg, rgba(0,0,0,.6), transparent)",
              opacity: ao.opacity,
              filter: "blur(8px)",
            }}
          />
          {/* 左右墙根的竖向暗带（detail≥1）。没有它，转视角时两侧墙会"飘" */}
          {detail >= 1 && (
            <>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: ao.width * 1.2,
                  background: "linear-gradient(90deg, rgba(0,0,0,.5), transparent)",
                  opacity: ao.opacity,
                  filter: "blur(8px)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: ao.width * 1.2,
                  background: "linear-gradient(270deg, rgba(0,0,0,.5), transparent)",
                  opacity: ao.opacity,
                  filter: "blur(8px)",
                }}
              />
            </>
          )}
        </>
      )}

      {/* ⑥ 高光（仅豪华档 detail=2）：一道自光方向扫过的柔光 */}
      {detail >= 2 && (
        <div
          data-light-specular="1"
          style={{
            position: "absolute",
            inset: 0,
            background:
              rig.key === "right"
                ? "linear-gradient(255deg, transparent 30%, rgba(255,255,255,.16) 52%, transparent 68%)"
                : rig.key === "left"
                  ? "linear-gradient(105deg, transparent 30%, rgba(255,255,255,.16) 52%, transparent 68%)"
                  : "linear-gradient(180deg, rgba(255,255,255,.14) 0%, transparent 34%)",
            mixBlendMode: "screen",
          }}
        />
      )}

      {/* ⑦ 色罩：v1 的 ambient.tint 语义，最后压一层统一色调 */}
      {tint.opacity > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: tint.color,
            opacity: tint.opacity,
            mixBlendMode: "multiply",
          }}
        />
      )}
    </div>
  );
}
