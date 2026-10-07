"use client";

import { COL, type Prop3DContext } from "./types";
import { BRIGHTEN, DARKEN, PROP_SHADOW, PROP_SHADOW_LIGHT, giltEdge, roundShade } from "./parts";

/**
 * 建筑类陈设：匾额 / 楹联柱 / 幡旗 / 屏风 / 挂轴 / 石狮 / 影壁。
 *
 * ## 这一组的度量单位是「有没有檐、有没有座」
 *
 * 中式建筑陈设的"等级"几乎全写在这两件事上：
 *   - 匾额有没有**外框檐**（实木框 → 描金框 → 雕龙边框）；
 *   - 石狮有没有**须弥座**（直接趴地上 → 单层方座 → 三层束腰座）。
 *
 * 所以这一组的 detail 分级沿着"座与框"展开，而不是加花纹。
 */

/** 匾额：外框金 + 内底鬃边 + 主字 + 描金 + 挂钩 + 投影（6 层） */
export function Plaque({ base, color, text, detail }: Prop3DContext) {
  const w = base * 1.5;
  const h = base * 0.52;
  return (
    <div
      data-part="plaque-wrap"
      style={{
        width: w,
        height: h,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        filter: `drop-shadow(0 6px 12px rgba(0,0,0,.45))`,
      }}
    >
      {/* ① 外框（描金） */}
      <div
        data-part="plaque-frame"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 3,
          background: `linear-gradient(180deg, ${color}, ${color}aa)`,
          boxShadow: giltEdge(detail >= 1 ? 2.5 : 1.5),
        }}
      />
      {/* ② 内底（深色板芯） */}
      <div
        data-part="plaque-panel"
        style={{
          position: "absolute",
          inset: detail >= 1 ? 4 : 3,
          borderRadius: 2,
          background: "linear-gradient(180deg, #2a1c10, #12100c 60%, #241a10)",
          boxShadow: "inset 0 0 8px rgba(0,0,0,.7)",
        }}
      />
      {/* ③ 回纹描边（detail≥1） */}
      {detail >= 1 && (
        <div
          data-part="plaque-fret"
          style={{
            position: "absolute",
            inset: 6,
            borderRadius: 2,
            border: "1px solid rgba(212,175,55,.55)",
          }}
        />
      )}
      {/* ④ 主字 */}
      <div
        data-part="plaque-text"
        style={{
          position: "relative",
          fontSize: h * 0.46,
          lineHeight: 1,
          color: "#f6e3ae",
          fontWeight: 700,
          letterSpacing: "0.16em",
          textShadow: "0 1px 3px rgba(0,0,0,.85), 0 0 12px rgba(246,227,174,.28)",
        }}
      >
        {text ?? "匾"}
      </div>
      {/* ⑤ 挂钩 ×2（detail≥1）*/}
      {detail >= 1 && (
        <>
          <div
            data-part="plaque-hook"
            style={{
              position: "absolute",
              top: -h * 0.16,
              left: "22%",
              width: 1.6,
              height: h * 0.16,
              background: "#5a4a2a",
            }}
          />
          <div
            data-part="plaque-hook"
            style={{
              position: "absolute",
              top: -h * 0.16,
              right: "22%",
              width: 1.6,
              height: h * 0.16,
              background: "#5a4a2a",
            }}
          />
        </>
      )}
      {/* ⑥ 下垂投影（detail≥1） */}
      {detail >= 1 && (
        <div
          data-part="plaque-shadow"
          style={{
            position: "absolute",
            left: "6%",
            right: "6%",
            bottom: -6,
            height: 8,
            background: "radial-gradient(ellipse, rgba(0,0,0,.42), transparent 72%)",
            filter: "blur(3px)",
          }}
        />
      )}
    </div>
  );
}

/** 楹联柱：柱身横向渐变 + 柱头箍 + 雀替×2 + 鼓形柱础 + 方座 + 竖排楹联 + 投影（8 层） */
export function CoupletPillar({ base, color, text, detail }: Prop3DContext) {
  const w = base * 0.24;
  const h = base * 1.5;
  return (
    <div style={{ ...COL, filter: `drop-shadow(0 6px 12px rgba(0,0,0,.40))` }}>
      {/* ① 柱头箍 */}
      <div
        data-part="capital"
        style={{
          width: w * 1.5,
          height: base * 0.09,
          borderRadius: 2,
          background: "linear-gradient(180deg,#c9a961,#7a5a24)",
        }}
      />
      {/* ② 雀替（右） */}
      {detail >= 1 && (
        <div
          data-part="sparrow"
          style={{
            position: "absolute",
            top: base * 0.06,
            left: `calc(50% - ${w * 0.5}px)`,
            width: w * 0.9,
            height: base * 0.22,
            background: `linear-gradient(90deg, ${color}, ${color}88)`,
            clipPath: "polygon(100% 0%, 100% 100%, 0% 0%)",
          }}
        />
      )}
      {/* ③ 雀替（左） */}
      {detail >= 1 && (
        <div
          data-part="sparrow"
          style={{
            position: "absolute",
            top: base * 0.06,
            left: "50%",
            width: w * 0.9,
            height: base * 0.22,
            background: `linear-gradient(270deg, ${color}, ${color}88)`,
            clipPath: "polygon(0% 0%, 0% 100%, 100% 0%)",
          }}
        />
      )}
      {/* ④ 柱身 */}
      <div
        data-part="shaft"
        style={{
          width: w,
          height: h,
          background: roundShade(color),
          borderRadius: 2,
          position: "relative",
          boxShadow: detail >= 1 ? "inset 0 0 10px rgba(0,0,0,.24)" : undefined,
        }}
      >
        {/* ⑤ 竖排楹联（detail≥1 才写字，免费档是素柱）*/}
        {detail >= 1 && (
          <div
            data-part="couplet-text"
            style={{
              position: "absolute",
              inset: "8% 18%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "4%",
              color: "#f6e3ae",
              fontSize: w * 0.5,
              lineHeight: 1.1,
              fontWeight: 600,
              textShadow: "0 1px 2px rgba(0,0,0,.7)",
            }}
          >
            {(text ?? "宗功祖德").split("").slice(0, 5).map((ch, i) => (
              <span key={i} data-part="couplet-char" style={{ display: "block" }}>
                {ch}
              </span>
            ))}
          </div>
        )}
      </div>
      {/* ⑥ 鼓形柱础 */}
      <div
        data-part="plinth"
        style={{
          width: w * 1.7,
          height: base * 0.14,
          borderRadius: "46% 46% 18% 18% / 62% 62% 40% 40%",
          background: "linear-gradient(180deg,#e6e2d8,#a8a294 62%,#86806f)",
        }}
      />
      {/* ⑦ 方座（detail≥1） */}
      {detail >= 1 && (
        <div
          data-part="plinth-base"
          style={{
            width: w * 2.1,
            height: base * 0.08,
            background: "linear-gradient(180deg,#b0aa9c,#7c766a)",
            borderRadius: 2,
          }}
        />
      )}
      {/* ⑧ 地面投影（detail≥1） */}
      {detail >= 1 && (
        <div
          data-part="pillar-shadow"
          style={{
            width: w * 2.4,
            height: 6,
            background: "radial-gradient(ellipse, rgba(0,0,0,.4), transparent 70%)",
            filter: "blur(3px)",
          }}
        />
      )}
    </div>
  );
}

/** 长幡：幡杆 + 云纹幡头 + 幡面（3 竖条 + 竖排字）+ 波浪下摆 + 飘带 + 投影（7 层） */
export function Banner({ base, color, text, detail }: Prop3DContext) {
  const w = base * 0.34;
  const h = base * 1.3;
  return (
    <div style={{ ...COL, filter: `drop-shadow(0 5px 10px rgba(0,0,0,.38))` }}>
      {/* ① 幡杆横挑 */}
      <div style={{ width: w * 1.5, height: 2.4, background: "#5a4a2a", borderRadius: 2 }} />
      {/* ② 幡杆竖杆 */}
      <div
        data-part="pole"
        style={{
          position: "absolute",
          top: 0,
          left: `calc(50% - ${w * 0.1}px)`,
          width: 2.4,
          height: h * 0.92,
          background: roundShade("#6a5238"),
        }}
      />
      {/* ③ 云纹幡头 */}
      <div
        data-part="banner-head"
        style={{
          width: w * 1.1,
          height: base * 0.14,
          marginTop: 2,
          background: `linear-gradient(180deg, #c9a961, ${color})`,
          clipPath: "polygon(0% 0%, 100% 0%, 100% 56%, 76% 100%, 50% 62%, 24% 100%, 0% 56%)",
        }}
      />
      {/* ④ 幡面主体（3 竖条） */}
      <div
        data-part="banner-face"
        style={{
          width: w,
          height: h * 0.66,
          position: "relative",
          overflow: "hidden",
          background: `linear-gradient(180deg, ${color}ee, ${color}bb)`,
          border: `1px solid ${color}`,
        }}
      >
        {/* ⑤⑥⑦ 三条竖褶（明暗相间 = 布料的起伏） */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            data-part="fold"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${(i / 3) * 100}%`,
              width: `${100 / 3}%`,
              background:
                i % 2 === 0
                  ? "linear-gradient(90deg, rgba(255,255,255,.14), transparent)"
                  : "linear-gradient(90deg, transparent, rgba(0,0,0,.20))",
            }}
          />
        ))}
        {/* ⑧ 竖排字（detail≥1）*/}
        {detail >= 1 && (
          <div
            data-part="banner-text"
            style={{
              position: "absolute",
              inset: "10% 22%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "6%",
              color: "#fff6de",
              fontSize: w * 0.62,
              fontWeight: 700,
              textShadow: "0 1px 2px rgba(0,0,0,.6)",
            }}
          >
            {(text ?? "宗").split("").slice(0, 3).map((ch, i) => (
              <span key={i} data-part="banner-char" style={{ display: "block" }}>
                {ch}
              </span>
            ))}
          </div>
        )}
        {/* ⑨ 受光渐变 */}
        <div data-part="gloss" style={{ position: "absolute", inset: 0, background: BRIGHTEN }} />
        <div data-part="shade" style={{ position: "absolute", inset: 0, background: DARKEN }} />
      </div>
      {/* ⑩ 波浪下摆 */}
      <div
        data-part="banner-hem"
        style={{
          width: w,
          height: base * 0.16,
          background: color,
          clipPath:
            "polygon(0% 0%, 100% 0%, 100% 46%, 88% 100%, 76% 46%, 64% 100%, 52% 46%, 40% 100%, 28% 46%, 16% 100%, 4% 46%, 0% 46%)",
        }}
      />
      {/* ⑪ 飘带（detail≥1）*/}
      {detail >= 1 && (
        <div
          data-part="ribbon"
          style={{
            position: "absolute",
            right: `calc(50% - ${w * 1.1}px)`,
            top: h * 0.42,
            width: w * 0.5,
            height: h * 0.3,
            background: `linear-gradient(180deg, ${color}cc, transparent)`,
            clipPath: "polygon(0% 0%, 100% 8%, 78% 100%, 22% 84%)",
            opacity: 0.85,
          }}
        />
      )}
    </div>
  );
}

/** 屏风：四扇可折（中堂隔断） */
export function Screen({ base, color, detail }: Prop3DContext) {
  const panelW = base * 0.52;
  const totalW = panelW * 4;
  const h = base * 1.16;
  return (
    <div
      data-part="screen-wrap"
      style={{
        width: totalW,
        height: h,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        transformStyle: "preserve-3d",
        filter: `drop-shadow(0 8px 16px rgba(0,0,0,.42))`,
      }}
    >
      {[0, 1, 2, 3].map((i) => {
        // 四扇呈折屏：外侧两扇向内转，形成"围合"感
        const rot = [-14, -5, 5, 14][i];
        return (
          <div
            key={i}
            data-part="screen-leaf"
            style={{
              width: panelW,
              height: "100%",
              marginLeft: i === 0 ? 0 : -1,
              transform: `rotateY(${rot}deg)`,
              transformOrigin: i < 2 ? "right center" : "left center",
              position: "relative",
              background: `linear-gradient(180deg, ${color}f2, ${color}cc)`,
              boxShadow: giltEdge(detail >= 1 ? 2 : 1.4, "rgba(160,120,50,.9)"),
              overflow: "hidden",
            }}
          >
            {/* ② 绢面（每扇内嵌浅色绢） */}
            <div
              data-part="screen-silk"
              style={{
                position: "absolute",
                inset: 4,
                background:
                  "linear-gradient(180deg, rgba(248,240,222,.90), rgba(222,208,182,.86))",
              }}
            />
            {/* ③④ 扇内竖格（detail≥1）*/}
            {detail >= 1 && (
              <>
                <div
                  data-part="screen-mullion"
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: 8,
                    bottom: 8,
                    width: 1,
                    background: "rgba(120,88,40,.45)",
                  }}
                />
                <div
                  data-part="screen-rail"
                  style={{
                    position: "absolute",
                    left: 6,
                    right: 6,
                    top: "22%",
                    height: 1,
                    background: "rgba(120,88,40,.4)",
                  }}
                />
              </>
            )}
            {/* ⑤ 下裙板 */}
            <div
              data-part="screen-apron"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "16%",
                background: `linear-gradient(180deg, ${color}, rgba(0,0,0,.42))`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

/** 山海图挂轴：侧墙挂画（上轴 + 画心 + 下轴 + 系带） */
export function ScrollPainting({ base, color, detail }: Prop3DContext) {
  const w = base * 0.72;
  const h = base * 1.24;
  return (
    <div style={{ ...COL, filter: `drop-shadow(0 4px 10px rgba(0,0,0,.36))` }}>
      {/* ① 天杆（上轴） */}
      <div
        data-part="rod-top"
        style={{
          width: w * 1.14,
          height: base * 0.05,
          borderRadius: 999,
          background: "linear-gradient(180deg,#6a5238,#3a2a18)",
        }}
      />
      {/* ② 挂绳 */}
      {detail >= 1 && (
        <div
          data-part="scroll-cord"
          style={{
            position: "absolute",
            top: -base * 0.12,
            width: w * 0.5,
            height: base * 0.12,
            borderTop: "1.4px solid #5a4a2a",
            borderLeft: "1.4px solid #5a4a2a",
            borderRight: "1.4px solid #5a4a2a",
            borderRadius: "4px 4px 0 0",
          }}
        />
      )}
      {/* ③ 画心（山海意象：远山 + 云 + 水） */}
      <div
        data-part="scroll-art"
        style={{
          width: w,
          height: h * 0.72,
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg, #e8e6dc, #d8d4c4 62%, #c8c2ae)",
          border: "1px solid rgba(90,70,44,.35)",
        }}
      >
        {/* ④ 远山 */}
        <div
          data-part="scroll-mountain"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "38%",
            height: "30%",
            background: `linear-gradient(180deg, transparent, ${color}88)`,
            clipPath: "polygon(0% 100%, 18% 42%, 34% 74%, 52% 20%, 70% 66%, 86% 38%, 100% 100%)",
          }}
        />
        {/* ⑤ 云带 */}
        <div
          data-part="scroll-cloud"
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            top: "26%",
            height: "10%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,.85), transparent)",
            borderRadius: 999,
            filter: "blur(1px)",
          }}
        />
        {/* ⑥ 水纹（detail≥1，用 repeating 渐变做波纹）*/}
        {detail >= 1 && (
          <div
            data-part="scroll-wave"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "38%",
              background:
                "repeating-linear-gradient(170deg, rgba(90,110,130,.24) 0 1.5px, transparent 1.5px 7px)",
            }}
          />
        )}
        {/* ⑦ 题跋竖排（detail≥2）*/}
        {detail >= 2 && (
          <div
            data-part="scroll-inscription"
            style={{
              position: "absolute",
              right: "8%",
              top: "8%",
              color: "rgba(60,42,20,.8)",
              fontSize: w * 0.09,
              writingMode: "vertical-rl",
              letterSpacing: "0.12em",
            }}
          >
            山高水長
          </div>
        )}
      </div>
      {/* ⑧ 地杆（下轴） */}
      <div
        data-part="rod-bottom"
        style={{
          width: w * 1.2,
          height: base * 0.07,
          borderRadius: 999,
          background: "linear-gradient(180deg,#4a3620,#241a10)",
        }}
      />
      {/* ⑨ 系带（detail≥1） */}
      {detail >= 1 && (
        <div
          data-part="scroll-tie"
          style={{ width: 2, height: base * 0.12, background: "#8a3a2e", marginTop: -1 }}
        />
      )}
    </div>
  );
}

/** 石狮：须弥座 3 层 + 狮身（头/鬃/前腿/绣球）+ 高光 + 投影（9 层） */
export function StoneLion({ base, color, detail }: Prop3DContext) {
  const w = base * 0.6;
  const bodyH = base * 0.62;
  return (
    <div style={{ ...COL, filter: `drop-shadow(0 6px 12px rgba(0,0,0,.44))` }}>
      {/* ① 狮头 */}
      <div
        data-part="lion-head"
        style={{
          width: w * 0.56,
          height: w * 0.5,
          borderRadius: "48% 48% 42% 42%",
          background: "radial-gradient(circle at 36% 32%, #e0dcd2, #a9a49b 58%, #7a756c)",
          position: "relative",
          zIndex: 2,
          marginBottom: -w * 0.08,
        }}
      >
        {/* ② 鬃毛（detail≥1：一圈锯齿）*/}
        {detail >= 1 && (
          <div
            data-part="lion-mane"
            style={{
              position: "absolute",
              inset: -w * 0.08,
              borderRadius: "50%",
              background: "conic-gradient(from 0deg, #8a857c 0 6deg, transparent 6deg 18deg)",
              opacity: 0.75,
              zIndex: -1,
            }}
          />
        )}
        {/* ③④ 双目 */}
        <div
          data-part="lion-eye"
          style={{ position: "absolute", left: "24%", top: "36%", width: w * 0.07, height: w * 0.07, borderRadius: "50%", background: "#3a3630" }}
        />
        <div
          data-part="lion-eye"
          style={{ position: "absolute", right: "24%", top: "36%", width: w * 0.07, height: w * 0.07, borderRadius: "50%", background: "#3a3630" }}
        />
      </div>
      {/* ⑤ 狮身 */}
      <div
        data-part="lion-body"
        style={{
          width: w * 0.78,
          height: bodyH,
          borderRadius: "40% 40% 14% 14%",
          background: "linear-gradient(160deg, #ded9cf, #a9a49b 66%, #837e75)",
          position: "relative",
        }}
      >
        {/* ⑥ 胸前绣球（detail≥1）*/}
        {detail >= 1 && (
          <div
            data-part="lion-ball"
            style={{
              position: "absolute",
              left: "8%",
              bottom: "10%",
              width: w * 0.26,
              height: w * 0.26,
              borderRadius: "50%",
              background: "radial-gradient(circle at 34% 30%, #f0ece2, #a9a49b 62%, #7a756c)",
            }}
          />
        )}
        {/* ⑦ 受光高光 */}
        <div
          data-part="lion-gloss"
          style={{
            position: "absolute",
            left: "16%",
            top: "10%",
            width: "20%",
            height: "52%",
            borderRadius: 999,
            background: "linear-gradient(180deg, rgba(255,255,255,.5), transparent)",
            mixBlendMode: "screen",
          }}
        />
      </div>
      {/* ⑧ 须弥座（detail 决定层数：0→1 层，1→2 层含束腰，2→3 层） */}
      <div
        data-part="lion-plinth-top"
        style={{
          width: w * 0.94,
          height: base * 0.08,
          background: `linear-gradient(180deg, ${color}, rgba(0,0,0,.3))`,
          borderTop: "1px solid rgba(255,255,255,.12)",
        }}
      />
      {detail >= 1 && (
        <div
          data-part="lion-plinth-waist"
          style={{
            width: w * 0.78,
            height: base * 0.09,
            background: roundShade(color),
          }}
        />
      )}
      <div
        data-part="lion-plinth-base"
        style={{
          width: detail >= 2 ? w * 1.06 : w * 0.94,
          height: base * 0.1,
          background: `linear-gradient(180deg, ${color}, rgba(0,0,0,.42))`,
          borderRadius: `0 0 2px 2px`,
        }}
      />
    </div>
  );
}

/** 影壁：山门内的独立照壁（须弥座 + 壁心 + 瓦顶） */
export function ScreenWall({ base, color, detail }: Prop3DContext) {
  const w = base * 2.2;
  const h = base * 1.16;
  return (
    <div
      data-part="screenwall-wrap"
      style={{
        width: w,
        height: h,
        position: "relative",
        filter: `drop-shadow(0 8px 16px rgba(0,0,0,.44))`,
      }}
    >
      {/* ① 瓦顶（小庑殿） */}
      <div
        data-part="screenwall-roof"
        style={{
          position: "absolute",
          left: "-4%",
          right: "-4%",
          top: 0,
          height: "14%",
          background: "linear-gradient(180deg,#5a6068,#2e3238)",
          clipPath: "polygon(6% 0%, 94% 0%, 100% 100%, 0% 100%)",
        }}
      />
      {/* ② 檐口线 */}
      <div
        data-part="screenwall-eave"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "13%",
          height: 2,
          background: "#c9a961",
          opacity: 0.8,
        }}
      />
      {/* ③ 壁身 */}
      <div
        data-part="screenwall-body"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "15%",
          bottom: "16%",
          background: `linear-gradient(180deg, ${color}, rgba(0,0,0,.28))`,
        }}
      />
      {/* ④ 壁心（方形内凹 + 回纹边）*/}
      <div
        data-part="screenwall-heart"
        style={{
          position: "absolute",
          left: "10%",
          right: "10%",
          top: "24%",
          bottom: "26%",
          background: "linear-gradient(180deg, rgba(245,238,222,.22), rgba(0,0,0,.18))",
          boxShadow: "inset 0 0 12px rgba(0,0,0,.4)",
          border: detail >= 1 ? "2px solid rgba(212,175,55,.5)" : "1px solid rgba(212,175,55,.3)",
        }}
      />
      {/* ⑤ 中央雕饰（detail≥1）*/}
      {detail >= 1 && (
        <div
          data-part="screenwall-motif"
          style={{
            position: "absolute",
            left: "32%",
            right: "32%",
            top: "36%",
            bottom: "38%",
            background:
              "repeating-conic-gradient(from 45deg, rgba(212,175,55,.5) 0deg 30deg, transparent 30deg 90deg)",
            opacity: 0.75,
          }}
        />
      )}
      {/* ⑥ 须弥座 */}
      <div
        data-part="screenwall-plinth"
        style={{
          position: "absolute",
          left: "-2%",
          right: "-2%",
          bottom: 0,
          height: "16%",
          background: "linear-gradient(180deg,#a8a294,#7c766a 56%,#5e584e)",
        }}
      />
      {/* ⑦ 座上线脚（detail≥2）*/}
      {detail >= 2 && (
        <div
          data-part="screenwall-plinth-line"
          style={{
            position: "absolute",
            left: "-2%",
            right: "-2%",
            bottom: "15.4%",
            height: 1.5,
            background: "rgba(255,255,255,.22)",
          }}
        />
      )}
    </div>
  );
}

/** 壁龛框（仅工坊预览用；公页的真实版本是 NicheWallScene） */
export function NicheWall({ base, color, detail }: Prop3DContext) {
  const w = base * 1.8;
  const h = base * 1.1;
  const cols = detail >= 1 ? 5 : 3;
  const rows = detail >= 1 ? 3 : 2;
  return (
    <div
      data-part="niche-wrap"
      style={{
        width: w,
        height: h,
        borderRadius: 4,
        border: `3px solid ${color}`,
        background: "linear-gradient(180deg, rgba(40,26,14,.42), rgba(20,12,6,.62))",
        boxShadow: `inset 0 0 0 1px ${color}55, 0 6px 14px rgba(0,0,0,.36)`,
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 3,
        padding: 5,
      }}
    >
      {Array.from({ length: cols * rows }).map((_, i) => (
        <div
          key={i}
          data-part="niche-cell"
          style={{
            borderRadius: 2,
            background: `linear-gradient(180deg, ${color}33, rgba(0,0,0,.5))`,
            boxShadow: "inset 0 2px 5px rgba(0,0,0,.5)",
          }}
        />
      ))}
    </div>
  );
}

/** 牌位墙：7×3 独立牌位（圆首 + 描金边）+ 底座供台（22+ 层） */
export function TabletWall({ base, color, count, detail }: Prop3DContext) {
  const cols = 7;
  const rows = 3;
  const gap = 3;
  const pad = 7;
  const cell = unitToPxSafe(base, 5.5);
  const w = cell * cols + (cols - 1) * gap + pad * 2;
  const h = cell * rows + (rows - 1) * gap + pad * 2;
  void count;
  return (
    <div
      data-part="tablet-wrap"
      style={{
        width: w,
        height: h,
        borderRadius: 4,
        background: `linear-gradient(180deg, ${color}99, ${color}55)`,
        border: `1px solid ${color}cc`,
        boxShadow: PROP_SHADOW,
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap,
        padding: pad,
      }}
    >
      {Array.from({ length: rows * cols }).map((_, i) => (
        <div
          key={i}
          data-part="tablet"
          style={{
            position: "relative",
            borderRadius: "46% 46% 4% 4%",
            background: "linear-gradient(180deg, #f0e2c4, #c8b48c 62%, #a08e68)",
            boxShadow: giltEdge(1, "rgba(120,80,30,.7)"),
          }}
        >
          {/* 牌位上的描金竖纹（名讳位） */}
          {detail >= 1 && (
            <div
              data-part="tablet-name"
              style={{
                position: "absolute",
                left: "34%",
                right: "34%",
                top: "22%",
                bottom: "18%",
                background: "linear-gradient(180deg, rgba(160,60,40,.75), rgba(120,40,26,.75))",
                borderRadius: 1,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** 与 unitToPx 等价，但这里以 base 为基准换算（供牌位墙自绘尺寸用） */
function unitToPxSafe(base: number, unit: number) {
  // base = unitToPx(7 * scale)，故 1 空间单位 ≈ base / 7
  return (unit / 7) * base;
}

export { PROP_SHADOW, PROP_SHADOW_LIGHT };
