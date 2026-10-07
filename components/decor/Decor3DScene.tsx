"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  SPACE,
  floorGrid,
  propTransform,
  space3d,
  structureCount,
  structureParts,
  unitToPx,
  viewerTransform,
  type Prop3DSpec,
  type Space3D,
} from "@/lib/decor-3d";
import Structure3D from "@/components/decor/Scene/Structure3D";
import LightLayer, { GroundShadow } from "@/components/decor/Scene/LightLayer";
import Prop3D from "@/components/decor/Prop3D";
import { LAYOUT_BOUNDS, type PropLayout } from "@/lib/hall-decor";
import type { DecorItem, HallDecor } from "@/lib/hall-decor";

/**
 * 程序化 3D 场景渲染层（纪念馆 / 宗祠共用）
 *
 * 做法：一个带 `perspective` 的容器，里面按 `translateZ/rotateY` 摆几面墙与陈设，
 * 由 CSS 自己做透视投影 —— 不引入 WebGL，零外部资源（见 lib/decor-3d.ts 的决策记录）。
 *
 * ## v1 / v2 两套引擎（`engine` 开关）
 *
 * v1 = 原来的实现：三面墙 + 一块顶 + 陈设，光照两层。
 * v2 = 新增结构层（柱/枋/斗拱/台基/藻井/分隔）+ 六层光影 + 材质配方。
 *
 * **v1 的代码路径完整保留**，这不是历史包袱而是回退开关：
 * 阶段 0–5 只在工坊预览启用 v2，公页仍走 v1；某个阶段出问题可以
 * 把 `engine` 一行改回 `"v1"` 秒回退，23 套既有断言零风险。
 * 因此下面的 v1 分支**一个字都不许删**，哪怕它看起来与 v2 重复。
 *
 * ## 为什么拖拽是在**外层容器**而不是内层
 *
 *   内层已经在做 3D transform 了。若把手势监听装在内层，
 *   手指移动时元素的 hit-test 会随 3D 变换漂移，拖拽会"跳"。
 *   监听装在外层（未变换的父节点），坐标就是稳定的屏幕坐标。
 *
 * ⚠️ 硬约束（勿改）：被验收脚本断言的文字必须留在 **HTML 节点**里。
 *    也就是说，场景里的"堂号 / 遗像 / 供台"这些业务内容由调用方以 children 传入，
 *    本组件只负责"把它们放进一个 3D 空间"，绝不把文字画进 SVG。
 *    同理：**遗像绝不进 SVG / 不进结构层**（要能按需加载、能被断言、
 *    letterbox 时不错位）。v2 的结构层只画建筑，不画内容。
 */

const WALL_BASE: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: 0,
  transformStyle: "preserve-3d",
  backfaceVisibility: "hidden",
};

/** 一面墙：背景样式由装修数据提供，几何由 3D 空间提供 */
function Wall3D({
  spec,
  containerW,
  style,
  children,
}: {
  spec: Space3D["walls"][number];
  containerW: number;
  style: CSSProperties;
  children?: React.ReactNode;
}) {
  const w = unitToPx(spec.width, containerW);
  const h = unitToPx(spec.height, containerW);
  const x = unitToPx(spec.offset, containerW);
  const z = unitToPx(spec.translateZ, containerW);

  return (
    <div
      data-wall={spec.wallSlot}
      style={{
        ...WALL_BASE,
        width: w,
        height: h,
        marginLeft: -w / 2,
        transform: `translate3d(${x}px, 0, ${z}px) rotateY(${spec.rotateY}deg)`,
        transformOrigin: "center bottom",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** 地面：带透视的铺装，可加网格与镜面反射 */
function Floor3D({
  space,
  containerW,
  style,
}: {
  space: Space3D;
  containerW: number;
  style: CSSProperties;
}) {
  const depth = unitToPx(space.floor.depth, containerW);
  const grid = floorGrid(space.floor.grid);
  /*
    ⚠️ 地面的摆位公式来回错过两版，这里记下**实测**结论（隔离测试测出来的）。

    地面是一块 `depth` 高、绕**顶边**（`transformOrigin: center top`）
    做 `rotateX(78deg)` 躺平的平板。`origin: top` 意味着旋转后
    这块板子从**它的顶边开始向下**只占 `projectedH = depth·cos78°` 的高度
    （实测 depth 205 → projectedH 43）。

    而 `bottom` 作用在**未旋转的布局盒**上：元素顶边 `top = H - bottom - depth`。
    要让它贴住盒子底部，就要让顶边落在 `H - projectedH`：

      H - bottom - depth = H - projectedH
      ⇒ **bottom = projectedH - depth**（是个负值）

    实测 W=513、H=361、depth=205、projectedH=43 ⇒ bottom = -162
      ⇒ 板子落在 y=318~361，正好贴底 ✓
    （隔离测试直接扫了 -162/0/43/163/205 五个值，只有 -162 落在 318~361。）

    ⚠️ 两个错过的版本，别写回去：
      `bottom: 0`              → 顶边落在 156，木板横插在柱子中段；
      `bottom: depth - projectedH`（+163）→ 顶边 -7，整块飞到画面顶端外。
    两次观感都是"木板浮空/横插"，但方向相反 —— 就是这里的符号搞反了。
  */
  const FLOOR_TILT_DEG = 78;
  const projectedH = depth * Math.cos((FLOOR_TILT_DEG * Math.PI) / 180);
  return (
    <div
      data-floor="1"
      style={{
        position: "absolute",
        left: "50%",
        bottom: projectedH - depth,
        width: containerW * 1.5,
        height: depth,
        marginLeft: -(containerW * 1.5) / 2,
        transform: `translate3d(0,0,${-depth / 2}px) rotateX(${FLOOR_TILT_DEG}deg)`,
        transformOrigin: "center top",
        backgroundImage: grid,
        ...style,
        opacity: space.floor.mirror ? 0.96 : 0.9,
      }}
    />
  );
}

/** 顶部：横梁 / 穹顶 / 露天 */
function Ceiling3D({ space, containerW }: { space: Space3D; containerW: number }) {
  if (space.ceiling.type === "none") return null;

  if (space.ceiling.type === "beam") {
    const h = unitToPx(SPACE.height, containerW);
    const depth = unitToPx(space.floor.depth, containerW);
    return (
      <div
        data-ceiling="beam"
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          width: containerW * 1.4,
          height: depth * 0.9,
          marginLeft: -(containerW * 1.4) / 2,
          transform: `translate3d(0,${-h * 0.06}px,${-depth * 0.3}px) rotateX(-72deg)`,
          transformOrigin: "center top",
          display: "flex",
          justifyContent: "space-around",
          pointerEvents: "none",
        }}
      >
        {Array.from({ length: space.ceiling.count }).map((_, i) => (
          <div
            key={i}
            data-beam={i}
            style={{
              width: unitToPx(2.4, containerW),
              height: "100%",
              background: `linear-gradient(180deg, ${space.ceiling && "color" in space.ceiling ? space.ceiling.color : "#6b5540"}, rgba(0,0,0,.25))`,
              boxShadow: "0 6px 18px rgba(0,0,0,.28)",
            }}
          />
        ))}
      </div>
    );
  }

  if (space.ceiling.type === "vault") {
    return (
      <div
        data-ceiling="vault"
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 120% 70% at 50% -10%, ${space.ceiling.color} 0%, transparent 62%)`,
          pointerEvents: "none",
        }}
      />
    );
  }

  // open：露天，顶部给一道天光
  return (
    <div
      data-ceiling="open"
      style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(180deg, ${space.ceiling.color} 0%, transparent 34%)`,
        pointerEvents: "none",
      }}
    />
  );
}

/*
  陈设渲染已拆到 components/decor/Prop3D/*（阶段 2）。

  拆分理由：v1 把 12 个 kind 塞在一个 220 行的函数里，
  扩到 24 个 kind 会变成 500 行、且"层数=精细度"的规律无处安放。
  现在 kind → 渲染器 是一张**表**（Prop3D/index.tsx 的 RENDERERS），
  断言可以对着 PROP_KINDS 逐个点验，不再靠全文搜 if。

  ⚠️ 位置仍由 propsFromDecor 算好（见下方），渲染层不重算位置 ——
     否则会出现"位置按 3 个灯笼算、渲染里画 5 个"的错位。
*/

/** 单件挂饰的 3D 陈设（与改造前逐字节一致；多件收敛/分布由 propsFromDecor 负责） */
function specsForOne(space: Space3D, orn: DecorItem): Prop3DSpec[] {
  const base = space.props;
  /*
    ⚠️ 这里把 ornament 的 kind 当成宽松的 string 用，而不是 OrnamentSpec 的联合类型。
    原因：纪念馆的 OrnamentSpec 是**封闭**联合（lib/hall-decor.ts），宗祠另有
    4 种专属挂饰（石狮/香炉/牌位墙/幡旗，见 lib/clan-decor.ts 的 ClanOrnamentSpec）。
    本组件是两端共用的，若收窄到纪念馆类型，宗祠的挂饰分支会被 TS 判定为
    "永不成立"而报错 —— 看着像写错了，其实是类型没覆盖到。
    取 kind 字符串做分发，比维护一份三处同步的联合类型更不容易漏。
  */
  const kind = (orn?.style.ornament as { kind?: string } | undefined)?.kind;
  if (!kind) return base;
  const color = (orn!.style.ornament as { color?: string }).color;
  const text = (orn!.style.ornament as { text?: string }).text;
  const count = (orn!.style.ornament as { count?: number }).count ?? 1;

  const half = SPACE.width / 2;
  const extra: Prop3DSpec[] = [];

  /*
    ---- 摆放分类（阶段 2 扩充，新增 kind 必须归入其中一类）----

    每一类的**位置策略**不同，这不是审美问题而是"器物该在哪"的物理问题：
      · top        悬在檐下（灯笼/宫灯/匾额/光晕）—— 左右对称摊开
      · surround   贴左右侧墙（立柱/长幡）—— 需成对，否则一边空
      · wallLarge  整面墙类（壁龛墙/牌位墙/影壁/屏风）—— 居中贴正面墙
      · floorPair  落地成对（石狮）—— 靠前、左右分开
      · floorCenter 落地居中（供桌/香几/香炉/花瓶）—— 正面墙前
      · sideWall   侧墙挂件（挂轴）—— 左右各一，略高于视线

    归错类的表现很具体：供桌飘到梁上、挂轴摊在正中间、石狮挤在香案上。
    这些都不是断言能直接发现的（DOM 都在），所以分类必须一次归对。
  */

  // ---- ① 檐下悬垂类 ----
  if (
    kind === "lantern" ||
    kind === "imperial-lantern" ||
    kind === "caisson-light" ||
    kind === "halo" ||
    kind === "plaque"
  ) {
    // 藻井灯是"结构自带的吊灯"，只有一盏、居中，不参与左右摊开
    if (kind === "caisson-light") {
      return [
        {
          id: `${kind}-0`,
          kind,
          x: 0,
          z: -SPACE.depth * 0.22,
          bottom: SPACE.height - 8,
          scale: 0.9,
          color,
        },
      ];
    }
    // 宫灯与素灯笼都是"一对"，但宫灯要大一号（贵的东西要看得出来）
    const n = kind === "imperial-lantern" ? Math.max(2, Math.min(4, count || 2)) : Math.max(1, Math.min(4, count));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      extra.push({
        id: `${kind}-${i}`,
        kind,
        x: t * SPACE.width * 0.5,
        /*
          ⚠️ 檐下悬垂物的 z 必须**朝观者**（正数），不能是负数。

          正面墙在 `z = 0`，结构件靠 `STRUCTURE_Z = 40` 推到墙**前面**才看得见
          （见 Structure3D 文件头那段"别把 0 改回去"的记录）。
          陈设原来是 `z = -SPACE.depth * 0.18`（≈ -7.2 单位 → -37px），
          于是**灯笼被正面墙整片挡住**：DOM 里有、rect 量得到（19×41）、
          控制台无错，但用户只看到一面壁纸 —— 与结构件踩的是同一个坑，
          只是陈设这条一直没被发现（因为旧素材多是"贴墙"类，
          挂到墙上反而不违和；灯笼这种**悬在堂中**的东西一挡就完全没了）。

          檐下悬垂类统一放到 `+depth * 0.06`（≈ +2.4 单位 → +12px），
          在"脱离墙面"与"不飞出空间前沿"之间取一个稳的值。
        */
        z: SPACE.depth * 0.06,
        /*
          ⚠️ 悬垂高度要落在**额枋以下、柱间可见区**，别贴着檐口。

          原值 `SPACE.height - 9`（= 53u）实测灯笼占 y=50~93，
          而额枋在 y=84~104 —— 灯笼**整盏躲在额枋后面**（z 已经改到枋前面，
          但 culling 上仍被横枋压住上半截，观感就是"没有灯笼"）。

          改成 44u（≈ 0.71 × 空间高）：灯笼落在 y=135 上下，
          正好悬在柱间的空白处，一眼能看见，也不挡匾额/供案。
        */
        bottom: SPACE.height * 0.71,
        scale: kind === "plaque" ? 0.9 : kind === "imperial-lantern" ? 0.82 : 0.7,
        color,
        text: kind === "plaque" ? text : undefined,
      });
    }
    return extra;
  }

  // ---- ② 贴侧墙成对类 ----
  if (kind === "couplet-pillar" || kind === "banner" || kind === "banner-pair") {
    return [
      { id: `${kind}-l`, kind, x: -half + 5, z: -SPACE.depth * 0.45, bottom: 0, scale: 1.5, color, text },
      { id: `${kind}-r`, kind, x: half - 5, z: -SPACE.depth * 0.45, bottom: 0, scale: 1.5, color, text },
    ];
  }

  // ---- ③ 整面墙类 ----
  if (kind === "niche-wall" || kind === "tablet-wall" || kind === "screen" || kind === "screen-wall") {
    /*
      影壁与屏风比"壁龛墙"更靠近观者（它们是空间里的**独立体**，
      不是墙面上的一层皮）；壁龛墙与牌位墙则紧贴正面墙。
    */
    const isFreeStanding = kind === "screen" || kind === "screen-wall";
    return [
      {
        id: `${kind}-0`,
        kind,
        x: 0,
        z: isFreeStanding ? -SPACE.depth * 0.62 : -SPACE.depth * 0.02,
        bottom: kind === "tablet-wall" ? 2 : 6,
        // ⚠️ tablet-wall 自绘尺寸已算好，scale 必须保持 1（双重放大过）
        scale: kind === "tablet-wall" ? 1 : 1.6,
        color,
        count,
      },
    ];
  }

  // ---- ④ 落地成对类 ----
  if (kind === "stone-lion") {
    return [
      { id: "lion-l", kind, x: -half + 10, z: -SPACE.depth * 0.6, bottom: 0, scale: 1.1, color },
      { id: "lion-r", kind, x: half - 10, z: -SPACE.depth * 0.6, bottom: 0, scale: 1.1, color },
    ];
  }

  // ---- ⑤ 侧墙挂件（挂轴）：左右各一，略高于视线 ----
  if (kind === "scroll-painting") {
    return [
      { id: `${kind}-l`, kind, x: -half + 16, z: -SPACE.depth * 0.34, bottom: SPACE.height * 0.22, scale: 1.2, color },
      { id: `${kind}-r`, kind, x: half - 16, z: -SPACE.depth * 0.34, bottom: SPACE.height * 0.22, scale: 1.2, color },
    ];
  }

  // ---- ⑥ 堂上规制：匾 + 一对联（成组，位置由渲染器内部锁定）----
  if (kind === "plaque-pair") {
    return [
      {
        id: `${kind}-0`,
        kind,
        x: 0,
        z: -SPACE.depth * 0.2,
        bottom: SPACE.height - 8,
        /*
          ⚠️ scale 必须是 1，不能是 0.62（踩过的坑）。

          `PlaquePair` 内部把 `base` 再乘 0.56 / 0.92 给配匾与楹联 ——
          `base` 本身 = `unitToPx(7 * p.scale, containerW)`，已经吃过一次 scale。
          若这里再乘 0.62，就是**双重缩小**：实测整件只剩 46×19 px，
          肉眼是个小方块，看不出是"匾 + 联"。
          复合件（一件画出多个物件）的缩放一律交给渲染器内部，
          外层只负责摆位。
        */
        scale: 1,
        color,
        text,
      },
    ];
  }

  // ---- ⑦ 案上陈设：落在正面墙前（供桌 / 香几 / 香炉 / 花瓶 / 烛台 / 花）----
  const ON_ALTAR = new Set([
    "shelf",
    "altar-table",
    "incense-table",
    "incense-burner",
    "incense",
    "vase",
    "candlestick",
    "flower",
    "curtain",
  ]);
  if (ON_ALTAR.has(kind)) {
    /*
      蜡烛台是**成对**的（单支烛台在祠堂里没有意义）；
      其余案上陈设居中摆一件。
    */
    if (kind === "candlestick") {
      return [
        { id: `${kind}-l`, kind, x: -4.5, z: -SPACE.depth * 0.2, bottom: 2.6, scale: 1.1, color },
        { id: `${kind}-r`, kind, x: 4.5, z: -SPACE.depth * 0.2, bottom: 2.6, scale: 1.1, color },
      ];
    }
    // 案上小件要略抬高（站在香案面上），否则会穿进台基
    const onAltar = kind === "vase" || kind === "flower";
    return [
      ...base,
      {
        id: `${kind}-0`,
        kind,
        x: 0,
        z: -SPACE.depth * 0.12,
        bottom: onAltar ? 3.4 : 0,
        scale: 1.1,
        color,
        text,
      },
    ];
  }

  // ---- 兜底：落在正面墙前（与 v1 行为一致，保证未归类 kind 不消失）----
  return [
    ...base,
    {
      id: `${kind}-0`,
      kind,
      x: 0,
      z: -SPACE.depth * 0.12,
      bottom: 0,
      scale: 1.1,
      color,
      text,
      count,
    },
  ];
}

/** 多件挂饰的摆放带分类（与上方单件逻辑里的注释一致） */
type OrnBand = "top" | "surround" | "wallLarge" | "floorPair" | "floorCenter" | "sideWall" | "other";

function bandOf(orn: DecorItem): OrnBand {
  const kind = (orn.style.ornament as { kind?: string } | undefined)?.kind;
  switch (kind) {
    case "lantern":
    case "imperial-lantern":
    case "caisson-light":
    case "halo":
    case "plaque":
    case "plaque-pair":
      return "top";
    case "couplet-pillar":
    case "banner":
    case "banner-pair":
      return "surround";
    case "niche-wall":
    case "tablet-wall":
    case "screen":
    case "screen-wall":
      return "wallLarge";
    case "stone-lion":
      return "floorPair";
    case "scroll-painting":
      return "sideWall";
    default:
      return "floorCenter";
  }
}

/** 同带内多件沿 X 均匀分布的步长（按空间宽度比例，保证不重叠且不出框） */
function bandSpread(band: OrnBand, _space: Space3D): number {
  switch (band) {
    case "top":
      return SPACE.width * 0.28;
    case "surround":
      return SPACE.width * 0.34;
    case "wallLarge":
      return SPACE.width * 0.16;
    case "floorPair":
      return SPACE.width * 0.3;
    case "sideWall":
      return SPACE.width * 0.34;
    default:
      return SPACE.width * 0.3;
  }
}

/**
 * 从装修数据里挑出挂饰**清单**的 kind 与配色，映射成 3D 陈设（支持多件不重叠）。
 *
 * 关键设计（用户要求"3D 也要多件渲染"）：
 *   - 单件 → 完全复用 specsForOne（含内部 count，如灯笼成对、石狮一对）。
 *   - 多件 → 按摆放带分组；**同带内**多件才需要防重叠：
 *       · 每件收敛为单件代表（取该件**自己的**第一个陈设，如灯笼取左盏），
 *         避免"灯笼自带 2 盏 × 3 件 = 6 盏"把整条檐下挤爆；
 *       · 单件代表居中（x=0）后沿带按 index 均匀分布锚点
 *         （如 top 带 3 件 → x = -0.28W / 0 / +0.28W）。
 *   - **跨带天然分离**（top 在檐下、floorCenter 在供台前、surround 在侧墙），
 *     不同带的件互不干涉，各自保留完整内部形态（所以"灯笼 + 香炉"仍是
 *      灯笼成对 + 香炉单件，不会被迫退化）。
 *
 * 这保证：① 单件渲染与改造前逐字节一致（零回归）；
 *         ② 同带多件不重叠；③ 跨带多件形态完整。
 *
 * 命名导出仅供验收脚本（verify-decor-ornaments / verify-decor-prop3d）做单元级断言。
 */
export function propsFromDecor(space: Space3D, orns: DecorItem[]): Prop3DSpec[] {
  const base = space.props;
  if (orns.length === 0) return base;
  if (orns.length === 1) return specsForOne(space, orns[0]);

  const groups: Record<string, DecorItem[]> = {};
  for (const orn of orns) {
    const b = bandOf(orn);
    (groups[b] ??= []).push(orn);
  }

  /*
    ⚠️ 代表必须取"该件**自己的** spec"，不能取 `specs[0]`（实测踩过）。

    案上类（vase/flower/香几/供桌/烛台…）与兜底分支的 specsForOne 返回
    `[...base, 自己的spec]` —— specs[0] 是**空间底座**（shrine 空间 = 牌位墙）。
    旧写法取 specs[0] 当代表：选 花瓶+香几 → 输出两座牌位墙（还被挪到
    分布锚点上）、两件挂饰**整体消失**。DOM 无错、断言若只数 data-ornament
    也不会红 —— 典型静默丢功能。

    判"自己的"用 id 集合（底座 id 固定、自有 spec 的 id 一律是 `${kind}-*`
    生成式），不按 kind 匹配 —— shrine 底座里也有 altar-table，
    按 kind 匹配会把底座的香案误当成挂饰的代表。
  */
  const baseIds = new Set(base.map((p) => p.id));
  let basePushed = false;

  const out: Prop3DSpec[] = [];
  for (const b of Object.keys(groups)) {
    const list = groups[b];
    const n = list.length;
    list.forEach((orn, i) => {
      const specs = specsForOne(space, orn);
      if (n === 1) {
        // 带内仅此一件：完整保留单件形态（含案上类垫进的底座），零回归
        out.push(...specs);
        if (specs.some((s) => baseIds.has(s.id))) basePushed = true;
        return;
      }
      const own = specs.filter((s) => !baseIds.has(s.id));
      if (own.length === 0) {
        // 该件没有自有陈设（如 orn-none：style 无 kind，specsForOne 原样返回 base）
        // —— 不产生可见物，也绝不把底座复制进来；仅垫一次底座保持"家具仍在"。
        if (i === 0 && !basePushed) {
          out.push(...specs.filter((s) => baseIds.has(s.id)));
          basePushed = true;
        }
        return;
      }
      // 同带多件：收敛为**自己的**单件代表，居中后沿带均匀分布
      const offset = (i - (n - 1) / 2) * bandSpread(b as OrnBand, space);
      out.push({ ...own[0], x: offset });
      // 底座只随带内第一件垫入一次（延续"案上类有挂饰仍保留底座家具"的单件语义）
      if (i === 0 && own.length < specs.length && !basePushed) {
        out.push(...specs.filter((s) => baseIds.has(s.id)));
        basePushed = true;
      }
    });
  }
  return out;
}

export type Decor3DSceneProps = {
  /** 装修方案（提供壁纸/地纹/挂饰样式） */
  decor: HallDecor;
  /** 空间形态标识（来自模板的 space 字段） */
  spaceKind?: string;
  /** 各槽位的素材查表结果（由调用方在服务端/客户端解析好传进来） */
  items: {
    wall?: DecorItem;
    floor?: DecorItem;
    /** 挂饰清单（多件同时陈设）；兼容旧调用方仍可传单件 `ornament` */
    ornaments?: DecorItem[];
    ornament?: DecorItem;
  };
  /** 空间里的业务内容（遗像、供台、堂号…）。**必须是 HTML 节点** */
  children?: React.ReactNode;
  className?: string;
  /** 高度（px）。不传则按宽度 16:9 自适应 */
  height?: number;
  /** 是否允许拖拽环视 */
  interactive?: boolean;
  /** 视角变化回调（用于断言与调试） */
  onYawChange?: (yaw: number) => void;
  /**
   * 陈设布局覆盖（键 = Prop3DSpec.id）。渲染时按 id 覆盖 x/z/bottom ——
   * 换模板/换挂饰后失效的键（stale）自然被忽略，无需清洗。
   */
  layout?: Record<string, PropLayout>;
  /**
   * 布局编辑态（公页馆主「调整布局」开关）。编辑时每件陈设显示描边并可拖。
   * 非编辑态不挂任何手势 —— 访客 DOM 与现状逐字节一致。
   */
  editable?: boolean;
  /**
   * 单件拖拽落点提交（pointerup 时回调一次，带该件的最终坐标）。
   * 拖动过程中的实时预览在本组件内部完成，不逐帧上抛。
   */
  onLayoutChange?: (id: string, pos: PropLayout) => void;
  /**
   * 容器初始宽度（px）。仅影响**首次渲染**的几何换算。
   * 传 0/不传时用 920（W 基准宽），挂载后由 ResizeObserver 校正。
   */
  initialWidth?: number;
  /**
   * 引擎版本。
   *  - `"v1"`（默认）：原实现，三面墙 + 陈设 + 两层光照。
   *  - `"v2"`           ：结构层（柱/枋/斗拱/台基/藻井/分隔）+ 六层光影 + 材质。
   *
   * 默认 `"v1"` 是**有意的**：切换是分阶段进行的（阶段 0–5 只在工坊启用 v2，
   * 阶段 6 才让公页默认 v2）。任何阶段出问题，把传进来的值改回 `"v1"` 即可。
   */
  engine?: "v1" | "v2";
};

export default function Decor3DScene({
  decor: _decor,
  spaceKind,
  items,
  children,
  className = "",
  height,
  interactive = true,
  onYawChange,
  layout,
  editable = false,
  onLayoutChange,
  /** 由调用方在服务端/客户端算好的容器宽度（px）。不传则用 W 基准宽再靠 ResizeObserver 校正 */
  initialWidth = 920,
  engine = "v1",
}: Decor3DSceneProps) {
  const space = useMemo(() => space3d(spaceKind), [spaceKind]);
  const isV2 = engine === "v2";
  /*
    结构层的"实际要画的构件"与"结构计数"都从 structureParts/structureCount 派生 ——
    渲染层绝不自己判定 `tier === "grand" || ...`：
    那样改档位时必然漏一处，而且计数与渲染会漂移（断言就会"数到一个没画出来的构件"）。
  */
  const parts = useMemo(() => structureParts(space), [space]);
  const structCount = useMemo(() => structureCount(space), [space]);
  const boxRef = useRef<HTMLDivElement | null>(null);
  /*
    ⚠️ containerW 的初值必须是**确定值**，不能是 0 或以窗口宽推算 ——
    这是本组件唯一一处 SSR/CSR 不一致的坑：服务端没有 window，
    若初值取 window.innerWidth，水合时首帧 DOM 与 SSR 输出不同，React 会报 mismatch。
    做法：初值 = 调用方给的 initialWidth（默认 920 = W 基准宽），
    挂载后由 ResizeObserver 校正成真实宽度。几何是**纯换算**，不持有状态，故重算无副作用。
  */
  const [containerW, setContainerW] = useState(initialWidth);
  const [yaw, setYaw] = useState(space.yaw);
  const dragging = useRef(false);
  const lastX = useRef(0);

  // 容器宽度变化时重算几何（空间是百分比推导的，但像素换算需要真实宽度）
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth || initialWidth;
      if (w > 0) setContainerW(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [initialWidth]);

  // 换空间形态时把视角复位（否则从星河的 46° 切到壁龛的 16°，会瞬间被夹住而"跳"）
  useEffect(() => {
    setYaw(space.yaw);
  }, [space]);

  const apply = useCallback(
    (next: number) => {
      const c = Math.max(-space.yawRange, Math.min(space.yawRange, next));
      setYaw(c);
      onYawChange?.(c);
    },
    [space.yawRange, onYawChange],
  );

  const onDown = (x: number) => {
    if (!interactive) return;
    dragging.current = true;
    lastX.current = x;
  };
  const onMove = (x: number) => {
    if (!interactive || !dragging.current) return;
    const delta = (x - lastX.current) * 0.22;
    lastX.current = x;
    apply(yaw + delta);
  };
  const stop = () => (dragging.current = false);

  const wallStyle = (wall: DecorItem | undefined): CSSProperties => ({
    backgroundColor: wall?.style.backgroundColor,
    backgroundImage: wall?.style.backgroundImage,
    backgroundSize: wall?.style.backgroundSize ?? "cover",
    backgroundPosition: wall?.style.backgroundPosition ?? "center",
    color: wall?.style.color,
  });

  const floorStyle: CSSProperties = {
    backgroundColor: items.floor?.style.backgroundColor,
    backgroundImage: items.floor?.style.backgroundImage,
    backgroundSize: items.floor?.style.backgroundSize ?? "cover",
  };

  const baseProps = useMemo(
    () => propsFromDecor(space, items.ornaments ?? (items.ornament ? [items.ornament] : [])),
    [space, items.ornaments, items.ornament],
  );

  /*
    布局编辑（公页馆主拖拽）：
      - dragPos = 正在拖的件的实时位置（本地 state，拖动中只重渲染本组件）；
      - pointerup 才把最终坐标 onLayoutChange 上抛（由外层 SceneLayoutEditor 防抖保存）；
      - 渲染合并顺序：库里的 layout 先、正在拖的实时位置后（拖的那件以实时为准）。
    键语义校验在这里完成：baseProps 里没有的 id（换模板后 stale）自然不命中，静默忽略。
  */
  const [dragPos, setDragPos] = useState<{ id: string; x: number; bottom: number } | null>(null);
  const dragPosRef = useRef<{ id: string; x: number; bottom: number } | null>(null);
  const dragStartRef = useRef<{ id: string; startX: number; startY: number; baseX: number; baseBottom: number } | null>(null);

  const props = useMemo(() => {
    if (!layout && !dragPos) return baseProps;
    return baseProps.map((p) => {
      const live = dragPos && dragPos.id === p.id ? dragPos : undefined;
      const saved = layout?.[p.id];
      if (!live && !saved) return p;
      return {
        ...p,
        x: live?.x ?? saved?.x ?? p.x,
        z: saved?.z ?? p.z,
        bottom: live?.bottom ?? saved?.bottom ?? p.bottom,
      };
    });
  }, [baseProps, layout, dragPos]);

  const clampDim = (n: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, n));

  const onPropDown = useCallback(
    (e: React.PointerEvent, p: Prop3DSpec) => {
      if (!editable) return;
      e.stopPropagation(); // 绝不触发外层容器的环视（onMouseDown/onTouchStart）
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragStartRef.current = {
        id: p.id,
        startX: e.clientX,
        startY: e.clientY,
        baseX: p.x,
        baseBottom: p.bottom,
      };
    },
    [editable],
  );

  const onPropMove = useCallback(
    (e: React.PointerEvent) => {
      const st = dragStartRef.current;
      if (!editable || !st) return;
      e.stopPropagation();
      /*
        屏幕 px → 空间单位：以容器宽为基准（unitToPx 同一比例）。
        yaw 让 x 轴在屏幕上的投影缩短 cos(yaw)，做近似补偿（编辑时环视已被
        stopPropagation 冻结，yaw 恒定，补偿是纯常数）。
      */
      const k = Math.max(0.5, Math.cos((yaw * Math.PI) / 180));
      const ux = ((e.clientX - st.startX) / (containerW * k)) * SPACE.width;
      const uy = (-(e.clientY - st.startY) / containerW) * SPACE.width;
      const next = {
        id: st.id,
        x: clampDim(st.baseX + ux, LAYOUT_BOUNDS.x),
        bottom: clampDim(st.baseBottom + uy, LAYOUT_BOUNDS.bottom),
      };
      dragPosRef.current = next;
      setDragPos(next);
    },
    [editable, yaw, containerW],
  );

  const onPropUp = useCallback(
    (e: React.PointerEvent) => {
      const st = dragStartRef.current;
      if (!editable || !st) return;
      e.stopPropagation();
      dragStartRef.current = null;
      const cur = dragPosRef.current;
      dragPosRef.current = null;
      setDragPos(null);
      if (cur && cur.id === st.id) onLayoutChange?.(st.id, { x: cur.x, bottom: cur.bottom });
    },
    [editable, onLayoutChange],
  );

  const dragHandlers = editable
    ? { editable: true, activeId: dragPos?.id, onDown: onPropDown, onMove: onPropMove, onUp: onPropUp }
    : undefined;

  const { transform } = viewerTransform(yaw, space);

  return (
    <div
      ref={boxRef}
      data-decor-3d={space.kind}
      data-engine={engine}
      data-structure-tier={space.structureTier}
      data-structure={structCount}
      data-yaw={Math.round(yaw)}
      className={`relative overflow-hidden rounded-xl ${className}`}
      style={{
        height: height ?? undefined,
        /*
          ⚠️ 无显式高度时，宽高比**必须**跟空间的真实几何一致，别写 16/9。

          `unitToPx` 只按**宽度**换算（`unit / SPACE.width * containerW`），
          所以空间高度会随宽度等比放大 —— 盒子如果比空间"更扁"，
          多出来的部分就会把地面/台基挤出可视区。

          所需高度由两段构成（推导见 Floor3D）：
            正面墙        62u          → 0.62 * W
            地面旋转后投影  40u·cos78°   → 0.0832 * W
            合计                         → 0.7032 * W
          （注意**不是** 62 + 40 = 102u：地面躺平后视觉高只剩 cos78° 那一段，
            早先按 62+14 估算是错的，实测差 1px 就会让台基被切。）

          实测：W=513 → 需要 361px，而工坊原先写死 360px，正好差 1px。
        */
        aspectRatio: height ? undefined : "1000 / 703",
        background: "#0b0d10",
        cursor: interactive && !editable ? (dragging.current ? "grabbing" : "grab") : "default",
        touchAction: "pan-y",
      }}
      onMouseDown={(e) => {
        /*
          编辑态禁用环视：pointerdown 的 stopPropagation 拦不住浏览器派生的
          兼容 mousedown（不同事件类型），只靠 prop 层拦截必然漏 ——
          干脆编辑模式下容器不吃鼠标/触摸，拖拽与环视彻底不打架。
        */
        if (!editable) onDown(e.clientX);
      }}
      onMouseMove={(e) => {
        if (!editable) onMove(e.clientX);
      }}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={(e) => {
        if (!editable) onDown(e.touches[0].clientX);
      }}
      onTouchMove={(e) => {
        if (!editable) onMove(e.touches[0].clientX);
      }}
      onTouchEnd={stop}
    >
      {/* 透视容器 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          perspective: `${space.perspective}px`,
          perspectiveOrigin: "50% 46%",
        }}
      >
        {/* 整个世界：环视 = 反向旋转整个世界 */}
        <div
          data-space={space.kind}
          style={{
            position: "absolute",
            inset: 0,
            transformStyle: "preserve-3d",
            transform,
            transition: dragging.current ? "none" : "transform .28s ease-out",
          }}
        >
          {/*
            ⚠️ v1 的 Ceiling3D 与 v2 的结构层**必须互斥**。
            v2 的 Structure3D 内部已经含天花（藻井/椽条/卷棚/平棋），
            若 v1 的 Ceiling3D 也画，同一页会出现两层顶（实测会看到
            "藻井下面又叠了几根横梁"，看着像渲染错乱）。
          */}
          {isV2 ? (
            <Structure3D
              space={space}
              containerW={containerW}
              detail={parts.detail}
              columns={parts.columns}
              beams={parts.beams}
              dougong={parts.dougong}
              podium={parts.podium}
              ceiling={parts.ceiling}
              dividers={parts.dividers}
            />
          ) : (
            <Ceiling3D space={space} containerW={containerW} />
          )}

          {space.walls.map((w, i) => (
            <Wall3D key={i} spec={w} containerW={containerW} style={wallStyle(items.wall)}>
              {/* 壁纸叠加纹理 */}
              {items.wall?.style.overlay && (
                <div
                  style={{ position: "absolute", inset: 0, backgroundImage: items.wall.style.overlay }}
                />
              )}
            </Wall3D>
          ))}

          <Floor3D space={space} containerW={containerW} style={floorStyle} />

          {/*
            地面投影（v2，detail ≥ 1 才画）：**在世界层内**，所以拖拽环视时
            影子跟着一起转 —— 这是"物体站在地上"的关键，比任何高光都重要。
            detail = 0（basic）时只靠 AO 暗带表达接地，省一层 DOM。
          */}
          {isV2 &&
            parts.detail >= 1 &&
            parts.columns.map((c) => (
              <GroundShadow
                key={`sh-${c.id}`}
                x={c.x}
                z={-SPACE.depth * 0.18}
                containerW={containerW}
                widthUnit={c.diameter * 2.2}
                ao={space.light.ao}
              />
            ))}

          {props.map((p) => (
            <Prop3D
              key={p.id}
              p={p}
              containerW={containerW}
              detail={parts.detail}
              drag={dragHandlers}
            />
          ))}
        </div>
      </div>

      {/*
        光影层（v2）：**在透视容器之外**、世界层之上。
        这一层是"镜头前的效果"（方向光/光柱/雾/AO/高光），不该随视角转动，
        所以不放进 preserve-3d 的世界里 —— 放进去会被透视投影二次变形。
        v1 走下面的老两层（色罩 + 顶光/正前光辉光），同样保留。
      */}
      {isV2 ? (
        <LightLayer space={space} containerW={containerW} detail={parts.detail} />
      ) : (
        <>
          {/* 环境光色罩（景深之外，压在最上层） */}
          {space.ambient.tintOpacity > 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: space.ambient.tint,
                opacity: space.ambient.tintOpacity,
                pointerEvents: "none",
                mixBlendMode: "multiply",
              }}
            />
          )}

          {/* 顶光/正前光的辉光 */}
          {space.ambient.keyLight !== "ambient" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  space.ambient.keyLight === "top"
                    ? `radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255,244,214,${0.3 * space.ambient.intensity}), transparent 70%)`
                    : `radial-gradient(circle at 50% 42%, rgba(255,250,235,${0.28 * space.ambient.intensity}), transparent 62%)`,
              }}
            />
          )}
        </>
      )}

      {/* 业务内容层：遗像/供台等 HTML 节点由调用方传入，居中叠在场景上 */}
      {children && (
        <div
          data-scene-content="1"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            /*
              ⚠️ 业务内容层**贴地**摆放，不用 `align-items: center`。

              这一层放的是"堂号 / 遗像 / 供台"这类业务 HTML（由调用方 children 传入）。
              早先写成垂直居中 + `translateY(-6%)`，于是**供案会浮在半墙中间**：
              工坊里那块"漂浮的棕色盒子"就是它（`DefaultAltar` 的 96×8 案面），
              截图一眼看去像渲染错乱，其实是定位错。

              改成 `flex-end` + 底部留出「台基 + 地面投影」的高度，
              内容就自然站在台基上了 —— 台基竖直高度 = 台基边高 + 地面投影
              （与 `Floor3D` 的 0.703 比例同一份来源）。
            */
            alignItems: "flex-end",
            justifyContent: "center",
            pointerEvents: "none",
            /*
              底部留白 = 内容底边要落在**台基顶面**上。
              实测（盒宽 513 / 盒高 361）：台面 top≈325 ⇒ 留白 = 36px ≈ 7% 宽。
              ⚠️ 这个百分比是「台基高 + 地面投影」的近似 —— 若日后调
              `Floor3D` 的倾角或 `Podium3D` 的 edgeH，这里要跟着复核
              （判据：工坊里那块 DefaultAltar 案面不能浮在半墙高）。
            */
            paddingBottom: "7%",
          }}
        >
          <div style={{ pointerEvents: "auto" }}>{children}</div>
        </div>
      )}

      {/* 操作提示 */}
      {interactive && space.yawRange > 0 && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 12,
            transform: "translateX(-50%)",
            borderRadius: 999,
            background: "rgba(0,0,0,.42)",
            color: "rgba(255,255,255,.85)",
            fontSize: 11,
            padding: "4px 12px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          拖拽环视 · 左右可转动 {space.yawRange}°
        </div>
      )}
    </div>
  );
}
