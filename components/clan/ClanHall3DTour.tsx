"use client";

import { useEffect, useRef } from "react";
import {
  SceneGate,
  SceneCourtyard,
  SceneMainHall,
  SceneShrine,
  type ClanAltarGlyph,
} from "@/components/clan/ClanHallScene";

/**
 * 宗祠「四段 3D 漫游」连廊（公页标配，免费/付费都渲染）
 *
 * 把山门 → 天井 → 享堂 → 寝堂四段，排进**同一透视舞台**的 Z 轴纵深：
 * 近大远小、鼠标移动整体环视，读起来就是"沿着中轴走进祠堂"。
 *
 * 做法（与纪念馆 Hall3DStage 同量级，纯 CSS-3D，零外部资源）：
 *  - 外层 `perspective`；内层 `preserve-3d` 舞台组。
 *  - 每段是一个 `translateZ` 纵深面，且宽度逐级收窄 → 同心嵌套的"殿庭轴"。
 *  - 鼠标 `pointermove` 经 rAF 写 `--rx/--ry`（rotateX/Y）+ 同步平移
 *    `perspective-origin`，实现环视。
 *  - `prefers-reduced-motion` 下关闭旋转与视差（静态正视）。
 *
 * 四段场景**直接复用** `ClanHallScene` 的现有组件（其内部 SVG/HTML 不动），
 * 保证「牌位墙/香案/遗像/匾额 HTML」等几何与断言零回归。
 */

type TourProps = {
  hallName: string;
  surname: string;
  ancestorTitle?: string | null;
  plaqueText?: string;
  ancestorName?: string | null;
  /** 先祖遗像（传入则寝堂中间让位出遗像龛） */
  portrait?: string | null;
  /** 供台陈列（祭品 glyph） */
  altarGlyphs?: ClanAltarGlyph[];
  className?: string;
};

/*
  四段的排布不是同心圆，而是「立体庙宇立轴」：山门在前居下，天井/享堂/寝堂
  依次升高、收窄、没入暖光深处（近大远小 + 层叠檐脊）。

  top 是**布局位置**，浏览器会按透视把深远段向灭点（perspective-origin 44%）
  收拢 —— 数值按 896×840 舞台、s=1500/(1500+z) 的投影公式反推：
    渲染中心 = VP + (布局中心 - VP) × s
  例：寝堂 top=-1.5%（布局中心 -13px）经 s=0.733 收拢后落在 y≈90，
  牌位墙与遗像正好完整落在山门檐脊之上的天空带里。

  haze：越远越蒙上一层暖色暮霭（大气透视），也让遗像所在的最深处不抢戏。
*/
const BAYS = [
  { key: "gate", z: 0, width: "68%", top: "70.5%", haze: 0, label: "山门" },
  { key: "courtyard", z: -180, width: "62%", top: "49%", haze: 0.15, label: "天井" },
  { key: "mainhall", z: -360, width: "56%", top: "26.5%", haze: 0.28, label: "享堂" },
  { key: "shrine", z: -540, width: "50%", top: "-1.5%", haze: 0.32, label: "寝堂" },
] as const;

export default function ClanHall3DTour({
  hallName,
  surname,
  ancestorTitle,
  plaqueText,
  ancestorName,
  portrait,
  altarGlyphs = [],
  className = "",
}: TourProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const groupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const group = groupRef.current;
    if (!stage || !group) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5; // [-0.5, 0.5]
      const ny = (e.clientY - r.top) / r.height - 0.5;
      tx = -ny * 5; // rotateX
      ty = nx * 9; // rotateY
      cx = 50 + nx * 18; // perspective-origin X
      cy = 44 + ny * 12; // perspective-origin Y
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const apply = () => {
      raf = 0;
      group.style.setProperty("--rx", `${tx.toFixed(2)}deg`);
      group.style.setProperty("--ry", `${ty.toFixed(2)}deg`);
      stage.style.perspectiveOrigin = `${cx.toFixed(1)}% ${cy.toFixed(1)}%`;
    };
    const onLeave = () => {
      tx = ty = 0;
      cx = 50;
      cy = 45;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      data-clan-tour="1"
      className={`relative w-full select-none overflow-hidden rounded-2xl border border-amber-900/20 bg-gradient-to-b from-[#2c231a] via-[#241c15] to-[#1a140e] ${className}`}
      style={{
        perspective: "1500px",
        perspectiveOrigin: "50% 44%",
        minHeight: "clamp(640px, 88vh, 840px)",
        boxShadow:
          "inset 0 2px 30px rgba(0,0,0,.5), 0 18px 50px rgba(20,12,4,.45)",
      }}
    >
      {/* 暖金光晕：从祠堂深处打出的主光 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 70% at 50% 78%, rgba(255,206,128,.20), rgba(255,206,128,0) 60%)",
        }}
      />

      <div
        ref={groupRef}
        className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          transform: "rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))",
          transition: "transform .12s ease-out",
          willChange: "transform",
        }}
      >
        {BAYS.map((bay) => (
          <div
            key={bay.key}
            className="absolute left-1/2"
            style={{
              width: bay.width,
              top: bay.top,
              transform: "translate(-50%,-50%)",
              transformStyle: "preserve-3d",
            }}
          >
            <div className="relative" style={{ transform: `translateZ(${bay.z}px)`, transformStyle: "preserve-3d" }}>
              {/* 轴线标注：竖排小字，像建筑图上的进深编号 */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-0 top-1 z-20 rounded bg-black/35 px-1.5 py-1 text-[10px] leading-none tracking-[0.3em] text-amber-100/60"
                style={{ writingMode: "vertical-rl" }}
              >
                {bay.label}
              </div>

              <BayContent
                kind={bay.key}
                hallName={hallName}
                surname={surname}
                ancestorTitle={ancestorTitle}
                plaqueText={plaqueText}
                ancestorName={ancestorName}
                portrait={portrait}
                altarGlyphs={altarGlyphs}
              />

              {/* 暮霭：越深远越蒙一层暖色，读成"祠堂深处"的大气透视 */}
              {bay.haze > 0 && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-10"
                  style={{
                    background: `rgba(26,19,11,${bay.haze})`,
                    borderRadius: 10,
                  }}
                />
              )}

              {/* 地面投影：只给最前段的山门，让整座建筑"落"在台基上；
                  深远段被前段遮挡，影子悬空反而穿帮 */}
              {bay.key === "gate" && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                  style={{
                    bottom: "-3%",
                    width: "120%",
                    height: "16%",
                    background:
                      "radial-gradient(ellipse at center, rgba(0,0,0,.45), rgba(0,0,0,0) 70%)",
                    filter: "blur(6px)",
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 操作提示：放在底部（顶部是寝堂牌位墙，别压在遗像上） */}
      <div
        className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[11px] tracking-wider text-amber-100/90 backdrop-blur"
        style={{ writingMode: "horizontal-tb" }}
      >
        移动鼠标 · 环视整座祠堂
      </div>
    </div>
  );
}

function BayContent({
  kind,
  hallName,
  surname,
  ancestorTitle,
  plaqueText,
  ancestorName,
  portrait,
  altarGlyphs,
}: {
  kind: string;
  hallName: string;
  surname: string;
  ancestorTitle?: string | null;
  plaqueText?: string;
  ancestorName?: string | null;
  portrait?: string | null;
  altarGlyphs: ClanAltarGlyph[];
}) {
  switch (kind) {
    case "gate":
      return (
        <SceneGate
          hallName={hallName}
          surname={surname}
          ancestorTitle={ancestorTitle}
          sky={false}
        />
      );
    case "courtyard":
      return (
        <SceneCourtyard banners={[surname.slice(0, 1) || "祖", "宗"]} />
      );
    case "mainhall":
      return <SceneMainHall plaqueText={plaqueText ?? "祖德流芳"} />;
    case "shrine":
      return (
        <SceneShrine
          altarItems={altarGlyphs}
          portrait={portrait ?? undefined}
          deceasedName={ancestorName ?? undefined}
        />
      );
    default:
      return null;
  }
}
