import * as React from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * 壁龛纪念墙场景（Niche Wall Scene）
 *
 * 按用户提供的实景参考图重绘：一座**木饰面壁龛纪念墙**的纪念厅。
 *
 * 参考图要素（从实测像素比例还原）：
 *   - 木格壁龛墙：**9 列 × 5 行 = 45 个壁龛格**，每格是内凹的白色面板 +
 *     木框（左下受光、右上阴影），格内右下角一枚小金属铭牌。
 *   - 墙面两侧各一块灰蓝石材屏板（把木饰面包起来，形成"内凹画框"感）。
 *   - 最外侧左右各一幅落地灰蓝窗帘，带束带收腰。
 *   - 墙前一条长木柜（4 个抽屉），柜面略高于壁龛墙下沿。
 *   - 柜面上：左右各一盏金色六角灯柱（玻璃罩内暖光），中央一大束白菊
 *     （放射状花瓣 + 绿叶），花束下系一个很大的白色纱质蝴蝶结。
 *   - 柜外两侧地面上各一盆绿植（陶盆 + 长条叶）。
 *   - 地面：灰白大理石，带斜向纹与竖向倒影。
 *   - 顶部：藏光筒灯洗墙，墙面出现暖色竖向光晕。
 *
 * 为什么用 SVG 重绘而不是拿参考图当底图：
 *   1. 每个纪念馆共用同一张底图时，遗像换了背景不会变，格位也对不上；
 *   2. 参考图格位是固定像素，手机上必然错位；
 *   3. 需要商用授权。
 *   重绘后格位坐标系由代码决定，遗像可用百分比精确嵌入任意格。
 *
 * 关键：`NICHE_GRID` / `nicheCell(idx)` 导出的**百分比几何**既被本 SVG 用于
 * 定位格位，也被页面用于把遗像 <img> 绝对定位到同一个格 ——
 * **一份数据驱动两处**，因此两者永远不会错位。
 */

/** viewBox 基准尺寸。所有内部坐标都以此为单位。 */
export const NICHE_VIEWBOX = { w: 1200, h: 700 } as const;

/**
 * 壁龛墙的几何参数（全部以画布百分比表达，窗口缩放时保持等比）。
 *
 * 数值来自对参考图的像素测量：
 *   墙面 x 约 12%–88%，格区更窄（两侧留出屏板与木边），y 约 10%–62%。
 */
export const NICHE_GRID = {
  cols: 9,
  rows: 5,
  /** 格区的左 / 上起点（%） */
  left: 15.2,
  top: 12.4,
  /** 单个格的宽 / 高（%） */
  cellW: 7.35,
  cellH: 8.9,
  /** 格间距（%） */
  gapX: 0.72,
  gapY: 1.35,
} as const;

/** 一个壁龛格在**整幅场景**中的百分比矩形（用于叠遗像） */
export type NicheCell = {
  /** 0-based 列 / 行 */
  col: number;
  row: number;
  /** 相对整幅场景的百分比（含百分号，可直接进 style） */
  left: string;
  top: string;
  width: string;
  height: string;
};

/**
 * 取第 idx 个壁龛格（按行优先：0..44）。
 * col/row 越界时自动收敛到合法范围，避免脏数据把遗像甩出画面。
 *
 * @param inset 内缩比例（0~0.4）。遗像嵌入时用 0.18 左右，
 *              让木框露出来 —— 读成"放进壁龛里"，而不是"贴了张纸盖住格子"。
 */
export function nicheCell(col: number, row: number, inset = 0): NicheCell {
  const c = Math.max(0, Math.min(NICHE_GRID.cols - 1, Math.floor(col)));
  const r = Math.max(0, Math.min(NICHE_GRID.rows - 1, Math.floor(row)));
  const k = Math.max(0, Math.min(0.4, inset));
  const l = NICHE_GRID.left + c * (NICHE_GRID.cellW + NICHE_GRID.gapX);
  const t = NICHE_GRID.top + r * (NICHE_GRID.cellH + NICHE_GRID.gapY);
  const w = NICHE_GRID.cellW * (1 - k * 2);
  const h = NICHE_GRID.cellH * (1 - k * 2);
  return {
    col: c,
    row: r,
    left: `${l + NICHE_GRID.cellW * k}%`,
    top: `${t + NICHE_GRID.cellH * k}%`,
    width: `${w}%`,
    height: `${h}%`,
  };
}

/**
 * 遗像默认落位：**墙面正中偏上**。
 *
 * 9 列的中列是 index 4（左右各 4 列）；5 行里取第 1 行（index 0），
 * 即"顶行的正中格" —— 视觉上就在木格墙的中上方，且高于花束、不被遮挡。
 */
export const NICHE_PORTRAIT_SLOT = { col: 4, row: 0 } as const;

/**
 * 遗像占用的**格块**尺寸：3 列 × 3 行 = 9 个格子。
 *
 * 为什么是 9 格而不是 1 格：遗像只占一格时在页面上约 56×40px，
 * 根本看不清人脸。放大到 3×3 块后约 237×173px，是能看清明暗五官的尺寸，
 * 同时上下仍留出两行壁龛格做装饰，墙面读起来还是"一面格墙"而不是"贴了张大海报"。
 */
export const NICHE_PORTRAIT_BLOCK = { cols: 3, rows: 3 } as const;

/**
 * 取一个 `bw × bh` 格块的**外接矩形**（含块内间隙，不含块外间隙）。
 *
 * 与 nicheCell 的关系：nicheCell 是"某一格"；本函数是"若干格拼起来的一块区域"。
 * 遗像要占 9 格，就必须用整块的边界，否则会一格一格地画成九宫格。
 *
 * @param inset 内缩比例（0~0.3）—— 让木框/立柱露出来，读成"嵌进格墙里"
 */
export function nicheBlock(
  col: number,
  row: number,
  bw: number,
  bh: number,
  inset = 0,
): NicheCell {
  const c = Math.max(0, Math.min(NICHE_GRID.cols - bw, Math.floor(col)));
  const r = Math.max(0, Math.min(NICHE_GRID.rows - bh, Math.floor(row)));
  const k = Math.max(0, Math.min(0.3, inset));

  const l = NICHE_GRID.left + c * (NICHE_GRID.cellW + NICHE_GRID.gapX);
  const t = NICHE_GRID.top + r * (NICHE_GRID.cellH + NICHE_GRID.gapY);
  // 块宽 = bw 个格 + (bw-1) 个间隙；高度同理
  const w = bw * NICHE_GRID.cellW + (bw - 1) * NICHE_GRID.gapX;
  const h = bh * NICHE_GRID.cellH + (bh - 1) * NICHE_GRID.gapY;

  return {
    col: c,
    row: r,
    left: `${l + w * k}%`,
    top: `${t + h * k}%`,
    width: `${w * (1 - k * 2)}%`,
    height: `${h * (1 - k * 2)}%`,
  };
}

/**
 * 遗像在格墙上的格块落位：3×3 块，**水平居中于 9 列**（块左沿 = (9-3)/2 = 3），
 * 纵向贴顶（row 0）—— 顶行留白最多，且不会被下方的柜面/花束遮挡。
 */
export const NICHE_PORTRAIT_BLOCK_SLOT = { col: 3, row: 0 } as const;

/** 场景配色（取自参考图实测色） */
const C = {
  wood: "#c9b393",
  woodDark: "#a8916f",
  woodDeep: "#8a7355",
  woodLine: "#8f7a5c",
  cellFace: "#e8e2d4",
  cellFaceLo: "#cdc6b6",
  cellInner: "#b9b1a0",
  nicheShadow: "rgba(90,72,48,.38)",
  stone: "#9aa0a4",
  stoneDark: "#7f868b",
  curtain: "#c3c9d1",
  curtainDark: "#9aa3ae",
  marble: "#cfd3d4",
  marbleDark: "#a8aeb0",
  gold: "#c9a961",
  goldHi: "#f0dda6",
  goldLo: "#8a6d2f",
  leaf: "#3f6136",
  leafHi: "#5d8a4c",
  pot: "#b9b7ad",
  bloom: "#f4f2ea",
  bloomLo: "#d9d5c6",
} as const;

/**
 * 格子绘制（纯 SVG）：内凹白面板 + 木框 + 金属铭牌。
 *
 * 工笔感来自三件事：
 *  1. 面板用线性渐变（左上受光 → 右下转灰），表现内凹；
 *  2. 上/左描一道深线（阴影边）、下/右描一道亮线（受光边）—— 在 -45° 光下
 *     才能读成"凹进去的方格"而不是"贴上去的白纸"；
 *  3. 格内右下角一枚小铭牌，呼应参考图。
 */
function Niche({
  x,
  y,
  w,
  h,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  const f = 3.2; // 木框厚度
  const ix = x + f;
  const iy = y + f;
  const iw = w - f * 2;
  const ih = h - f * 2;
  // 内凹立面的斜切深度
  const d = 2.4;

  return (
    <g>
      {/* ---- 木框 ---- */}
      <rect x={x} y={y} width={w} height={h} rx={2} fill={C.woodDark} />
      {/* 框的受光上沿（外缘亮线） */}
      <rect x={x} y={y} width={w} height={1.3} fill="#e0d1b2" opacity={0.75} />
      {/* 框的受光左沿 */}
      <rect x={x} y={y} width={1.3} height={h} fill="#e0d1b2" opacity={0.5} />

      {/* ---- 面板 ---- */}
      <rect x={ix} y={iy} width={iw} height={ih} fill="url(#nw-cell)" />

      {/*
        ---- 内凹立体感 ----
        四个立面：上/左是背光面（深），下/右是受光面（浅）。
        用梯形而不是矩形，才能读成"斜切进去的凹格"。
      */}
      {/* 上立面（深） */}
      <path d={`M ${ix} ${iy} L ${ix + iw} ${iy} L ${ix + iw - d} ${iy + d} L ${ix + d} ${iy + d} Z`} fill={C.nicheShadow} />
      {/* 左立面（次深） */}
      <path d={`M ${ix} ${iy} L ${ix + d} ${iy + d} L ${ix + d} ${iy + ih - d} L ${ix} ${iy + ih} Z`} fill={C.nicheShadow} opacity={0.75} />
      {/* 下立面（受光亮） */}
      <path
        d={`M ${ix} ${iy + ih} L ${ix + iw} ${iy + ih} L ${ix + iw - d} ${iy + ih - d} L ${ix + d} ${iy + ih - d} Z`}
        fill="#ffffff"
        opacity={0.5}
      />
      {/* 右立面（受光次亮） */}
      <path
        d={`M ${ix + iw} ${iy} L ${ix + iw - d} ${iy + d} L ${ix + iw - d} ${iy + ih - d} L ${ix + iw} ${iy + ih} Z`}
        fill="#ffffff"
        opacity={0.28}
      />
      {/* 面板中心微高光（内凹最深处被照亮） */}
      <ellipse cx={ix + iw / 2} cy={iy + ih * 0.58} rx={iw * 0.3} ry={ih * 0.26} fill="#ffffff" opacity={0.28} />

      {/* ---- 右下角金属铭牌 ---- */}
      <rect x={ix + iw - 9.5} y={iy + ih - 4.6} width={7.4} height={2.4} rx={0.6} fill="#b0b4b8" />
      <rect x={ix + iw - 9.5} y={iy + ih - 4.6} width={7.4} height={0.8} fill="#d7dade" />
    </g>
  );
}

/** 一盏金色六角灯柱（含玻璃罩与暖光） */
function Lantern({ x, y, h }: { x: number; y: number; h: number }) {
  const w = 34;
  const bodyH = h * 0.56;
  const bodyY = y - bodyH;
  return (
    <g>
      {/* 地面光晕 */}
      <ellipse cx={x} cy={y + 5} rx={w * 1.7} ry={9} fill="url(#nw-glow)" />
      {/* 底座（两层，厚实） */}
      <rect x={x - w / 2 - 5} y={y - 8} width={w + 10} height={8} rx={2} fill={C.goldLo} />
      <rect x={x - w / 2 - 5} y={y - 8} width={w + 10} height={2.2} fill={C.goldHi} opacity={0.85} />
      <rect x={x - w / 2 - 1} y={y - 15} width={w + 2} height={8} rx={1.4} fill={C.gold} />
      {/* 柱脚（收腰） */}
      <path d={`M ${x - 9} ${y - 15} L ${x + 9} ${y - 15} L ${x + 6} ${bodyY + bodyH} L ${x - 6} ${bodyY + bodyH} Z`} fill={C.goldLo} />

      {/* 玻璃罩 */}
      <rect x={x - w / 2} y={bodyY} width={w} height={bodyH} rx={2} fill="url(#nw-lampglass)" stroke={C.gold} strokeWidth={2} />
      {/* 罩内灯芯（比罩窄，透出暖光） */}
      <ellipse cx={x} cy={bodyY + bodyH * 0.58} rx={w * 0.26} ry={bodyH * 0.32} fill="#fff4d4" />
      {/* 六角棱线 */}
      {[-1, 1].map((s) => (
        <line
          key={s}
          x1={x + s * w * 0.27}
          y1={bodyY + 1.5}
          x2={x + s * w * 0.27}
          y2={bodyY + bodyH - 1.5}
          stroke={C.gold}
          strokeWidth={0.8}
          opacity={0.55}
        />
      ))}
      {/* 罩顶（四坡） */}
      <path d={`M ${x - w / 2 - 3} ${bodyY} L ${x} ${bodyY - 11} L ${x + w / 2 + 3} ${bodyY} Z`} fill={C.gold} stroke={C.goldLo} strokeWidth={1} />
      <path d={`M ${x - w / 2 - 3} ${bodyY} L ${x} ${bodyY - 11} L ${x + w / 2 + 3} ${bodyY} L ${x + w / 2 + 3} ${bodyY + 1.4} L ${x - w / 2 - 3} ${bodyY + 1.4} Z`} fill={C.goldHi} opacity={0.5} />
      {/* 提环 */}
      <circle cx={x} cy={bodyY - 15} r={3.6} fill="none" stroke={C.gold} strokeWidth={1.7} />
    </g>
  );
}

/**
 * 白菊花束（中央摆放）。
 *
 * 一朵菊 = 中心圆 + 一圈放射花瓣。花瓣用 <ellipse> 绕中心旋转，
 * 比画 path 省得多，且在缩略尺寸下仍然读得成"菊花"。
 */
function Chrysanthemum({
  cx,
  cy,
  r,
  petals = 10,
  fill = C.bloom,
}: {
  cx: number;
  cy: number;
  r: number;
  petals?: number;
  fill?: string;
}) {
  const items: ReactNode[] = [];
  for (let i = 0; i < petals; i++) {
    const a = (360 / petals) * i;
    items.push(
      <ellipse
        key={i}
        cx={cx}
        cy={cy - r * 0.52}
        rx={r * 0.17}
        ry={r * 0.55}
        fill={fill}
        stroke={C.bloomLo}
        strokeWidth={0.3}
        transform={`rotate(${a} ${cx} ${cy})`}
      />,
    );
  }
  return (
    <g>
      {items}
      <circle cx={cx} cy={cy} r={r * 0.24} fill="#e9dfa8" />
      <circle cx={cx} cy={cy} r={r * 0.24} fill="none" stroke={C.bloomLo} strokeWidth={0.3} />
    </g>
  );
}

/** 一束白菊（含绿叶、露出的长枝、纱质蝴蝶结） */
function Bouquet({ cx, baseY }: { cx: number; baseY: number }) {
  /*
    花头编排：整体是"中间高、两侧低"的穹顶形（参考图的姿态）。
    纵向压得比横向紧一些，读起来才是一束"立着的花"而不是一朵扁平的花。
  */
  const blooms: [number, number, number][] = [
    // 顶层
    [-52, -96, 15], [-18, -108, 16], [18, -106, 16], [52, -94, 15],
    // 中层
    [-84, -74, 17], [-52, -68, 19], [-18, -78, 20], [18, -76, 20], [52, -66, 19], [84, -72, 17],
    // 下层
    [-100, -44, 18], [-68, -38, 20], [-34, -44, 21], [0, -40, 21], [34, -42, 21], [68, -36, 20], [100, -42, 18],
    // 底缘
    [-84, -14, 18], [-50, -8, 19], [-16, -12, 19], [16, -10, 19], [50, -6, 19], [84, -12, 18],
  ];

  return (
    <g>
      {/* 露出的花枝（白色小花苞）*/}
      {[
        [-58, -140], [-24, -156], [22, -154], [56, -138],
      ].map(([dx, dy], i) => (
        <g key={i}>
          <line x1={cx + dx * 0.35} y1={baseY - 60} x2={cx + dx} y2={baseY + dy} stroke={C.leaf} strokeWidth={1.1} opacity={0.65} />
          {[0, 1, 2, 3].map((k) => (
            <circle key={k} cx={cx + dx + (k % 2 ? 3 : -3)} cy={baseY + dy + k * 6} r={2.3} fill="#f7f5ee" opacity={0.94} />
          ))}
        </g>
      ))}

      {/* 绿叶衬底（在花头之后画） */}
      {[
        [-118, -30, -24], [-108, -66, -38], [-96, -4, -12],
        [118, -28, 24], [108, -64, 38], [96, -2, 12],
        [-70, -104, -46], [70, -102, 46],
      ].map(([dx, dy, rot], i) => (
        <ellipse
          key={i}
          cx={cx + dx}
          cy={baseY + dy}
          rx={24}
          ry={7.5}
          fill={i % 2 ? C.leaf : C.leafHi}
          opacity={0.92}
          transform={`rotate(${rot} ${cx + dx} ${baseY + dy})`}
        />
      ))}

      {/* 花头 */}
      {blooms.map(([dx, dy, r], i) => (
        <Chrysanthemum key={i} cx={cx + dx} cy={baseY + dy} r={r} petals={i % 3 === 0 ? 12 : 10} />
      ))}

      {/* 花茎捆扎 */}
      <ellipse cx={cx} cy={baseY + 22} rx={17} ry={6} fill={C.leaf} opacity={0.8} />

      {/* ---- 纱质蝴蝶结（参考图的花束下系了一个很大的白纱结） ---- */}
      <g opacity={0.96}>
        {/* 两条下垂飘带 */}
        <path d={`M ${cx - 10} ${baseY + 26} C ${cx - 30} ${baseY + 70}, ${cx - 34} ${baseY + 118}, ${cx - 20} ${baseY + 150} L ${cx - 4} ${baseY + 146} C ${cx - 16} ${baseY + 112}, ${cx - 12} ${baseY + 72}, ${cx + 4} ${baseY + 30} Z`} fill="#fbfaf6" opacity={0.9} />
        <path d={`M ${cx + 10} ${baseY + 26} C ${cx + 32} ${baseY + 72}, ${cx + 36} ${baseY + 122}, ${cx + 22} ${baseY + 152} L ${cx + 6} ${baseY + 148} C ${cx + 18} ${baseY + 114}, ${cx + 14} ${baseY + 74}, ${cx - 2} ${baseY + 30} Z`} fill="#fbfaf6" opacity={0.9} />
        {/* 左右两个环 */}
        <ellipse cx={cx - 34} cy={baseY + 34} rx={30} ry={19} fill="#ffffff" opacity={0.92} transform={`rotate(-18 ${cx - 34} ${baseY + 34})`} />
        <ellipse cx={cx + 34} cy={baseY + 34} rx={30} ry={19} fill="#ffffff" opacity={0.92} transform={`rotate(18 ${cx + 34} ${baseY + 34})`} />
        {/* 环内折痕 */}
        <ellipse cx={cx - 34} cy={baseY + 34} rx={16} ry={9} fill="none" stroke="#e4e1d6" strokeWidth={1} transform={`rotate(-18 ${cx - 34} ${baseY + 34})`} />
        <ellipse cx={cx + 34} cy={baseY + 34} rx={16} ry={9} fill="none" stroke="#e4e1d6" strokeWidth={1} transform={`rotate(18 ${cx + 34} ${baseY + 34})`} />
        {/* 结心 */}
        <ellipse cx={cx} cy={baseY + 30} rx={14} ry={12} fill="#ffffff" stroke="#e4e1d6" strokeWidth={0.9} />
      </g>
    </g>
  );
}

/** 一盆绿植（陶盆 + 长条叶），摆在地面上 */
function PottedPlant({ x, baseY, scale = 1 }: { x: number; baseY: number; scale?: number }) {
  const s = scale;
  const leaves: [number, number, number][] = [
    [-58, -66, -62], [-44, -102, -42], [-26, -128, -24], [-6, -136, -8],
    [12, -132, 10], [30, -112, 26], [46, -84, 42], [58, -56, 60],
    [-36, -78, -50], [38, -70, 50], [-16, -110, -16], [22, -104, 20],
  ];
  return (
    <g transform={`translate(${x} ${baseY}) scale(${s}) translate(${-x} ${-baseY})`}>
      {/* 盆影 */}
      <ellipse cx={x} cy={baseY + 4} rx={48} ry={10} fill="rgba(0,0,0,.18)" />
      {/* 盆 */}
      <path
        d={`M ${x - 38} ${baseY - 56} L ${x + 38} ${baseY - 56} L ${x + 28} ${baseY - 2} Q ${x} ${baseY + 5} ${x - 28} ${baseY - 2} Z`}
        fill="url(#nw-pot)"
        stroke="#9d9b92"
        strokeWidth={1.1}
      />
      <ellipse cx={x} cy={baseY - 56} rx={38} ry={9} fill={C.pot} stroke="#9d9b92" strokeWidth={1.1} />
      <ellipse cx={x} cy={baseY - 56} rx={31} ry={6.4} fill="#6b5a44" opacity={0.5} />
      {/* 叶 */}
      {leaves.map(([dx, dy, rot], i) => (
        <g key={i}>
          <ellipse
            cx={x + dx}
            cy={baseY + dy}
            rx={17}
            ry={5.8}
            fill={i % 2 ? C.leaf : C.leafHi}
            opacity={0.95}
            transform={`rotate(${rot} ${x + dx} ${baseY + dy})`}
          />
          {/* 叶脉 */}
          <line
            x1={x + dx * 0.55}
            y1={baseY + dy * 0.55}
            x2={x + dx * 1.35}
            y2={baseY + dy * 1.35}
            stroke="#93c47a"
            strokeWidth={0.8}
            opacity={0.55}
            transform={`rotate(${rot} ${x + dx} ${baseY + dy})`}
          />
        </g>
      ))}
    </g>
  );
}

/** 一幅落地窗帘（含褶皱竖纹与束带） */
function Curtain({ side }: { side: "left" | "right" }) {
  const W = NICHE_VIEWBOX.w;
  const CW = 74; // 帘宽：不能太宽，否则把两侧屏板和绿植压掉
  const x0 = side === "left" ? -4 : W - CW + 4;
  const folds = 6;
  return (
    <g>
      {/* 帘布主体 */}
      <rect x={x0} y={-4} width={CW} height={720} fill="url(#nw-curtain)" />
      {/* 竖向褶皱 */}
      {Array.from({ length: folds }).map((_, i) => {
        const x = x0 + 5 + i * (CW / folds);
        return (
          <rect
            key={i}
            x={x}
            y={-4}
            width={4.5}
            height={720}
            fill={i % 2 ? "#ffffff" : C.curtainDark}
            opacity={i % 2 ? 0.18 : 0.32}
          />
        );
      })}
      {/* 内缘阴影（帘布离墙，投影到墙上） */}
      <rect
        x={side === "left" ? x0 + CW - 4 : x0 - 10}
        y={-4}
        width={14}
        height={720}
        fill="rgba(40,48,58,.2)"
      />
      {/* 束带（收腰） */}
      <g>
        <rect
          x={side === "left" ? x0 + 2 : x0 + CW - 14}
          y={298}
          width={12}
          height={46}
          rx={3}
          fill={C.curtainDark}
          opacity={0.72}
        />
        <rect
          x={side === "left" ? x0 + 2 : x0 + CW - 14}
          y={298}
          width={12}
          height={6}
          rx={3}
          fill="#ffffff"
          opacity={0.32}
        />
      </g>
    </g>
  );
}

/**
 * 壁龛纪念墙场景。
 *
 * @param portrait  逝者遗像 URL。**本组件不负责放遗像** —— 遗像由页面用
 *                  `nicheCell()` 的百分比叠在场景之上（见文件头说明）。
 * @param className 外层 class
 * @param style     外层 inline style。传入 `{height:"100%"}` 时 SVG 会
 *                  按容器高度等比内缩（两侧留白），不传则按宽度自然撑开。
 */
/** 供台上的一件供品（由调用方从 OfferingOnAltar 查出后传入） */
export type AltarGlyph = { id: string; slug: string; glyph: string };

export default function NicheWallScene({
  className = "",
  style,
  altarItems,
  portrait,
}: {
  portrait?: string;
  className?: string;
  style?: CSSProperties;
  /**
   * 供台陈列：摆在本场景柜面上的供品。
   * 不传（undefined/空数组）时**完全不渲染新增节点** ——
   * 这是为了不干扰壁龛墙既有的结构断言（45 个格、遗像唯一等）。
   */
  altarItems?: AltarGlyph[];
}) {
  const W = NICHE_VIEWBOX.w;
  const H = NICHE_VIEWBOX.h;

  /*
    是否真有遗像要安奉。整块 3×3 大龛（背板 + 描金框 + 云头）与"让出的 9 格"
    必须**同进同退**：有遗像才有龛，无遗像时格子照满 45 个。
    （曾经只让位不判断，导致空馆凭空少一块格子 —— verify-hall-niche-noportrait 锁这条。）
  */
  const hasPortrait = !!portrait;

  // ---- 墙面与格位（把百分比几何换算到 viewBox 坐标） ----
  const gridX0 = (NICHE_GRID.left / 100) * W;
  const gridY0 = (NICHE_GRID.top / 100) * H;
  const cw = (NICHE_GRID.cellW / 100) * W;
  const ch = (NICHE_GRID.cellH / 100) * H;
  const gx = (NICHE_GRID.gapX / 100) * W;
  const gy = (NICHE_GRID.gapY / 100) * H;

  const gridW = NICHE_GRID.cols * cw + (NICHE_GRID.cols - 1) * gx;
  const gridH = NICHE_GRID.rows * ch + (NICHE_GRID.rows - 1) * gy;

  // 木饰面底板（比格区每边外扩一点，形成木边）
  const panelX = gridX0 - 26;
  const panelY = gridY0 - 22;
  const panelW = gridW + 52;
  const panelH = gridH + 44;

  // 柜体
  const cabTop = panelY + panelH + 4;
  const cabH = 104;
  const cabX = panelX - 26;
  const cabW = panelW + 52;
  const floorY = cabTop + cabH;

  const cells: ReactNode[] = [];
  for (let r = 0; r < NICHE_GRID.rows; r++) {
    for (let c = 0; c < NICHE_GRID.cols; c++) {
      /*
        只有"确实有遗像"时才让位。
        遗像要占的那块 3×3 区域**不画内凹格** ——
        否则遗像 PNG 是叠在 9 个凹格上的，边缘会露出格子的暗边，
        看起来像"照片压在九宫格上"而不是"嵌进一个龛里"。
        改由下面那块整片背板 + 描金外框来承载。
        无遗像时（hallPortrait=false）该区域必须照常画满 9 格，
        否则空馆会凭空少一块格子（verify-hall-niche-noportrait 锁这条）。
      */
      const inPortraitBlock =
        hasPortrait &&
        r >= NICHE_PORTRAIT_BLOCK_SLOT.row &&
        r < NICHE_PORTRAIT_BLOCK_SLOT.row + NICHE_PORTRAIT_BLOCK.rows &&
        c >= NICHE_PORTRAIT_BLOCK_SLOT.col &&
        c < NICHE_PORTRAIT_BLOCK_SLOT.col + NICHE_PORTRAIT_BLOCK.cols;
      if (inPortraitBlock) continue;

      cells.push(
        <Niche
          key={`${r}-${c}`}
          x={gridX0 + c * (cw + gx)}
          y={gridY0 + r * (ch + gy)}
          w={cw}
          h={ch}
        />,
      );
    }
  }

  /*
    遗像龛：一整块 3×3 的凹龛背板 + 描金外框 + 云头。
    背板画得比 9 个格子稍大一圈，让遗像"嵌进墙里"而不是"糊在格子上"。
  */
  const pbX = gridX0 + NICHE_PORTRAIT_BLOCK_SLOT.col * (cw + gx) - 7;
  const pbY = gridY0 + NICHE_PORTRAIT_BLOCK_SLOT.row * (ch + gy) - 7;
  const pbW =
    NICHE_PORTRAIT_BLOCK.cols * cw + (NICHE_PORTRAIT_BLOCK.cols - 1) * gx + 14;
  const pbH =
    NICHE_PORTRAIT_BLOCK.rows * ch + (NICHE_PORTRAIT_BLOCK.rows - 1) * gy + 14;

  return (
    <div className={`overflow-hidden ${className}`} style={{ position: "relative", width: "100%", ...style }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        /* meet 而非 none：none 会把窗帘/花束压扁变形 */
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full"
        role="img"
        aria-label="壁龛纪念墙"
      >
        <defs>
          {/* 木饰面：上浅下深，横向木纹 */}
          <linearGradient id="nw-wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.wood} />
            <stop offset="45%" stopColor={C.woodDark} />
            <stop offset="100%" stopColor={C.woodDeep} />
          </linearGradient>
          {/*
            壁龛面板：**左上暗 → 右下亮**（内凹的关键）。
            光从上方筒灯打下来，面板是往里凹的，因此上沿被框体挡住形成阴影、
            下沿受光更亮。若反过来（上亮下暗）会读成"凸出来的白纸"。
          */}
          <linearGradient id="nw-cell" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor={C.cellFaceLo} />
            <stop offset="45%" stopColor={C.cellFace} />
            <stop offset="100%" stopColor="#f6f2e8" />
          </linearGradient>
          {/* 描金（遗像龛外框 / 云头） */}
          <linearGradient id="nw-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8cf8a" />
            <stop offset="50%" stopColor="#c9a44c" />
            <stop offset="100%" stopColor="#8a6a1e" />
          </linearGradient>
          {/* 灯罩玻璃 */}
          <linearGradient id="nw-lampglass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff6dc" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#ffe9b0" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#e8c877" stopOpacity="0.9" />
          </linearGradient>
          {/* 帘布 */}
          <linearGradient id="nw-curtain" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={C.curtainDark} />
            <stop offset="50%" stopColor={C.curtain} />
            <stop offset="100%" stopColor={C.curtainDark} />
          </linearGradient>
          {/* 陶盆 */}
          <linearGradient id="nw-pot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d5d3c9" />
            <stop offset="100%" stopColor="#a9a79d" />
          </linearGradient>
          {/* 大理石地面 */}
          <linearGradient id="nw-marble" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.marbleDark} />
            <stop offset="35%" stopColor={C.marble} />
            <stop offset="100%" stopColor="#dfe2e3" />
          </linearGradient>
          {/* 灯柱地面光晕 */}
          <radialGradient id="nw-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#ffe6a8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffe6a8" stopOpacity="0" />
          </radialGradient>
          {/* 筒灯洗墙：顶部暖光 */}
          <linearGradient id="nw-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff2cf" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#fff2cf" stopOpacity="0" />
          </linearGradient>
          {/* 地面倒影渐隐 */}
          <linearGradient id="nw-reflect" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ---------- 背景层：后墙 + 两侧灰蓝石材屏板 ---------- */}
        <rect x="0" y="0" width={W} height={H} fill="#8f9298" />
        {/* 石材屏板（把木饰面包起来） */}
        <rect x="96" y="18" width={panelX - 84} height={floorY - 18} fill="url(#nw-marble)" />
        <rect x={panelX + panelW - 12} y="18" width={W - 96 - (panelX + panelW - 12)} height={floorY - 18} fill="url(#nw-marble)" />
        {/* 屏板竖向分缝 */}
        {[0.34, 0.7].map((t, i) => (
          <rect
            key={i}
            x={96 + (panelX - 84) * t}
            y="18"
            width={2}
            height={floorY - 18}
            fill="rgba(60,68,74,.22)"
          />
        ))}

        {/* ---------- 木饰面底板 ---------- */}
        <rect x={panelX} y={panelY} width={panelW} height={panelH} fill="url(#nw-wood)" />
        {/* 木纹横线 */}
        {Array.from({ length: 22 }).map((_, i) => (
          <rect
            key={i}
            x={panelX}
            y={panelY + 6 + i * (panelH / 22)}
            width={panelW}
            height={0.8}
            fill="#8a7355"
            opacity={0.16 + (i % 3) * 0.05}
          />
        ))}
        {/* 底板内阴影（四周压暗，强调"嵌进墙里"） */}
        <rect x={panelX} y={panelY} width={panelW} height={12} fill="rgba(70,54,34,.3)" />
        <rect x={panelX} y={panelY} width={12} height={panelH} fill="rgba(70,54,34,.22)" />
        <rect x={panelX + panelW - 12} y={panelY} width={12} height={panelH} fill="rgba(70,54,34,.22)" />

        {/* ---------- 壁龛格（遗像那块 3×3 已挖空） ---------- */}
        {cells}

        {/* ---------- 遗像龛：3×3 的凹龛背板 + 描金外框（无遗像时不画，格子照满） ---------- */}
        {hasPortrait && (
        <g>
          {/* 凹龛背板（比格区大一圈，遮住被挖空的边缘） */}
          <rect x={pbX} y={pbY} width={pbW} height={pbH} rx="3" fill="url(#nw-cell)" />
          {/* 内阴影：上/左更重，读成"往里凹" */}
          <rect x={pbX} y={pbY} width={pbW} height="7" fill="rgba(70,54,34,.42)" />
          <rect x={pbX} y={pbY} width="7" height={pbH} fill="rgba(70,54,34,.32)" />
          <rect x={pbX + pbW - 7} y={pbY} width="7" height={pbH} fill="rgba(70,54,34,.22)" />
          {/* 描金外框 */}
          <rect
            x={pbX}
            y={pbY}
            width={pbW}
            height={pbH}
            rx="3"
            fill="none"
            stroke="url(#nw-gold)"
            strokeWidth="3.4"
          />
          {/* 龛顶云头 */}
          <path
            d={`M${pbX - 6} ${pbY + 1} Q${pbX + pbW / 2} ${pbY - 20} ${pbX + pbW + 6} ${pbY + 1} Z`}
            fill="url(#nw-gold)"
            stroke="#8a6a1e"
            strokeWidth="1.2"
          />
        </g>
        )}

        {/* 顶部筒灯洗墙光 */}
        <rect x={panelX} y="0" width={panelW} height={panelY + 40} fill="url(#nw-wash)" />
        {/* 筒灯本体 */}
        {Array.from({ length: 4 }).map((_, i) => (
          <ellipse
            key={i}
            cx={panelX + 40 + i * ((panelW - 80) / 3)}
            cy="9"
            rx="9"
            ry="3.6"
            fill="#fff6da"
            opacity="0.95"
          />
        ))}

        {/* ---------- 长条木柜（墙前） ---------- */}
        <rect x={cabX} y={cabTop} width={cabW} height={cabH} fill="url(#nw-wood)" />
        {/* 台面（略亮、向左右各挑出一线） */}
        <rect x={cabX - 6} y={cabTop - 7} width={cabW + 12} height={10} fill={C.wood} stroke={C.woodLine} strokeWidth={0.8} />
        <rect x={cabX - 6} y={cabTop - 7} width={cabW + 12} height={2.6} fill="#e6d8bb" opacity={0.9} />
        {/* 4 个抽屉：内缩 18px 边距后等分，绝不超出柜体 */}
        {Array.from({ length: 4 }).map((_, i) => {
          const innerX = cabX + 18;
          const innerW = cabW - 36;
          const dW = innerW / 4;
          const dx = innerX + i * dW;
          const faceW = dW - 10;
          return (
            <g key={i}>
              <rect x={dx + 5} y={cabTop + 14} width={faceW} height={cabH - 36} rx={1.6} fill={C.woodDark} stroke={C.woodLine} strokeWidth={0.9} />
              {/* 面板上沿受光 */}
              <rect x={dx + 5} y={cabTop + 14} width={faceW} height={2.2} fill="#dccdae" opacity={0.75} />
              {/* 面板下沿阴影 */}
              <rect x={dx + 5} y={cabTop + cabH - 24} width={faceW} height={2} fill="rgba(70,54,34,.35)" />
            </g>
          );
        })}
        {/* 柜体底部阴影（贴地） */}
        <rect x={cabX} y={floorY - 5} width={cabW} height={7} fill="rgba(40,34,24,.32)" />

        {/* ---------- 地面 ---------- */}
        <rect x="0" y={floorY} width={W} height={H - floorY} fill="url(#nw-marble)" />
        {/* 斜向石纹 */}
        {Array.from({ length: 16 }).map((_, i) => (
          <path
            key={i}
            d={`M ${-60 + i * 92} ${H} L ${60 + i * 92} ${floorY}`}
            stroke="#b6bcbe"
            strokeWidth={1}
            opacity={0.28}
          />
        ))}
        {/* 柜体在石面上的倒影 */}
        <rect x={cabX} y={floorY} width={cabW} height={46} fill="url(#nw-reflect)" />
        <rect x={cabX} y={floorY} width={cabW} height={5} fill="rgba(30,26,20,.28)" />

        {/* ---------- 绿植（墙面两侧、柜体之外，站地面） ---------- */}
        {/* 位置要落在屏板内（不被窗帘压住、也不越出画框） */}
        <PottedPlant x={78} baseY={H - 16} scale={0.78} />
        <PottedPlant x={W - 78} baseY={H - 16} scale={0.78} />

        {/* ---------- 柜面陈列：灯柱 + 白菊花束 ---------- */}
        {/*
          花束的高度必须收住：它站在柜面上，只够到壁龛墙的**最下面一排**。
          参考图里花顶大约在墙面底行中部，绝不上半墙 —— 否则会挡住大量壁龛格。
          这里把整束按 0.72 缩放，底部对齐柜面。
        */}
        <g transform={`translate(${W / 2} ${cabTop + 2}) scale(0.72) translate(${-W / 2} ${-(cabTop + 2)})`}>
          <Bouquet cx={W / 2} baseY={cabTop + 2} />
        </g>
        <Lantern x={cabX + cabW * 0.17} y={cabTop - 7} h={118} />
        <Lantern x={cabX + cabW * 0.83} y={cabTop - 7} h={118} />

        {/* 花束后方墙面投影（增加层次） */}
        <ellipse cx={W / 2} cy={cabTop - 8} rx={150} ry={34} fill="rgba(40,30,18,.1)" />

        {/* ---------- 供台陈列：正在供奉的祭品（数据驱动） ---------- */}
        {/*
          只摆在**柜面上**（cabTop 处），远低于壁龛格区，因此绝不会遮挡任何壁龛格、
          更不会压到遗像（遗像在顶行正中格）。
          中央已被真实花束占据（W/2 ± 约 140），故供品分左右两组沿柜面铺开、避开中央。
        */}
        {altarItems && altarItems.length > 0 && (
          <g>
            {(() => {
              const zoneL0 = cabX + 60;
              const zoneL1 = W / 2 - 150;
              const zoneR0 = W / 2 + 150;
              const zoneR1 = cabX + cabW - 60;
              const left = altarItems.filter((_, i) => i % 2 === 0);
              const right = altarItems.filter((_, i) => i % 2 === 1);
              const place = (arr: AltarGlyph[], z0: number, z1: number) =>
                arr.map((it, i) => {
                  const t = (i + 0.5) / arr.length;
                  const span = Math.max(0, z1 - z0);
                  return (
                    <text
                      key={it.id}
                      x={z0 + t * span}
                      y={cabTop - 10}
                      fontSize="32"
                      textAnchor="middle"
                      data-altar-slug={it.slug}
                    >
                      {it.glyph}
                    </text>
                  );
                });
              return (
                <>
                  {place(left, zoneL0, zoneL1)}
                  {place(right, zoneR0, zoneR1)}
                </>
              );
            })()}
          </g>
        )}

        {/* ---------- 窗帘（最外层，压住屏板） ---------- */}
        <Curtain side="left" />
        <Curtain side="right" />
      </svg>
    </div>
  );
}
