import type { ReactNode } from "react";

/**
 * 主题化装修封面（DecorCover）
 * ---------------------------------------------------------------------------
 * 装修案例厅（/gallery/decor）的卡片封面、以及商城装修模板详情页首屏封面，
 * 之前分别是「一枚通用 emoji + 渐变色块」与「所有模板共用的 prod-decor-tpl.svg」。
 * 这两种做法都与每套主题的**文字描述对不上**（水墨山房配了表情山、朱漆门庭
 * 配了希腊神庙、莲开九品在缺 emoji 字体的设备上还是豆腐块）。
 *
 * 本组件按模板 id **逐套程序化绘制场景 SVG**：
 *   - 底色直接复用模板自己的 `preview.background`（线性/径向渐变原样保留，
 *     零图片加载、零外部资源，延续仓库「纯 CSS / 内联、不依赖图片」的原则）；
 *   - 前景用 `preview.color` / `preview.accent` 作为描边与高光色，保证配色
 *     与模板调色板完全一致；
 *   - 每个 id 映射到一种「场景母题」（山房/门庭/莲池/星河/壁龛/影壁……），
 *     让 43 套主题各有各的样子，而非同一个 emoji 换个底色。
 *
 * 这是纯展示组件：无状态、无副作用、无 "use client"，可在 Server Component
 * 中直接渲染（画廊页与 mall 详情页都是服务端组件）。
 */

type CoverPreview = {
  /** 渐变/纯色底；缺失时回退中性色（理论上每套模板都带 background） */
  background?: string;
  color?: string;
  accent?: string;
  icon?: string;
};
export type DecorCoverInput = {
  id: string;
  name?: string;
  space?: string;
  preview: CoverPreview;
};

type C = { ink: string; accent: string };
type MotifFn = (c: C) => ReactNode;

const W = 320;
const H = 180;
const VERMILION = "#b23a2e";

// ---------------------------------------------------------------------------
// 复用构件（小件 SVG 基元）
// ---------------------------------------------------------------------------

function Ground({ c }: { c: C }) {
  return (
    <>
      <line x1={20} y1={150} x2={300} y2={150} stroke={c.ink} strokeWidth={1} opacity={0.22} />
      <ellipse cx={160} cy={157} rx={120} ry={9} fill={c.ink} opacity={0.06} />
    </>
  );
}

function Roof({ x, y, w, color, sw = 2.2 }: { x: number; y: number; w: number; color: string; sw?: number }) {
  return (
    <path
      d={`M ${x} ${y} Q ${x + w / 2} ${y - 15} ${x + w} ${y} L ${x + w - 11} ${y + 5} L ${x + 11} ${y + 5} Z`}
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeLinejoin="round"
    />
  );
}

function Pillar({ x, y0, y1, color, w = 9 }: { x: number; y0: number; y1: number; color: string; w?: number }) {
  return (
    <>
      <rect x={x - w / 2} y={y0} width={w} height={y1 - y0} rx={2} fill="none" stroke={color} strokeWidth={1.8} />
      <line x1={x - w / 2} y1={y0 + 6} x2={x + w / 2} y2={y0 + 6} stroke={color} strokeWidth={1} />
    </>
  );
}

function Lantern({ cx, cy, s, color, glow }: { cx: number; cy: number; s: number; color: string; glow?: string }) {
  const w = 14 * s;
  const h = 18 * s;
  return (
    <>
      {glow && <circle cx={cx} cy={cy} r={h * 1.5} fill={glow} opacity={0.16} />}
      <line x1={cx} y1={cy - h * 1.25} x2={cx} y2={cy - h * 0.65} stroke={color} strokeWidth={1.4} />
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={w * 0.32} fill="none" stroke={color} strokeWidth={1.8} />
      <line x1={cx - w / 2} y1={cy} x2={cx + w / 2} y2={cy} stroke={color} strokeWidth={1.1} />
      <line x1={cx} y1={cy - h / 2} x2={cx} y2={cy + h / 2} stroke={color} strokeWidth={0.9} />
      <line x1={cx} y1={cy + h / 2} x2={cx} y2={cy + h * 0.92} stroke={color} strokeWidth={1.4} />
    </>
  );
}

function Plaque({ x, y, w, h, color, accent }: { x: number; y: number; w: number; h: number; color: string; accent: string }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={4} fill="none" stroke={accent} strokeWidth={2.2} />
      <rect x={x + 4} y={y + 4} width={w - 8} height={h - 8} rx={2} fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
      <line x1={x + 9} y1={y + h / 2 - 4} x2={x + w - 9} y2={y + h / 2 - 4} stroke={color} strokeWidth={1.4} opacity={0.7} />
      <line x1={x + 9} y1={y + h / 2 + 4} x2={x + w - 9} y2={y + h / 2 + 4} stroke={color} strokeWidth={1.4} opacity={0.7} />
    </>
  );
}

function Censer({ cx, cy, color, accent }: { cx: number; cy: number; color: string; accent: string }) {
  return (
    <>
      <path d={`M ${cx - 16} ${cy} Q ${cx} ${cy - 14} ${cx + 16} ${cy} Z`} fill="none" stroke={color} strokeWidth={1.8} />
      <line x1={cx - 16} y1={cy} x2={cx - 16} y2={cy + 8} stroke={color} strokeWidth={1.6} />
      <line x1={cx + 16} y1={cy} x2={cx + 16} y2={cy + 8} stroke={color} strokeWidth={1.6} />
      <line x1={cx} y1={cy + 8} x2={cx} y2={cy + 12} stroke={color} strokeWidth={1.6} />
      <path d={`M ${cx - 4} ${cy - 14} q -5 -9 2 -15 q 7 -4 3 -13`} fill="none" stroke={accent} strokeWidth={1.2} opacity={0.75} />
    </>
  );
}

function Tablet({ x, y, w, h, color, accent }: { x: number; y: number; w: number; h: number; color: string; accent: string }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={3} fill="none" stroke={color} strokeWidth={1.8} />
      <path d={`M ${x + w / 2} ${y - 6} v -3 M ${x + w / 2 - 3} ${y - 7} h 6`} stroke={accent} strokeWidth={1.4} />
    </>
  );
}

function Lion({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={1.6} fill="none">
      <ellipse cx={cx} cy={cy} rx={10} ry={8} />
      <circle cx={cx} cy={cy - 9} r={5} />
      <line x1={cx - 9} y1={cy + 8} x2={cx - 9} y2={cy + 16} />
      <line x1={cx + 9} y1={cy + 8} x2={cx + 9} y2={cy + 16} />
    </g>
  );
}

function Halo({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.14} />
      <circle cx={cx} cy={cy} r={r * 0.7} fill="none" stroke={color} strokeWidth={1.2} opacity={0.6} />
      <circle cx={cx} cy={cy} r={r * 0.4} fill="none" stroke={color} strokeWidth={1} opacity={0.85} />
    </>
  );
}

function Moon({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  return <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={1.6} opacity={0.8} />;
}

function Mountains({ color }: { color: string }) {
  return (
    <path
      d="M 0 132 L 58 88 L 100 120 L 150 72 L 208 122 L 258 94 L 320 132"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      opacity={0.55}
      strokeLinejoin="round"
    />
  );
}

function Bamboo({ x, color }: { x: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={1.6} fill="none" opacity={0.7}>
      <line x1={x} y1={40} x2={x} y2={150} />
      {[56, 82, 108, 134].map((y) => (
        <line key={y} x1={x - 4} y1={y} x2={x + 4} y2={y} />
      ))}
      <path d={`M ${x} 58 q 18 -8 26 -22`} />
      <path d={`M ${x} 92 q -16 -6 -24 -20`} />
    </g>
  );
}

function Lotus({ cx, cy, color, accent }: { cx: number; cy: number; color: string; accent: string }) {
  return (
    <g>
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <ellipse
          key={a}
          cx={cx}
          cy={cy}
          rx={7}
          ry={16}
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          transform={`rotate(${a} ${cx} ${cy})`}
          opacity={0.85}
        />
      ))}
      <circle cx={cx} cy={cy} r={6} fill={accent} opacity={0.5} />
    </g>
  );
}

function Scroll({ cx, y, h, color, accent }: { cx: number; y: number; h: number; color: string; accent: string }) {
  const w = 26;
  return (
    <g stroke={color} strokeWidth={1.6} fill="none">
      <rect x={cx - w / 2} y={y} width={w} height={h} rx={2} />
      <rect x={cx - w / 2 - 3} y={y - 5} width={w + 6} height={6} rx={3} fill={accent} opacity={0.5} />
      <rect x={cx - w / 2 - 3} y={y + h - 1} width={w + 6} height={6} rx={3} fill={accent} opacity={0.5} />
      <line x1={cx - w / 2 + 5} y1={y + h * 0.35} x2={cx + w / 2 - 5} y2={y + h * 0.35} strokeWidth={1} />
      <line x1={cx - w / 2 + 5} y1={y + h * 0.55} x2={cx + w / 2 - 5} y2={y + h * 0.55} strokeWidth={1} />
    </g>
  );
}

function Starfield({ color, accent }: { color: string; accent: string }) {
  const stars: Array<[number, number, boolean]> = [
    [60, 40, false], [110, 70, true], [200, 50, false], [252, 92, true], [150, 40, false],
    [90, 112, true], [232, 132, false], [40, 92, true], [282, 60, false], [172, 122, true],
  ];
  return (
    <g>
      {stars.map(([x, y, alt], i) => (
        <g key={i} transform={`translate(${x} ${y})`} stroke={alt ? accent : color} strokeWidth={1}>
          <line x1={-3} y1={0} x2={3} y2={0} />
          <line x1={0} y1={-3} x2={0} y2={3} />
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// 场景母题（每种对应一组主题）
// ---------------------------------------------------------------------------

const MOTIFS: Record<string, MotifFn> = {
  plain: (c) => (
    <>
      <Ground c={c} />
      <rect x={70} y={55} width={180} height={95} rx={3} fill="none" stroke={c.ink} strokeWidth={1.6} opacity={0.5} />
    </>
  ),

  scroll: (c) => (
    <>
      <Ground c={c} />
      <line x1={160} y1={26} x2={160} y2={42} stroke={c.ink} strokeWidth={1.4} />
      <Scroll cx={160} y={42} h={92} color={c.ink} accent={c.accent} />
    </>
  ),

  nightlantern: (c) => (
    <>
      <line x1={20} y1={40} x2={300} y2={40} stroke={c.ink} strokeWidth={2} opacity={0.4} />
      <Lantern cx={90} cy={94} s={1.1} color={c.ink} glow={c.accent} />
      <Lantern cx={160} cy={80} s={1.3} color={c.ink} glow={c.accent} />
      <Lantern cx={230} cy={94} s={1.1} color={c.ink} glow={c.accent} />
      <Ground c={c} />
    </>
  ),

  inkmountain: (c) => (
    <>
      <Moon cx={250} cy={46} r={16} color={c.ink} />
      <Mountains color={c.ink} />
      <Bamboo x={48} color={c.ink} />
      <Ground c={c} />
    </>
  ),

  vermiliongong: (c) => (
    <>
      <Roof x={70} y={50} w={180} color={VERMILION} />
      <Pillar x={92} y0={55} y1={150} color={VERMILION} />
      <Pillar x={228} y0={55} y1={150} color={VERMILION} />
      <rect x={120} y={78} width={80} height={72} rx={3} fill="none" stroke={VERMILION} strokeWidth={1.6} opacity={0.7} />
      <Ground c={c} />
    </>
  ),

  goldhall: (c) => (
    <>
      <Halo cx={160} cy={80} r={60} color={c.accent} />
      <Plaque x={118} y={64} w={84} h={34} color={c.ink} accent={c.accent} />
      <Lantern cx={70} cy={98} s={0.9} color={c.ink} glow={c.accent} />
      <Lantern cx={250} cy={98} s={0.9} color={c.ink} glow={c.accent} />
      <Ground c={c} />
    </>
  ),

  lotus: (c) => (
    <>
      <Halo cx={160} cy={70} r={46} color={c.accent} />
      <Lotus cx={160} cy={96} color={c.ink} accent={c.accent} />
      <line x1={30} y1={130} x2={290} y2={130} stroke={c.ink} strokeWidth={1.4} opacity={0.4} />
      <ellipse cx={160} cy={132} rx={26} ry={5} fill={c.ink} opacity={0.18} />
      <Ground c={c} />
    </>
  ),

  starfield: (c) => (
    <>
      <Starfield color={c.ink} accent={c.accent} />
      <Plaque x={120} y={92} w={80} h={30} color={c.ink} accent={c.accent} />
      <Ground c={c} />
    </>
  ),

  niche: (c) => (
    <>
      <rect x={60} y={40} width={200} height={112} rx={3} fill="none" stroke={c.ink} strokeWidth={1.6} opacity={0.5} />
      <path d="M 130 70 a 30 30 0 0 1 60 0 v 50 h -60 Z" fill="none" stroke={c.accent} strokeWidth={2} />
      <path d="M 160 96 q -6 -10 0 -18 q 6 8 0 18" fill="none" stroke={c.accent} strokeWidth={1.6} />
      <rect x={74} y={56} width={30} height={36} rx={2} fill="none" stroke={c.ink} strokeWidth={1} opacity={0.45} />
      <rect x={216} y={56} width={30} height={36} rx={2} fill="none" stroke={c.ink} strokeWidth={1} opacity={0.45} />
      <Ground c={c} />
    </>
  ),

  mist: (c) => (
    <>
      {[50, 80, 110].map((y, i) => (
        <rect key={i} x={0} y={y} width={320} height={14} rx={7} fill={c.ink} opacity={0.05 + i * 0.02} />
      ))}
      <g stroke={c.ink} strokeWidth={1.4} fill="none" opacity={0.5}>
        {[250, 266, 282].map((x) => (
          <path key={x} d={`M ${x} 30 q 6 60 0 120`} />
        ))}
      </g>
      <line x1={20} y1={40} x2={300} y2={40} stroke={c.ink} strokeWidth={1.4} opacity={0.3} />
      <Ground c={c} />
    </>
  ),

  bamboo: (c) => (
    <>
      <Bamboo x={80} color={c.ink} />
      <Bamboo x={120} color={c.ink} />
      <Bamboo x={212} color={c.ink} />
      <Ground c={c} />
    </>
  ),

  altar: (c) => (
    <>
      <Censer cx={160} cy={96} color={c.ink} accent={c.accent} />
      <rect x={108} y={120} width={104} height={14} rx={2} fill="none" stroke={c.ink} strokeWidth={1.8} />
      <line x1={118} y1={134} x2={118} y2={150} stroke={c.ink} strokeWidth={1.6} />
      <line x1={202} y1={134} x2={202} y2={150} stroke={c.ink} strokeWidth={1.6} />
      <line x1={160} y1={96} x2={160} y2={120} stroke={c.ink} strokeWidth={1} />
      <Lantern cx={120} cy={100} s={0.7} color={c.ink} glow={c.accent} />
      <Lantern cx={200} cy={100} s={0.7} color={c.ink} glow={c.accent} />
      <Ground c={c} />
    </>
  ),

  screen: (c) => (
    <>
      {[0, 1, 2, 3].map((i) => {
        const x = 70 + i * 46;
        return (
          <g key={i}>
            <rect x={x} y={48} width={42} height={100} rx={2} fill="none" stroke={c.ink} strokeWidth={1.6} opacity={0.75} />
            <line x1={x + 21} y1={48} x2={x + 21} y2={148} stroke={c.ink} strokeWidth={0.8} opacity={0.4} />
          </g>
        );
      })}
      <Ground c={c} />
    </>
  ),

  scrolls: (c) => (
    <>
      <Scroll cx={120} y={40} h={96} color={c.ink} accent={c.accent} />
      <Scroll cx={200} y={40} h={96} color={c.ink} accent={c.accent} />
      <rect x={140} y={132} width={40} height={18} rx={2} fill="none" stroke={c.ink} strokeWidth={1.4} opacity={0.6} />
      <Ground c={c} />
    </>
  ),

  shadowwall: (c) => (
    <>
      <Roof x={86} y={44} w={148} color={c.ink} />
      <rect x={96} y={50} width={128} height={92} rx={2} fill="none" stroke={c.ink} strokeWidth={1.8} />
      {[73, 96, 119, 142].map((y, i) => (
        <line key={i} x1={96} y1={y} x2={224} y2={y} stroke={c.ink} strokeWidth={0.8} opacity={0.3} />
      ))}
      <circle cx={160} cy={92} r={18} fill="none" stroke={c.accent} strokeWidth={1.6} />
      <Ground c={c} />
    </>
  ),

  plaquehall: (c) => (
    <>
      <Plaque x={120} y={48} w={80} h={30} color={c.ink} accent={c.accent} />
      <line x1={92} y1={60} x2={92} y2={150} stroke={c.ink} strokeWidth={2} opacity={0.7} />
      <line x1={228} y1={60} x2={228} y2={150} stroke={c.ink} strokeWidth={2} opacity={0.7} />
      <Lantern cx={92} cy={94} s={0.8} color={c.ink} glow={c.accent} />
      <Lantern cx={228} cy={94} s={0.8} color={c.ink} glow={c.accent} />
      <Ground c={c} />
    </>
  ),

  palacelantern: (c) => (
    <>
      <line x1={40} y1={40} x2={280} y2={40} stroke={c.ink} strokeWidth={2.4} opacity={0.5} />
      <Lantern cx={110} cy={92} s={1.6} color={c.ink} glow={c.accent} />
      <Lantern cx={210} cy={92} s={1.6} color={c.ink} glow={c.accent} />
      <Ground c={c} />
    </>
  ),

  censer: (c) => (
    <>
      <rect x={84} y={44} width={152} height={100} rx={2} fill="none" stroke={c.ink} strokeWidth={1.4} opacity={0.4} />
      <Censer cx={160} cy={104} color={c.ink} accent={c.accent} />
      <Ground c={c} />
    </>
  ),

  dragongate: (c) => (
    <>
      <circle cx={160} cy={78} r={30} fill="none" stroke={c.accent} strokeWidth={1.6} />
      <path d="M 160 56 q 14 12 0 24 q -14 -12 0 -24" fill="none" stroke={c.accent} strokeWidth={1.4} />
      <path d="M 160 100 q 14 12 0 24 q -14 -12 0 -24" fill="none" stroke={c.accent} strokeWidth={1.4} />
      <Lion cx={92} cy={128} color={c.ink} />
      <Lion cx={228} cy={128} color={c.ink} />
      <Ground c={c} />
    </>
  ),

  tabletwall: (c) => (
    <>
      <rect x={70} y={40} width={180} height={110} rx={3} fill="none" stroke={c.ink} strokeWidth={1.6} opacity={0.5} />
      {[...Array(4)].flatMap((_, r) =>
        [...Array(5)].map((__, col) => (
          <Tablet key={`${r}-${col}`} x={84 + col * 34} y={52 + r * 24} w={24} h={18} color={c.ink} accent={c.accent} />
        )),
      )}
      <Ground c={c} />
    </>
  ),

  banner: (c) => (
    <>
      <Halo cx={160} cy={52} r={28} color={c.accent} />
      {[110, 210].map((x, i) => (
        <g key={i}>
          <line x1={x} y1={28} x2={x} y2={40} stroke={c.ink} strokeWidth={1.4} />
          <path d={`M ${x - 12} 40 h 24 v 84 l -12 12 l -12 -12 Z`} fill="none" stroke={c.ink} strokeWidth={1.6} />
          <line x1={x - 6} y1={60} x2={x + 6} y2={60} stroke={c.accent} strokeWidth={1} />
          <line x1={x - 6} y1={76} x2={x + 6} y2={76} stroke={c.accent} strokeWidth={1} />
          <line x1={x - 6} y1={92} x2={x + 6} y2={92} stroke={c.accent} strokeWidth={1} />
        </g>
      ))}
      <Ground c={c} />
    </>
  ),

  gate: (c) => (
    <>
      <Roof x={70} y={40} w={180} color={c.ink} />
      <Roof x={96} y={64} w={128} color={c.ink} />
      <rect x={120} y={80} width={80} height={64} rx={3} fill="none" stroke={c.ink} strokeWidth={1.6} opacity={0.7} />
      <Pillar x={110} y0={80} y1={150} color={c.ink} />
      <Pillar x={210} y0={80} y1={150} color={c.ink} />
      <Lion cx={90} cy={138} color={c.ink} />
      <Lion cx={230} cy={138} color={c.ink} />
      <Ground c={c} />
    </>
  ),

  courtyard: (c) => (
    <>
      <rect x={110} y={30} width={100} height={50} rx={3} fill="none" stroke={c.accent} strokeWidth={1.4} opacity={0.5} />
      <Pillar x={80} y0={60} y1={150} color={c.ink} />
      <Pillar x={240} y0={60} y1={150} color={c.ink} />
      <line x1={20} y1={60} x2={300} y2={60} stroke={c.ink} strokeWidth={1.6} opacity={0.4} />
      <line x1={120} y1={40} x2={120} y2={120} stroke={c.accent} strokeWidth={1.2} opacity={0.5} />
      <line x1={200} y1={40} x2={200} y2={120} stroke={c.accent} strokeWidth={1.2} opacity={0.5} />
      <Ground c={c} />
    </>
  ),

  thronehall: (c) => (
    <>
      <Roof x={66} y={40} w={188} color={VERMILION} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line key={i} x1={76 + i * 34} y1={52} x2={76 + i * 34} y2={64} stroke={VERMILION} strokeWidth={2} />
      ))}
      <Plaque x={126} y={70} w={68} h={26} color={c.ink} accent={c.accent} />
      <Pillar x={86} y0={78} y1={150} color={VERMILION} />
      <Pillar x={234} y0={78} y1={150} color={VERMILION} />
      <Ground c={c} />
    </>
  ),

  earth: (c) => (
    <>
      <rect x={80} y={46} width={160} height={96} rx={6} fill="none" stroke={c.ink} strokeWidth={1.8} opacity={0.6} />
      {[70, 100, 130].map((y, i) => (
        <line key={i} x1={86} y1={y} x2={234} y2={y} stroke={c.ink} strokeWidth={0.8} opacity={0.25} />
      ))}
      <line x1={40} y1={38} x2={280} y2={38} stroke={c.ink} strokeWidth={2} opacity={0.4} />
      <Lantern cx={160} cy={92} s={1.1} color={c.ink} glow={c.accent} />
      <Ground c={c} />
    </>
  ),

  whitehall: (c) => (
    <>
      <Pillar x={92} y0={50} y1={150} color={VERMILION} />
      <Pillar x={228} y0={50} y1={150} color={VERMILION} />
      <rect x={70} y={50} width={180} height={100} rx={2} fill="none" stroke={c.ink} strokeWidth={1.4} opacity={0.4} />
      <Lion cx={120} cy={138} color={c.ink} />
      <Lion cx={200} cy={138} color={c.ink} />
      <Ground c={c} />
    </>
  ),

  stoneterrace: (c) => (
    <>
      <rect x={70} y={70} width={180} height={80} rx={2} fill="none" stroke={c.ink} strokeWidth={1.6} opacity={0.5} />
      <line x1={60} y1={120} x2={260} y2={120} stroke={c.ink} strokeWidth={2} />
      <line x1={50} y1={135} x2={270} y2={135} stroke={c.ink} strokeWidth={2} />
      <Lion cx={95} cy={108} color={c.ink} />
      <Lion cx={225} cy={108} color={c.ink} />
      <Ground c={c} />
    </>
  ),

  incense: (c) => (
    <>
      <Censer cx={160} cy={86} color={c.ink} accent={c.accent} />
      <rect x={104} y={114} width={112} height={16} rx={2} fill="none" stroke={c.ink} strokeWidth={1.8} />
      <line x1={116} y1={130} x2={116} y2={148} stroke={c.ink} strokeWidth={1.6} />
      <line x1={204} y1={130} x2={204} y2={148} stroke={c.ink} strokeWidth={1.6} />
      <line x1={160} y1={86} x2={160} y2={114} stroke={c.ink} strokeWidth={1} />
      <Ground c={c} />
    </>
  ),

  dragonhall: (c) => (
    <>
      <Halo cx={160} cy={76} r={58} color={c.accent} />
      <path d="M 130 60 q 30 -20 60 0 q -20 14 -30 0 q -10 14 -30 0" fill="none" stroke={c.accent} strokeWidth={1.4} opacity={0.85} />
      <Plaque x={120} y={92} w={80} h={28} color={c.ink} accent={c.accent} />
      <Ground c={c} />
    </>
  ),
};

// ---------------------------------------------------------------------------
// 模板 id → 母题 映射（覆盖全部 43 套主题）
// ---------------------------------------------------------------------------

const MOTIF_OF: Record<string, string> = {
  // 纪念馆
  "tpl-plain": "plain",
  "tpl-paper": "scroll",
  "tpl-nightlight": "nightlantern",
  "tpl-inkwash": "inkmountain",
  "tpl-zhuqi": "vermiliongong",
  "tpl-goldhall": "goldhall",
  "tpl-lotuswake": "lotus",
  "tpl-starry": "starfield",
  "tpl-niche": "niche",
  "tpl-lotuswake3d": "lotus",
  "tpl-starry3d": "starfield",
  "tpl-inkspace": "inkmountain",
  "tpl-zhuqispace": "vermiliongong",
  "tpl-mistveil": "mist",
  "tpl-longnight3d": "nightlantern",
  "tpl-bambooherm": "bamboo",
  "tpl-goldweavespace": "goldhall",
  "tpl-clearfrost": "plain",
  "tpl-paper3d": "scroll",
  "tpl-tangzhi": "plaquehall",
  "tpl-gongdeng": "palacelantern",
  "tpl-qinggong": "altar",
  "tpl-zheping": "screen",
  "tpl-shuhua": "scrolls",
  "tpl-yingbi": "shadowwall",
  // 宗祠
  "clan-tpl-plain": "plain",
  "clan-tpl-vermilion": "vermiliongong",
  "clan-tpl-ancestral": "censer",
  "clan-tpl-dragonmarble": "dragongate",
  "clan-tpl-hallplaque": "plaquehall",
  "clan-tpl-imperial": "goldhall",
  "clan-tpl-ancestorshrine": "tabletwall",
  "clan-tpl-xianghuo": "banner",
  "clan-tpl-gateway": "gate",
  "clan-tpl-courtyard": "courtyard",
  "clan-tpl-thronehall": "thronehall",
  "clan-tpl-ancestral3d": "tabletwall",
  "clan-tpl-earthancient": "earth",
  "clan-tpl-whitewash": "whitehall",
  "clan-tpl-incensehall": "incense",
  "clan-tpl-bannerhall": "banner",
  "clan-tpl-dragonthrone": "dragonhall",
  "clan-tpl-stoneterrace": "stoneterrace",
};

/** 未知 id 时按空间形态兜底，保证任何新模板都不会白屏 */
function fallbackMotif(space?: string): string {
  switch (space) {
    case "niche":
      return "niche";
    case "shrine":
      return "tabletwall";
    case "courtyard":
      return "courtyard";
    case "gate":
      return "gate";
    case "hall":
      return "goldhall";
    case "pond":
      return "lotus";
    case "starfield":
      return "starfield";
    default:
      return "plain";
  }
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export default function DecorCover({ t, className }: { t: DecorCoverInput; className?: string }) {
  const ink = t.preview.color || "#1f2937";
  const accent = t.preview.accent || ink;
  const c: C = { ink, accent };
  const key = MOTIF_OF[t.id] ?? fallbackMotif(t.space);
  const render = MOTIFS[key] ?? MOTIFS.plain;
  const bg = t.preview.background || "#eef2f5";

  return (
    <div
      data-decor-cover={t.id}
      className={`relative aspect-[16/9] w-full overflow-hidden ${className ?? ""}`}
      style={{ background: bg, color: ink }}
      role="img"
      aria-label={`${t.name ?? "主题"} 装修封面`}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {render(c)}
      </svg>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(120% 120% at 50% 28%, transparent 52%, rgba(0,0,0,0.16))" }}
      />
    </div>
  );
}
