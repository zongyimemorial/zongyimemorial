"use client";

import { COL, type Prop3DContext } from "./types";
import { BRIGHTEN, DARKEN, PROP_SHADOW, PROP_SHADOW_LIGHT, roundShade } from "./parts";

/**
 * 案几类陈设：香炉 / 供几 / 供桌 / 香几 / 烛台 / 花瓶 / 果盘。
 *
 * ## 这一组的共同点：它们决定「这间屋子有没有被用过」
 *
 * 空白房间与"有人常来祭扫"的房间，差别不在墙上，在**案上**：
 * 有没有香炉、香炉有没有脚、案面有没有束腰、烛台是不是一对。
 * 所以这一组的层数增长方向是「器物的零件数」，而不是「装饰花纹」。
 *
 * ## 造型共识（三件共用的语汇）
 *
 *   - 有脚：三足 / 四足 / 马蹄足 —— 器物"站在案上"的关键，比投影更有效；
 *   - 有面：案面比腿宽 8~12%，这是"案子"与"箱子"的区别；
 *   - 有牙板：腿与面之间那块过渡（卷云 / 直牙），中式家具最标志性的细节。
 */

/** 青铜香炉：镂空盖 + 双耳 + 梯形身 + 三足 + 香烟（9 层） */
export function IncenseBurner({ base, color, detail }: Prop3DContext) {
  const w = base * 0.62;
  const bodyH = base * 0.36;
  return (
    <div style={{ ...COL, filter: `drop-shadow(0 4px 8px rgba(0,0,0,.40))` }}>
      {/* ① 镂空炉盖（detail≥1；免费档是素盖） */}
      <div
        data-part="lid"
        style={{
          width: w * 0.78,
          height: bodyH * 0.34,
          borderRadius: "50% 50% 6% 6%",
          background: `linear-gradient(180deg, ${color}, rgba(0,0,0,.35))`,
          position: "relative",
          overflow: "hidden",
          ...(detail >= 1
            ? {
                backgroundImage: `radial-gradient(circle at 30% 40%, rgba(0,0,0,.55) 1.5px, transparent 2px), radial-gradient(circle at 70% 42%, rgba(0,0,0,.55) 1.5px, transparent 2px), linear-gradient(180deg, ${color}, rgba(0,0,0,.35))`,
                backgroundSize: "8px 8px, 8px 8px, 100% 100%",
              }
            : null),
        }}
      >
        {/* ② 盖顶钮 */}
        <div
          data-part="lid-knob"
          style={{
            position: "absolute",
            left: "50%",
            top: -1,
            width: w * 0.14,
            height: w * 0.14,
            marginLeft: -w * 0.07,
            borderRadius: "50%",
            background: `linear-gradient(180deg, ${color}, rgba(0,0,0,.4))`,
          }}
        />
      </div>
      {/* ③④ 双耳（detail≥1） */}
      {detail >= 1 && (
        <>
          <div
            data-part="handle"
            style={{
              position: "absolute",
              top: bodyH * 0.72,
              left: `calc(50% - ${w * 0.62}px)`,
              width: w * 0.18,
              height: bodyH * 0.42,
              borderRadius: `${w * 0.1}px 0 0 ${w * 0.1}px`,
              border: `1.5px solid ${color}`,
              borderRight: "none",
            }}
          />
          <div
            data-part="handle"
            style={{
              position: "absolute",
              top: bodyH * 0.72,
              left: `calc(50% + ${w * 0.44}px)`,
              width: w * 0.18,
              height: bodyH * 0.42,
              borderRadius: `0 ${w * 0.1}px ${w * 0.1}px 0`,
              border: `1.5px solid ${color}`,
              borderLeft: "none",
            }}
          />
        </>
      )}
      {/* ⑤ 炉身（梯形，上宽下收） */}
      <div
        data-part="bowl"
        style={{
          width: w * 0.86,
          height: bodyH,
          clipPath: "polygon(6% 0%, 94% 0%, 84% 100%, 16% 100%)",
          background: roundShade(color),
          marginTop: -bodyH * 0.12,
          position: "relative",
        }}
      >
        {/* ⑥ 腹部受光 */}
        <div data-part="gloss" style={{ position: "absolute", inset: 0, background: BRIGHTEN }} />
      </div>
      {/* ⑦ 三足（一前两后） */}
      <div style={{ ...COL, flexDirection: "row", gap: w * 0.2, marginTop: -1 }}>
        <div data-part="leg" style={{ width: 2.4, height: bodyH * 0.26, background: color }} />
        <div data-part="leg" style={{ width: 2.4, height: bodyH * 0.34, background: color }} />
        <div data-part="leg" style={{ width: 2.4, height: bodyH * 0.26, background: color }} />
      </div>
      {/* ⑧ 兽面足端（detail≥2） */}
      {detail >= 2 && (
        <div
          data-part="paw"
          style={{ width: w * 0.28, height: 2, background: "rgba(0,0,0,.5)", marginTop: -1 }}
        />
      )}
      {/* ⑨ 香烟（detail≥1） */}
      {detail >= 1 && (
        <div style={{ position: "absolute", bottom: bodyH * 1.05, left: 0 }}>
          <div style={{ ...COL, width: base * 0.5, height: base * 0.6, position: "relative" }}>
            <div
              data-part="smoke"
              style={{
                position: "absolute",
                left: base * 0.2,
                bottom: 0,
                width: base * 0.1,
                height: base * 0.5,
                background: "linear-gradient(0deg, rgba(214,214,208,.46), transparent 82%)",
                clipPath:
                  "polygon(44% 100%, 56% 100%, 70% 72%, 54% 50%, 64% 26%, 50% 0%, 36% 26%, 46% 50%, 30% 72%)",
                filter: "blur(1.5px)",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 供几 / 香几：**独脚式**小几（区别于供桌）。
 *
 * 为什么小几要单独一个 kind：佛堂/祠堂里"几"与"桌"是两种器物，
 * 几是独脚高挑（放香炉/花瓶），桌是四足宽面（放供品）。
 * v1 把两者都画成"一块板 + 四腿"，于是买了"供几案台"与"供桌陈设"
 * 看起来是同一件东西 —— 这是典型的"付费了但看不出区别"。
 */
export function AltarTable({ base, color, detail }: Prop3DContext) {
  const w = base * 1.34; // 案面比腿宽
  const topH = base * 0.1;
  const legH = base * 0.42;
  return (
    <div style={{ ...COL, width: w, marginLeft: 0, filter: `drop-shadow(0 5px 9px rgba(0,0,0,.40))` }}>
      {/* ① 案面（两端翘头，detail≥1） */}
      <div
        data-part="top"
        style={{
          width: w,
          height: topH,
          borderRadius: 2,
          background: `linear-gradient(180deg, ${color}ee, ${color}99)`,
          boxShadow: PROP_SHADOW,
          position: "relative",
        }}
      />
      {/* ②③ 两端翘头 */}
      {detail >= 1 && (
        <>
          <div
            data-part="eared"
            style={{
              position: "absolute",
              left: -2,
              top: -topH * 0.5,
              width: 4,
              height: topH * 1.5,
              borderRadius: 2,
              background: color,
            }}
          />
          <div
            data-part="eared"
            style={{
              position: "absolute",
              right: -2,
              top: -topH * 0.5,
              width: 4,
              height: topH * 1.5,
              borderRadius: 2,
              background: color,
            }}
          />
        </>
      )}
      {/* ④ 束腰（面与腿之间的内收段） */}
      <div
        data-part="waist"
        style={{
          width: w * 0.92,
          height: topH * 0.4,
          background: `linear-gradient(180deg, ${color}99, ${color}66)`,
        }}
      />
      {/* ⑤⑥ 卷云牙板（左右各一，detail≥1） */}
      {detail >= 1 && (
        <>
          <div
            data-part="apron"
            style={{
              position: "absolute",
              left: w * 0.06,
              top: topH * 1.4,
              width: w * 0.34,
              height: legH * 0.42,
              background: color,
              clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 62% 46%, 30% 100%)",
              opacity: 0.9,
            }}
          />
          <div
            data-part="apron"
            style={{
              position: "absolute",
              right: w * 0.06,
              top: topH * 1.4,
              width: w * 0.34,
              height: legH * 0.42,
              background: color,
              clipPath: "polygon(0% 0%, 100% 0%, 70% 100%, 38% 46%, 0% 100%)",
              opacity: 0.9,
            }}
          />
        </>
      )}
      {/* ⑦⑧⑨⑩ 四蹄足 */}
      <div style={{ ...COL, flexDirection: "row", width: w, justifyContent: "space-between", padding: `0 ${w * 0.08}px` }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            data-part="leg"
            style={{
              width: detail >= 2 ? 3.4 : 2.6,
              height: legH,
              borderRadius: "0 0 2px 2px",
              background: `linear-gradient(180deg, ${color}, rgba(0,0,0,.45))`,
            }}
          />
        ))}
      </div>
      {/* ⑪ 桌面投影（detail≥1） */}
      {detail >= 1 && (
        <div
          data-part="top-shadow"
          style={{ width: w * 0.94, height: 3, background: "rgba(0,0,0,.28)", filter: "blur(2px)" }}
        />
      )}
    </div>
  );
}

/** 供桌：束腰马蹄足 + 陈设（烛台×2 / 果盘 / 香炉）—— 10+ 层 */
export function Shelf({ base, color, detail }: Prop3DContext) {
  const w = base * 1.24;
  const topH = base * 0.12;
  const legH = base * 0.36;
  return (
    <div style={{ ...COL, width: w, filter: `drop-shadow(0 5px 9px rgba(0,0,0,.38))` }}>
      {/* 案上陈列：① 烛台×2 ② 果盘 ③ 香炉（detail≥1 才摆，免费档留空案）*/}
      {detail >= 1 && (
        <div style={{ ...COL, flexDirection: "row", alignItems: "flex-end", gap: w * 0.1, marginBottom: -1 }}>
          {/* 烛台左 */}
          <div data-part="candlestick" style={{ ...COL }}>
            <div
              style={{
                width: 2.6,
                height: base * 0.14,
                background: "linear-gradient(180deg,#ffe9a8,#c9a961)",
                borderRadius: 1,
              }}
            />
            <div
              style={{
                width: base * 0.1,
                height: base * 0.16,
                borderRadius: "50% 50% 24% 24%",
                background: "linear-gradient(180deg,#d4af37,#8a6a18)",
                marginTop: -1,
              }}
            />
            <div
              style={{
                width: 1.4,
                height: base * 0.2,
                background: "#8a6a18",
                marginTop: -1,
              }}
            />
          </div>
          {/* 果盘 */}
          <div
            data-part="fruit-tray"
            style={{
              width: base * 0.3,
              height: base * 0.1,
              borderRadius: "0 0 50% 50%",
              background: "linear-gradient(180deg,#f0e0c0,#b89b6c)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              gap: 1.5,
              paddingBottom: 1,
            }}
          >
            <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#d4643a" }} />
            <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#e0a03a" }} />
            <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#c84a34" }} />
          </div>
          {/* 烛台右 */}
          <div data-part="candlestick" style={{ ...COL }}>
            <div
              style={{
                width: 2.6,
                height: base * 0.14,
                background: "linear-gradient(180deg,#ffe9a8,#c9a961)",
                borderRadius: 1,
              }}
            />
            <div
              style={{
                width: base * 0.1,
                height: base * 0.16,
                borderRadius: "50% 50% 24% 24%",
                background: "linear-gradient(180deg,#d4af37,#8a6a18)",
                marginTop: -1,
              }}
            />
            <div style={{ width: 1.4, height: base * 0.2, background: "#8a6a18", marginTop: -1 }} />
          </div>
        </div>
      )}

      {/* 案面 */}
      <div
        data-part="top"
        style={{
          width: w,
          height: topH,
          borderRadius: 2,
          background: `linear-gradient(180deg, ${color}ee, ${color}aa)`,
          boxShadow: PROP_SHADOW,
        }}
      />
      {/* 束腰 */}
      <div
        data-part="waist"
        style={{
          width: w * 0.9,
          height: topH * 0.44,
          background: `linear-gradient(180deg, ${color}aa, ${color}66)`,
        }}
      />
      {/* 牙板（直牙，detail≥1 加卷云口） */}
      <div
        data-part="apron"
        style={{
          width: w * 0.94,
          height: topH * 0.5,
          background: color,
          opacity: 0.85,
          clipPath:
            detail >= 1
              ? "polygon(0% 0%, 100% 0%, 100% 62%, 88% 100%, 74% 62%, 60% 100%, 46% 62%, 32% 100%, 18% 62%, 4% 100%, 0% 62%)"
              : undefined,
        }}
      />
      {/* 四马蹄足（detail≥2 加马蹄内收） */}
      <div style={{ ...COL, flexDirection: "row", width: w, justifyContent: "space-between", padding: `0 ${w * 0.06}px` }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            data-part="leg"
            style={{
              width: detail >= 2 ? 3.6 : 2.8,
              height: legH,
              background: `linear-gradient(180deg, ${color}, rgba(0,0,0,.5))`,
              borderRadius: detail >= 2 ? "0 0 46% 46%" : 0,
            }}
          />
        ))}
      </div>
      {detail >= 1 && (
        <div
          data-part="top-shadow"
          style={{ width: w * 0.96, height: 4, background: "rgba(0,0,0,.26)", filter: "blur(2.5px)" }}
        />
      )}
    </div>
  );
}

/** 香几：独脚高挑，放香炉/花瓶（区别于供桌的"宽面") */
export function IncenseTable({ base, color, detail }: Prop3DContext) {
  const w = base * 0.56;
  const h = base * 0.86;
  return (
    <div style={{ ...COL, width: w, filter: `drop-shadow(0 5px 8px rgba(0,0,0,.36))` }}>
      {/* ① 几面（圆） */}
      <div
        data-part="top"
        style={{
          width: w,
          height: w * 0.16,
          borderRadius: "50%",
          background: `linear-gradient(180deg, ${color}ee, ${color}88)`,
          boxShadow: PROP_SHADOW_LIGHT,
        }}
      />
      {/* ② 束腰环 */}
      <div
        data-part="waist"
        style={{
          width: w * 0.62,
          height: w * 0.1,
          background: `linear-gradient(180deg, ${color}aa, ${color}66)`,
          marginTop: -1,
        }}
      />
      {/* ③ 独腿 */}
      <div
        data-part="leg"
        style={{
          width: w * 0.14,
          height: h * 0.62,
          background: roundShade(color),
          borderRadius: 1,
        }}
      />
      {/* ④⑤⑥ 三弯腿（detail≥1 才有，器物的"贵气"就在这道弧线上） */}
      {detail >= 1 && (
        <div
          data-part="cabriole"
          style={{
            width: w * 0.66,
            height: h * 0.2,
            marginTop: -1,
            borderBottom: `2px solid ${color}`,
            borderLeft: `2px solid ${color}`,
            borderRight: `2px solid ${color}`,
            borderBottomLeftRadius: "48% 62%",
            borderBottomRightRadius: "48% 62%",
            opacity: 0.9,
          }}
        />
      )}
      {/* ⑦ 托泥（底盘） */}
      <div
        data-part="base"
        style={{
          width: w * 0.44,
          height: 3,
          borderRadius: 999,
          background: `linear-gradient(180deg, ${color}, rgba(0,0,0,.5))`,
        }}
      />
    </div>
  );
}

/** 花瓶：颈/腹/足三段 + 花枝花心 + 叶（12+ 层） */
export function Vase({ base, color, detail }: Prop3DContext) {
  const bw = base * 0.3;
  const bh = base * 0.44;
  return (
    <div style={{ ...COL, filter: `drop-shadow(0 4px 7px rgba(0,0,0,.34))` }}>
      {/* ① 花枝 */}
      <div data-part="stem" style={{ width: 1.4, height: base * 0.34, background: "#5a7a4a" }} />
      {/* ② 花朵（detail≥1 开三朵）*/}
      <div style={{ ...COL, flexDirection: "row", gap: base * 0.04, alignItems: "flex-end" }}>
        <div
          data-part="bloom"
          style={{
            width: base * 0.16,
            height: base * 0.16,
            borderRadius: "50%",
            background: `radial-gradient(circle at 40% 36%, ${color}, ${color}88 62%, transparent 78%)`,
            marginBottom: base * 0.06,
          }}
        />
        <div
          data-part="bloom"
          style={{
            width: base * 0.2,
            height: base * 0.2,
            borderRadius: "50%",
            background: `radial-gradient(circle at 42% 34%, #fffdf6, ${color} 58%, ${color}66)`,
          }}
        />
        {detail >= 1 && (
          <div
            data-part="bloom"
            style={{
              width: base * 0.14,
              height: base * 0.14,
              borderRadius: "50%",
              background: `radial-gradient(circle at 40% 36%, ${color}, ${color}88 62%, transparent 78%)`,
              marginBottom: base * 0.09,
            }}
          />
        )}
      </div>
      {/* ③④ 叶（detail≥1）*/}
      {detail >= 1 && (
        <>
          <div
            data-part="leaf"
            style={{
              position: "absolute",
              left: `calc(50% - ${base * 0.18}px)`,
              top: base * 0.2,
              width: base * 0.2,
              height: base * 0.08,
              background: "linear-gradient(90deg,#4a6a3a,#7a9a5a)",
              clipPath: "polygon(0% 50%, 42% 0%, 100% 50%, 42% 100%)",
              transform: "rotate(-20deg)",
            }}
          />
          <div
            data-part="leaf"
            style={{
              position: "absolute",
              left: `calc(50% + ${base * 0.02}px)`,
              top: base * 0.3,
              width: base * 0.18,
              height: base * 0.07,
              background: "linear-gradient(90deg,#7a9a5a,#4a6a3a)",
              clipPath: "polygon(0% 50%, 58% 0%, 100% 50%, 58% 100%)",
              transform: "rotate(18deg)",
            }}
          />
        </>
      )}
      {/* ⑤ 瓶口（外撇） */}
      <div
        data-part="mouth"
        style={{
          width: bw * 0.4,
          height: bh * 0.1,
          background: `linear-gradient(180deg,#e8dcc4,#a89070)`,
          clipPath: "polygon(0% 0%, 100% 0%, 76% 100%, 24% 100%)",
          marginTop: -1,
        }}
      />
      {/* ⑥ 瓶颈 */}
      <div
        data-part="neck"
        style={{
          width: bw * 0.3,
          height: bh * 0.3,
          background: `linear-gradient(90deg,#8a7050,#d4c4a8 40%,#a89070)`,
        }}
      />
      {/* ⑦ 瓶腹（球） */}
      <div
        data-part="belly"
        style={{
          width: bw,
          height: bh,
          borderRadius: "46% 46% 48% 48%",
          background: "radial-gradient(circle at 34% 30%, #f0e4cc, #c0aa88 58%, #8a7454)",
          border: "1px solid rgba(90,70,44,.5)",
          position: "relative",
          marginTop: -1,
        }}
      >
        {/* ⑧ 釉面高光 */}
        <div
          data-part="gloss"
          style={{
            position: "absolute",
            left: "18%",
            top: "12%",
            width: "22%",
            height: "46%",
            borderRadius: 999,
            background: "linear-gradient(180deg, rgba(255,255,255,.6), transparent)",
            mixBlendMode: "screen",
          }}
        />
        {/* ⑨⑩ 腹部彩绘（detail≥2）*/}
        {detail >= 2 && (
          <>
            <div
              data-part="painted-band"
              style={{
                position: "absolute",
                left: "14%",
                right: "14%",
                top: "34%",
                height: "16%",
                background: `linear-gradient(90deg, transparent, ${color}aa, transparent)`,
              }}
            />
            <div
              data-part="painted-band"
              style={{
                position: "absolute",
                left: "14%",
                right: "14%",
                bottom: "22%",
                height: "10%",
                background: "linear-gradient(90deg, transparent, rgba(60,42,20,.4), transparent)",
              }}
            />
          </>
        )}
      </div>
      {/* ⑪ 圈足 */}
      <div
        data-part="foot"
        style={{
          width: bw * 0.54,
          height: bh * 0.1,
          background: "linear-gradient(180deg,#a89070,#6a5238)",
          borderRadius: `0 0 ${bw * 0.1}px ${bw * 0.1}px`,
          marginTop: -1,
        }}
      />
    </div>
  );
}

/** 烛台：单件（供桌里已内联；此 kind 用于独立摆放） */
export function Candlestick({ base, color, detail }: Prop3DContext) {
  const h = base * 0.8;
  return (
    <div style={{ ...COL, filter: "drop-shadow(0 3px 6px rgba(0,0,0,.34))" }}>
      {/* ① 烛苗 */}
      <div
        data-part="flame"
        style={{
          width: base * 0.1,
          height: base * 0.16,
          borderRadius: "50% 50% 40% 40%",
          background: "radial-gradient(circle at 50% 66%, #fff6d2, #f0a83c 60%, transparent 78%)",
          filter: "blur(.4px)",
        }}
      />
      {/* ②③ 烛身 */}
      <div
        data-part="candle"
        style={{ width: base * 0.09, height: h * 0.24, background: "linear-gradient(90deg,#e8dfc8,#fffaf0,#c8bfa8)" }}
      />
      <div
        data-part="drip"
        style={{ width: base * 0.11, height: base * 0.05, borderRadius: "50%", background: "#efe6d0", marginTop: -1 }}
      />
      {/* ④ 承盘 */}
      <div
        data-part="drip-pan"
        style={{
          width: base * 0.24,
          height: base * 0.04,
          borderRadius: "50%",
          background: "linear-gradient(180deg,#d4af37,#8a6a18)",
        }}
      />
      {/* ⑤ 柱身 */}
      <div data-part="shaft" style={{ width: base * 0.05, height: h * 0.34, background: roundShade(color) }} />
      {/* ⑥ 中节（detail≥1）*/}
      {detail >= 1 && (
        <div
          data-part="knop"
          style={{ width: base * 0.14, height: base * 0.09, borderRadius: "46%", background: "linear-gradient(180deg,#d4af37,#8a6a18)", marginTop: -1 }}
        />
      )}
      {/* ⑦ 圈足 */}
      <div
        data-part="foot"
        style={{
          width: base * 0.3,
          height: base * 0.05,
          borderRadius: "50%",
          background: "linear-gradient(180deg,#c9a961,#6a5238)",
          marginTop: -1,
        }}
      />
    </div>
  );
}
