"use client";

import { unitToPx, type Space3D, type ColumnSpec, type BeamSpec, type DougongSpec, type PodiumSpec, type DividerSpec, type StructureTier } from "@/lib/decor-3d";
import { buildFills } from "@/components/decor/Scene/MaterialStyle";

/**
 * 结构层：把 `Space3D` 里的柱 / 枋 / 斗拱 / 台基 / 天花 / 分隔 画成 DOM。
 *
 * ## 它在整个 v2 里承担什么
 *
 * v1 的 3D 场景只有「三面墙 + 一块顶 + 几个陈设」，于是所有 SpaceKind
 * 长出来都是"同一间方盒子换壁纸"。结构层是**装修前后落差的主体**：
 * 免费档只有台基 + 一道额枋 + 几根椽，豪华档有 6 柱 + 3 道枋 + 6 朵斗拱 +
 * 须弥座 + 栏杆 + 藻井。这个落差必须是**可数的**（`data-structure` 计数），
 * 而不是"感觉更豪华"。
 *
 * ## 三层硬约束
 *
 * ① **只能画在「世界层」内**。结构构件参与 `viewerTransform` 的反向旋转，
 *    拖拽环视时它们得跟着转，否则一眼看出是"贴玻璃上的画"。
 * ② **必须能被子元素叠层**（`preserve-3d`）。柱础、斗拱的出跳全靠层叠出体积感。
 * ③ **绝不能把遗像 / 堂号 / 供台画进来**。那些是业务数据，
 *    必须是调用方传入的真实 HTML 节点（AGENTS.md 硬约束）。
 *    结构层只画"建筑"，不画"内容"。
 *
 * ## 零外部资源
 *
 * 全部是 div + CSS 渐变 + `clip-path`。不请求任何图片（原因见 lib/decor-3d.ts 文件头：
 * 隧道环境 30–50% 抖动，任何外部资源都可能让首屏白屏）。
 */

type Fills = ReturnType<typeof buildFills>;

/** 结构层的公共外框样式（所有构件都从这里派生） */
const NODE = {
  position: "absolute" as const,
  left: "50%",
  bottom: 0,
  transformStyle: "preserve-3d" as const,
  pointerEvents: "none" as const,
};

/**
 * 结构件与墙面的 Z 分层。
 *
 * ⚠️ **这是踩过的真坑，别把 0 改回去。**
 *
 * 正面墙（`walls[0]`）在 `translateZ: 0`，而结构件原先也画在 z=0 —— **同一层**。
 * 在 `preserve-3d` 里共面元素的绘制顺序 = DOM 顺序，而墙体在
 * `Decor3DScene` 里排在 `Structure3D` **之后**，
 * 于是**柱子被正面墙整片盖住**：DOM 里有柱子（rect 量到 17×271）、
 * 断言全绿、控制台无错，但用户只看到一面墙 ——
 * "买了豪华装修却什么都没有"，正是最该避免的静默失效。
 *
 * 实测判据：`document.elementFromPoint(柱心)` 返回的是 `[data-wall]` 而不是柱子。
 *
 * 解法：结构件统一向观察者方向（+Z，即更近）推 `STRUCTURE_Z`。
 * 40px 远小于 perspective(1400)，透视变形可忽略，但足以脱离共面、
 * 稳定地压在正面墙**之前**；同时仍远小于侧墙的 -20（depth/2），
 * 所以"越过侧墙"的观感不会被破坏。
 */
const STRUCTURE_Z = 40;

/** 把 (x, bottom) 转成 CSS transform（结构件只左右与高，另加一层 Z 脱离墙面） */
function at(x: number, bottom: number) {
  return `translate3d(${x}px, ${-bottom}px, ${STRUCTURE_Z}px)`;
}

// ---------------------------------------------------------------------------
// 立柱
// ---------------------------------------------------------------------------

/**
 * 一根立柱。
 *
 * 体积感的来源是**横向渐变**（`lacquer` 配方：dark → light 30% → base 62% → dark）——
 * 一张平面 div 只要明暗分布对，看起来就是圆柱。这是既有 `PillarPair.tsx`
 * 已验证过的做法，v2 只是复用它并把色交给材质主题。
 *
 * 层数（`detail` 控制）：
 *   detail 0 → 柱身（1 层）
 *   detail ≥1 → + 柱础 + 雀替（3 层）
 *   detail =2 → + 柱头箍 + 高光条（5 层）
 */
function Column3D({
  spec,
  containerW,
  fills,
  detail,
}: {
  spec: ColumnSpec;
  containerW: number;
  fills: Fills;
  detail: 0 | 1 | 2;
}) {
  const w = unitToPx(spec.diameter, containerW);
  const h = unitToPx(spec.top, containerW);
  const x = unitToPx(spec.x, containerW);

  return (
    <div
      data-structure="column"
      data-column-id={spec.id}
      style={{ ...NODE, transform: at(x, 0), marginLeft: -w / 2 }}
    >
      {/* 柱础：鼓形，汉白玉两点渐变 */}
      {detail >= 1 && spec.plinth && (
        <div
          data-part="plinth"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 0,
            width: w * 1.7,
            height: unitToPx(2.2, containerW),
            marginLeft: -(w * 1.7) / 2,
            borderRadius: "42% 42% 16% 16% / 60% 60% 40% 40%",
            background: `linear-gradient(180deg, ${fills.stone})`,
            boxShadow: "0 3px 7px rgba(0,0,0,.42)",
          }}
        />
      )}

      {/* 柱身 */}
      <div
        data-part="shaft"
        style={{
          position: "absolute",
          left: "50%",
          bottom: unitToPx(1.6, containerW),
          width: w,
          height: h,
          marginLeft: -w / 2,
          background: fills.pillar,
          borderRadius: `${w * 0.16}px ${w * 0.16}px 2px 2px`,
          /*
            ⚠️ 箱阴影三层各有分工，别删：
            ① inset 内阴影 → 柱身圆柱感（左侧暗）
            ② **外描边 + 落影**（0 0 0 1px + 2px 3px）→ 与背景墙分离。

            ② 是这次专门补的：实测立柱是深朱红、背景墙可能是深棕织锦，
            **两者明度接近时柱子"融"进墙里**，看起来像"没有柱子"。
            这不是几何错（rect 测得到 17×271），是**对比度**问题 ——
            断言测不出来，但用户一眼就觉得"没装修效果"。
            加一道近乎黑的 1px 描边 + 向右下 3px 落影，任何墙色下都能立住。
          */
          boxShadow:
            "inset 0 0 12px rgba(0,0,0,.28), 0 0 0 1px rgba(0,0,0,.42), 2px 3px 12px rgba(0,0,0,.45)",
        }}
      >
        {/* 柱头箍（detail=2）：一道描金细箍 */}
        {detail >= 2 && (
          <div
            data-part="capital"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: unitToPx(1.6, containerW),
              height: unitToPx(1.1, containerW),
              background: `linear-gradient(180deg, ${fills.metal})`,
              opacity: 0.9,
            }}
          />
        )}
        {/* 高光条（detail=2）：窄白条做"釉面反光" */}
        {detail >= 2 && (
          <div
            data-part="gloss"
            style={{
              position: "absolute",
              left: "18%",
              top: "8%",
              width: w * 0.16,
              height: "78%",
              borderRadius: 999,
              background:
                "linear-gradient(180deg, rgba(255,255,255,.42), rgba(255,255,255,.06))",
              mixBlendMode: "screen",
            }}
          />
        )}
      </div>

      {/* 雀替：柱与枋之间的角撑（两片三角形），detail ≥1 */}
      {detail >= 1 && spec.sparrowBrace && (
        <>
          <div
            data-part="sparrow"
            style={{
              position: "absolute",
              left: "50%",
              bottom: unitToPx(spec.top - 3, containerW),
              width: w * 1.9,
              height: unitToPx(3, containerW),
              marginLeft: -w * 1.05,
              background: fills.beam,
              clipPath: "polygon(0% 100%, 100% 100%, 0% 0%)",
              opacity: 0.92,
            }}
          />
          <div
            data-part="sparrow"
            style={{
              position: "absolute",
              left: "50%",
              bottom: unitToPx(spec.top - 3, containerW),
              width: w * 1.9,
              height: unitToPx(3, containerW),
              marginLeft: -w * 0.85,
              background: fills.beam,
              clipPath: "polygon(0% 100%, 100% 100%, 100% 0%)",
              opacity: 0.92,
            }}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 梁枋
// ---------------------------------------------------------------------------

/**
 * 一道梁枋。
 *
 * `painted` 叠一条简化旋子彩画（`repeating-linear-gradient` 暗金竖纹）——
 * 这是"官式建筑"最一眼可辨的特征：梁上有没有彩画。
 * `detail ≥ 1` 才真正绘制（档位低的梁就是素木）。
 */
function Beam3D({
  spec,
  containerW,
  fills,
  detail,
}: {
  spec: BeamSpec;
  containerW: number;
  fills: Fills;
  detail: 0 | 1 | 2;
}) {
  const from = unitToPx(spec.fromX, containerW);
  const to = unitToPx(spec.toX, containerW);
  const w = to - from;
  const h = unitToPx(spec.depth, containerW);
  const bottom = unitToPx(spec.bottom, containerW);
  const cx = from + w / 2;

  return (
    <div
      data-structure="beam"
      data-beam-kind={spec.kind}
      style={{ ...NODE, transform: at(cx, bottom), marginLeft: -w / 2 }}
    >
      <div
        data-part="body"
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: w,
          height: h,
          background: fills.beam,
          borderRadius: 2,
          /* 与柱子同款"描边 + 落影"：让梁枋从墙面上浮出来（理由见柱身注释） */
          boxShadow:
            "0 4px 10px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.14), 0 0 0 1px rgba(0,0,0,.36)",
        }}
      >
        {/* 旋子彩画（简化）：暗金等距竖纹，detail ≥1 且 painted 才画 */}
        {detail >= 1 && spec.painted && (
          <div
            data-part="painted"
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "repeating-linear-gradient(90deg, rgba(212,175,55,.85) 0 2px, transparent 2px 40px)",
              opacity: 0.55,
            }}
          />
        )}
        {/* 枋下"阴影线"：让枋与墙之间有一道缝，避免贴在墙上 */}
        <div
          data-part="underside"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -unitToPx(0.7, containerW),
            height: unitToPx(0.7, containerW),
            background: "rgba(0,0,0,.34)",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 斗拱
// ---------------------------------------------------------------------------

/**
 * 一朵斗拱。
 *
 * 斗拱的观感全部来自**出跳层数**：每层向外交替伸出一小段，
 * 并且逐层变窄 + 底下压一道暗影。所以它天然是"层数越多越华丽"的构件，
 * 正好适合当档位落差的可视化。
 *
 * 层数上限 5（再多在这个尺寸下就糊成一团）。
 */
function Dougong3D({
  spec,
  containerW,
  fills,
}: {
  spec: DougongSpec;
  containerW: number;
  fills: Fills;
}) {
  const x = unitToPx(spec.x, containerW);
  const bottom = unitToPx(spec.bottom, containerW);
  const tiers = Math.max(1, Math.min(5, spec.tiers));
  const unit = unitToPx(3.4, containerW);

  return (
    <div
      data-structure="dougong"
      style={{ ...NODE, transform: at(x, bottom) }}
    >
      {Array.from({ length: tiers }).map((_, i) => {
        const w = unit * (1.5 - i * 0.16);
        const h = unit * 0.34;
        return (
          <div
            key={i}
            data-part="tier"
            style={{
              position: "absolute",
              left: "50%",
              bottom: i * h * 0.92,
              width: w,
              height: h,
              marginLeft: -w / 2,
              background: i % 2 === 0 ? fills.beam : fills.metal,
              borderRadius: 1,
              boxShadow: "0 2px 4px rgba(0,0,0,.4)",
            }}
          />
        );
      })}
      {/* 最上方一块"坐斗"：斗拱顶上的方斗 */}
      <div
        data-part="cap"
        style={{
          position: "absolute",
          left: "50%",
          bottom: tiers * unit * 0.34 * 0.92,
          width: unit * 0.9,
          height: unit * 0.36,
          marginLeft: -unit * 0.45,
          background: fills.metal,
          borderRadius: 1,
          boxShadow: "0 2px 5px rgba(0,0,0,.45)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 台基
// ---------------------------------------------------------------------------

/**
 * 台基。
 *
 * 两个形制：
 *   - `terrace` 普通台基：一块带踏步的方台；
 *   - `sumeru` 须弥座：中部**内收**（束腰）—— 这是高等级建筑最显著的标志，
 *     收进去那一段会形成一条横向暗带，一眼就能与普通台基区分。
 *
 * 台面用 `rotateX(78deg)` 平铺（复用 `Floor3D` 的手法），
 * 这样它与地面在同一套透视里，不会有"两块地"的错觉。
 */
function Podium3D({
  spec,
  containerW,
  fills,
  detail,
}: {
  spec: PodiumSpec;
  containerW: number;
  fills: Fills;
  detail: 0 | 1 | 2;
}) {
  const w = containerW * 1.06;
  const surfaceD = unitToPx(9, containerW);
  const edgeH = unitToPx(spec.kind === "sumeru" ? 4.4 : 3.2, containerW);
  /*
    ⚠️ 台面的摆位与 `Floor3D` 是**镜像**关系，别照抄那边的公式
    （`Floor3D` 用的是 `transformOrigin: center top`，这边是 `center bottom`）。

    台面是一块 `surfaceD` 高、绕**底边**（`transformOrigin: center bottom`）
    躺平的平板（`rotateX(78deg)`）。`origin: bottom` 意味着旋转后
    这块板子从**它的底边开始向上**只占 `surfaceD · cos78°` 的高度。

    这个容器（`data-structure="podium"`）是 `NODE`，高度为 0，
    所以元素的 `bottom: B` 就是它的底边位置、也是旋转的支点。
    旋转后板子占 `[B, B + surfaceD·cos78°]`。
    要让它扣在竖板顶上 ⇒ **`bottom = edgeH`**。

    实测（W=513）：surfaceD=46、projectedH=10、edgeH=22.6
      ⇒ bottom=22.6 ⇒ 板子落在 y=22.6~32.6（竖板 0~22.6 之上）✓

    ⚠️ 别写 `bottom: 0`（初版）：板子会落在竖板**内部**，
    与竖板重叠成一条粗横带；也别写 `bottom: projectedH`。

    ⚠️ 另注：`getBoundingClientRect` 对这两个元素量到的 h（16 / 14）
    **不等于**名义 edgeH/projectedH —— 因为 `waist`、`step` 子元素
    与透视变换会改变视觉包围盒。所以断言里判"座面是否扣在竖板顶"
    **用实测的相邻边**（surface.bottom ≈ edge.top），不要拿名义值反推。
  */
  return (
    <div data-structure="podium" data-podium-kind={spec.kind} style={{ ...NODE }}>
      {/* 台面（俯视投影） */}
      <div
        data-part="surface"
        style={{
          position: "absolute",
          left: "50%",
          bottom: edgeH,
          width: w,
          height: surfaceD,
          marginLeft: -w / 2,
          transform: `translate3d(0,0,${STRUCTURE_Z}px) rotateX(78deg)`,
          transformOrigin: "center bottom",
          background: fills.stone,
          boxShadow: "inset 0 -6px 14px rgba(0,0,0,.26)",
        }}
      />
      {/* 正面竖板 */}
      <div
        data-part="edge"
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0,
          width: w,
          height: edgeH,
          marginLeft: -w / 2,
          background: `linear-gradient(180deg, ${fills.stone})`,
          boxShadow: "0 5px 14px rgba(0,0,0,.42)",
        }}
      >
        {/* 须弥座束腰：中部内收的暗带 */}
        {spec.kind === "sumeru" && (
          <div
            data-part="waist"
            style={{
              position: "absolute",
              left: "6%",
              right: "6%",
              top: "38%",
              height: "24%",
              background: "linear-gradient(180deg, rgba(0,0,0,.42), rgba(0,0,0,.16))",
              boxShadow: "inset 0 2px 4px rgba(0,0,0,.4)",
            }}
          />
        )}
      </div>
      {/* 踏步：错开的窄条，从台基前沿向外推 */}
      {Array.from({ length: Math.max(0, spec.steps - 1) }).map((_, i) => {
        const sw = w * 0.34;
        const sh = edgeH * 0.42;
        return (
          <div
            key={i}
            data-part="step"
            style={{
              position: "absolute",
              left: "50%",
              bottom: -sh * (i + 0.4),
              width: sw,
              height: sh,
              marginLeft: -sw / 2,
              background: `linear-gradient(180deg, ${fills.stone})`,
              borderRadius: "0 0 2px 2px",
              boxShadow: "0 3px 6px rgba(0,0,0,.4)",
            }}
          />
        );
      })}
      {/* 望柱栏板（detail ≥1 才画） */}
      {detail >= 1 && spec.railing && (
        /*
          ⚠️ 外层 NODE 没有宽度（只靠 left:50% + 负 marginLeft 定位），
          所以这里**不能**用 `left:4%; right:4%` —— 百分比相对零宽包含块，
          会塌成 0 宽（与 Divider3D 的栏杆是同一个坑）。
          改用显式宽度（台基宽度的 92%）。
        */
        <div
          data-part="railing"
          style={{
            position: "absolute",
            left: "50%",
            bottom: unitToPx(1.2, containerW),
            width: w * 0.92,
            marginLeft: -(w * 0.92) / 2,
            height: unitToPx(1.6, containerW),
            background:
              "linear-gradient(180deg, rgba(255,255,255,.30), rgba(255,255,255,.10))",
            borderTop: "1px solid rgba(255,255,255,.34)",
            display: "flex",
            justifyContent: "space-around",
            alignItems: "flex-end",
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 2,
                height: "170%",
                background: "rgba(240,238,232,.55)",
                borderRadius: 1,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 天花
// ---------------------------------------------------------------------------

/**
 * 藻井 / 卷棚 / 平棋 / 椽条。
 *
 * 藻井（`coffer`）是豪华档的证据：**n 圈同心方井，逐圈向内收 + 向深处推**。
 * 实现是每圈一个 div，`translateZ(-i*8px) scale(1-i*0.14) rotateX(-72deg)`。
 * 这套"层层内收"正是真实藻井的观感（站在底下往上看，一圈圈套进去）。
 * 圈数（2~5）直接就是档位数字。
 */
function CofferedCeiling3D({
  ceiling,
  containerW,
  fills,
}: {
  ceiling: Space3D["ceiling"];
  containerW: number;
  fills: Fills;
}) {
  if (ceiling.type === "none") return null;

  // ---- 椽条（原 beam 语义） ----
  if (ceiling.type === "rafters" || ceiling.type === "beam") {
    const count = "count" in ceiling ? ceiling.count : 4;
    const color = "color" in ceiling ? ceiling.color : "#6b5540";
    const depth = unitToPx(SPACE_DEPTH, containerW);
    return (
      <div
        data-structure="ceiling"
        data-ceiling-kind="rafters"
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          width: containerW * 1.4,
          height: depth * 0.9,
          marginLeft: -(containerW * 1.4) / 2,
          transform: `translate3d(0,0,${-depth * 0.3}px) rotateX(-72deg)`,
          transformOrigin: "center top",
          display: "flex",
          justifyContent: "space-around",
          pointerEvents: "none",
          transformStyle: "preserve-3d",
        }}
      >
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            data-part="rafter"
            style={{
              width: unitToPx(2.4, containerW),
              height: "100%",
              background: `linear-gradient(180deg, ${color}, rgba(0,0,0,.25))`,
              boxShadow: "0 6px 18px rgba(0,0,0,.28)",
            }}
          />
        ))}
      </div>
    );
  }

  // ---- 藻井 ----
  if (ceiling.type === "coffer") {
    const rings = Math.max(1, Math.min(5, ceiling.rings));
    const base = unitToPx(46, containerW);
    return (
      <div
        data-structure="ceiling"
        data-ceiling-kind="coffer"
        data-coffer-rings={rings}
        style={{
          position: "absolute",
          left: "50%",
          top: unitToPx(4, containerW),
          width: base,
          height: base * 0.62,
          marginLeft: -base / 2,
          transformStyle: "preserve-3d",
          pointerEvents: "none",
        }}
      >
        {Array.from({ length: rings }).map((_, i) => {
          const s = 1 - i * 0.14;
          const w = base * s;
          const h = base * 0.62 * s;
          return (
            <div
              key={i}
              data-part="coffer-ring"
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: w,
                height: h,
                marginLeft: -w / 2,
                marginTop: -h / 2,
                transform: `translateZ(${-i * 8}px) rotateX(-72deg)`,
                transformOrigin: "center center",
                background:
                  i === 0
                    ? `linear-gradient(180deg, ${ceiling.color}, rgba(0,0,0,.42))`
                    : i % 2 === 0
                      ? `linear-gradient(180deg, ${fills.beam})`
                      : `linear-gradient(180deg, ${fills.metal})`,
                border: "1px solid rgba(0,0,0,.35)",
                boxShadow: "inset 0 0 14px rgba(0,0,0,.45)",
              }}
            />
          );
        })}
        {/* 中心藻井灯：藻井正中悬一盏（这是"结构自带"的构件，不占挂饰槽） */}
        <div
          data-part="caisson-light"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: base * 0.14,
            height: base * 0.14,
            marginLeft: -(base * 0.14) / 2,
            borderRadius: "50%",
            background: `radial-gradient(circle at 50% 40%, #fff7dc, ${fills.metal} 60%, rgba(120,88,30,.6))`,
            boxShadow: "0 0 26px rgba(255,232,170,.55)",
          }}
        />
      </div>
    );
  }

  // ---- 卷棚（弧形顶） ----
  if (ceiling.type === "scroll") {
    return (
      <div
        data-structure="ceiling"
        data-ceiling-kind="scroll"
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          width: containerW * 1.1,
          height: unitToPx(14, containerW),
          marginLeft: -(containerW * 1.1) / 2,
          borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
          background: `linear-gradient(180deg, ${ceiling.color}, rgba(0,0,0,.2))`,
          opacity: 0.9,
          pointerEvents: "none",
        }}
      />
    );
  }

  // ---- 平棋（方格顶） ----
  if (ceiling.type === "caisson") {
    return (
      <div
        data-structure="ceiling"
        data-ceiling-kind="caisson"
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          width: containerW * 1.2,
          height: unitToPx(16, containerW),
          marginLeft: -(containerW * 1.2) / 2,
          backgroundImage: `repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 1px, transparent 1px ${unitToPx(7, containerW)}px), repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 1px, transparent 1px ${unitToPx(7, containerW)}px), linear-gradient(180deg, ${ceiling.color}, transparent)`,
          pointerEvents: "none",
        }}
      />
    );
  }

  // ---- v1 的 vault / open：原样保留语义（v2 的 v1 兼容路径要用） ----
  if (ceiling.type === "vault") {
    return (
      <div
        data-structure="ceiling"
        data-ceiling-kind="vault"
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 120% 70% at 50% -10%, ${ceiling.color} 0%, transparent 62%)`,
          pointerEvents: "none",
        }}
      />
    );
  }
  return (
    <div
      data-structure="ceiling"
      data-ceiling-kind="open"
      style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(180deg, ${ceiling.color} 0%, transparent 34%)`,
        pointerEvents: "none",
      }}
    />
  );
}

/** 地面纵深（与 SPACE.depth 同值；此处常量避免顶层 import 顺序问题） */
const SPACE_DEPTH = 40;

// ---------------------------------------------------------------------------
// 分隔构件
// ---------------------------------------------------------------------------

/** 挂落 / 屏门 / 栏杆 */
function Divider3D({
  spec,
  containerW,
  fills,
  detail,
}: {
  spec: DividerSpec;
  containerW: number;
  fills: Fills;
  detail: 0 | 1 | 2;
}) {
  // ---- 挂落：柱间横木 + 下方锯齿波浪 ----
  if (spec.kind === "hangfall") {
    const w = unitToPx(spec.width, containerW);
    const x = unitToPx(spec.x, containerW);
    const bottom = unitToPx(spec.bottom, containerW);
    const barH = unitToPx(1.6, containerW);
    return (
      <div
        data-structure="divider"
        data-divider-kind="hangfall"
        style={{ ...NODE, transform: at(x, bottom), marginLeft: -w / 2 }}
      >
        <div
          data-part="bar"
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: w,
            height: barH,
            background: fills.beam,
            boxShadow: "0 3px 8px rgba(0,0,0,.36)",
          }}
        />
        <div
          data-part="fringe"
          style={{
            position: "absolute",
            left: 0,
            bottom: -unitToPx(2.6, containerW),
            width: w,
            height: unitToPx(2.6, containerW),
            background: fills.beam,
            opacity: 0.86,
            clipPath:
              "polygon(0% 0%, 100% 0%, 100% 70%, 97.5% 100%, 95% 70%, 92.5% 100%, 90% 70%, 87.5% 100%, 85% 70%, 82.5% 100%, 80% 70%, 77.5% 100%, 75% 70%, 72.5% 100%, 70% 70%, 67.5% 100%, 65% 70%, 62.5% 100%, 60% 70%, 57.5% 100%, 55% 70%, 52.5% 100%, 50% 70%, 47.5% 100%, 45% 70%, 42.5% 100%, 40% 70%, 37.5% 100%, 35% 70%, 32.5% 100%, 30% 70%, 27.5% 100%, 25% 70%, 22.5% 100%, 20% 70%, 17.5% 100%, 15% 70%, 12.5% 100%, 10% 70%, 7.5% 100%, 5% 70%, 2.5% 100%, 0% 70%)",
          }}
        />
      </div>
    );
  }

  // ---- 屏门：独立竖墙（不吃壁纸槽，用材质） ----
  if (spec.kind === "screen") {
    const w = unitToPx(spec.width, containerW);
    const h = unitToPx(spec.height, containerW);
    const x = unitToPx(spec.x, containerW);
    return (
      <div
        data-structure="divider"
        data-divider-kind="screen"
        style={{ ...NODE, transform: at(x, 0), marginLeft: -w / 2 }}
      >
        <div
          data-part="panel"
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: w,
            height: h,
            background: fills.beam,
            border: "2px solid rgba(0,0,0,.3)",
            borderRadius: 2,
            boxShadow: "0 10px 26px rgba(0,0,0,.45)",
            display: "flex",
            justifyContent: "space-evenly",
            padding: unitToPx(1.4, containerW),
            gap: unitToPx(1.4, containerW),
          }}
        >
          {/* 四扇：竖向分隔，detail≥1 再加门钉 */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              data-part="leaf"
              style={{
                flex: 1,
                background: `linear-gradient(180deg, rgba(0,0,0,.14), rgba(0,0,0,.34))`,
                border: "1px solid rgba(0,0,0,.24)",
                borderRadius: 2,
                position: "relative",
              }}
            >
              {detail >= 1 &&
                Array.from({ length: 6 }).map((__, j) => (
                  <div
                    key={j}
                    style={{
                      position: "absolute",
                      left: `${22 + (j % 3) * 28}%`,
                      top: `${20 + Math.floor(j / 3) * 34}%`,
                      width: unitToPx(0.7, containerW),
                      height: unitToPx(0.7, containerW),
                      borderRadius: "50%",
                      background: fills.metal,
                      opacity: 0.9,
                    }}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- 栏杆 ----
  const from = unitToPx(spec.fromX, containerW);
  const to = unitToPx(spec.toX, containerW);
  const w = to - from;
  const bottom = unitToPx(spec.bottom, containerW);
  return (
    /*
      ⚠️ 外层节点**必须显式给 width**。
      里层 `rail` 用的是 `left:0; right:0` —— 百分比定位是相对**包含块**算的，
      而外层若没有宽度（只有 marginLeft 负偏移），包含块宽就是 0，
      `left:0;right:0` 会塌成 0 宽 → 栏杆整个不可见（且不报错、断言也难发现）。
      实测 rect 就是 w=0、h=20：高度对、宽度没了 —— 典型的"半死不活"。
      供案/挂落那些用的是 `width: w` 显式宽度，所以它们没事，只有栏杆踩了这个坑。
    */
    <div
      data-structure="divider"
      data-divider-kind="railing"
      style={{ ...NODE, width: w, transform: at(from + w / 2, bottom), marginLeft: -w / 2 }}
    >
      <div
        data-part="rail"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: unitToPx(4.2, containerW),
          borderTop: `1px solid rgba(255,255,255,.34)`,
          background:
            "linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.06))",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        {Array.from({ length: 11 }).map((_, i) => (
          <div
            key={i}
            data-part="post"
            style={{
              width: unitToPx(0.8, containerW),
              height: "100%",
              background: fills.stone,
              borderRadius: "2px 2px 0 0",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 结构层总装
// ---------------------------------------------------------------------------

export type Structure3DProps = {
  space: Space3D;
  containerW: number;
  /** 档位细节（0/1/2）；由调用方从 structureParts() 传入，避免重复推导 */
  detail: 0 | 1 | 2;
  columns: ColumnSpec[];
  beams: BeamSpec[];
  dougong: DougongSpec[];
  podium: PodiumSpec | null;
  ceiling: Space3D["ceiling"];
  dividers: DividerSpec[];
};

/**
 * 结构层。
 *
 * **绘制顺序至关重要**（DOM 顺序 = 3D 层叠顺序）：
 *   天花 → 台基 → 梁枋 → 立柱 → 斗拱 → 分隔（屏门最后）
 *
 * `screen`（屏门）必须在门楼结构**之后**，否则它挡不住后面的构件 ——
 * 这条与 AGENTS.md 记的「宗祠大龛的 SVG 块必须画在立柱/斗拱之前」
 * 是同一类约束（层叠顺序反了，观感就是错的，而且不报错）。
 */
export default function Structure3D({
  space,
  containerW,
  detail,
  columns,
  beams,
  dougong,
  podium,
  ceiling,
  dividers,
}: Structure3DProps) {
  // 材质按主光方向算好（一次算、多处用；避免每根柱子各调一次）
  const fills = buildFills(space.material, space.light.key);

  // 屏门单独拎出来最后画
  const screens = dividers.filter((d) => d.kind === "screen");
  const others = dividers.filter((d) => d.kind !== "screen");

  return (
    <div
      data-structure-layer="1"
      data-structure-tier={space.structureTier}
      style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", pointerEvents: "none" }}
    >
      <CofferedCeiling3D ceiling={ceiling} containerW={containerW} fills={fills} />

      {podium && (
        <Podium3D spec={podium} containerW={containerW} fills={fills} detail={detail} />
      )}

      {beams.map((b, i) => (
        <Beam3D key={`b${i}`} spec={b} containerW={containerW} fills={fills} detail={detail} />
      ))}

      {columns.map((c) => (
        <Column3D key={c.id} spec={c} containerW={containerW} fills={fills} detail={detail} />
      ))}

      {dougong.map((d, i) => (
        <Dougong3D key={`d${i}`} spec={d} containerW={containerW} fills={fills} />
      ))}

      {others.map((d, i) => (
        <Divider3D key={`v${i}`} spec={d} containerW={containerW} fills={fills} detail={detail} />
      ))}

      {/* 屏门最后：它要挡住前面的构件 */}
      {screens.map((d, i) => (
        <Divider3D key={`s${i}`} spec={d} containerW={containerW} fills={fills} detail={detail} />
      ))}
    </div>
  );
}

/** 导出档位类型给调用方（避免各处再 import lib） */
export type { StructureTier };
