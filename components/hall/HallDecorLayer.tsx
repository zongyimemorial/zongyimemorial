import type { CSSProperties } from "react";
import {
  decorItem,
  decorStyle,
  findTemplate,
  resolveOrnamentItems,
  type HallDecor,
  type OrnamentSpec,
} from "@/lib/hall-decor";
import { skinIsActive, skinOf, skinVars, type SkinTokens } from "@/lib/decor-skin";

/**
 * 装修层：把装修方案（壁纸/地纹/挂饰）渲染成纯 CSS 效果。
 * 服务端组件，可同时用于公网馆页与后台预览。
 *
 * ============================================================================
 * 全页联动换肤（阶段 4）
 * ============================================================================
 *
 * 本层除了画壁纸/挂饰，还负责在根节点**注入一组 `--skin-*` CSS 变量**，
 * 馆页里任意深度的卡片/标题/分隔线都能直接 `var(--skin-*)` 读到。
 *
 * 为什么是 CSS 变量而不是 React Context：
 *   · 公页是 **Server Component** —— Context 要求 Provider 是客户端组件，
 *     等于把整页拖进客户端 bundle（隧道环境首屏受不了）；
 *   · 变量**天然级联**，不需要把装修方案穿过 5~6 层组件逐层透传；
 *   · 变量值是内联 style 字符串，**不依赖 window** —— 服务端能算出同样的值，
 *     因此**没有水合 mismatch**（AGENTS.md 反复强调的一条）。
 *
 * ⚠️ **不改任何 DOM 结构**。只在根节点多挂 `data-skin` 与 `style`——
 *    既有 23 套断言依赖的 class（卡片标题、`overflow-hidden`、`p-3`）
 *    一个字都不动，所以它们零风险。
 */

function Ornament({ spec }: { spec: OrnamentSpec }) {
  switch (spec.kind) {
    /*
      niche-wall 是一整幅场景（含长柜/灯柱/花束/地面），必须撑满馆页顶部，
      不能塞进这个 fixed 的"檐下挂饰"容器里 —— 它由馆页用 <NicheWallHero/> 单独渲染。
      这里显式返回 null，避免同一位逝者的画面被渲染两次。
    */
    case "niche-wall":
      return null;
    case "lantern": {
      const count = spec.count ?? 2;
      return (
        <div className="flex justify-center gap-16 pt-1">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex flex-col items-center" style={{ marginTop: i % 2 === 0 ? 0 : 10 }}>
              <div className="h-3 w-6 rounded-full" style={{ background: spec.color }} />
              <div className="h-px w-0.5" style={{ background: spec.color, opacity: 0.6 }} />
              <div
                className="h-10 w-8 rounded-[45%] shadow-md"
                style={{
                  background: `radial-gradient(circle at 50% 35%, ${spec.color}, ${spec.color}cc 60%, ${spec.color}88)`,
                  boxShadow: `0 0 22px ${spec.color}66`,
                }}
              />
              <div className="h-5 w-1 rounded-b" style={{ background: spec.color, opacity: 0.75 }} />
            </div>
          ))}
        </div>
      );
    }
    case "couplet-pillar":
      return (
        <div className="fixed inset-0">
          <div
            className="pointer-events-none absolute bottom-0 left-0 top-0 w-4 md:w-6"
            style={{
              background: `linear-gradient(90deg, ${spec.color}, ${spec.color}dd 45%, ${spec.color}99)`,
              boxShadow: "inset -3px 0 8px rgba(0,0,0,0.35)",
            }}
          />
          <div
            className="pointer-events-none absolute bottom-0 right-0 top-0 w-4 md:w-6"
            style={{
              background: `linear-gradient(270deg, ${spec.color}, ${spec.color}dd 45%, ${spec.color}99)`,
              boxShadow: "inset 3px 0 8px rgba(0,0,0,0.35)",
            }}
          />
        </div>
      );
    case "curtain":
      return (
        <div className="flex justify-between gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 flex-1 rounded-b-[60%]"
              style={{
                background: `linear-gradient(180deg, ${spec.color}, ${spec.color}00)`,
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      );
    case "flower":
      return (
        <div className="pointer-events-none absolute bottom-3 left-4 flex items-end gap-1">
          {/* ③ 真花束（阶段 2 起不再用 emoji —— emoji 不吃 color，
                 选不同颜色的花束看起来完全一样，正是"付费没效果"的老毛病）*/}
          <div className="relative h-16 w-14">
            <div
              className="absolute bottom-0 left-1/2 h-7 w-8 -translate-x-1/2 rounded-[46%_46%_48%_48%]"
              style={{
                background: `radial-gradient(circle at 34% 30%, #f0e4cc, #c0aa88 58%, #8a7454)`,
                border: "1px solid rgba(90,70,44,.5)",
              }}
            />
            {[
              { l: "50%", t: 2, s: 12 },
              { l: "28%", t: 8, s: 10 },
              { l: "72%", t: 9, s: 11 },
              { l: "40%", t: 18, s: 9 },
              { l: "62%", t: 20, s: 8 },
            ].map((b, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: b.l,
                  top: b.t,
                  width: b.s,
                  height: b.s,
                  transform: "translateX(-50%)",
                  background: `radial-gradient(circle at 40% 36%, #fffdf6, ${spec.color} 58%, ${spec.color}77)`,
                }}
              />
            ))}
            <div className="absolute bottom-6 left-1/2 h-8 w-px -translate-x-1/2 bg-[#5a7a4a]" />
          </div>
        </div>
      );
    case "shelf":
      return (
        <div className="pointer-events-none absolute inset-x-8 bottom-0">
          {/* 案面 + 束腰 + 四足（阶段 2 起用构件而不是 emoji 摆件） */}
          <div
            className="mx-auto h-3 w-full max-w-lg rounded-sm shadow-lg"
            style={{ background: `linear-gradient(180deg, ${spec.color}, ${spec.color}aa)` }}
          />
          <div
            className="mx-auto h-1.5 w-[88%] max-w-md"
            style={{ background: `linear-gradient(180deg, ${spec.color}aa, ${spec.color}66)` }}
          />
          <div className="mx-auto flex w-full max-w-lg justify-between px-6">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-10 w-[3px] rounded-b"
                style={{ background: `linear-gradient(180deg, ${spec.color}, rgba(0,0,0,.5))` }}
              />
            ))}
          </div>
        </div>
      );
    case "halo":
      return (
        <div
          className="pointer-events-none absolute left-1/2 top-6 h-40 w-40 -translate-x-1/2 rounded-full blur-2xl"
          style={{ background: `radial-gradient(circle, ${spec.color}55, transparent 70%)` }}
        />
      );
    case "plaque":
      return (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
          <div
            className="rounded-sm px-6 py-1.5 text-base tracking-[0.4em] shadow-lg"
            style={{
              background: `linear-gradient(180deg, ${spec.color}dd, ${spec.color}88)`,
              color: "#3a2c1e",
              border: `1px solid ${spec.color}`,
            }}
          >
            {spec.text}
          </div>
        </div>
      );

    // -----------------------------------------------------------------------
    // 阶段 2 新增 kind（2D 层）
    // -----------------------------------------------------------------------
    //
    // ⚠️ 这里必须与 `components/decor/Prop3D/index.tsx` 的 RENDERERS 保持
    //    **kind 集合一致**。漏一个的后果是"工坊 3D 预览里有、馆页上看不到"
    //    （或反过来）—— 用户会觉得"预览是假的"。
    //    `verify-decor-prop3d.mjs` §5 会核对两边的集合。
    //
    // 2D 层不用 SVG 文件，仍走 CSS —— 与 3D 层共享同一套视觉语汇
    // （出檐 / 束腰 / 描金边），这样预览与实页是"同一件东西的两视图"。
    case "imperial-lantern":
      return (
        <div className="flex justify-center gap-20 pt-1">
          {Array.from({ length: spec.count ?? 2 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center">
              {/* ① 宝顶 ② 上出檐 ③ 灯体 ④ 垂锦 ⑤ 流苏 */}
              <div
                className="h-2 w-2 rounded-full"
                style={{ background: "radial-gradient(circle at 34% 30%, #fff3c4, #d4af37 58%, #8a6a18)" }}
              />
              <div
                className="h-2 w-12"
                style={{
                  clipPath: "polygon(14% 0%, 86% 0%, 100% 100%, 0% 100%)",
                  background: "linear-gradient(180deg,#c9a961,#7a5a24)",
                }}
              />
              <div
                className="relative h-14 w-12 overflow-hidden rounded-[18%_18%_14%_14%]"
                style={{
                  background: `linear-gradient(180deg, ${spec.color}ee, ${spec.color}99 60%, ${spec.color}cc)`,
                  border: "1.5px solid rgba(212,175,55,.7)",
                  boxShadow: `0 0 26px ${spec.color}55`,
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-[16%]"
                  style={{
                    background:
                      "repeating-linear-gradient(90deg, rgba(212,175,55,.55) 0 3px, transparent 3px 9px)",
                  }}
                />
                <div
                  className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ background: "radial-gradient(circle, rgba(255,248,222,.95), transparent 74%)" }}
                />
                <div
                  className="absolute inset-x-0 bottom-0 h-[14%]"
                  style={{
                    background:
                      "repeating-linear-gradient(90deg, rgba(212,175,55,.48) 0 3px, transparent 3px 9px)",
                  }}
                />
              </div>
              <div
                className="h-2.5 w-14"
                style={{
                  background:
                    "repeating-linear-gradient(45deg, rgba(255,215,140,.55) 0 4px, rgba(120,60,40,.85) 4px 8px)",
                  borderBottom: "1px solid rgba(212,175,55,.7)",
                }}
              />
              <div className="flex justify-center gap-1.5 pt-0.5">
                {[0, 1, 2, 3, 4].map((j) => (
                  <div key={j} className="h-5 w-0.5 rounded-b-full" style={{ background: "#c9a961" }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    case "plaque-pair":
      return (
        <div className="pointer-events-none absolute left-1/2 top-3 flex w-full max-w-2xl -translate-x-1/2 items-start justify-between px-4">
          {/* 左联 */}
          <div
            className="flex h-32 w-7 flex-col items-center justify-center gap-0.5 rounded-sm text-[11px] font-semibold tracking-widest"
            style={{
              background: `linear-gradient(90deg, ${spec.color}, ${spec.color}dd 45%, ${spec.color}99)`,
              color: "#f6e3ae",
              boxShadow: "inset -3px 0 8px rgba(0,0,0,.35)",
            }}
          >
            {["祖", "德"].map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </div>
          {/* 中匾 */}
          <div
            className="rounded-sm px-7 py-2 text-lg tracking-[0.35em] shadow-xl"
            style={{
              background: "linear-gradient(180deg,#2a1c10,#15110c)",
              color: "#f6e3ae",
              border: `2px solid ${spec.color}`,
            }}
          >
            {spec.text ?? "祖德流芳"}
          </div>
          {/* 右联 */}
          <div
            className="flex h-32 w-7 flex-col items-center justify-center gap-0.5 rounded-sm text-[11px] font-semibold tracking-widest"
            style={{
              background: `linear-gradient(270deg, ${spec.color}, ${spec.color}dd 45%, ${spec.color}99)`,
              color: "#f6e3ae",
              boxShadow: "inset 3px 0 8px rgba(0,0,0,.35)",
            }}
          >
            {["宗", "功"].map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </div>
        </div>
      );
    case "altar-table":
    case "incense-table":
      return (
        <div className="pointer-events-none absolute inset-x-10 bottom-0">
          <div
            className="mx-auto h-3 w-full max-w-md rounded-sm shadow-lg"
            style={{ background: `linear-gradient(180deg, ${spec.color}ee, ${spec.color}99)` }}
          />
          <div
            className="mx-auto h-1.5 w-[86%] max-w-sm"
            style={{ background: `linear-gradient(180deg, ${spec.color}aa, ${spec.color}66)` }}
          />
          <div className="mx-auto flex w-full max-w-md justify-between px-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 w-[3px]"
                style={{
                  background: `linear-gradient(180deg, ${spec.color}, rgba(0,0,0,.5))`,
                  borderRadius: spec.kind === "altar-table" ? "0 0 46% 46%" : 0,
                }}
              />
            ))}
          </div>
        </div>
      );
    case "vase":
      return (
        <div className="pointer-events-none absolute bottom-3 right-5">
          <div className="flex flex-col items-center">
            {[
              { s: 9 },
              { s: 7 },
            ].map((b, i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: b.s,
                  height: b.s,
                  marginLeft: i === 0 ? -6 : 6,
                  marginBottom: -3,
                  background: `radial-gradient(circle at 40% 36%, #fffdf6, ${spec.color} 58%, ${spec.color}77)`,
                }}
              />
            ))}
            <div className="h-6 w-1 rounded bg-[#5a7a4a]" />
            <div
              className="h-1.5 w-3"
              style={{ clipPath: "polygon(0% 0%, 100% 0%, 74% 100%, 26% 100%)", background: "#c8b48c" }}
            />
            <div
              className="h-8 w-6 rounded-[44%_44%_48%_48%]"
              style={{
                background: "radial-gradient(circle at 34% 30%, #f0e4cc, #c0aa88 58%, #8a7454)",
                border: "1px solid rgba(90,70,44,.5)",
              }}
            />
            <div className="h-1.5 w-3.5 rounded-b" style={{ background: "linear-gradient(180deg,#a89070,#6a5238)" }} />
          </div>
        </div>
      );
    case "candlestick":
      return (
        <div className="pointer-events-none absolute inset-x-14 bottom-0 flex justify-between">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col items-center">
              <div
                className="h-2.5 w-1.5 rounded-t-full"
                style={{
                  background: "radial-gradient(circle at 50% 66%, #fff6d2, #f0a83c 60%, transparent 78%)",
                }}
              />
              <div className="h-3 w-1 rounded-sm bg-[#efe6d0]" />
              <div className="h-1 w-4 rounded-full" style={{ background: "linear-gradient(180deg,#d4af37,#8a6a18)" }} />
              <div className="h-8 w-[3px]" style={{ background: `linear-gradient(90deg, rgba(0,0,0,.42), ${spec.color} 34%, ${spec.color} 62%, rgba(0,0,0,.5))` }} />
              <div className="h-1 w-5 rounded-full" style={{ background: "linear-gradient(180deg,#c9a961,#6a5238)" }} />
            </div>
          ))}
        </div>
      );
    case "screen":
      return (
        <div className="pointer-events-none absolute bottom-0 left-1/2 flex -translate-x-1/2 items-end">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="relative h-40 w-16 overflow-hidden"
              style={{
                marginLeft: i === 0 ? 0 : -1,
                background: `linear-gradient(180deg, ${spec.color}f2, ${spec.color}cc)`,
                boxShadow: `inset 0 0 0 2px rgba(160,120,50,.9)`,
              }}
            >
              <div className="absolute inset-1 bg-[linear-gradient(180deg,rgba(248,240,222,.9),rgba(222,208,182,.86))]" />
              <div className="absolute inset-x-0 bottom-0 h-6" style={{ background: `linear-gradient(180deg, ${spec.color}, rgba(0,0,0,.42))` }} />
            </div>
          ))}
        </div>
      );
    case "screen-wall":
      return (
        <div className="pointer-events-none absolute inset-x-6 bottom-0">
          <div
            className="mx-auto h-4 w-[92%] rounded-t-sm"
            style={{
              background: "linear-gradient(180deg,#5a6068,#2e3238)",
              clipPath: "polygon(4% 0%, 96% 0%, 100% 100%, 0% 100%)",
            }}
          />
          <div className="relative mx-auto h-24 w-[86%]" style={{ background: `linear-gradient(180deg, ${spec.color}, rgba(0,0,0,.28))` }}>
            <div className="absolute inset-x-[10%] inset-y-[18%] border-2 border-[rgba(212,175,55,.5)] bg-[linear-gradient(180deg,rgba(245,238,222,.22),rgba(0,0,0,.18))]" />
          </div>
          <div
            className="mx-auto h-5 w-[96%] rounded-b-sm"
            style={{ background: "linear-gradient(180deg,#a8a294,#7c766a 56%,#5e584e)" }}
          />
        </div>
      );
    case "scroll-painting":
      return (
        <div className="pointer-events-none absolute inset-x-10 top-24 flex justify-between">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="h-1.5 w-11 rounded-full" style={{ background: "linear-gradient(180deg,#6a5238,#3a2a18)" }} />
              <div
                className="relative h-32 w-10 overflow-hidden"
                style={{ background: "linear-gradient(180deg,#e8e6dc,#d8d4c4 62%,#c8c2ae)", border: "1px solid rgba(90,70,44,.35)" }}
              >
                <div
                  className="absolute inset-x-0 bottom-[38%] h-[30%]"
                  style={{
                    background: `linear-gradient(180deg, transparent, ${spec.color}88)`,
                    clipPath: "polygon(0% 100%, 18% 42%, 34% 74%, 52% 20%, 70% 66%, 86% 38%, 100% 100%)",
                  }}
                />
                <div className="absolute inset-x-[8%] top-[26%] h-[10%] rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent)]" />
              </div>
              <div className="h-2 w-12 rounded-full" style={{ background: "linear-gradient(180deg,#4a3620,#241a10)" }} />
            </div>
          ))}
        </div>
      );
    case "caisson-light":
      // 藻井灯由结构层（藻井）承担，2D 页面上不重复出现
      return null;
    default:
      return null;
  }
}

export default function HallDecorLayer(props: {
  decor: HallDecor;
  className?: string;
  children?: React.ReactNode;
  style?: CSSProperties;
  /**
   * 已算好的皮肤（可选）。传了就**以它为准**，不再自己推断。
   *
   * 存在的理由：深色判定依赖调用方的旧列表（`onDarkWall`），层看不到；
   * 而"文字色/卡片底色必须同源"，所以由调用方 `withDark()` 回写后传入。
   * 见 lib/decor-skin.ts 的 `withDark()` 注释。
   */
  skin?: SkinTokens;
  /**
   * 关闭页面级 fixed「檐下挂饰」层（灯笼/幔帐/牌匾等悬浮饰物）。
   *
   * 存在的理由：默认厅堂已升级为 3D 舞台（Hall3DStage），舞台内部自绘
   * 灯笼/匾额/光晕等陈设 —— 页面级 fixed 挂饰会与舞台内的立体挂饰**重复叠挂**
   * （2026-10 实测：白灯笼 + 条案悬浮在 3D 厅堂上）。3D 舞台接管挂饰后，
   * 调用方传 true 关掉这层；其余页面形态（付费 3D 场景/旧版式）不受影响。
   */
  suppressFixedOrnaments?: boolean;
}) {
  const { decor, className = "", children, style } = props;
  const wall = decorItem("wall", decor);
  const floor = decorItem("floor", decor);
  /*
    多挂饰（2026-10）：挂饰一律经 resolveOrnamentItems 取清单（首件 = 主陈设），
    绝不直接读 slots.ornament（「同一事实两个判据」防复发）。皮肤取色用主陈设。
  */
  const ornItems = resolveOrnamentItems(decor);
  const orn = ornItems[0] ?? decorItem("ornament", decor);
  const font = decorItem("font", decor);

  const textLight = !!wall?.style.color && wall.style.color !== "#1f262e";

  /*
    全页换肤：把"当前这套装修"翻译成 CSS 变量。
    素材（wall/floor/ornament/frame/font）与模板都参与，模板最后拍板 ——
    合并顺序的详细理由见 lib/decor-skin.ts 文件头。

    ⚠️ `skin` prop 由调用方传入时**优先**（不再自己算）。
       为什么需要这个口子：深色判定（"旧硬编码列表 || skin.dark"）只有
       调用方知道 —— 层本身看不到 `onDarkWall` 那张表。而"文字色"与
       "卡片底色"必须来自**同一个判据**，否则会在边界素材上打架
       （浅色字 + 浅米卡，实测抓到的真 bug，详见 lib/decor-skin.ts 的
        `withDark()`）。所以调用方算好（含回写）再传进来。
  */
  const skin =
    props.skin ??
    skinOf(decor, {
      items: {
        wall,
        floor,
        ornament: orn,
        frame: decorItem("frame", decor),
        font,
      },
      template: decor.templateId
        ? { id: decor.templateId, skin: findTemplate(decor.templateId)?.skin }
        : undefined,
    });

  return (
    <div
      className={`relative ${className}`}
      data-skin={skinIsActive(skin) ? "on" : "off"}
      style={{ ...decorStyle("wall", decor), ...skinVars(skin), ...style }}
    >
      {/* 壁纸叠加纹理 */}
      {wall?.style.overlay && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: wall.style.overlay }}
        />
      )}

      {/* 挂饰层：灯笼/幔帐/立柱用 fixed/sticky，滚动时仍可见。
          多挂饰（≥2 件）在同一容器里并排；**单件保持原标记结构**（零回归）。
          3D 舞台接管挂饰时（suppressFixedOrnaments）整层关闭，避免重复叠挂 */}
      {(() => {
        if (props.suppressFixedOrnaments) return null;
        const specs = ornItems
          .map((it) => it.style.ornament)
          .filter((s): s is OrnamentSpec => !!s);
        if (specs.length === 0) return null;
        if (specs.length === 1) {
          return (
            <div className="pointer-events-none fixed inset-x-0 top-16 z-20">
              <Ornament spec={specs[0]} />
            </div>
          );
        }
        return (
          <div className="pointer-events-none fixed inset-x-0 top-16 z-20 flex items-start justify-center gap-2 md:gap-5 px-2 md:px-6">
            {ornItems.map((it, i) => {
              const s = it.style.ornament;
              if (!s) return null;
              return (
                <div key={`${i}-${it.id}`} data-ornament={it.id} className="min-w-0 flex-1 max-w-xl">
                  <Ornament spec={s} />
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* 地面层 */}
      {floor && floor.id !== "floor-none" && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
          style={{
            backgroundImage: floor.style.backgroundImage,
            maskImage: "linear-gradient(180deg, transparent, black 65%)",
            WebkitMaskImage: "linear-gradient(180deg, transparent, black 65%)",
            opacity: 0.85,
          }}
        />
      )}

      <div
        className="relative z-10"
        style={{
          fontFamily: font?.style.fontFamily,
          letterSpacing: font?.style.letterSpacing,
          textShadow: font?.style.textShadow,
          color: textLight ? undefined : "inherit",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export { Ornament };
