"use client";

// 注意：项目 tsconfig 的 jsx 为 "preserve"（交给 Next 处理）。
// 在 scripts/*.tsx 里用 renderToStaticMarkup 单独渲染本组件时走的是经典运行时，
// 需要显式引入 React；此处引入对 Next 侧无副作用。
import * as React from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  C_BRICK,
  C_GOLD,
  C_GRANITE,
  C_MARBLE,
  C_NANMU,
  C_PAPER,
  C_TILE,
  C_VERMILION,
  DEFAULT_PALETTE,
  type ArchPalette,
} from "./arch/palette";

/**
 * 宗祠建筑场景容器（分镜）
 *
 * 设计目标：让公网宗祠详情页「像一座真的祠堂」，而不是几块色块拼图。
 *
 * 做法：把页面按**中轴递进的空间序列**切成四段分镜，每段是一个真实建筑构件：
 *
 *   ① 山门   —— 屋脊 + 门楼 + 抱鼓石   （进门）
 *   ② 天井   —— 两侧立柱 + 长幡 + 青石地面（过渡）
 *   ③ 享堂   —— 匾额高悬 + 斗拱额枋     （主厅，匾额文字为 HTML）
 *   ④ 寝堂   —— 牌位墙 + 香案 + 香炉     （供奉，祖先名号为 HTML）
 *
 * 关键约束（勿改）：
 *  1. 所有**被脚本断言的文字**（堂号 / 字辈诗 / 祭祀记录 / 献祭按钮…）
 *     必须保持 HTML 节点，SVG 只负责装饰与匾额刻字。
 *  2. 构件一律 pointer-events-none，绝不遮挡底下的按钮。
 *  3. 分镜自身不带业务数据逻辑，只接收已渲染好的 children 做「陈设」。
 */

// ---------------------------------------------------------------------------
// 通用：按比例撑开的画框
// ---------------------------------------------------------------------------
/** 每个构件的 viewBox 比例（只给宽度，高度按比例自然撑开，永不变形） */
const RATIO = {
  roof: "1200 / 340",
  gate: "900 / 656",
  dougong: "1200 / 110",
  pillar: "720 / 400",
  terrace: "1200 / 300",
  plaque: "480 / 130",
  banner: "720 / 480",
  tabletWall: "900 / 340",
  censer: "260 / 300",
  lion: "600 / 280",
  altar: "900 / 260",
} as const;

/**
 * 按比例撑开的画框。
 *
 * 重要（勿改）：外层必须 `items-end`/`items-start`（不能 stretch），
 * 且这里显式写 `alignSelf: flex-start` —— 否则 flex 的 stretch 会把高度
 * 拉到"行高"，而行高又由本元素撑出，互相喂养成死循环（实测涨到 8900px）。
 */
function Frame({
  ratio,
  className = "",
  style,
  children,
}: {
  /** “宽 / 高”，如 "900 / 620" */
  ratio: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative shrink-0 self-start ${className}`}
      style={{ aspectRatio: ratio, width: "100%", ...style }}
    >
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

const FULL = { width: "100%", height: "100%" } as const;

// ---------------------------------------------------------------------------
// 分镜外壳：一段建筑 + 一段陈设
// ---------------------------------------------------------------------------
function Bay({
  index,
  label,
  title,
  note,
  tone = "light",
  children,
}: {
  index: number;
  label: string;
  title: string;
  note?: string;
  tone?: "light" | "dark";
  children: ReactNode;
}) {
  const dark = tone === "dark";
  return (
    <section className="relative">
      {/* 分镜标尺：竖排「一/二/三/四」，像建筑图上的轴线编号 */}
      <div className="mb-3 flex items-center gap-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs"
          style={{
            borderColor: dark ? "rgba(255,255,255,.35)" : "rgba(120,110,95,.45)",
            color: dark ? "rgba(255,255,255,.9)" : "#6b6255",
            background: dark ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.6)",
          }}
        >
          {index}
        </span>
        <span
          className="h-px flex-1"
          style={{
            background: dark
              ? "linear-gradient(90deg, rgba(255,255,255,.35), transparent)"
              : "linear-gradient(90deg, rgba(120,110,95,.4), transparent)",
          }}
        />
        <span
          className="text-[11px] tracking-[0.3em]"
          style={{ color: dark ? "rgba(255,255,255,.6)" : "#8b8275" }}
        >
          {label}
        </span>
      </div>

      {/* 建筑本体 */}
      <div className="relative">{children}</div>

      {/* 陈设标题（HTML —— 保持可被脚本断言） */}
      <div className="relative mt-6">
        <h2
          className="font-serif text-xl tracking-[0.2em]"
          style={{ color: dark ? "#f5efe2" : "#4a4136" }}
        >
          {title}
        </h2>
        {note && (
          <p className="mt-1 text-xs" style={{ color: dark ? "rgba(255,255,255,.6)" : "#8b8275" }}>
            {note}
          </p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ① 山门：屋脊 + 门楼
// ---------------------------------------------------------------------------
export function SceneGate({
  palette = DEFAULT_PALETTE,
  hallName,
  surname,
  ancestorTitle,
  sky = true,
}: {
  palette?: ArchPalette;
  hallName: string;
  surname: string;
  ancestorTitle?: string | null;
  /**
   * 是否渲染顶部"天空渐变"。默认 true（浅色纸面页面上把建筑从纸面托起）；
   * 3D 漫游（ClanHall3DTour）的深色舞台上它是刺眼的白色横带，传 false 关掉。
   * 不传时行为与改造前逐字节一致 —— 零回归。
   */
  sky?: boolean;
}) {
  return (
    <div className="relative select-none" aria-hidden>
      {/* 天空渐变：把建筑从纸面上"托"起来 */}
      {sky && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,.85), rgba(255,255,255,0) 70%)",
          }}
        />
      )}
      {/*
        宽度约束：山门画幅是 900×656（近方形），若放任到 max-w-4xl 会占满整屏、
        把正文全挤到下面去。收到 max-w-2xl（约 672px）后高度约 490px，
        既有"仰视山门"的分量，又不至于独占一屏。
      */}
      <div className="relative mx-auto max-w-2xl px-2">
        <Frame ratio={RATIO.gate}>
          <GateDrawing palette={palette} hallName={hallName} surname={surname} ancestorTitle={ancestorTitle} />
        </Frame>
      </div>
    </div>
  );
}

/** 门楼线描（内联 SVG，直接画在分镜里，尺寸完全受控） */
function GateDrawing({
  palette,
  hallName,
  surname,
  ancestorTitle,
}: {
  palette: ArchPalette;
  hallName: string;
  surname: string;
  ancestorTitle?: string | null;
}) {
  const tile = palette.roof ?? C_TILE;
  const brick = palette.wall ?? C_BRICK;
  const gold = palette.gold ?? C_GOLD;
  const verm = palette.pillar ?? C_VERMILION;

  /** 径向瓦垄：从正脊向檐口发散（与 ClanRoof 同构） */
  const tiles = (ry: number, rx0: number, rx1: number, ey: number, ex0: number, ex1: number, n: number) =>
    Array.from({ length: n }).map((_, i) => {
      const t = (i + 1) / (n + 1);
      const rx = rx0 + (rx1 - rx0) * t;
      const ex = ex0 + (ex1 - ex0) * t;
      return (
        <path
          key={i}
          d={`M${rx} ${ry} L${ex} ${ey}`}
          fill="none"
          stroke={tile.dark}
          strokeWidth="2"
          opacity="0.42"
        />
      );
    });

  /** 一片屋面 */
  const eave = (ry: number, rx0: number, rx1: number, ey: number, ex0: number, ex1: number, n: number) => (
    <>
      <path
        d={`M${rx0} ${ry} L${rx1} ${ry} L${ex1} ${ey} L${ex0} ${ey} Z`}
        fill={tile.base}
        stroke={tile.dark}
        strokeWidth="2.4"
      />
      {tiles(ry, rx0, rx1, ey, ex0, ex1, n)}
      {/* 檐下阴影带 */}
      <rect x={ex0} y={ey - 6} width={ex1 - ex0} height={16} fill="rgba(0,0,0,.30)" />
      {/* 檐口滴水 */}
      <path
        d={`M${ex0} ${ey + 8} L${ex1} ${ey + 8}`}
        stroke={tile.dark}
        strokeWidth="7"
        strokeLinecap="round"
        opacity="0.85"
      />
    </>
  );

  return (
    <svg viewBox="0 0 900 656" style={FULL} preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id="cs-brick" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={brick.light} />
          <stop offset="0.55" stopColor={brick.base} />
          <stop offset="1" stopColor={brick.dark} />
        </linearGradient>
        <linearGradient id="cs-verm" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={verm.dark} />
          <stop offset="0.4" stopColor={verm.light} />
          <stop offset="1" stopColor={verm.dark} />
        </linearGradient>
        <linearGradient id="cs-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={gold.light} />
          <stop offset="0.5" stopColor={gold.base} />
          <stop offset="1" stopColor="#8a6a1e" />
        </linearGradient>
        <pattern id="cs-brickpat" width="46" height="22" patternUnits="userSpaceOnUse">
          <path d="M0 0 H46 M0 11 H46 M0 22 H46" stroke={brick.dark} strokeWidth="1" opacity="0.35" />
          <path d="M23 0 V11 M0 11 V22" stroke={brick.dark} strokeWidth="1" opacity="0.35" />
        </pattern>
      </defs>

      {/* ---------- 主脊 + 正吻 ---------- */}
      <path d="M232 96 H668" stroke={tile.dark} strokeWidth="16" strokeLinecap="round" />
      <path d="M232 96 H668" stroke={tile.base} strokeWidth="9" strokeLinecap="round" />
      {/* 两端鸱吻（张口吞脊） */}
      <path d="M232 96 q-26 -6 -34 -30 q-4 -14 8 -16 q10 -2 12 10 q2 16 14 22 Z" fill={tile.dark} stroke="#3a3c3e" strokeWidth="1.5" />
      <path d="M668 96 q26 -6 34 -30 q4 -14 -8 -16 q-10 -2 -12 10 q-2 16 -14 22 Z" fill={tile.dark} stroke="#3a3c3e" strokeWidth="1.5" />

      {/* ---------- 上层屋面（重檐） ---------- */}
      {eave(104, 232, 668, 214, 168, 732, 26)}
      {/* 围脊 */}
      <rect x={210} y={214} width={480} height={22} fill={tile.light} stroke={tile.dark} strokeWidth="2.2" />

      {/* ---------- 下层屋面（主檐，最外挑） ---------- */}
      {eave(236, 200, 700, 352, 96, 804, 34)}

      {/* ---------- 额枋 + 匾额 ---------- */}
      <rect x={150} y={368} width={600} height={30} rx="3" fill="url(#cs-verm)" stroke="#5d1a14" strokeWidth="2" />
      {/* 额枋彩画 */}
      {Array.from({ length: 9 }).map((_, i) => (
        <circle key={i} cx={186 + i * 66} cy={383} r="9" fill="none" stroke={gold.base} strokeWidth="2.2" opacity="0.9" />
      ))}

      {/* 匾额（金字，高悬门楣） */}
      <g>
        <rect x={300} y={404} width={300} height={74} rx="6" fill="#2f2a26" stroke="url(#cs-gold)" strokeWidth="6" />
        <rect x={312} y={416} width={276} height={50} rx="3" fill="none" stroke={gold.base} strokeWidth="1.6" opacity="0.75" />
        <text
          x="450"
          y="450"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="40"
          fill="url(#cs-gold)"
          style={{ fontFamily: "serif", letterSpacing: "0.12em" }}
        >
          {hallName}
        </text>
      </g>

      {/*
        ---------- 墙身 ----------
        墙面必须比纸底/页面底**明显更深**，否则"房子"会看着像浮在半空。
        cs-brick 渐变本身偏浅灰，因此这里再叠一层暗色罩染（multiply 观感），
        让墙成为门楼最实在的一块体量。
      */}
      <rect x={170} y={478} width={560} height={104} fill="url(#cs-brick)" stroke={brick.dark} strokeWidth="2.4" />
      <rect x={170} y={478} width={560} height={104} fill="#3b4148" opacity="0.34" />
      <rect x={170} y={478} width={560} height={104} fill="url(#cs-brickpat)" opacity="0.45" />
      {/* 墙檐阴影 */}
      <rect x={170} y={478} width={560} height={14} fill="rgba(0,0,0,.32)" />
      {/* 墙脚（石活） */}
      <rect x={170} y={566} width={560} height={16} fill={C_GRANITE.dark} opacity="0.55" />

      {/* 大门（对开） */}
      <rect x={366} y={492} width={168} height={90} rx="4" fill="#4d1f16" stroke={gold.base} strokeWidth="3" />
      <path d="M450 492 V582" stroke={gold.base} strokeWidth="2.4" />
      {/* 门钉 */}
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2, 3].map((c) => (
          <circle key={`${r}-${c}`} cx={392 + c * 38} cy={516 + r * 26} r="5" fill="url(#cs-gold)" opacity="0.92" />
        )),
      )}
      {/* 铺首衔环 */}
      {[418, 482].map((x) => (
        <g key={x}>
          <circle cx={x} cy={548} r="11" fill="url(#cs-gold)" />
          <circle cx={x} cy={562} r="7" fill="none" stroke={gold.base} strokeWidth="2.6" />
        </g>
      ))}

      {/* ---------- 台基 ---------- */}
      <rect x={128} y={582} width={644} height={20} rx="3" fill={C_MARBLE.base} stroke={C_MARBLE.dark} strokeWidth="2.4" />
      <rect x={128} y={600} width={644} height={12} rx="2" fill={C_MARBLE.dark} stroke="#9a938a" strokeWidth="1.8" />
      {/* 踏跺（中央台阶） */}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={402 + i * 8} y={582 + i * 10} width={96 - i * 16} height={10} fill={C_MARBLE.light} stroke={C_MARBLE.dark} strokeWidth="1.4" />
      ))}

      {/*
        抱鼓石（门两侧，坐在台基**之上**）：
        鼓身朝外、基座朝内，左右以门口为轴镜像。
        transform 顺序：`translate(cx,cy) scale(s,1)` = 先移到门口，再以该点为轴翻转。
        （早先把 s 乘进了 translate 的 x，结果只画出一只、另一只飞出画布。）
        cy=582 是台基顶面 —— 鼓座底面必须压在这条线上，才不会"陷进地里"。
        必须画在台基之后：SVG 靠文档顺序叠放，画在前面会被台基盖住半截。
      */}
      {[
        { cx: 336, s: 1 },
        { cx: 564, s: -1 },
      ].map(({ cx, s }, i) => (
        <g key={i} transform={`translate(${cx},582) scale(${s},1)`}>
          {/* 鼓座（方趺，坐在台基顶面） */}
          <rect x="-34" y="-12" width="40" height="12" rx="2" fill={C_GRANITE.dark} stroke="#5f5c55" strokeWidth="1.8" />
          {/* 鼓托（须弥座） */}
          <rect x="-30" y="-34" width="32" height="22" rx="2" fill={C_GRANITE.light} stroke={C_GRANITE.dark} strokeWidth="2.2" />
          {/* 鼓身（圆鼓，贴门一侧） */}
          <ellipse cx="-52" cy="-52" rx="30" ry="26" fill={C_GRANITE.base} stroke={C_GRANITE.dark} strokeWidth="2.6" />
          <ellipse cx="-52" cy="-52" rx="17" ry="15" fill="none" stroke={C_GRANITE.dark} strokeWidth="1.8" opacity="0.7" />
          {/* 鼓钉 */}
          {[
            [-52, -70],
            [-70, -52],
            [-34, -52],
            [-52, -34],
          ].map(([dx, dy], k) => (
            <circle key={k} cx={dx} cy={dy} r="3" fill={C_GRANITE.dark} opacity="0.75" />
          ))}
        </g>
      ))}

      {/* 姓氏小字（郡望）——落在台基**下方**的留白里，不与台基线重叠 */}
      {ancestorTitle && (
        <text x="450" y="636" textAnchor="middle" fontSize="17" fill="#6b6255" style={{ fontFamily: "serif", letterSpacing: "0.36em" }}>
          {surname}氏 · {ancestorTitle}
        </text>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ② 天井：两侧立柱 + 长幡
// ---------------------------------------------------------------------------
export function SceneCourtyard({
  palette = DEFAULT_PALETTE,
  banners = ["祖", "宗"],
}: {
  palette?: ArchPalette;
  banners?: [string, string] | string[];
}) {
  const verm = palette.pillar ?? C_VERMILION;
  const gold = palette.gold ?? C_GOLD;

  return (
    <div className="relative select-none" aria-hidden>
      <div className="relative mx-auto max-w-5xl px-1">
        {/*
          天井：左幡 / 朱红立柱两根 / 右幡 / 青石地面 —— 整段画进**一张** SVG。
          早期版本用 grid + 多个 aspect-ratio 容器：grid 列宽被 1fr 吃掉，
          容器又各自撑高，互相喂养后整段涨到 8900–13000px。
          单张 viewBox 后，所有构件按同一坐标系排布，比例天然一致。
        */}
        <svg viewBox="0 0 1200 700" className="block w-full" preserveAspectRatio="xMidYMax meet">
          <title>天井</title>
          <defs>
            <linearGradient id="cy-p2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={verm.dark} />
              <stop offset="0.36" stopColor={verm.light} />
              <stop offset="0.62" stopColor={verm.base} />
              <stop offset="1" stopColor="#5d1a14" />
            </linearGradient>
            <linearGradient id="cy-flag" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C_VERMILION.light} />
              <stop offset="1" stopColor={C_VERMILION.dark} />
            </linearGradient>
          </defs>

          {/* ---------- 地面（先画，被柱础压住） ---------- */}
          <rect x="0" y="600" width="1200" height="100" fill="#ded8c9" opacity="0.75" />
          {Array.from({ length: 16 }).map((_, i) => (
            <path key={`v${i}`} d={`M${i * 78} 600 V700`} stroke="#b9b1a0" strokeWidth="1.6" opacity="0.6" />
          ))}
          {[622, 652, 682].map((y, i) => (
            <path key={`h${i}`} d={`M0 ${y} H1200`} stroke="#b9b1a0" strokeWidth="1.4" opacity="0.5" />
          ))}

          {/* ---------- 幡（左 / 右） ----------
              幡杆落在 y=600 的地面上（与柱础同一条基线），不与地面错位。 */}
          {[
            { x: 110, ch: banners[0] ?? "祖" },
            { x: 1090, ch: banners[1] ?? "宗" },
          ].map(({ x, ch }, i) => (
            <g key={i}>
              {/* 幡杆：自杆首一直插到地面（y=600），两侧露出的杆身要够长才像"挑幡" */}
              <rect x={x - 6} y="30" width="12" height="570" rx="4" fill={C_NANMU.dark} stroke="#3d2a18" strokeWidth="2" />
              {/* 杆首金饰 */}
              <circle cx={x} cy="30" r="13" fill={gold.base} stroke="#8a6a1e" strokeWidth="2" />
              <path d={`M${x} 17 q11 -13 23 -7 q-15 7 -19 15 Z`} fill={gold.light} stroke="#8a6a1e" strokeWidth="1.4" />
              {/* 幡身：从杆上部垂下，不遮住杆首 */}
              <path d={`M${x - 46} 66 H${x + 46} V452 L${x} 490 L${x - 46} 452 Z`} fill="url(#cy-flag)" stroke={C_VERMILION.dark} strokeWidth="2.6" />
              <path d={`M${x - 40} 72 H${x + 40} V444 L${x} 476 L${x - 40} 444 Z`} fill="none" stroke={gold.base} strokeWidth="2" opacity="0.85" />
              {/* 幡字 */}
              <text x={x} y="264" textAnchor="middle" dominantBaseline="middle" fontSize="76" fill={gold.light} style={{ fontFamily: "serif" }}>
                {ch}
              </text>
              {/* 流苏：从幡尾垂到地面之上，不越过基线 */}
              {[0, 1, 2, 3, 4].map((k) => (
                <path key={k} d={`M${x - 20 + k * 10} 490 q${(k - 2) * 4} 20 0 40`} stroke={gold.base} strokeWidth="2.4" fill="none" opacity="0.9" />
              ))}
            </g>
          ))}

          {/* ---------- 立柱两根 ---------- */}
          {[402, 798].map((x, i) => (
            <g key={i}>
              {/* 柱础（覆盆 + 方座） */}
              <path d={`M${x - 58} 600 q58 -22 116 0 q-16 26 -58 26 q-42 0 -58 -26 Z`} fill={C_MARBLE.base} stroke={C_MARBLE.dark} strokeWidth="3" />
              <rect x={x - 64} y="622" width="128" height="14" rx="2" fill={C_MARBLE.dark} stroke="#9a938a" strokeWidth="2" />
              {/* 柱身 */}
              <rect x={x - 34} y="60" width="68" height="542" rx="3" fill="url(#cy-p2)" stroke="#5d1a14" strokeWidth="2.4" />
              {/* 柱头金箍 */}
              <rect x={x - 40} y="52" width="80" height="16" rx="2" fill={gold.base} stroke="#8a6a1e" strokeWidth="2" />
              {/* 雀替 */}
              <path d={`M${x - 34} 92 q-30 8 -34 34 q22 -8 34 -9 Z`} fill={verm.dark} stroke="#5d1a14" strokeWidth="1.8" />
              <path d={`M${x + 34} 92 q30 8 34 34 q-22 -8 -34 -9 Z`} fill={verm.dark} stroke="#5d1a14" strokeWidth="1.8" />
              {/* 抱柱联（竖排金饰） */}
              <rect x={x - 20} y="150" width="40" height="340" rx="3" fill="none" stroke={gold.base} strokeWidth="2" opacity="0.55" />
              {Array.from({ length: 7 }).map((_, k) => (
                <rect key={k} x={x - 10} y={172 + k * 46} width="20" height="26" rx="2" fill={gold.base} opacity="0.32" />
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ③ 享堂：斗拱额枋 + 匾额
// ---------------------------------------------------------------------------
export function SceneMainHall({
  palette = DEFAULT_PALETTE,
  plaqueText = "祖德流芳",
  children,
}: {
  palette?: ArchPalette;
  plaqueText?: string;
  children?: ReactNode;
}) {
  const tile = palette.roof ?? C_TILE;
  const gold = palette.gold ?? C_GOLD;
  const verm = palette.pillar ?? C_VERMILION;

  return (
    <div className="relative select-none" aria-hidden>
      <div className="relative mx-auto max-w-4xl px-2">
        {/*
          斗拱带：整排画成**一张** SVG（早期是 13 个带 w-[6.2%] 的 <svg>，
          百分比在 flex 里失效 → 每个撑满整行，整段涨到 13000px）。
          注意 preserveAspectRatio 用默认的 meet（**不要** none）：
          none 会把 13 朵斗拱横向拉变形，看着像一排锯齿。
        */}
        <svg viewBox="0 0 1200 110" className="block w-full" preserveAspectRatio="xMidYMax meet" aria-hidden>
          <title>斗拱</title>
          {Array.from({ length: 11 }).map((_, i) => {
            const x = 40 + i * 105;
            return (
              <g key={i}>
                {/* 坐斗 */}
                <rect x={x + 24} y={72} width="34" height="24" rx="2" fill={gold.base} stroke="#8a6a1e" strokeWidth="1.6" />
                {/* 拱（朱红，两道） */}
                <path d={`M${x + 4} 64 H${x + 78} V73 H${x + 4} Z`} fill={verm.base} stroke="#5d1a14" strokeWidth="1.4" />
                <path d={`M${x + 16} 44 H${x + 66} V52 H${x + 16} Z`} fill={verm.light} stroke="#5d1a14" strokeWidth="1.4" />
                {/* 昂（斜向下伸出的尖嘴） */}
                <path d={`M${x + 36} 44 L${x + 70} 14 L${x + 78} 21 L${x + 44} 52 Z`} fill={verm.dark} stroke="#5d1a14" strokeWidth="1.4" />
                {/* 升（斗上的小托块） */}
                <rect x={x + 8} y={32} width="15" height="12" rx="1.5" fill={gold.light} stroke="#8a6a1e" strokeWidth="1.2" />
                <rect x={x + 60} y={32} width="15" height="12" rx="1.5" fill={gold.light} stroke="#8a6a1e" strokeWidth="1.2" />
              </g>
            );
          })}
        </svg>

        {/* 额枋 */}
        <div
          className="relative h-8 rounded-sm"
          style={{
            background: `linear-gradient(180deg, ${verm.light}, ${verm.base} 55%, ${verm.dark})`,
            borderTop: "2px solid #5d1a14",
            borderBottom: "2px solid #5d1a14",
          }}
        >
          <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-around px-6">
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={i}
                className="block h-3.5 w-3.5 rounded-full"
                style={{ border: `2.2px solid ${gold.base}` }}
              />
            ))}
          </div>
        </div>

        {/*
          匾额：黑漆金匾，高悬门楣。
          匾文是 **HTML**（不是 SVG text）—— 既保证字体渲染与可读性，
          也让脚本文案断言能直接命中（与"标题保持 HTML 节点"的约定一致）。
          必须 `w-fit`：否则在 flex 行里会被拉成整幅宽，字全跑到左边去。
        */}
        <div className="mt-5 flex justify-center">
          <div
            className="flex w-fit items-center gap-4 rounded-md px-8 py-3"
            style={{
              background: "linear-gradient(180deg, #3a332c, #241f1a)",
              border: `4px solid ${gold.base}`,
              boxShadow: "0 10px 26px rgba(0,0,0,.28), inset 0 0 0 1px rgba(255,255,255,.08)",
            }}
          >
            <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: gold.base, opacity: 0.85 }} />
            <span
              className="whitespace-nowrap font-serif text-2xl tracking-[0.28em] md:text-3xl"
              style={{
                color: gold.light,
                textShadow: "0 2px 0 rgba(0,0,0,.5)",
              }}
            >
              {plaqueText}
            </span>
            <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: gold.base, opacity: 0.85 }} />
          </div>
        </div>
      </div>

      {/* 供桌前的帷幔（桌围） */}
      <div
        className="relative mx-auto mt-6 h-3 max-w-4xl rounded"
        style={{ background: `linear-gradient(180deg, ${verm.base}, ${verm.dark})`, opacity: 0.9 }}
      />

      {/* 陈设内容由调用方注入（必须是 HTML） */}
      <div className="relative mt-6">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ④ 寝堂：牌位墙 + 香案
// ---------------------------------------------------------------------------
/** 供台上的一件供品（由调用方从 OfferingOnAltar 查出后传入） */
export type ClanAltarGlyph = { id: string; slug: string; glyph: string };

/*
  牌位墙的几何（与下面 SVG 的 `viewBox="0 0 980 340"` 严格对应）。
  导出成常量而不是散落在 JSX 里的字面量，是因为**遗像龛**要用同一份数字：
  遗像是真实 `<img>`，靠百分比绝对定位叠在 SVG 上。两份数字一旦各自漂移，
  遗像就会与画出来的龛位错位（这正是 NicheWallHero 踩过的坑）。
*/
const SHRINE_W = 980;
const SHRINE_H = 340;
/**
 * 中间一间（bay=1）里被遗像龛占用的牌位位次。
 *
 * 从 3 座（k=1,2,3）扩到**整间 5 座**（k=0..4）—— 遗像太小时人脸看不清，
 * 必须占满一间才有辨识度。牌位墙高度只有 340，靠"9 倍面积"是放不下的
 * （那需要 800 高），因此横向取到极限：整间让位，龛宽 142 → 246。
 */
const SHRINE_NICHE_KS = [0, 1, 2, 3, 4];
/** bay=1 的牌位起点与步进 */
const SHRINE_BAY1_X0 = 40 + 304 + 22;
const SHRINE_K_STEP = 52;
const SHRINE_TABLET_W = 38;
/**
 * 遗像龛：横向占满中间一间（366 → 612，宽 246，中心 489 ≈ 墙心 490）；
 * 纵向从**上横枋下沿（66）**到趺座上沿（264）—— 从横枋下开始，
 * 这样龛顶的云头正好抵着横枋（像匾额挂在枋下），不会与斗拱打架。
 * 中心 (489, 165) 落在**香案正上方**，且不压住下方的三足香炉。
 */
const SHRINE_NICHE = {
  left: SHRINE_BAY1_X0 + SHRINE_NICHE_KS[0] * SHRINE_K_STEP,
  right:
    SHRINE_BAY1_X0 + SHRINE_NICHE_KS[SHRINE_NICHE_KS.length - 1] * SHRINE_K_STEP +
    SHRINE_TABLET_W,
  top: 66,
  bottom: 264,
} as const;

export function SceneShrine({
  children,
  altarItems = [],
  portrait,
  deceasedName,
}: {
  children?: ReactNode;
  /**
   * 供台陈列：摆在香案桌面上的供品。
   * 不传时与改造前完全一致 —— 保证既有的场景结构快照不受影响。
   */
  altarItems?: ClanAltarGlyph[];
  /**
   * 先祖遗像。传入时中间一间的中间三座牌位**让位**，腾出一个遗像龛；
   * 不传时中间照常画满五座牌位 —— 零回归。
   */
  portrait?: string;
  /** 遗像的 alt 文案（拼成「{名}遗像」，便于断言与无障碍） */
  deceasedName?: string;
}) {
  const tile = C_TILE;
  const gold = C_GOLD;
  const nanmu = C_NANMU;

  const hasPortrait = !!portrait;

  return (
    <div className="relative select-none">
      {/* 牌位墙：一排朱漆牌位（祖先名号用 HTML 覆盖在牌面上） */}
      <div className="relative mx-auto max-w-3xl px-2" aria-hidden>
        <Frame ratio={RATIO.tabletWall}>
          {/*
            遗像与 SVG 必须共享同一坐标系：
            Frame 的外层用 preserveAspectRatio="xMidYMax meet" 会 letterbox，
            若遗像按**容器**百分比定位就会与画出的龛位错位。
            因此这里在 Frame 内部再套一层严格按 980:340 撑开的盒子，
            SVG 与 `<img>` 都用这套同构坐标，窗口怎么缩放都不会漂。
          */}
          <div
            className="relative"
            style={{ aspectRatio: `${SHRINE_W} / ${SHRINE_H}`, width: "100%" }}
          >
            <svg
              viewBox={`0 0 ${SHRINE_W} ${SHRINE_H}`}
              style={FULL}
              preserveAspectRatio="xMidYMax meet"
            >
            <defs>
              <linearGradient id="sh-nanmu" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={nanmu.light} />
                <stop offset="0.45" stopColor={nanmu.base} />
                <stop offset="1" stopColor={nanmu.dark} />
              </linearGradient>
              <linearGradient id="sh-gold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={gold.light} />
                <stop offset="0.5" stopColor={gold.base} />
                <stop offset="1" stopColor="#8a6a1e" />
              </linearGradient>
            </defs>

            {/* 通壁木构架 */}
            <rect x="6" y="6" width="968" height="328" rx="6" fill="url(#sh-nanmu)" stroke="#2f2318" strokeWidth="3" />
            {/* 横枋两道 */}
            <rect x="6" y="52" width="968" height="14" fill="#2f2318" opacity="0.55" />
            <rect x="6" y="286" width="968" height="16" fill="#2f2318" opacity="0.55" />

            {/*
              三间 × 五座牌位，昭穆序（中间最高，向两侧递减）。
              坐标由 980 的画幅推出：左右留白 40，三间等宽 292，间以 12 宽立柱分隔。
              每座牌位占 52（牌面 38 + 间隙 14），故一间正好容下 5 座。

              有遗像时：中间一间被 SHRINE_NICHE_KS 指定的三座**不画**，
              那个位置留给叠加在上面的遗像龛。
            */}
            {[0, 1, 2].flatMap((bay) =>
              Array.from({ length: 5 }).map((_, k) => {
                if (hasPortrait && bay === 1 && SHRINE_NICHE_KS.includes(k)) return null;
                const bx = 40 + bay * 304; // 292 + 12
                const x = bx + 22 + k * 52;
                const center = Math.abs(k - 2);
                const ph = 176 - center * 16;
                const top = 286 - ph;
                return (
                  <g key={`${bay}-${k}`}>
                    {/* 牌位（朱漆牌面 + 双描金框） */}
                    <rect x={x} y={top} width="38" height={ph - 22} rx="4" fill={C_VERMILION.dark} stroke="#4a1209" strokeWidth="2" />
                    <rect x={x + 4} y={top + 4} width="30" height={ph - 30} rx="3" fill="none" stroke="url(#sh-gold)" strokeWidth="2" />
                    {/* 牌首（云头） */}
                    <path d={`M${x - 3} ${top} q22 -14 44 0 Z`} fill="url(#sh-gold)" stroke="#8a6a1e" strokeWidth="1.4" />
                    {/* 趺座（比牌位宽） */}
                    <rect x={x - 7} y={286 - 22} width="52" height="22" rx="3" fill="url(#sh-nanmu)" stroke="#2f2318" strokeWidth="2" />
                  </g>
                );
              }),
            )}

            {/*
              遗像龛的描金外框（遗像本身是 HTML 叠在上面）。
              只在真的让了位时画 —— 否则墙中央空出一个描金方框会很怪。
              龛底补一块朱漆背板，让遗像"嵌"进去而不是浮在牌位之间。
            */}
            {hasPortrait && (
              <g>
                {/* 龛背板：比龛口大 8，把整间让出的空位填实，形成"嵌进墙里"的凹感 */}
                <rect
                  x={SHRINE_NICHE.left - 8}
                  y={SHRINE_NICHE.top - 8}
                  width={SHRINE_NICHE.right - SHRINE_NICHE.left + 16}
                  height={SHRINE_NICHE.bottom - SHRINE_NICHE.top + 16}
                  rx="5"
                  fill={nanmu.dark}
                />
                {/* 内阴影：上/左更重 → 读成往里凹 */}
                <rect x={SHRINE_NICHE.left - 8} y={SHRINE_NICHE.top - 8} width={SHRINE_NICHE.right - SHRINE_NICHE.left + 16} height="10" fill="rgba(30,22,14,.45)" />
                <rect x={SHRINE_NICHE.left - 8} y={SHRINE_NICHE.top - 8} width="10" height={SHRINE_NICHE.bottom - SHRINE_NICHE.top + 16} fill="rgba(30,22,14,.34)" />
                <rect x={SHRINE_NICHE.right - 2} y={SHRINE_NICHE.top - 8} width="10" height={SHRINE_NICHE.bottom - SHRINE_NICHE.top + 16} fill="rgba(30,22,14,.22)" />
                {/* 描金外框 */}
                <rect
                  x={SHRINE_NICHE.left - 8}
                  y={SHRINE_NICHE.top - 8}
                  width={SHRINE_NICHE.right - SHRINE_NICHE.left + 16}
                  height={SHRINE_NICHE.bottom - SHRINE_NICHE.top + 16}
                  rx="5"
                  fill="none"
                  stroke="url(#sh-gold)"
                  strokeWidth="4"
                />
                {/* 龛顶云头，与牌首相呼应 */}
                <path
                  d={`M${SHRINE_NICHE.left - 18} ${SHRINE_NICHE.top - 4} Q${
                    (SHRINE_NICHE.left + SHRINE_NICHE.right) / 2
                  } ${SHRINE_NICHE.top - 30} ${SHRINE_NICHE.right + 18} ${SHRINE_NICHE.top - 4} Z`}
                  fill="url(#sh-gold)"
                  stroke="#8a6a1e"
                  strokeWidth="1.4"
                />
              </g>
            )}

            {/* 分隔三间的立柱（四根：两端 + 中间两道） */}
            {[40, 332, 636, 928].map((x, i) => (
              <rect key={i} x={x - 6} y="6" width="12" height="328" fill="url(#sh-nanmu)" stroke="#2f2318" strokeWidth="2.2" />
            ))}
            {/* 斗拱托木（每间两朵） */}
            {[0, 1, 2].flatMap((bay) =>
              [0, 1].map((j) => {
                const x = 186 + bay * 304 + j * 96;
                return (
                  <g key={`${bay}-${j}`}>
                    <rect x={x - 22} y={22} width="44" height="10" rx="2" fill={gold.base} stroke="#8a6a1e" strokeWidth="1.6" />
                    <rect x={x - 9} y={32} width="18" height="20" rx="2" fill={gold.light} stroke="#8a6a1e" strokeWidth="1.6" />
                  </g>
                );
              }),
            )}
            </svg>

            {/*
              先祖遗像：绝对定位到龛位，百分比由 SHRINE_NICHE 与画幅算出。
              放在 SVG **之后**，因此天然盖在牌位墙之上。
              内缩 6（各边）让 SVG 画的描金框（-8 处、4 宽）露出来，
              读成"嵌在龛里"而不是"贴了张纸"。

              为什么是真实 <img> 而不是 SVG <image> 或背景图：
                遗像是业务数据（可能为空），必须走浏览器的按需加载与既有上传链路，
                也要能被脚本按 img[alt*='遗像'] 断言。
            */}
            {hasPortrait && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={portrait}
                alt={deceasedName ? `${deceasedName}遗像` : "先祖遗像"}
                data-clan-portrait="1"
                className="absolute rounded-[3px] border-solid object-cover shadow-lg"
                style={{
                  // 内缩 6：描金框画在 -8..-4 与 +4..+8，故 6 正好压在框内侧
                  left: `${((SHRINE_NICHE.left + 6) / SHRINE_W) * 100}%`,
                  top: `${((SHRINE_NICHE.top + 6) / SHRINE_H) * 100}%`,
                  width: `${((SHRINE_NICHE.right - SHRINE_NICHE.left - 12) / SHRINE_W) * 100}%`,
                  height: `${((SHRINE_NICHE.bottom - SHRINE_NICHE.top - 12) / SHRINE_H) * 100}%`,
                  borderWidth: 0,
                  borderColor: gold.base,
                }}
              />
            )}
          </div>
        </Frame>
      </div>

      {/* 香案（长条供桌，压在牌位墙前） */}
      <div className="relative mx-auto -mt-10 max-w-2xl px-6" aria-hidden>
        <Frame ratio={RATIO.altar}>
          <svg viewBox="0 0 900 260" style={FULL} preserveAspectRatio="xMidYMax meet">
            {/* 桌面 */}
            <rect x="40" y="40" width="820" height="30" rx="4" fill={nanmu.light} stroke="#3d2a18" strokeWidth="3" />
            {/* 束腰 */}
            <rect x="90" y="70" width="720" height="70" fill={nanmu.base} stroke="#3d2a18" strokeWidth="3" />
            {/* 牙板（云纹） */}
            <path d="M90 140 H810 V178 H90 Z" fill={nanmu.dark} stroke="#2f2318" strokeWidth="2.6" />
            <path d="M120 142 q40 26 90 0 q46 26 92 0 q46 26 92 0 q46 26 92 0 q46 26 92 0 q46 26 92 0" fill="none" stroke={gold.base} strokeWidth="2.4" opacity="0.55" />
            {/* 四腿 */}
            {[128, 772].map((x, i) => (
              <g key={i}>
                <rect x={x - 16} y="178" width="32" height="66" fill={nanmu.dark} stroke="#2f2318" strokeWidth="2.4" />
                <rect x={x - 24} y="244" width="48" height="12" rx="2" fill={nanmu.light} stroke="#2f2318" strokeWidth="2" />
              </g>
            ))}
            {/*
              案上祭器：香炉居中、烛台左右。
              它们的**底部必须正好落在桌面 y=40**（桌面 top=40），
              否则会看到祭器"浮"在桌子上方——早先画在 y=2..40 就是这个毛病。
            */}
            {/* 香炉（含双耳 + 三足） */}
            <g>
              <path d="M424 16 q26 -10 52 0 q6 12 -6 16 h-40 q-12 -4 -6 -16 Z" fill={C_GRANITE.base} stroke={C_GRANITE.dark} strokeWidth="2.2" />
              <ellipse cx="450" cy="16" rx="26" ry="6" fill={C_GRANITE.light} stroke={C_GRANITE.dark} strokeWidth="2" />
              {/* 双耳 */}
              <path d="M424 18 q-12 2 -10 12" fill="none" stroke={C_GRANITE.dark} strokeWidth="3" strokeLinecap="round" />
              <path d="M476 18 q12 2 10 12" fill="none" stroke={C_GRANITE.dark} strokeWidth="3" strokeLinecap="round" />
              {/* 三足坐到桌面 */}
              {[436, 450, 464].map((x, k) => (
                <rect key={k} x={x - 4} y="32" width="8" height="8" rx="2" fill={C_GRANITE.dark} />
              ))}
            </g>
            {/* 烛台（左右） */}
            {[312, 588].map((x, i) => (
              <g key={i}>
                <rect x={x - 5} y="18" width="10" height="22" rx="3" fill={gold.base} stroke="#8a6a1e" strokeWidth="1.6" />
                <ellipse cx={x} cy="40" rx="13" ry="4" fill={gold.light} stroke="#8a6a1e" strokeWidth="1.4" />
                <ellipse cx={x} cy="14" rx="8" ry="5" fill="#f6e6b8" opacity="0.95" />
                <path d={`M${x} 2 q4 5 0 9 q-4 -4 0 -9 Z`} fill="#f2b23c" opacity="0.9" />
              </g>
            ))}
            {/* 果盘（两件，补足供案陈设） */}
            {[388, 512].map((x, i) => (
              <g key={i}>
                <ellipse cx={x} cy="30" rx="18" ry="9" fill={nanmu.dark} stroke="#2f2318" strokeWidth="2" />
                <circle cx={x - 6} cy="27" r="5" fill="#d4722c" />
                <circle cx={x + 4} cy="26" r="5" fill="#c8452f" />
                <circle cx={x - 1} cy="31" r="5" fill="#d4722c" />
              </g>
            ))}

            {/*
              供台陈列：正在供奉的祭品。
              画在桌面 y=40 的**前排**（y=36），香炉/烛台在后排（y=2..40），形成前后层次。
              x 均布于桌面区间并跳过中央香炉区（约 400–520），避免与香炉重叠。
            */}
            {altarItems.length > 0 &&
              (() => {
                const slots: number[] = [];
                const n = altarItems.length;
                for (let i = 0; i < n; i++) {
                  const t = (i + 0.5) / n;
                  let x = 70 + t * 760; // 桌面 x 区间 40..820，两端各留 30
                  if (x > 395 && x < 525) x += x < 460 ? -70 : 70; // 让开香炉
                  slots.push(x);
                }
                return altarItems.map((it, i) => (
                  <text
                    key={it.id}
                    x={slots[i]}
                    y="36"
                    fontSize="28"
                    textAnchor="middle"
                    data-altar-slug={it.slug}
                  >
                    {it.glyph}
                  </text>
                ));
              })()}
          </svg>
        </Frame>
      </div>

      {/* 陈设内容（祭祀记录等 HTML 由调用方注入） */}
      <div className="relative">{children}</div>
    </div>
  );
}

/** 底部收束：地砖 + 阴影，让整座祠堂"落地" */
export function SceneGround({ style }: { style?: CSSProperties }) {
  return (
    <div
      className="pointer-events-none relative mt-10 h-20 select-none"
      aria-hidden
      style={{
        background:
          "linear-gradient(180deg, rgba(120,112,98,0) 0%, rgba(120,112,98,.16) 40%, rgba(120,112,98,.30) 100%)",
        maskImage: "linear-gradient(180deg, transparent, black)",
        WebkitMaskImage: "linear-gradient(180deg, transparent, black)",
        ...style,
      }}
    />
  );
}
