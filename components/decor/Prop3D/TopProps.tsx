"use client";

import { COL, type Prop3DContext } from "./types";
import {
  BRIGHTEN,
  DARKEN,
  GroundPool,
  PROP_SHADOW,
  PROP_SHADOW_LIGHT,
  Smoke,
  Tassel,
  roundShade,
} from "./parts";

/**
 * 顶部类挂件：灯笼 / 宫灯 / 藻井灯 / 光晕。
 *
 * ## 这三个 kind 以前是"同一盏灯换个颜色"
 *
 * v1 的 `lantern` 只有 4 层（挂钩 / 盖 / 椭圆身 / 流苏），
 * `orn-lantern-red`（¥2.2 的素灯笼）与 `orn-lantern-gold`（宫灯）
 * 渲染出来**只差一个 color**。用户花了 10 倍价钱买到"同一个形状换个色"，
 * 这就是"装修没效果"的具体形态。
 *
 * v2 把三者拆成**结构不同的物件**：
 *   - `lantern`（素灯笼，10 层）：六角纱灯，只有箍、纱面、一缕流苏 —— 朴素是对的；
 *   - `imperial-lantern`（宫灯，17 层）：雕花角柱 ×6、双层出檐、垂锦、五缕流苏、地面光斑；
 *   - `halo`（光晕，7 层）：不是灯，是**光** —— 同心光羽 + 中心亮点。
 *
 * 层数写进断言（`verify-decor-prop3d.mjs` §2），所以"把宫灯改回旧实现"会变红。
 */

/** 素灯笼：六角纱灯 + 上下箍 + 一缕流苏（10 层） */
export function Lantern({ base, detail, color }: Prop3DContext) {
  const w = base * 0.66;
  const bodyH = base * 0.72;
  return (
    <div style={{ ...COL, filter: `drop-shadow(0 6px 10px rgba(0,0,0,.34))` }}>
      {/* ① 吊绳 */}
      <div data-part="cord" style={{ width: 1.6, height: base * 0.3, background: "#3a2a18" }} />
      {/* ② 灯钩（金属小环） */}
      <div
        data-part="hook"
        style={{
          width: w * 0.3,
          height: w * 0.14,
          borderRadius: 999,
          background: "linear-gradient(180deg,#e8d8a8,#8a7440)",
          marginBottom: -1,
        }}
      />
      {/* ③ 上箍 */}
      <div
        data-part="cap-top"
        style={{
          width: w * 0.62,
          height: bodyH * 0.1,
          borderRadius: 2,
          background: "linear-gradient(180deg,#4a3618,#2a1e0e)",
        }}
      />
      {/* ④ 六角灯体：外框（六边形感由 border 半径 + 内缩做） */}
      <div
        data-part="body"
        style={{
          width: w,
          height: bodyH,
          position: "relative",
          borderRadius: "42% 42% 38% 38%",
          background: `radial-gradient(circle at 38% 32%, ${color}, ${color}bb 58%, ${color}77)`,
          border: `1.5px solid ${color}44`,
          overflow: "hidden",
        }}
      >
        {/* ⑤ 内透光（纱面透出的芯光） */}
        <div
          data-part="core"
          style={{
            position: "absolute",
            left: "50%",
            top: "46%",
            width: w * 0.3,
            height: bodyH * 0.36,
            marginLeft: -w * 0.15,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(255,246,220,.92), transparent 72%)`,
          }}
        />
        {/* ⑥ 竖向分瓣（六角灯的骨架影） */}
        <div
          data-part="rib"
          style={{
            position: "absolute",
            inset: 0,
            background: `repeating-linear-gradient(90deg, transparent 0 ${w / 6}px, rgba(0,0,0,.24) ${w / 6}px ${w / 6 + 1}px)`,
          }}
        />
        {/* ⑦ 顶面受光 */}
        <div data-part="gloss" style={{ position: "absolute", inset: 0, background: BRIGHTEN }} />
      </div>
      {/* ⑧ 下箍 */}
      <div
        data-part="cap-bottom"
        style={{
          width: w * 0.58,
          height: bodyH * 0.08,
          borderRadius: 2,
          background: "linear-gradient(180deg,#2a1e0e,#4a3618)",
        }}
      />
      {/* ⑨ 流苏一缕（detail≥1 才给，免费档就是一个素灯） */}
      {detail >= 1 && (
        <div style={{ ...COL, marginTop: 1 }}>
          <Tassel x={0} h={base * 0.26} w={2.2} color={color} />
          {/* ⑩ 流苏穗头 */}
          <div
            data-part="tassel-knot"
            style={{ width: w * 0.16, height: w * 0.16, borderRadius: "50%", background: color, marginTop: -1 }}
          />
        </div>
      )}
      {/* 地面光斑：detail≥2（豪华空间才给，避免免费档"满地光斑"显廉价） */}
      {detail >= 2 && (
        <div style={{ position: "absolute", bottom: -base * 1.5, left: 0 }}>
          <GroundPool containerW={base * 14} widthUnit={9} color={`${color}66`} opacity={0.5} />
        </div>
      )}
    </div>
  );
}

/**
 * 宫灯：六角雕花 + 双层出檐 + 垂锦 + 五缕流苏（17 层）。
 *
 * 与 `lantern` 的差别必须**一眼可辨**：出檐是它最标志性的特征
 * （素灯笼是"圆球"，宫灯是"有屋檐的灯"）。
 */
export function ImperialLantern({ base, color }: Prop3DContext) {
  const w = base * 0.84;
  const bodyH = base * 0.78;
  const tassels = [0.32, 0.16, 0, -0.16, -0.32];
  return (
    <div style={{ ...COL, filter: `drop-shadow(0 8px 14px rgba(0,0,0,.40))` }}>
      {/* ① 吊绳 */}
      <div data-part="cord" style={{ width: 2, height: base * 0.34, background: "#3a2a18" }} />
      {/* ② 宝顶（金球） */}
      <div
        data-part="finial"
        style={{
          width: w * 0.2,
          height: w * 0.2,
          borderRadius: "50%",
          background: "radial-gradient(circle at 34% 30%, #fff3c4, #d4af37 58%, #8a6a18)",
          marginBottom: -2,
        }}
      />
      {/* ③ 上层出檐（宫灯的"屋檐"） */}
      <div
        data-part="eave-top"
        style={{
          width: w * 0.72,
          height: base * 0.12,
          clipPath: "polygon(14% 0%, 86% 0%, 100% 100%, 0% 100%)",
          background: "linear-gradient(180deg,#c9a961,#7a5a24)",
        }}
      />
      {/* ④ 上层檐口描金线 */}
      <div
        data-part="eave-line"
        style={{ width: w * 0.72, height: 1.5, background: "rgba(255,235,170,.75)" }}
      />
      {/* ⑤ 下层出檐（更宽，形成"重檐"） */}
      <div
        data-part="eave-bottom"
        style={{
          width: w,
          height: base * 0.12,
          clipPath: "polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)",
          background: "linear-gradient(180deg,#b08a3c,#5e4418)",
          marginTop: -1,
        }}
      />
      {/* ⑥ 六角灯体 */}
      <div
        data-part="body"
        style={{
          width: w * 0.82,
          height: bodyH,
          position: "relative",
          marginTop: -1,
          background: `linear-gradient(180deg, ${color}ee, ${color}99 60%, ${color}cc)`,
          border: `1.5px solid rgba(212,175,55,.7)`,
          borderRadius: "18% 18% 14% 14%",
          overflow: "hidden",
        }}
      >
        {/* ⑦ 角柱 ×6（雕花骨架） */}
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            data-part="corner-post"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${(i / 4) * 100}%`,
              width: 1.4,
              background: "rgba(212,175,55,.62)",
            }}
          />
        ))}
        {/* ⑧ 上下雕花带 */}
        <div
          data-part="carve-top"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: "16%",
            background:
              "repeating-linear-gradient(90deg, rgba(212,175,55,.55) 0 3px, transparent 3px 9px)",
          }}
        />
        {/* ⑨ 下雕花带 */}
        <div
          data-part="carve-bottom"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "14%",
            background:
              "repeating-linear-gradient(90deg, rgba(212,175,55,.48) 0 3px, transparent 3px 9px)",
          }}
        />
        {/* ⑩ 内透光 */}
        <div
          data-part="core"
          style={{
            position: "absolute",
            left: "50%",
            top: "48%",
            width: "48%",
            height: "46%",
            transform: "translate(-50%,-50%)",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,248,222,.95), transparent 74%)",
          }}
        />
        {/* ⑪ 釉面高光 */}
        <div data-part="gloss" style={{ position: "absolute", inset: 0, background: BRIGHTEN }} />
        {/* ⑫ 底部压暗（体积感） */}
        <div data-part="shade" style={{ position: "absolute", inset: 0, background: DARKEN }} />
      </div>
      {/* ⑬ 垂锦（下沿一圈织锦边） */}
      <div
        data-part="drape"
        style={{
          width: w * 0.86,
          height: base * 0.1,
          marginTop: -1,
          background:
            "repeating-linear-gradient(45deg, rgba(255,215,140,.55) 0 4px, rgba(120,60,40,.85) 4px 8px)",
          borderBottom: "1px solid rgba(212,175,55,.7)",
        }}
      />
      {/* ⑭⑮⑯⑰ 五缕流苏 */}
      <div style={{ ...COL, width: w * 0.9, height: base * 0.34, position: "relative", marginTop: 0 }}>
        {tassels.map((t, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `calc(50% + ${t * w * 0.9}px)`,
              bottom: 0,
              transform: "translateX(-50%)",
            }}
          >
            <Tassel x={0} h={base * 0.34 - Math.abs(t) * base * 0.14} w={2.4} color="#c9a961" alpha={0.9} />
          </div>
        ))}
      </div>
      <GroundPool containerW={base * 20} widthUnit={13} color="rgba(255,226,150,.5)" opacity={0.42} />
    </div>
  );
}

/** 光晕：不是灯，是光 —— 同心明暗环 + 放射光羽（7 层） */
export function Halo({ base, color, detail }: Prop3DContext) {
  const s = base * 0.72;
  return (
    <div style={{ ...COL, position: "relative", width: s, height: s }}>
      {/* ① 外层弥散 */}
      <div
        data-part="halo-outer"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(circle, transparent 42%, ${color}33 62%, transparent 82%)`,
          filter: "blur(2px)",
        }}
      />
      {/* ② 中层光环 */}
      <div
        data-part="halo-mid"
        style={{
          position: "absolute",
          inset: "16%",
          borderRadius: "50%",
          border: `1.5px solid ${color}66`,
          boxShadow: `0 0 ${s * 0.2}px ${color}55`,
        }}
      />
      {/* ③ 内层辉光 */}
      <div
        data-part="halo-core"
        style={{
          position: "absolute",
          inset: "30%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color}, transparent 76%)`,
        }}
      />
      {/* ④ 中心亮点 */}
      <div
        data-part="halo-spark"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: s * 0.14,
          height: s * 0.14,
          marginLeft: -s * 0.07,
          marginTop: -s * 0.07,
          borderRadius: "50%",
          background: "radial-gradient(circle, #fffdf2, transparent 70%)",
          mixBlendMode: "screen",
        }}
      />
      {/* ⑤⑥ 放射光羽（detail≥1）*/}
      {detail >= 1 && (
        <>
          <div
            data-part="halo-ray"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: `repeating-conic-gradient(from 0deg, ${color}44 0deg 4deg, transparent 4deg 22deg)`,
              mixBlendMode: "screen",
              opacity: 0.7,
              maskImage: "radial-gradient(circle, transparent 34%, #000 52%, transparent 78%)",
              WebkitMaskImage: "radial-gradient(circle, transparent 34%, #000 52%, transparent 78%)",
            }}
          />
          <div
            data-part="halo-ray"
            style={{
              position: "absolute",
              inset: "8%",
              borderRadius: "50%",
              background: `repeating-conic-gradient(from 11deg, ${color}33 0deg 3deg, transparent 3deg 26deg)`,
              mixBlendMode: "screen",
              opacity: 0.55,
            }}
          />
        </>
      )}
      {/* ⑦ 竖向柔光（拉长感，避免"一个圆饼"） */}
      <div
        data-part="halo-veil"
        style={{
          position: "absolute",
          left: "-14%",
          right: "-14%",
          top: "6%",
          bottom: "-10%",
          background: `radial-gradient(ellipse at 50% 40%, ${color}44, transparent 70%)`,
          filter: "blur(5px)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/** 藻井灯：悬在藻井中心的宫灯（结构自带，独立 kind 便于断言） */
export function CaissonLight({ base, color }: Prop3DContext) {
  const w = base * 0.5;
  return (
    <div style={{ ...COL, filter: "drop-shadow(0 6px 12px rgba(0,0,0,.42))" }}>
      <div data-part="cord" style={{ width: 1.6, height: base * 0.22, background: "#3a2a18" }} />
      <div
        data-part="ring"
        style={{ width: w * 0.7, height: base * 0.06, borderRadius: 999, background: "#c9a961" }}
      />
      <div
        data-part="bowl"
        style={{
          width: w,
          height: w * 0.62,
          clipPath: "polygon(18% 0%, 82% 0%, 100% 100%, 0% 100%)",
          background: `linear-gradient(180deg, ${color}, ${color}88)`,
          borderTop: "1px solid rgba(255,240,200,.6)",
        }}
      />
      <div
        data-part="glow"
        style={{
          width: w * 1.7,
          height: w * 0.8,
          marginTop: -w * 0.2,
          background: `radial-gradient(ellipse at 50% 0%, rgba(255,244,206,.85), transparent 72%)`,
          filter: "blur(3px)",
        }}
      />
      <div
        data-part="wick"
        style={{ width: 2, height: base * 0.1, background: "#f7e6a8", marginTop: -w * 0.5 }}
      />
    </div>
  );
}

/** 香烟（香炉上方三缕）—— 供 incense-burner 复用，单独导出便于断言计数 */
export function SmokeColumn({ base }: Prop3DContext) {
  return (
    <div style={{ ...COL, width: base * 0.8, height: base * 0.9, position: "relative" }}>
      <Smoke x={base * 0.2} h={base * 0.8} w={base * 0.14} skew={-8} delay={0} />
      <Smoke x={base * 0.38} h={base * 0.9} w={base * 0.14} skew={4} delay={0.5} />
      <Smoke x={base * 0.54} h={base * 0.72} w={base * 0.12} skew={10} delay={1} />
    </div>
  );
}

export { PROP_SHADOW, PROP_SHADOW_LIGHT, roundShade };
