/**
 * 程序化 3D 空间：装修模板的「空间形态」定义
 *
 * ## v2（2026-10）新增的一层：结构 / 光影 / 材质
 *
 * v1 的空间描述只有「几面墙 + 天花板类型 + 一个色罩」，于是 8 种 SpaceKind 里
 * 有 7 种只是 `classicSpace()` 换几个数字 —— 用户买了付费模板，看到的仍是
 * 「一间贴了不同壁纸的方盒子」。装修前后的落差只存在于颜色，不存在于**结构**。
 *
 * v2 把空间描述扩成四层，全部是**纯几何/光/材质参数**（依然零外部资源）：
 *   ① 几何：`columns` / `beams` / `dougong` / `podium` / `ceiling` / `dividers`
 *   ② 档位：`structureTier` 决定上面这些构件「画不画、画多细」
 *   ③ 光影：`light`（方向光 / 光柱 / 雾 / AO / 高光）
 *   ④ 材质：`material`（柱/枋/石/金/地的三点色 + 木纹/织锦纹理）
 *
 * ⚠️ 兼容性原则：**旧字段一个都不删**。`ceiling` 的旧形态（`beam`/`vault`/`open`）
 *    仍是合法值，`ambient` 也保留（标注 `@deprecated`，由渲染层映射到 `light.tint`）。
 *    原因是既有断言与调用方都在读它们，删字段等于让 23 套验收脚本一起变红。
 *
 * 为什么不用 three.js / react-three-fiber（方案 A 的决策记录）：
 *   1. 我们跑在 localhost.run 免费隧道上，本就要忍受边缘节点 30–50% 的抖动。
 *      再压一个 ~600KB 的 WebGL 运行时，首屏 3–8 秒，手机端大概率崩。
 *   2. 现有装修体系有一条明确的设计原则（见 lib/hall-decor.ts 文件头）：
 *      **零外部资源**，纯 CSS/内联样式 —— 就是为了隧道环境下也能稳定渲染。
 *   3. 现有的壁龛纪念墙（NicheWallScene.tsx，888 行）与宗祠四段分镜
 *      （ClanHallScene.tsx，942 行）本来就是手绘 SVG 的"伪 3D"：
 *      透视、内凹、受光面全是算出来的，不靠任何贴图。
 *   因此这里走**程序化 3D**：CSS `perspective` + `rotateY` + `translateZ`
 *   做出真实的景深与环视，几何全部由代码推导，一个字节的外部图片都不需要。
 *
 * 与 lib/hall-decor.ts 的分工：
 *   - hall-decor.ts   管「装修内容」：用哪块壁纸、哪种挂饰（数据层，进数据库）
 *   - decor-3d.ts     管「空间形态」：这套模板下，空间长成什么样（表现层，不进数据库）
 *   两者通过模板的 `space` 字段关联（见 DecorTemplate.space）。
 *   这样拆的好处：以后要换成 WebGL，只需要重写本文件 + 渲染组件，
 *   装修数据与解锁权益一行都不用动。
 */

/** 空间形态标识。模板用它声明"应用我之后，装修向导里的 3D 预览是什么样子"。 */
export type SpaceKind =
  | "classic" // 常规厅堂：正面墙 + 两侧墙（默认）
  | "niche" // 壁龛纪念墙：整面木格壁龛 + 长柜
  | "shrine" // 祠堂寝堂：牌位墙 + 香案
  | "courtyard" // 庭院天井：立柱 + 长幡 + 青石地
  | "gate" // 山门：屋脊 + 门楼
  | "hall" // 享堂：斗拱 + 匾额
  | "pond" // 莲池：水面 + 莲台
  | "starfield"; // 星河：深空 + 星点

/**
 * 一面墙的几何参数。
 *
 * 坐标系统一为「空间单位」：整个空间宽 100 单位（不是像素），
 * 渲染时按容器宽度等比换算 —— 这样任何视口下比例都一致，不会变形。
 */
export type WallSpec = {
  /** 相对空间中心的横向偏移（单位），0 = 正对观者 */
  offset: number;
  /** 绕 Y 轴旋转角度（度）。负值向左转，正值向右转 */
  rotateY: number;
  /** 沿 Z 轴推进（单位）。负值推向远处 */
  translateZ: number;
  /** 宽度（单位） */
  width: number;
  /** 高度（单位） */
  height: number;
  /** 底边离地高度（单位） */
  bottom: number;
  /** 壁纸图层（装修数据的 slot 值），见 HallDecor.slots.wall */
  wallSlot: "wall";
  /** 是否有地面倒影 */
  reflect?: boolean;
};

// ---------------------------------------------------------------------------
// v2：结构构件
// ---------------------------------------------------------------------------

/**
 * 结构档位。
 *
 * 这是「装修前后肉眼可辨」的**唯一开关**：它不描述具体几何，只描述
 * 「这套空间配得上多少构件、画到多细」。具体见 `STRUCTURE_TIERS`。
 *
 * 与 `DecorTier`（free/points/buyout/premium，管**付费方式**）是两个维度：
 * 一套 ¥5 的入门模板可以 `basic`，一套随时可用（premium 订阅）的模板
 * 也可以是 `imperial`。渲染层只认 `structureTier`，绝不认 `DecorTier` ——
 * 否则「订阅期内看到的结构」与「买断后的结构」会不一致。
 */
export type StructureTier = "none" | "basic" | "grand" | "imperial";

/** 一根立柱 */
export type ColumnSpec = {
  id: string;
  /** 相对空间中心的横向偏移（单位） */
  x: number;
  /** 柱顶高度（单位，从地面算起） */
  top: number;
  /** 柱径（单位） */
  diameter: number;
  /** 是否画柱础（鼓形/覆盆） */
  plinth: boolean;
  /** 是否画雀替（柱与枋之间的角撑）—— `detail >= 1` 才真正绘制 */
  sparrowBrace: boolean;
};

/** 一道梁枋 */
export type BeamSpec = {
  /** 额枋（柱间横木） / 脊檩（屋脊下） / 檩条（椽下横木） */
  kind: "architrave" | "ridge" | "purlin";
  fromX: number;
  toX: number;
  /** 下沿高度（单位） */
  bottom: number;
  /** 断面高度（单位） */
  depth: number;
  /** 是否叠旋子彩画（`detail >= 1` 才真正绘制） */
  painted: boolean;
};

/** 一朵斗拱 */
export type DougongSpec = {
  x: number;
  bottom: number;
  /** 出跳层数（3~5） */
  tiers: number;
};

/** 台基 */
export type PodiumSpec = {
  /** terrace = 普通台基；sumeru = 须弥座（中部内收「束腰」） */
  kind: "terrace" | "sumeru";
  /** 踏步级数（1~3） */
  steps: number;
  /** 是否画望柱栏板 */
  railing: boolean;
};

/**
 * 天花。v1 的 `beam`/`vault`/`open` 仍在联合里（兼容，见下），
 * 这里只说明 v2 新增的四种：
 *   - `rafters` 椽条（等价旧 `beam`，但可指定根数）
 *   - `coffer`  藻井（同心方井逐层内收 + 中心藻井灯）
 *   - `scroll`  卷棚（弧形顶）
 *   - `caisson` 平棋（方格天花）
 */
export type CofferedCeiling =
  | { type: "none" }
  | { type: "rafters"; count: number; color: string }
  | { type: "coffer"; rings: number; color: string }
  | { type: "scroll"; color: string }
  | { type: "caisson"; color: string }
  /* ---- v1 三态：`Space3D["ceiling"]` 的联合仍收它们，删了会静默回归 ---- */
  | { type: "beam"; count: number; color: string }
  | { type: "vault"; color: string }
  | { type: "open"; color: string };

/** 分隔构件：挂落 / 屏门 / 栏杆 */
export type DividerSpec =
  | { kind: "hangfall"; x: number; bottom: number; width: number }
  | { kind: "screen"; x: number; width: number; height: number }
  | { kind: "railing"; fromX: number; toX: number; bottom: number };

// ---------------------------------------------------------------------------
// v2：光影
// ---------------------------------------------------------------------------

/** 光源温度。渲染层用它对材质三点色做 HSL 偏移，而不是手写几十个色值。 */
export type LightTemperature = "warm" | "neutral" | "cool" | "moonlight";

/** 一套光影装置 */
export type LightRig = {
  /** 主光方向。决定材质渐变的角度与投影落点 */
  key: "top" | "left" | "right" | "front" | "ambient";
  temperature: LightTemperature;
  /** 光源强度 0~1 */
  intensity: number;
  /** 体积光（光柱）。null = 不画 */
  shafts: { count: number; angle: number; opacity: number } | null;
  /** 环境遮蔽强度 0~1。越大 → 墙根/柱脚的暗带越重 */
  ao: number;
  /** 景深雾。`density` 0~1，0 = 不起雾 */
  fog: { color: string; density: number };
  /** 色罩（v1 的 `ambient.tint` 语义，保留下来不丢） */
  tint: { color: string; opacity: number };
};

// ---------------------------------------------------------------------------
// v2：材质
// ---------------------------------------------------------------------------

/**
 * 三点色。**从 `components/clan/arch/palette.ts` 提升到此处共用。**
 *
 * 为什么提上来：宗祠的工笔彩绘早就用「受光/本色/暗部」三点定材质，
 * 而纪念馆侧的 3D 场景一直在手写单色渐变。v2 要统一走材质体系，
 * 若从 palette.ts 引入，`lib/decor-3d.ts` 就会 import 一个 React 组件同目录的文件 ——
 * 层级反了（表现层库不该依赖组件目录）。因此把**纯类型**上提到这里，
 * palette.ts 改为从这里 re-export（它原有的 Triangle 值定义完全不动）。
 */
export type TriTone = { light: string; base: string; dark: string };

/** 空间材质主题 */
export type MaterialTheme = {
  /** 立柱 */
  pillar: TriTone;
  /** 梁枋 */
  beam: TriTone;
  /** 石材（台基 / 柱础 / 地） */
  stone: TriTone;
  /** 金属（金饰 / 铜件） */
  metal: TriTone;
  /** 地面 */
  floor: TriTone;
  /** 木纹花纹（CSS background-image 片段）；null = 不叠 */
  woodGrain: string | null;
  /** 织锦花纹；null = 不叠 */
  brocade: string | null;
};

/** 一件陈设（灯笼 / 香炉 / 牌位墙…）在 3D 空间里的摆位 */
export type Prop3DSpec = {
  id: string;
  /** 挂饰图层：对应的 OrnamentSpec.kind */
  kind: string;
  /** 空间单位下的位置（x 横向、z 纵深），y 由 bottom 决定 */
  x: number;
  z: number;
  bottom: number;
  /** 缩放（1 = 原始尺寸） */
  scale: number;
  /** 绕 Y 轴朝向（度） */
  rotateY?: number;
  /** 颜色（取装修数据的 ornament.color） */
  color?: string;
  /** 文字（匾额用） */
  text?: string;
  /**
   * 件数 / 格数。
   *
   * 为什么要在 spec 上带一份而不是渲染时再读 `OrnamentSpec`：
   * 陈设的位置是 `propsFromDecor` 算好的（比如灯笼 count=3 会摊成 3 个独立 prop），
   * 渲染层若再回读装修数据，就会出现"位置按 3 个算、渲染按 2 个画"的错位。
   * 所以件数必须在**算位置时**就定下来、一并传下去。
   * 缺省 1；仅 `tablet-wall`（格数）与需要自绘多件的 kind 会用到。
   */
  count?: number;
};

/** 一套完整的 3D 空间描述 */
export type Space3D = {
  kind: SpaceKind;
  /** 观者到正面墙的距离（单位）。越小越"贴脸"，越大越"开阔" */
  cameraDistance: number;
  /** 初始水平视角（度）。正值向右看 */
  yaw: number;
  /** 可环视的角度范围（度）。0 = 固定不动 */
  yawRange: number;
  /** 透视强度（px）。等价于 CSS perspective 值 */
  perspective: number;
  /** 地面样式 */
  floor: {
    /** 地纹图层由装修数据提供，这里只描述几何 */
    depth: number; // 地面纵深（单位）
    /** 是否有镜面反射 */
    mirror: boolean;
    /** 网格线间距（单位），0 = 不画网格 */
    grid: number;
  };
  /**
   * 天花板/顶部。
   *
   * ⚠️ 联合里同时存在 v1 形态（`beam`/`vault`/`open`）与 v2 形态
   *    （`rafters`/`coffer`/`scroll`/`caisson`）—— **这是有意的**。
   *    v1 的三态被既有断言与 `Ceiling3D` 读着，删掉就是一次静默的回归。
   *    v2 的 `CofferedCeiling` 是新增，不是替换。
   */
  ceiling: CofferedCeiling;
  /** 墙面（可以有 1~4 面） */
  walls: WallSpec[];
  /** 陈设 */
  props: Prop3DSpec[];
  /** 环境光：影响整体明暗与色温 */
  ambient: {
    /** 主色调（叠在最上层的半透明色罩） */
    tint: string;
    /** 色罩不透明度 0~1 */
    tintOpacity: number;
    /** 主光源方向："top" 顶光 / "center" 正前 / "ambient" 无方向 */
    keyLight: "top" | "center" | "ambient";
    /** 光源强度 0~1 */
    intensity: number;
  };

  // ----- v2 新增（全部由 classicSpace() 工厂统一填默认值） -----

  /** 结构档位。渲染层据此决定各构件画不画、画多细 */
  structureTier: StructureTier;
  /** 立柱 */
  columns: ColumnSpec[];
  /** 梁枋 */
  beams: BeamSpec[];
  /** 斗拱 */
  dougong: DougongSpec[];
  /** 台基。null = 无台基（深空类空间） */
  podium: PodiumSpec | null;
  /** 分隔构件（挂落 / 屏门 / 栏杆） */
  dividers: DividerSpec[];
  /** 材质主题 */
  material: MaterialTheme;
  /** 光影装置 */
  light: LightRig;
};

// ---------------------------------------------------------------------------
// 结构档位表
// ---------------------------------------------------------------------------

/**
 * 结构档位 → 允许出现的构件（**单调性**是硬约束，见断言）。
 *
 * `imperial ⊇ grand ⊇ basic ⊇ none` —— 高档位只允许"加"，不允许悄悄"减"。
 * 若某天有人把 imperial 的 `podium` 改成 false，用户在豪华模板里就会看到
 * 台基凭空消失；单调性断言正是为这类"改一处、降一档"准备的。
 *
 * `detail` 是"精细度"，不是布尔：0 = 只画轮廓；1 = 加彩画/雀替/柱础；
 * 2 = 再加高光与描金。渲染层用它开关**同一个构件的内部层数**，
 * 所以档位落差能体现在「层数」上，而不是只有"有没有"。
 */
export const STRUCTURE_TIERS: Record<
  StructureTier,
  {
    podium: boolean;
    columns: boolean;
    beams: boolean;
    dougong: boolean;
    cofferedCeiling: boolean;
    dividers: boolean;
    detail: 0 | 1 | 2;
  }
> = {
  none: {
    podium: false,
    columns: false,
    beams: false,
    dougong: false,
    cofferedCeiling: false,
    dividers: false,
    detail: 0,
  },
  basic: {
    podium: true,
    columns: true,
    beams: true,
    dougong: false,
    cofferedCeiling: false,
    dividers: false,
    detail: 0,
  },
  grand: {
    podium: true,
    columns: true,
    beams: true,
    dougong: true,
    cofferedCeiling: true,
    dividers: true,
    detail: 1,
  },
  imperial: {
    podium: true,
    columns: true,
    beams: true,
    dougong: true,
    cofferedCeiling: true,
    dividers: true,
    detail: 2,
  },
};

/** 从 `none` 到 `imperial` 的档位序（用于比较与单调性判定） */
export const TIER_ORDER: StructureTier[] = ["none", "basic", "grand", "imperial"];

/** 档位序号（0 = none … 3 = imperial）。未知值按 0 处理，脏数据不该让页面崩 */
export function tierLevel(t: string | undefined): number {
  const i = TIER_ORDER.indexOf((t ?? "none") as StructureTier);
  return i < 0 ? 0 : i;
}

// ---------------------------------------------------------------------------
// 材质配方
// ---------------------------------------------------------------------------

/**
 * 五种材质配方：`(三点色) → CSS background-image`。
 *
 * 为什么做成"配方"而不是让每个空间各写一串渐变：
 * 同一根柱子在 `shrine` 与 `hall` 里都该有"圆柱受光"的样子，只有色不同。
 * 把"怎么画出圆柱"抽成配方后，色由 `material.pillar` 给，
 * 换材质就真的只是换色，不会出现"两个空间里的柱子长得不一样"。
 *
 * 与 `components/clan/arch/defs.tsx` 的 SVG `<pattern>` 是**同一套观感**：
 * 砖缝间距必须一致（横 1px/34px、竖 1px/56px），否则 2D 与 3D 两个视图
 * 会对同一种石材质给出不同纹理密度。新断言锁这条。
 */
export const MATERIAL_RECIPES = {
  /** 描金：顶部径向高光 + 45° 斜纹 + 底色 */
  gilt: (t: TriTone) =>
    `radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255,255,235,.55), transparent 62%), repeating-linear-gradient(45deg, rgba(255,255,255,.07) 0 8px, transparent 8px 16px), linear-gradient(180deg, ${t.light} 0%, ${t.base} 52%, ${t.dark} 100%)`,
  /** 髹漆（大漆）：柱身横向渐变，受光面在左 1/3 + 顶部薄高光 */
  lacquer: (t: TriTone) =>
    `linear-gradient(180deg, rgba(255,240,210,.18) 0 6%, transparent 22%), linear-gradient(90deg, ${t.dark} 0%, ${t.light} 30%, ${t.base} 62%, ${t.dark} 100%)`,
  /**
   * 石材：横缝 + 竖缝 + 底色。
   *
   * ⚠️ **缝距必须与 `components/clan/arch/defs.tsx` 的 `<pattern id="brick">` 一致**
   *    —— 那边是 `width=72 height=34`（青砖 72×34）。若两处写不同的数字，
   *    同一种"青砖墙"在宗祠 2D 分镜与 3D 场景里会呈现不同密度，
   *    用户切换视图时会觉得"砖变大了"，而这种不一致极难在页面上察觉、只能靠断言锁。
   *    所以这里是 `0deg` 缝间距 34（横向砖缝，按行高）、`90deg` 缝间距 72（竖向砖缝）。
   */
  stone: (t: TriTone) =>
    `repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 1px, transparent 1px 34px), repeating-linear-gradient(90deg, rgba(0,0,0,.14) 0 1px, transparent 1px 72px), linear-gradient(180deg, ${t.light} 0%, ${t.base} 60%, ${t.dark} 100%)`,
  /** 木纹：密竖纹 + 径向受光 + 底色 */
  wood: (t: TriTone) =>
    `repeating-linear-gradient(88deg, rgba(255,225,170,.10) 0 2px, transparent 2px 14px), radial-gradient(circle at 40% 10%, rgba(255,210,140,.22), transparent 62%), linear-gradient(180deg, ${t.light} 0%, ${t.base} 55%, ${t.dark} 100%)`,
  /** 织锦：±45° 双向斜纹 + 底色 */
  brocade: (t: TriTone) =>
    `repeating-linear-gradient(45deg, rgba(255,215,140,.18) 0 8px, transparent 8px 16px), repeating-linear-gradient(-45deg, rgba(255,215,140,.12) 0 8px, transparent 8px 16px), linear-gradient(180deg, ${t.light} 0%, ${t.base} 52%, ${t.dark} 100%)`,
} as const;

export type MaterialRecipeName = keyof typeof MATERIAL_RECIPES;

/** 缺省材质主题：暖木 + 青石 + 金。多数空间都能用，不需要各自重写一遍 */
export const DEFAULT_MATERIAL: MaterialTheme = {
  pillar: { light: "#a8503a", base: "#8e3a26", dark: "#5d2216" },
  beam: { light: "#b98559", base: "#a8744f", dark: "#8f5f3d" },
  stone: { light: "#c3c6ca", base: "#9fa4a9", dark: "#7c8085" },
  metal: { light: "#f7e6a8", base: "#d4af37", dark: "#a5801f" },
  floor: { light: "#c9c3b6", base: "#a8a294", dark: "#86806f" },
  woodGrain: null,
  brocade: null,
};

/**
 * 色温 → 三点色的 HSL 微调量。
 *
 * 为什么要"算"而不是"写死四套色"：
 * 材质主题有 5 个 TriTone × 每套 3 个色值 = 15 个色值，
 * 再乘 4 种色温就是 60 个手写常量 —— 改一次品牌色要改 60 处，
 * 必然漏。改成偏移量后，色温是一个函数，不会漂移。
 *
 * 数值取法：暖光把色相往红黄推、提亮受光面；冷光往蓝推、压低饱和；
 * 月光最狠 —— 整体去饱和 + 压暗，接近"蓝灰单色"。
 */
const TEMPERATURE_SHIFT: Record<
  LightTemperature,
  { hue: number; satMul: number; lightAdd: number }
> = {
  warm: { hue: 8, satMul: 1.18, lightAdd: 0.04 },
  neutral: { hue: 0, satMul: 1, lightAdd: 0 },
  cool: { hue: -12, satMul: 0.86, lightAdd: -0.02 },
  moonlight: { hue: -26, satMul: 0.42, lightAdd: -0.08 },
};

/** #rrggbb → {h,s,l}；解析失败返回中性灰（不抛错，脏数据不该让页面崩） */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 0, l: 0.5 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** {h,s,l} → #rrggbb */
function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360 / 360;
  const ss = clamp01(s);
  const ll = clamp01(l);
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return `#${v.toString(16).padStart(2, "0").repeat(3)}`;
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const f = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const r = Math.round(f(hh + 1 / 3) * 255);
  const g = Math.round(f(hh) * 255);
  const b = Math.round(f(hh - 1 / 3) * 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 按色温偏移一个三点色。
 *
 * 受光面偏移最强、暗部最弱（真实光照下暗部几乎不受色温影响），
 * 所以 `light` 的 `lightAdd` 加倍、`dark` 减半 —— 否则暗部会被"洗白"，
 * 体积感全丢。
 *
 * 输出一定是 `#rrggbb`，可直接进 CSS 渐变（不需要 `hsl()` 包装）。
 */
export function applyTemperature(t: TriTone, temp: LightTemperature): TriTone {
  const sh = TEMPERATURE_SHIFT[temp] ?? TEMPERATURE_SHIFT.neutral;
  const shift = (hex: string, weight: number): string => {
    const { h, s, l } = hexToHsl(hex);
    return hslToHex(h + sh.hue, s * (1 + (sh.satMul - 1) * weight), l + sh.lightAdd * weight);
  };
  return { light: shift(t.light, 1.4), base: shift(t.base, 1), dark: shift(t.dark, 0.55) };
}

// ---------------------------------------------------------------------------
// 共用常量
// ---------------------------------------------------------------------------

/** 空间基准尺寸（单位）。所有空间都按这套基准推导，保证切换模板时比例一致。 */
export const SPACE = {
  /** 空间总宽 */
  width: 100,
  /** 空间总高 */
  height: 62,
  /** 地面纵深 */
  depth: 40,
} as const;

const FLOOR_DEFAULT: Space3D["floor"] = { depth: SPACE.depth, mirror: false, grid: 0 };

/** v1 环境光的默认值（各空间通过 opts.ambient 覆盖） */
const AMBIENT_DEFAULT: Space3D["ambient"] = {
  tint: "#00000000",
  tintOpacity: 0,
  keyLight: "top",
  intensity: 0.55,
};

/** v2 光影的默认值：温和顶光、无光柱、轻雾、无 AO */
const LIGHT_DEFAULT: LightRig = {
  key: "top",
  temperature: "neutral",
  intensity: 0.55,
  shafts: null,
  ao: 0.12,
  fog: { color: "#000000", density: 0 },
  tint: { color: "#00000000", opacity: 0 },
};

/**
 * 由 v1 的 `ambient` 推导一份 v2 的 `light`。
 *
 * 为什么需要这层映射：`light` 是新增字段，而 8 个空间里有几个只打算给
 * `ambient`（旧写法）。若任其留空，那些空间的光影就会是"零"——
 * 表现为整体发灰、不如 v1 好看，用户的第一反应是"升级后变丑了"。
 * 所以工厂用旧值兜底生成新值：
 *   - `tint`/`tintOpacity` 一对一搬过来（语义完全一致）
 *   - `keyLight` 的 `center` 映射为 `front`，`ambient` 映射为 `ambient`
 *   - 强度直接搬
 * 显式传了 `opts.light` 时以显式值为准（见 classicSpace）。
 */
function lightFromAmbient(a: Space3D["ambient"]): LightRig {
  const key: LightRig["key"] =
    a.keyLight === "center" ? "front" : a.keyLight === "top" ? "top" : "ambient";
  return {
    ...LIGHT_DEFAULT,
    key,
    intensity: a.intensity,
    tint: { color: a.tint, opacity: a.tintOpacity },
  };
}

/**
 * 一个「常规厅堂」：正面墙 + 左右各一面侧墙，形成三面围合。
 * 这是最基础的空间，多数模板都用它，只是换了壁纸/挂饰/光色。
 *
 * ⚠️ **v2 的新字段必须在这里统一填默认值**（`structureTier` / `columns` /
 *    `beams` / `dougong` / `podium` / `dividers` / `material` / `light`）。
 *    8 个空间全部由本工厂派生，漏填一处就是那 8 处一起 `undefined` ——
 *    渲染层读到 undefined 会静默跳过整个结构层（页面照常、不报错、
 *    只是"没有结构"），这类静默降级最难查。判定入口是断言 ②：
 *    「8 种 SpaceKind 的 structureTier/columns/beams/light 齐备」。
 */
export function classicSpace(opts: {
  yawRange?: number;
  cameraDistance?: number;
  mirror?: boolean;
  grid?: number;
  ceiling?: Space3D["ceiling"];
  ambient?: Partial<Space3D["ambient"]>;
  props?: Prop3DSpec[];
  // ---- v2 可覆写项（不传则用 classic 的朴素骨架） ----
  structureTier?: StructureTier;
  columns?: ColumnSpec[];
  beams?: BeamSpec[];
  dougong?: DougongSpec[];
  podium?: PodiumSpec | null;
  dividers?: DividerSpec[];
  material?: Partial<MaterialTheme>;
  light?: Partial<LightRig>;
} = {}): Space3D {
  const half = SPACE.width / 2;
  const ambient: Space3D["ambient"] = { ...AMBIENT_DEFAULT, ...opts.ambient };
  const light = opts.light ? { ...lightFromAmbient(ambient), ...opts.light } : lightFromAmbient(ambient);

  return {
    kind: "classic",
    cameraDistance: opts.cameraDistance ?? 78,
    yaw: 0,
    yawRange: opts.yawRange ?? 26,
    perspective: 1400,
    floor: { ...FLOOR_DEFAULT, mirror: opts.mirror ?? false, grid: opts.grid ?? 0 },
    ceiling: opts.ceiling ?? { type: "rafters", count: 4, color: "#6b5540" },
    walls: [
      // 正面墙：贴齐空间后沿
      {
        offset: 0,
        rotateY: 0,
        translateZ: 0,
        width: SPACE.width,
        height: SPACE.height,
        bottom: 0,
        wallSlot: "wall",
        reflect: true,
      },
      // 左墙：向后收，绕 Y 轴转 90°
      {
        offset: -half,
        rotateY: 90,
        translateZ: -SPACE.depth / 2,
        width: SPACE.depth,
        height: SPACE.height,
        bottom: 0,
        wallSlot: "wall",
      },
      // 右墙
      {
        offset: half,
        rotateY: -90,
        translateZ: -SPACE.depth / 2,
        width: SPACE.depth,
        height: SPACE.height,
        bottom: 0,
        wallSlot: "wall",
      },
    ],
    props: opts.props ?? [],
    ambient,

    // ----- v2：结构（classic 的朴素骨架） -----
    /*
      classic 从 v1 的"无特征方盒"改为 basic：一座朴素的厅堂**本来**就该有
      台基、檐下一道额枋、几根椽条。这样"未装修"也仍然是一个完整的空间，
      而不是一个纯色背景墙 —— 也就有了"装修前"的可比基准（对比视图要用）。
    */
    structureTier: opts.structureTier ?? "basic",
    columns:
      opts.columns ??
      [
        { id: "col-l", x: -SPACE.width * 0.38, top: SPACE.height * 0.86, diameter: 3, plinth: true, sparrowBrace: false },
        { id: "col-r", x: SPACE.width * 0.38, top: SPACE.height * 0.86, diameter: 3, plinth: true, sparrowBrace: false },
      ],
    beams:
      opts.beams ??
      [
        {
          kind: "architrave",
          fromX: -half,
          toX: half,
          bottom: SPACE.height * 0.84,
          depth: 3,
          painted: false,
        },
      ],
    dougong: opts.dougong ?? [],
    podium: opts.podium !== undefined ? opts.podium : { kind: "terrace", steps: 1, railing: false },
    dividers: opts.dividers ?? [],
    material: { ...DEFAULT_MATERIAL, ...opts.material },
    light,
  };
}

/**
 * 空间形态注册表。
 *
 * 每套模板通过 `space` 字段引用这里的某个 key；未声明时用 `classic`。
 * 这里**只描述几何**，不引用任何装修数据 —— 壁纸/挂饰由渲染组件从 decor 里读。
 *
 * ⚠️ 下面每一项都由 `classicSpace()` 派生，而它内部把 `kind` 写死为 `"classic"`。
 *    因此**必须**在收尾处用 `withKind()` 把每项的 `kind` 覆写成它自己的 key。
 *    否则 SPACES.starfield.kind === "classic"，渲染出来的 `data-decor-3d` /
 *    `data-space` 全是 "classic" —— 页面看着有 3D，但空间形态永远分辨不出来，
 *    断言与调试也全部失效（实测踩到：星河模板的 badge 是 starfield，
 *    内层 data-space 却是 classic，一眼以为模板没生效）。
 *
 * ## v2 各空间的结构/光影配置（**必须齐备**）
 *
 * | SpaceKind   | tier     | 立柱        | 梁枋                | 斗拱  | 台基        | 天花        | 分隔   |
 * |-------------|----------|-------------|---------------------|-------|-------------|-------------|--------|
 * | classic     | basic    | ±38 ×1      | 额枋 ×1             | 0     | terrace(1)  | 椽条(4)     | 0      |
 * | niche       | basic    | 0           | 0                   | 0     | terrace(1)  | 无          | 挂落×1 |
 * | shrine      | grand    | ±30/±44     | 额枋 + 脊檩         | 柱头4 | 须弥(2)     | 椽条(5)     | 栏杆   |
 * | courtyard   | grand    | ±22/±38/±50 | 额枋 ×2             | 0     | terrace(1)  | 无（露天）  | 挂落×2 |
 * | gate        | grand    | ±×2         | 额枋 ×1             | 柱头4 | terrace(3)  | 无（露天）  | 屏门×1 |
 * | hall        | grand    | ±×3         | 额枋 + 脊檩 ×2      | 柱头6 | 须弥(2)     | 藻井(3)     | 栏杆   |
 * | pond        | basic    | ±×1         | 0                   | 0     | terrace(1)  | 卷棚        | 0      |
 * | starfield   | none     | 0           | 0                   | 0     | null        | 平棋        | 0      |
 *
 * 这张表是"免费朴素 vs 豪华满配"落差的**数据来源**：`structureTier` 是唯一的
 * 档位开关，构件数组只是"这套空间**打算**画哪些"。渲染层两者取交集 ——
 * 所以把 `hall` 降到 `basic` 就能立刻变朴素（反向验证就是这么做的）。
*/
function withKind<K extends SpaceKind>(map: Record<K, Space3D>): Record<K, Space3D> {
  for (const k of Object.keys(map) as K[]) map[k] = { ...map[k], kind: k };
  return map;
}

/** 构造一组对称立柱（左右各一，可多对）。纯粹为了少写几遍重复字面量 */
function symColumns(
  pairs: { x: number; top: number; diameter?: number; plinth?: boolean; sparrowBrace?: boolean }[],
): ColumnSpec[] {
  return pairs.flatMap((p, i) => [
    {
      id: `col-l${i}`,
      x: -p.x,
      top: p.top,
      diameter: p.diameter ?? 3,
      plinth: p.plinth ?? true,
      sparrowBrace: p.sparrowBrace ?? false,
    },
    {
      id: `col-r${i}`,
      x: p.x,
      top: p.top,
      diameter: p.diameter ?? 3,
      plinth: p.plinth ?? true,
      sparrowBrace: p.sparrowBrace ?? false,
    },
  ]);
}

export const SPACES: Record<SpaceKind, Space3D> = withKind({
  classic: classicSpace(),

  /**
   * 壁龛纪念墙：整面木格壁龛是主角，纵深浅、正对着看。
   * 用浅纵深 + 小环视角度，让注意力集中在墙上（而不是空间本身）。
   *
   * 结构刻意最简（basic，无明柱、无斗拱）：壁龛墙本身就是"结构"，
   * 再加柱子只会跟墙面打架。只留台基（接地）与一道挂落（檐口）。
   */
  niche: classicSpace({
    cameraDistance: 70,
    yawRange: 16,
    mirror: true,
    ceiling: { type: "none" },
    structureTier: "basic",
    columns: [],
    beams: [],
    dougong: [],
    dividers: [{ kind: "hangfall", x: 0, bottom: SPACE.height * 0.9, width: SPACE.width }],
    light: { key: "top", temperature: "warm", intensity: 0.5, ao: 0.1 },
  }),

  /** 祠堂寝堂：牌位墙 + 香案，纵深中等，光线偏暖偏暗。
   *
   * 不再只是 classicSpace 调几个参数 —— 作为一个"寝堂"，它本身就该有
   * 牌位墙、香案、长明灯这些"家具"（base props），以及**两列立柱 + 柱头斗拱 +
   * 须弥座**这些建筑构件（v2 新增），而不是空荡荡一个厅。
   * 这些 props 是空间自带的，与用户选了什么挂饰无关；挂饰只会**覆盖**它们。
   * （propsFromDecor 在有 ornament 时会整体替换 base，所以这里设的不会被叠出来）
   */
  shrine: (() => {
    const half = SPACE.width / 2;
    const s = classicSpace({
      cameraDistance: 74,
      yawRange: 22,
      mirror: true,
      ceiling: { type: "rafters", count: 5, color: "#5a3f28" },
      ambient: { tint: "#3a2410", tintOpacity: 0.18, keyLight: "top", intensity: 0.5 },
      structureTier: "grand",
      // 内外两列：外列贴侧墙、内列围出"龛前"空间
      columns: symColumns([
        { x: half * 0.88, top: SPACE.height * 0.9, diameter: 3.4, sparrowBrace: true },
        { x: half * 0.6, top: SPACE.height * 0.88, diameter: 3.0, sparrowBrace: true },
      ]),
      beams: [
        { kind: "architrave", fromX: -half, toX: half, bottom: SPACE.height * 0.86, depth: 3.4, painted: true },
        { kind: "ridge", fromX: -half * 0.7, toX: half * 0.7, bottom: SPACE.height * 0.95, depth: 2.6, painted: true },
      ],
      dougong: [-half * 0.88, -half * 0.6, half * 0.6, half * 0.88].map((x) => ({
        x,
        bottom: SPACE.height * 0.9,
        tiers: 3,
      })),
      podium: { kind: "sumeru", steps: 2, railing: true },
      dividers: [{ kind: "railing", fromX: -half * 0.7, toX: half * 0.7, bottom: 2 }],
      material: { pillar: { light: "#a8503a", base: "#8e2018", dark: "#5d130d" } },
      light: { key: "top", temperature: "warm", intensity: 0.52, ao: 0.3, shafts: { count: 2, angle: 12, opacity: 0.5 } },
    });
    s.props = [
      // 牌位墙：贴着正面墙，Prop3D 内按格子自绘（scale 只作整体微调）
      {
        id: "shrine-tablets",
        kind: "tablet-wall",
        x: 0,
        z: -SPACE.depth * 0.02,
        bottom: 2,
        scale: 1,
        color: "#8a6a3e",
      },
      // 香案：位于牌位墙前、贴近地面，是"献祭的落点"
      {
        id: "shrine-altar",
        kind: "incense-burner",
        x: 0,
        z: -SPACE.depth * 0.12,
        bottom: 0,
        scale: 1.1,
        color: "#6a4a28",
      },
      // 长明灯 ×2：对称悬在香案两侧上方（悬在半高，太高会出画）
      {
        id: "shrine-lantern-l",
        kind: "lantern",
        x: -half * 0.55,
        z: -SPACE.depth * 0.18,
        bottom: SPACE.height * 0.52,
        scale: 0.9,
        color: "#d4a84a",
      },
      {
        id: "shrine-lantern-r",
        kind: "lantern",
        x: half * 0.55,
        z: -SPACE.depth * 0.18,
        bottom: SPACE.height * 0.52,
        scale: 0.9,
        color: "#d4a84a",
      },
    ];
    return s;
  })(),

  /** 庭院天井：露天，无顶，环视范围最大 —— 这是"院子"，可以四处张望。
   *  三重立柱撑起两侧廊庑，两道挂落横跨廊下。 */
  courtyard: classicSpace({
    cameraDistance: 88,
    yawRange: 34,
    grid: 12,
    ceiling: { type: "open", color: "#cfe0ea" },
    ambient: { tint: "#dce9f2", tintOpacity: 0.12, keyLight: "ambient", intensity: 0.75 },
    structureTier: "grand",
    columns: symColumns([
      { x: SPACE.width / 2 * 0.44, top: SPACE.height * 0.82, diameter: 2.8 },
      { x: SPACE.width / 2 * 0.76, top: SPACE.height * 0.86, diameter: 3.0 },
      { x: SPACE.width / 2, top: SPACE.height * 0.88, diameter: 3.2 },
    ]),
    beams: [
      { kind: "architrave", fromX: -SPACE.width / 2, toX: -SPACE.width / 2 * 0.4, bottom: SPACE.height * 0.8, depth: 3, painted: false },
      { kind: "architrave", fromX: SPACE.width / 2 * 0.4, toX: SPACE.width / 2, bottom: SPACE.height * 0.8, depth: 3, painted: false },
    ],
    dougong: [],
    podium: { kind: "terrace", steps: 1, railing: false },
    dividers: [
      { kind: "hangfall", x: -SPACE.width / 2 * 0.62, bottom: SPACE.height * 0.78, width: SPACE.width * 0.36 },
      { kind: "hangfall", x: SPACE.width / 2 * 0.62, bottom: SPACE.height * 0.78, width: SPACE.width * 0.36 },
    ],
    material: { pillar: { light: "#b2352a", base: "#8e2018", dark: "#5d130d" }, stone: { light: "#eceae4", base: "#dfdbd1", dark: "#cfcac0" } },
    light: { key: "ambient", temperature: "neutral", intensity: 0.78, ao: 0.14, fog: { color: "#dfe7ee", density: 0.18 } },
  }),

  /** 山门：开阔的室外，环视角度大，地面有石缝网格。
   *  三阶台基 + 柱头斗拱 + 一道屏门（挡住门后的"内院"，制造纵深）。 */
  gate: classicSpace({
    cameraDistance: 96,
    yawRange: 40,
    grid: 14,
    ceiling: { type: "open", color: "#c8d8e4" },
    ambient: { tint: "#d6e4ee", tintOpacity: 0.1, keyLight: "ambient", intensity: 0.8 },
    structureTier: "grand",
    columns: symColumns([
      { x: SPACE.width / 2 * 0.3, top: SPACE.height * 0.84, diameter: 3.2, sparrowBrace: true },
    ]),
    beams: [
      { kind: "architrave", fromX: -SPACE.width / 2 * 0.42, toX: SPACE.width / 2 * 0.42, bottom: SPACE.height * 0.82, depth: 3.6, painted: true },
    ],
    dougong: [-SPACE.width / 2 * 0.3, SPACE.width / 2 * 0.3].map((x) => ({
      x,
      bottom: SPACE.height * 0.84,
      tiers: 4,
    })),
    podium: { kind: "terrace", steps: 3, railing: false },
    // 屏门：画在门楼结构**之后**（AGENTS.md：影壁/屏门必须后画才能挡住后面）
    dividers: [{ kind: "screen", x: 0, width: SPACE.width * 0.5, height: SPACE.height * 0.68 }],
    material: { pillar: { light: "#b2352a", base: "#8e2018", dark: "#5d130d" }, stone: { light: "#b4b0a6", base: "#9b978c", dark: "#7a766c" } },
    light: { key: "front", temperature: "cool", intensity: 0.82, ao: 0.2, fog: { color: "#c8d8e4", density: 0.3 } },
  }),

  /** 享堂：主厅，斗拱横梁密，光线自上而下。
   *  这是"豪华档"的样板：6 朵柱头斗拱 + 3 圈藻井 + 须弥座 + 栏杆 + 光柱。 */
  hall: classicSpace({
    cameraDistance: 80,
    yawRange: 24,
    mirror: true,
    ceiling: { type: "coffer", rings: 3, color: "#7a4a26" },
    ambient: { tint: "#4a2c10", tintOpacity: 0.14, keyLight: "top", intensity: 0.6 },
    structureTier: "grand",
    columns: symColumns([
      { x: SPACE.width / 2 * 0.86, top: SPACE.height * 0.9, diameter: 3.6, sparrowBrace: true },
      { x: SPACE.width / 2 * 0.56, top: SPACE.height * 0.9, diameter: 3.4, sparrowBrace: true },
      { x: SPACE.width / 2 * 0.26, top: SPACE.height * 0.9, diameter: 3.2, sparrowBrace: true },
    ]),
    beams: [
      { kind: "architrave", fromX: -SPACE.width / 2, toX: SPACE.width / 2, bottom: SPACE.height * 0.87, depth: 3.8, painted: true },
      { kind: "ridge", fromX: -SPACE.width / 2 * 0.8, toX: SPACE.width / 2 * 0.8, bottom: SPACE.height * 0.96, depth: 2.8, painted: true },
      { kind: "purlin", fromX: -SPACE.width / 2 * 0.9, toX: SPACE.width / 2 * 0.9, bottom: SPACE.height * 0.93, depth: 2.2, painted: false },
    ],
    dougong: [-0.86, -0.56, -0.26, 0.26, 0.56, 0.86].map((f) => ({
      x: SPACE.width / 2 * f,
      bottom: SPACE.height * 0.9,
      tiers: 4,
    })),
    podium: { kind: "sumeru", steps: 2, railing: true },
    dividers: [{ kind: "railing", fromX: -SPACE.width / 2 * 0.8, toX: SPACE.width / 2 * 0.8, bottom: 2 }],
    material: {
      pillar: { light: "#a8503a", base: "#8e2018", dark: "#5d130d" },
      beam: { light: "#b98559", base: "#a8744f", dark: "#8f5f3d" },
      metal: { light: "#f7e6a8", base: "#d4af37", dark: "#a5801f" },
    },
    light: {
      key: "top",
      temperature: "warm",
      intensity: 0.62,
      ao: 0.32,
      shafts: { count: 3, angle: 14, opacity: 0.6 },
      tint: { color: "#4a2c10", opacity: 0.14 },
    },
  }),

  /** 莲池：水面倒影是主角，透明度高，色调偏青绿。卷棚顶 + 一圈挂落 */
  pond: classicSpace({
    cameraDistance: 84,
    yawRange: 30,
    mirror: true,
    ceiling: { type: "scroll", color: "#0e1a1c" },
    ambient: { tint: "#0c2a26", tintOpacity: 0.34, keyLight: "ambient", intensity: 0.42 },
    structureTier: "basic",
    columns: symColumns([
      { x: SPACE.width / 2 * 0.82, top: SPACE.height * 0.86, diameter: 3, plinth: false },
    ]),
    beams: [],
    dougong: [],
    podium: { kind: "terrace", steps: 1, railing: true },
    material: {
      pillar: { light: "#7d5a2c", base: "#4d3418", dark: "#2b1d0c" },
      stone: { light: "#9fb0ad", base: "#7d8f8c", dark: "#5c6c6a" },
    },
    light: { key: "ambient", temperature: "moonlight", intensity: 0.44, ao: 0.24, fog: { color: "#0c2a26", density: 0.42 } },
  }),

  /** 星河：深空，无建筑构件，色调最暗。平棋顶 + 无台基（浮在星海里） */
  starfield: classicSpace({
    cameraDistance: 104,
    yawRange: 46,
    mirror: true,
    ceiling: { type: "caisson", color: "#070b11" },
    ambient: { tint: "#0a1220", tintOpacity: 0.42, keyLight: "ambient", intensity: 0.3 },
    structureTier: "none",
    columns: [],
    beams: [],
    dougong: [],
    podium: null,
    dividers: [],
    material: {
      pillar: { light: "#26344a", base: "#141d2c", dark: "#080d15" },
      beam: { light: "#26344a", base: "#141d2c", dark: "#080d15" },
      stone: { light: "#2b3d55", base: "#1a2536", dark: "#0b1119" },
      metal: { light: "#cfe0ff", base: "#8fa8cf", dark: "#4d6285" },
      floor: { light: "#16202e", base: "#0d141d", dark: "#05080c" },
    },
    light: { key: "ambient", temperature: "moonlight", intensity: 0.34, ao: 0.4, fog: { color: "#070b11", density: 0.5 } },
  }),
});

/** 取某个空间形态；未知值回落到 classic（脏数据不该让页面崩掉） */
export function space3d(kind?: string): Space3D {
  const k = (kind ?? "classic") as SpaceKind;
  return SPACES[k] ?? SPACES.classic;
}

/**
 * 计算观者在给定 yaw（水平环视角）下的空间变换。
 *
 * 这是"环视"的核心：观者转动视角，等价于整个空间朝反方向旋转。
 * 返回值直接进 CSS transform。
 *
 * @param yaw      当前水平视角（度），0 = 正对
 * @param space    空间描述
 * @param spread   额外视差强度（0~1），渲染组件用它把各层拉开距离
 */
export function viewerTransform(yaw: number, space: Space3D, spread = 1) {
  const clamped = Math.max(-space.yawRange, Math.min(space.yawRange, yaw));
  return {
    yaw: clamped,
    transform: `translateZ(${-space.cameraDistance}px) rotateY(${-clamped * spread}deg)`,
  };
}

/**
 * 把空间单位换算成像素。
 *
 * @param unit      空间单位值
 * @param containerW 容器宽度（px）
 * @returns 像素值
 */
export function unitToPx(unit: number, containerW: number) {
  return (unit / SPACE.width) * containerW;
}

/**
 * 生成地面网格线的 CSS background-image。
 *
 * 用 repeating-linear-gradient 而不是真画线，是因为地纹要能跟着
 * translateZ 一起做透视变形 —— 背景图会随元素一起被 transform。
 *
 * @param spacing 网格间距（空间单位）
 * @param color   线色
 */
export function floorGrid(spacing: number, color = "rgba(0,0,0,.12)") {
  if (spacing <= 0) return undefined;
  const px = `${spacing * 6}px`;
  return [
    `repeating-linear-gradient(0deg, ${color} 0 1px, transparent 1px ${px})`,
    `repeating-linear-gradient(90deg, ${color} 0 1px, transparent 1px ${px})`,
  ].join(", ");
}

/**
 * 陈设的 3D 摆放：把 (x, z, bottom) 换算成 CSS transform。
 *
 * 关键：陈设也参与 `rotateY`，否则环视时陈设会"贴在玻璃上"，
 * 与墙面的景深对不上，一眼假。
 */
export function propTransform(p: Prop3DSpec, containerW: number) {
  const x = unitToPx(p.x, containerW);
  const z = unitToPx(p.z, containerW);
  const bottom = unitToPx(p.bottom, containerW);
  return `translate3d(${x}px, ${-bottom}px, ${z}px) rotateY(${p.rotateY ?? 0}deg) scale(${p.scale})`;
}

// ---------------------------------------------------------------------------
// v2：结构 / 光影的派生工具
// ---------------------------------------------------------------------------

/**
 * 取某空间在**当前档位下**实际要绘制的构件。
 *
 * 为什么要这层"取交集"而不是让渲染层直接读数组：
 *   - 构件数组描述的是"这套空间**打算**画什么"（几何意图）；
 *   - `structureTier` 描述的是"这次装到第几档"（付费意图）。
 *   两者必须由**同一个函数**合起来，否则渲染层各处各写一遍
 *   `if (tier === "grand" || tier === "imperial")`，改档位时必漏。
 *   把判定收在这里之后，"把 hall 降到 basic 就变朴素"是**改一个字段**的事 ——
 *   反向验证也正是靠这一点（改 `structureTier` 就能让断言变红）。
 *
 * ⚠️ 返回空数组 ≠ 渲染层可以少画一层 DOM。渲染层仍需给出 `data-structure`
 *    计数属性，断言依赖它统计"结构复杂度的数字级落差"。
 */
export function structureParts(space: Space3D) {
  const t = STRUCTURE_TIERS[space.structureTier] ?? STRUCTURE_TIERS.none;
  const useCofferedCeiling =
    t.cofferedCeiling &&
    (space.ceiling.type === "rafters" ||
      space.ceiling.type === "coffer" ||
      space.ceiling.type === "scroll" ||
      space.ceiling.type === "caisson");
  return {
    tier: space.structureTier,
    detail: t.detail,
    columns: t.columns ? space.columns : [],
    beams: t.beams ? space.beams : [],
    dougong: t.dougong ? space.dougong : [],
    podium: t.podium ? space.podium : null,
    dividers: t.dividers ? space.dividers : [],
    ceiling: useCofferedCeiling ? space.ceiling : ({ type: "none" } as Space3D["ceiling"]),
  };
}

/**
 * 结构构件总数 —— **"装修前后的落差"的可证伪口径**。
 *
 * 免费档（basic）与豪华档（imperial）的差别不该是"感觉更豪华"，
 * 而应是这个数字的差。`verify-decor-scene-engine.mjs` 与后续的
 * 对比视图断言都引用它，避免各写一份重数逻辑（数法一漂，断言就互相打架）。
 *
 * 计数口径：每根柱 / 每道枋 / 每朵斗拱 / 台基（含踏步与栏杆各计 1）/
 * 每件分隔 / 天花（有顶算 1，藻井按圈数算）各计 1。
 */
export function structureCount(space: Space3D): number {
  const p = structureParts(space);
  let n = 0;
  n += p.columns.length;
  n += p.beams.length;
  n += p.dougong.length;
  if (p.podium) n += 1 + Math.max(0, p.podium.steps - 1) + (p.podium.railing ? 1 : 0);
  n += p.dividers.length;
  if (p.ceiling.type === "coffer") n += p.ceiling.rings;
  else if (p.ceiling.type !== "none") n += 1;
  return n;
}

/**
 * 按色温算出某空间要说用的材质主题（三点色全部偏移后的成品）。
 *
 * 渲染层**不该**自己调 `applyTemperature` —— 那样每处材质各调一次，
 * 漏调一处就是"柱子是暖光、枋是中性光"，看着像打光错了。
 */
export function litMaterial(space: Space3D): MaterialTheme {
  const temp = space.light.temperature;
  const m = space.material;
  return {
    pillar: applyTemperature(m.pillar, temp),
    beam: applyTemperature(m.beam, temp),
    stone: applyTemperature(m.stone, temp),
    metal: applyTemperature(m.metal, temp),
    floor: applyTemperature(m.floor, temp),
    woodGrain: m.woodGrain,
    brocade: m.brocade,
  };
}

/**
 * 主光方向 → 材质渐变的"角度"（度）。
 *
 * 为什么要有这张表：`MATERIAL_RECIPES` 里的 `lacquer`（柱身横向渐变）
 * 是用 CSS 的 `90deg` 写死的"左受光"。但主光在右边时，柱子的亮面就该在右边 ——
 * 否则整个空间的明暗逻辑是矛盾的（光从右来，所有物体却都左亮），
 * 观感上会说不出的别扭。这层映射把 `light.key` 翻译成配方里的角度。
 */
export const LIGHT_ANGLE: Record<LightRig["key"], number> = {
  top: 180,
  // 光从左边来 → 受光面朝左 → 渐变从"左亮"扫到"右暗"，即 90deg 方向
  left: 105,
  right: 255,
  front: 180,
  ambient: 155,
};

/**
 * 光柱的 CSS 片段（`shafts` 为 null 时不渲染）。
 *
 * ⚠️ 返回的是**普通对象字面量**而不是 `React.CSSProperties`：
 *    `lib/decor-3d.ts` 是纯值模块（一行业务代码都不该依赖 React），
 *    引入 `CSSProperties` 会让它变成"组件层的依赖"，层级就反了。
 *    调用方（组件）直接把它 spread 进 style 即可，TS 会自行结构兼容。
 *    `mixBlendMode` 在 TS 的 DOM 类型里是 `CSSProperties["mixBlendMode"]`，
 *    此处用 `as const` 收窄字符串字面量，避免被推成 `string` 而报错。
 */
export function shaftStyle(rig: LightRig) {
  if (!rig.shafts || rig.shafts.count <= 0) return null;
  const { angle, opacity } = rig.shafts;
  return {
    background: `linear-gradient(${angle}deg, transparent 0%, rgba(255,244,214,${0.16 * opacity}) 45%, rgba(255,244,214,${0.09 * opacity}) 55%, transparent 100%)`,
    filter: "blur(6px)",
    mixBlendMode: "screen" as const,
  };
}

/**
 * AO（环境遮蔽）暗带的宽度与强度。
 *
 * `ao` 0~1 → 透明度 0~0.5、宽度 2~6 单位。这是"物体接地"最省的一招：
 * 比逐件画投影便宜得多，但足以让墙根/柱脚不再"浮"起来。
 */
export function aoBand(ao: number, containerW: number) {
  const a = Math.max(0, Math.min(1, ao));
  return { width: unitToPx(2 + a * 4, containerW), opacity: a * 0.5 };
}

/**
 * 统一的空间"配色查询"入口（v1 兼容）。
 *
 * v1 的渲染层直接读 `space.ambient.tint/tintOpacity`。v2 改用 `light.tint`，
 * 但工厂已把 `ambient` 搬到 `light.tint`，两者同值 —— 这里给出唯一入口，
 * 免得渲染层一半读 ambient、一半读 light（漂移的经典来源）。
 */
export function spaceTint(space: Space3D): { color: string; opacity: number } {
  const t = space.light.tint;
  // light.tint 全透明时不信任它，回落到 ambient（老数据可能只填了 ambient）
  if (!t || (t.opacity <= 0 && space.ambient.tintOpacity > 0)) {
    return { color: space.ambient.tint, opacity: space.ambient.tintOpacity };
  }
  return { color: t.color, opacity: t.opacity };
}
