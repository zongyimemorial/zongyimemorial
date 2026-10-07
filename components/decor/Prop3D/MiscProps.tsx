"use client";

import { COL, type Prop3DContext } from "./types";
import { PROP_SHADOW_LIGHT, roundShade } from "./parts";
import { CoupletPillar, Plaque } from "./ArchProps";

/**
 * `plaque-pair`（匾额联）与 `curtain`（幔帐）+ 兜底件。
 *
 * ## `plaque-pair` 为什么值得单独一个 kind
 *
 * "堂上悬匾"与"堂上悬匾 + 一对楹联"是**两个价位段**的东西：
 * 前者是普通家的堂屋，后者是祠堂正厅的规制。
 * 但若让用户自己买两件（`orn-plaque` + `orn-pillar`）拼，
 * 就会出现"匾挂在中间、楹联却贴到侧墙上"的**位置错乱** ——
 * 楹联本该在匾的两侧、同一面墙上。
 *
 * 所以整组一个 kind：位置由渲染层**成组给定**，用户买到的是一套"堂上规制"。
 */

/**
 * 匾额联：中间一块匾 + 两侧一对楹联（豪华档堂上）。
 *
 * ⚠️ 这是一件 prop 画出三个物件，**三者的横向位置必须由本组件内部锁定**，
 *    不能由 `propsFromDecor` 摊成 3 个独立 prop ——
 *    那样一旦有任何一个被"位置微调"逻辑影响，联就会从匾旁边跑开。
 */
export function PlaquePair({ base, color, text, detail }: Prop3DContext) {
  /*
    ⚠️ 内部缩放系数（0.62 / 0.86）是**相对外层 base** 的，不要再乘外部 scale。
    外层 `propsFromDecor` 已保证 scale = 1（见那里的注释）——
    两处都缩的后果是整件只剩几十像素，肉眼是个小方块。
  */
  const span = base * 4.6;
  return (
    <div
      data-part="plaque-pair-wrap"
      style={{
        width: span,
        height: base * 1.7,
        position: "relative",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
      }}
    >
      {/* 左联 */}
      <div data-part="pair-couplet" style={{ position: "absolute", left: 0, top: base * 0.16 }}>
        <CoupletPillar base={base * 0.62} containerW={0} detail={detail} color={color} text="祖德" count={1} />
      </div>
      {/* 中匾 */}
      <div
        data-part="pair-plaque"
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          transform: "translateX(-50%)",
        }}
      >
        <Plaque base={base * 1.02} containerW={0} detail={detail} color={color} text={text ?? "祖德流芳"} count={1} />
      </div>
      {/* 右联 */}
      <div data-part="pair-couplet" style={{ position: "absolute", right: 0, top: base * 0.16 }}>
        <CoupletPillar base={base * 0.62} containerW={0} detail={detail} color={color} text="宗功" count={1} />
      </div>
    </div>
  );
}

/** 幔帐 / 帘幕：幔杆 + 主体 3 竖褶 + 锯齿波浪底 + 束带 + 半透明纱层（5+ 层） */
export function Curtain({ base, color, detail }: Prop3DContext) {
  const w = base * 1.7;
  const h = base * 0.96;
  const teeth = (n: number) =>
    `polygon(${Array.from({ length: n * 2 + 1 })
      .map((_, i) => {
        const x = (i / (n * 2)) * 100;
        const y = i % 2 === 0 ? 88 : 100;
        return `${x.toFixed(1)}% ${y}%`;
      })
      .join(", ")}, 100% 0%, 0% 0%)`;
  return (
    <div
      data-part="curtain-wrap"
      style={{
        width: w,
        height: h,
        position: "relative",
        filter: `drop-shadow(0 5px 10px rgba(0,0,0,.34))`,
      }}
    >
      {/* ① 幔杆 + 两端装饰头 */}
      <div
        data-part="rod"
        style={{
          position: "absolute",
          left: "-6%",
          right: "-6%",
          top: 0,
          height: base * 0.06,
          borderRadius: 999,
          background: "linear-gradient(180deg,#c9a961,#6a5238)",
          boxShadow: PROP_SHADOW_LIGHT,
        }}
      />
      {/* ② 幔身（锯齿波浪底） */}
      <div
        data-part="curtain-body"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: base * 0.06,
          bottom: 0,
          background: `linear-gradient(180deg, ${color}dd, ${color}88)`,
          clipPath: teeth(detail >= 1 ? 11 : 7),
        }}
      />
      {/* ③④⑤ 三条竖褶（受光/背光交替，做布料起伏） */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          data-part="curtain-fold"
          style={{
            position: "absolute",
            top: base * 0.06,
            bottom: "8%",
            left: `${6 + i * 30}%`,
            width: "24%",
            background:
              i % 2 === 0
                ? "linear-gradient(90deg, transparent, rgba(255,255,255,.20), transparent)"
                : "linear-gradient(90deg, transparent, rgba(0,0,0,.16), transparent)",
          }}
        />
      ))}
      {/* ⑥ 束带（detail≥1：把幔束出一道腰）*/}
      {detail >= 1 && (
        <>
          <div
            data-part="curtain-tie"
            style={{
              position: "absolute",
              left: "8%",
              top: "42%",
              width: "12%",
              height: base * 0.07,
              background: `linear-gradient(180deg, #c9a961, #8a6a18)`,
              borderRadius: 2,
            }}
          />
          <div
            data-part="curtain-tie"
            style={{
              position: "absolute",
              right: "8%",
              top: "42%",
              width: "12%",
              height: base * 0.07,
              background: `linear-gradient(180deg, #c9a961, #8a6a18)`,
              borderRadius: 2,
            }}
          />
        </>
      )}
      {/* ⑦ 半透明纱层（detail≥1，罩在最外，做"纱"的通透）*/}
      {detail >= 1 && (
        <div
          data-part="curtain-shear"
          style={{
            position: "absolute",
            left: "-2%",
            right: "-2%",
            top: base * 0.1,
            bottom: "4%",
            background:
              "repeating-linear-gradient(90deg, rgba(255,255,255,.10) 0 6px, transparent 6px 16px)",
            opacity: 0.8,
          }}
        />
      )}
    </div>
  );
}

/**
 * 花束（素菊）—— 大幅升级：从"两个圆"到"瓶 + 七朵 + 叶 + 桌布"（12+ 层）。
 *
 * 这是免费/入门档最常被选的一件（`orn-flower-white` 160 积分），
 * 它必须"看着值"：一束真花与一个色块，是用户对平台诚意最直观的判断。
 */
export function Flower({ base, color, detail }: Prop3DContext) {
  const blooms = detail >= 1 ? 7 : 5;
  const bw = base * 0.3;
  // 花朵位置（左右错开，模拟插花的自然感）
  const spots = [
    { x: 0, y: 0, s: 1.0 },
    { x: -0.34, y: 0.1, s: 0.82 },
    { x: 0.32, y: 0.12, s: 0.86 },
    { x: -0.18, y: -0.16, s: 0.9 },
    { x: 0.2, y: -0.18, s: 0.78 },
    { x: -0.42, y: -0.06, s: 0.7 },
    { x: 0.44, y: -0.04, s: 0.66 },
  ].slice(0, blooms);
  return (
    <div style={{ ...COL, filter: `drop-shadow(0 4px 8px rgba(0,0,0,.34))` }}>
      {/* 花枝丛（每朵一根，做"不是同一个圆堆"） */}
      <div style={{ position: "relative", width: base * 0.8, height: base * 0.62 }}>
        {spots.map((s, i) => (
          <div
            key={`stem-${i}`}
            data-part="stem"
            style={{
              position: "absolute",
              left: `calc(50% + ${s.x * base * 0.3}px)`,
              bottom: 0,
              width: 1.3,
              height: base * (0.3 - s.y * 0.3),
              background: "#5a7a4a",
              transform: `rotate(${s.x * 22}deg)`,
              transformOrigin: "bottom center",
            }}
          />
        ))}
        {/* 花朵 */}
        {spots.map((s, i) => (
          <div
            key={`bloom-${i}`}
            data-part="bloom"
            style={{
              position: "absolute",
              left: `calc(50% + ${s.x * base * 0.3}px)`,
              top: `${s.y * base * 0.3}px`,
              width: base * 0.2 * s.s,
              height: base * 0.2 * s.s,
              marginLeft: -base * 0.1 * s.s,
              borderRadius: "50%",
              background: `radial-gradient(circle at 40% 36%, #fffdf6, ${color} 58%, ${color}77)`,
            }}
          >
            {/* 花心 */}
            {detail >= 2 && (
              <div
                data-part="bloom-core"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: "34%",
                  height: "34%",
                  marginLeft: "-17%",
                  marginTop: "-17%",
                  borderRadius: "50%",
                  background: "#f0d060",
                }}
              />
            )}
          </div>
        ))}
        {/* 叶（detail≥1）*/}
        {detail >= 1 && (
          <>
            <div
              data-part="leaf"
              style={{
                position: "absolute",
                left: "18%",
                bottom: "30%",
                width: base * 0.22,
                height: base * 0.09,
                background: "linear-gradient(90deg,#4a6a3a,#7a9a5a)",
                clipPath: "polygon(0% 50%, 42% 0%, 100% 50%, 42% 100%)",
                transform: "rotate(-24deg)",
              }}
            />
            <div
              data-part="leaf"
              style={{
                position: "absolute",
                right: "16%",
                bottom: "24%",
                width: base * 0.2,
                height: base * 0.08,
                background: "linear-gradient(90deg,#7a9a5a,#4a6a3a)",
                clipPath: "polygon(0% 50%, 58% 0%, 100% 50%, 58% 100%)",
                transform: "rotate(22deg)",
              }}
            />
          </>
        )}
      </div>
      {/* 花瓶（颈/腹/足三段） */}
      <div
        data-part="vase-neck"
        style={{ width: bw * 0.4, height: base * 0.1, background: roundShade("#c8b48c"), clipPath: "polygon(0% 0%, 100% 0%, 74% 100%, 26% 100%)", marginTop: -1 }}
      />
      <div
        data-part="vase-belly"
        style={{
          width: bw,
          height: base * 0.26,
          borderRadius: "44% 44% 48% 48%",
          background: "radial-gradient(circle at 34% 30%, #f0e4cc, #c0aa88 58%, #8a7454)",
          border: "1px solid rgba(90,70,44,.5)",
        }}
      />
      <div
        data-part="vase-foot"
        style={{ width: bw * 0.56, height: base * 0.06, background: "linear-gradient(180deg,#a89070,#6a5238)", borderRadius: `0 0 3px 3px`, marginTop: -1 }}
      />
      {/* 桌布褶皱（detail≥1，做"花摆在哪"的上下文）*/}
      {detail >= 1 && (
        <div
          data-part="cloth"
          style={{
            width: base * 0.62,
            height: base * 0.12,
            marginTop: -2,
            background:
              "repeating-linear-gradient(90deg, rgba(230,220,200,.55) 0 5px, rgba(190,178,152,.5) 5px 10px)",
            clipPath: "polygon(0% 0%, 100% 0%, 100% 62%, 84% 100%, 66% 62%, 50% 100%, 34% 62%, 16% 100%, 0% 62%)",
          }}
        />
      )}
    </div>
  );
}
