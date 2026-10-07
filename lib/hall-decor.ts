/**
 * 纪念馆空间装修素材库与模板目录
 *
 * 设计原则（2026-10 改版，勿按旧注释理解）：
 *  - 「建馆赠一套，其余皆付费」：新纪念馆建成时自动获赠一套模板（`tpl-niche`），
 *    **永久免费**，赠品用到的零件也随之永久免费 —— 用户建完馆立刻有一套像样的装修。
 *  - 赠品之外的一切（含原先的免费素材）均为收费：**可积分兑换，也可货币支付买断**。
 *  - 高级订阅（premiumUntil 有效期内）仍可直接使用全部素材。
 *  - 所有渲染参数均为纯 CSS / 内联样式，不依赖任何外部图片资源，保证隧道环境下也能稳定渲染。
 *
 * ⚠️ 素材 id / kind 值**一律不得变更** —— 数据库里已存了用户的装修方案，
 *    改 id 会让所有人的方案静默失效（normalizeDecor 会无声回落到默认搭配）。
 */

import type { StructureTier } from "@/lib/decor-3d";
import type { SkinTokens } from "@/lib/decor-skin";

/**
 * 素材档位。
 *
 *  - `free`    ：永久免费。改版后**只剩赠品模板及其零件**属于此档。
 *  - `points`  ：可用积分兑换（一次性买断，永久有效），也可用货币支付买断。
 *  - `buyout`  ：只标货币价（真金白银买断），走商城下单 —— 见 `lib/decor-products.ts`。
 *  - `premium` ：高级订阅期内可用，订阅到期后不可见（但选择会被保留，不会删除）。
 *
 * `points` 与 `buyout` 的区别只在「主推哪种支付方式」，两者最终都落到
 * `HallDecor.unlocked` 里同一个 `buy:<id>` 键 —— 解锁状态只有一种，不分支付渠道。
 */
export type DecorTier = "free" | "points" | "buyout" | "premium";

export type DecorCategory =
  | "template" // 整套模板（一键应用）
  | "kit" // 美化装饰套件（打包的挂饰/相框/字体，不覆盖墙地）
  | "wall" // 背景壁纸
  | "floor" // 地面/地纹
  | "ornament" // 挂饰/陈设
  | "frame" // 遗像相框
  | "font"; // 字体风格

/**
 * 槽位 = 能落到装修方案 `slots` 里的分类。
 *
 * `template` 与 `kit` 都是"打包"概念，不对应单个槽位，因此排除在外。
 * 注意 `DecorSlot` 是**唯一的槽位定义来源** —— `HallDecor.slots` 与
 * `SLOT_ITEMS` 都由它约束，加分类时别顺手把它也扩了。
 */
export type DecorSlot = Exclude<DecorCategory, "template" | "kit">;

export type DecorItem = {
  id: string;
  name: string;
  desc: string;
  tier: DecorTier;
  /** 积分兑换价（积分「个数」）。tier 为 points 时必填 */
  points?: number;
  /** 货币买断价（**单位：分**，与 Product.price 同口径）。points/buyout 档必填 */
  priceFen?: number;
  /** 视觉预览（用于素材卡片的小样） */
  preview: {
    background?: string;
    color?: string;
    border?: string;
    icon?: string;
    fontFamily?: string;
  };
  /** 渲染样式：直接内联到目标节点 */
  style: {
    background?: string;
    backgroundColor?: string;
    backgroundImage?: string;
    backgroundSize?: string;
    backgroundPosition?: string;
    color?: string;
    borderColor?: string;
    boxShadow?: string;
    fontFamily?: string;
    letterSpacing?: string;
    textShadow?: string;
    backdropFilter?: string;
    opacity?: number;
    /** 额外装饰层（做旧的纹理 / 光晕 / 纱幔等） */
    overlay?: string;
    /** 挂饰类素材的装饰节点（绝对定位，纯 CSS 绘制） */
    ornament?: OrnamentSpec;
  };
  /** 挂饰在馆内的默认摆放位置 */
  position?: "top" | "corner" | "bottom" | "surround";
  /**
   * 全页换肤增量（可选）。
   *
   * 不写时由 `lib/decor-skin.ts` 按 id 前缀**自动推断**（约定优于配置）——
   * 100+ 件素材逐件手写 12 个 token 既啰嗦又必然漏。
   * 这里只在"前缀推断猜不出这件素材的调子"时显式覆盖，且**只写要改的字段**。
   */
  skin?: Partial<SkinTokens>;
};

/** 挂饰：用纯 CSS / SVG 绘制的装饰元素 */
export type OrnamentSpec =
  | { kind: "lantern"; color: string; count?: number }
  | { kind: "couplet-pillar"; color: string; text?: string }
  | { kind: "curtain" ; color: string }
  | { kind: "flower" ; color: string }
  | { kind: "shelf"; color: string }
  | { kind: "halo"; color: string }
  | { kind: "plaque"; color: string; text: string }
  /**
   * 壁龛纪念墙：一整幅「实景纪念厅」场景（木格壁龛墙 + 长柜 + 灯柱 + 白菊 + 大理石地）。
   *
   * 注意：这里**不带遗像**。遗像属于业务数据（`hall.archive.portrait`）而非装修数据，
   * 若塞进 OrnamentSpec 会污染装修方案的归一化逻辑（且馆主未上传时无法兜底）。
   * 因此本 kind 只描述"空墙"，遗像由馆页用 `nicheCell()` 的百分比几何自行叠加上去。
   */
  | { kind: "niche-wall"; color: string }
  // -------------------------------------------------------------------------
  // 阶段 2（2026-10）新增：把"入门档与豪华档长得一样"这块短板补掉
  // -------------------------------------------------------------------------
  //
  // 新增 kind 的**判据**是「它在结构上就不是同一件器物」，而不是"换个颜色"：
  //   · imperial-lantern 有出檐与垂锦，素灯笼没有 —— 两种物件；
  //   · altar-table 是四足宽面的桌，incense-table 是独脚高挑的几 —— 两种家具；
  //   · plague-pair 是"一块匾 + 一对联"的**成组规制**，位置必须由渲染器锁定。
  // 只换 color 的一律不加 kind，否则档次差就退化成"换色"（这正是要修的毛病）。
  | { kind: "imperial-lantern"; color: string; count?: number }
  | { kind: "caisson-light"; color: string }
  | { kind: "altar-table"; color: string }
  | { kind: "incense-table"; color: string }
  | { kind: "vase"; color: string }
  | { kind: "candlestick"; color: string }
  | { kind: "plaque-pair"; color: string; text?: string }
  | { kind: "screen"; color: string }
  | { kind: "screen-wall"; color: string }
  | { kind: "scroll-painting"; color: string };

export type DecorTemplate = {
  id: string;
  name: string;
  desc: string;
  tier: DecorTier;
  /** 积分兑换价（个）。tier 为 points 时必填 */
  points?: number;
  /** 货币买断价（**分**）。points/buyout 档必填 */
  priceFen?: number;
  /** 标签，便于筛选展示 */
  tags: string[];
  /** 一键应用：直接指定 5 个槽位（挂饰为数组，模板可预设多件陈设） */
  slots: HallSlots;
  preview: {
    background: string;
    color: string;
    accent: string;
    icon: string;
  };
  /**
   * 3D 场景形态标识（见 lib/decor-3d.ts）。
   * 决定这套模板应用后，装修向导里的 3D 预览长成什么样子。
   * 缺省时用 `"classic"`。
   */
  space?: string;
  /**
   * 结构档位（见 lib/decor-3d.ts 的 `StructureTier`）。
   *
   * ⚠️ **与 `tier` 是两个维度，别混用**：
   *    `tier` 管"怎么付钱"（free / points / buyout / premium）；
   *    `structure` 管"装出来多豪华"（none / basic / grand / imperial）。
   *    **渲染层只认 `structure`**，绝不认 `tier` —— 否则高级订阅用户
   *    与买断用户看到的结构会不一样（同一份装修两种样子）。
   *
   * 缺省时不写，由渲染层按模板 `space` 的默认档位推导。
   */
  structure?: StructureTier;
  /** 全页换肤增量（可选；缺省按 id 推断，见 lib/decor-skin.ts） */
  skin?: Partial<SkinTokens>;
};

// ---------------------------------------------------------------------------
// 背景壁纸（wall）
// ---------------------------------------------------------------------------
export const WALLS: DecorItem[] = [
  {
    id: "wall-plain",
    name: "素白",
    desc: "纯净留白，庄重克制",
    tier: "points",
    points: 100,
    priceFen: 100,
    preview: { background: "#ffffff" },
    style: { backgroundColor: "#ffffff", backgroundImage: "none" },
  },
  {
    id: "wall-mist",
    name: "晨雾青",
    desc: "淡青渐层，清冷静谧",
    tier: "points",
    points: 150,
    priceFen: 150,
    preview: { background: "linear-gradient(180deg,#f1f5f7,#ffffff)" },
    style: { backgroundImage: "linear-gradient(180deg,#eef3f6 0%,#ffffff 60%)" },
  },
  {
    id: "wall-warm",
    name: "暖宣纸",
    desc: "米白泛黄，温润亲和 · 建馆赠品",
    tier: "free",
    preview: { background: "linear-gradient(180deg,#faf6ef,#fffdf8)" },
    style: {
      backgroundImage:
        "radial-gradient(circle at 20% 10%, rgba(168,116,79,0.07), transparent 55%), linear-gradient(180deg,#faf6ef 0%,#fffdf8 70%)",
    },
  },
  {
    id: "wall-night",
    name: "夜阑深青",
    desc: "深青夜色，肃穆安宁",
    tier: "points",
    points: 250,
    priceFen: 250,
    preview: { background: "linear-gradient(180deg,#1f2b33,#101820)", color: "#e9eef2" },
    style: {
      backgroundImage: "linear-gradient(180deg,#243139 0%,#131c22 100%)",
      color: "#e9eef2",
    },
  },
  {
    id: "wall-inkwash",
    name: "水墨远山",
    desc: "墨色晕染、远山留白，意境悠远",
    tier: "points",
    points: 300,
    priceFen: 300,
    preview: { background: "linear-gradient(180deg,#e8ecef,#fbfcfd)", icon: "🏔️" },
    style: {
      backgroundImage:
        "radial-gradient(ellipse 90% 45% at 50% 105%, rgba(45,58,66,0.30), transparent 62%), radial-gradient(ellipse 55% 32% at 18% 100%, rgba(58,74,84,0.22), transparent 60%), radial-gradient(ellipse 60% 34% at 84% 102%, rgba(58,74,84,0.20), transparent 60%), linear-gradient(180deg,#f2f5f7 0%,#ffffff 55%)",
      overlay:
        "repeating-linear-gradient(115deg, rgba(31,38,46,0.035) 0 2px, transparent 2px 9px)",
    },
  },
  {
    id: "wall-goldweave",
    name: "鎏金织锦",
    desc: "暗金织纹，华贵而不张扬",
    tier: "points",
    points: 500,
    priceFen: 500,
    preview: { background: "linear-gradient(135deg,#3a2c1e,#6b4f2a)", color: "#f2dfae", icon: "🧵" },
    style: {
      backgroundImage:
        "repeating-linear-gradient(45deg, rgba(212,175,105,0.10) 0 6px, transparent 6px 12px), repeating-linear-gradient(-45deg, rgba(212,175,105,0.08) 0 6px, transparent 6px 12px), linear-gradient(160deg,#2f2418 0%,#4a3823 50%,#2b2015 100%)",
      color: "#f4e7c8",
      textShadow: "0 1px 12px rgba(212,175,105,0.35)",
    },
  },
  {
    id: "wall-bamboo",
    name: "竹影摇风",
    desc: "疏影横斜，清风入室",
    tier: "points",
    points: 400,
    priceFen: 400,
    preview: { background: "linear-gradient(180deg,#eef3ea,#fbfdf9)", icon: "🎋" },
    style: {
      backgroundImage:
        "repeating-linear-gradient(96deg, rgba(76,110,74,0.16) 0 3px, transparent 3px 46px), repeating-linear-gradient(96deg, rgba(76,110,74,0.07) 0 9px, transparent 9px 46px), linear-gradient(180deg,#f0f5ec 0%,#fdfefb 70%)",
      overlay: "linear-gradient(180deg, transparent 60%, rgba(76,110,74,0.05))",
    },
  },
  {
    id: "wall-starry",
    name: "星河长明",
    desc: "深空星河，思念有光",
    tier: "premium",
    preview: { background: "radial-gradient(circle at 30% 20%, #2b3d55, #0b1119)", color: "#e6eefc", icon: "🌌" },
    style: {
      backgroundImage:
        "radial-gradient(1.6px 1.6px at 12% 22%, rgba(255,255,255,0.9), transparent 60%), radial-gradient(1.4px 1.4px at 38% 12%, rgba(255,255,255,0.75), transparent 60%), radial-gradient(1.8px 1.8px at 62% 30%, rgba(255,255,255,0.85), transparent 60%), radial-gradient(1.2px 1.2px at 82% 18%, rgba(255,255,255,0.7), transparent 60%), radial-gradient(1.5px 1.5px at 25% 62%, rgba(255,255,255,0.6), transparent 60%), radial-gradient(1.3px 1.3px at 72% 70%, rgba(255,255,255,0.55), transparent 60%), linear-gradient(180deg,#101a26 0%,#070b11 100%)",
      color: "#e6eefc",
    },
  },
  {
    id: "wall-lotuspond",
    name: "莲池月夜",
    desc: "莲开九品，接引往生（高级订阅）",
    tier: "premium",
    preview: { background: "radial-gradient(ellipse at 50% 80%, #2c4a44, #0f1a19)", color: "#e8f5ef", icon: "🪷" },
    style: {
      backgroundImage:
        "radial-gradient(ellipse 70% 40% at 50% 96%, rgba(122,196,173,0.22), transparent 65%), radial-gradient(ellipse 40% 26% at 22% 92%, rgba(122,196,173,0.14), transparent 62%), linear-gradient(180deg,#14211f 0%,#0c1413 100%)",
      color: "#e8f5ef",
    },
  },

  // -------------------------------------------------------------------------
  // 阶段 3 新增壁纸（2026-10）：补齐四档定价里的"入门 / 中档 / 豪华"三段
  // -------------------------------------------------------------------------
  //
  // 为什么旧壁纸不够用：改造前 9 张壁纸里，免费 1 张、积分 6 张（¥1–5）、
  // 高级订阅 2 张 —— **没有任何一件落在"中档 ¥15–39"与"豪华 ¥39–99"**。
  // 用户挑壁纸时看不到价格阶梯，自然也没有"再攒攒换好的"的动机。
  //
  // ⚠️ 一律不落 `free`：免费集合必须与赠品模板零件**集合相等**
  //    （见 GRANTED_TEMPLATE_PARTS），多一件免费品断言就变红。
  {
    id: "wall-inklandscape",
    name: "青绿山水",
    desc: "石青石绿敷染的远山层峦，云气缭绕其间。入门之选，已见山意。",
    tier: "buyout",
    priceFen: 1600,
    points: 1600,
    preview: { background: "linear-gradient(180deg,#8fb4a8,#e8f0e4)", icon: "🏞️" },
    style: {
      backgroundImage:
        "radial-gradient(ellipse 70% 38% at 22% 100%, rgba(46,94,82,0.42), transparent 66%), radial-gradient(ellipse 55% 30% at 62% 102%, rgba(58,112,96,0.34), transparent 64%), radial-gradient(ellipse 42% 22% at 88% 100%, rgba(46,94,82,0.26), transparent 62%), radial-gradient(ellipse 90% 26% at 50% 4%, rgba(180,208,196,0.55), transparent 70%), linear-gradient(180deg,#dfeae0 0%,#f4f8f0 62%)",
      color: "#26443c",
      overlay:
        "repeating-linear-gradient(112deg, rgba(38,68,60,0.030) 0 2px, transparent 2px 10px)",
    },
  },
  {
    id: "wall-marble-veined",
    name: "汉白玉纹",
    desc: "白玉底色上走银灰石脉，清冷莹润。中档之始，贵气不喧。",
    tier: "buyout",
    priceFen: 1800,
    points: 1800,
    preview: { background: "linear-gradient(135deg,#f6f7f5,#d7dcd8)", icon: "🤍" },
    style: {
      backgroundImage:
        "radial-gradient(ellipse 60% 22% at 24% 26%, rgba(160,172,168,0.34), transparent 68%), radial-gradient(ellipse 40% 16% at 72% 62%, rgba(160,172,168,0.26), transparent 66%), radial-gradient(ellipse 34% 14% at 46% 84%, rgba(150,164,158,0.22), transparent 64%), linear-gradient(170deg,#fbfcfa 0%,#e3e7e3 100%)",
      color: "#2f3a36",
      overlay:
        "repeating-linear-gradient(64deg, rgba(120,134,128,0.055) 0 1px, transparent 1px 24px)",
    },
  },
  {
    id: "wall-vermilion-lacquer",
    name: "朱漆描金",
    desc: "大漆朱红、描金云纹，堂上一亮，气象立刻不同。",
    tier: "buyout",
    priceFen: 2900,
    points: 2900,
    preview: { background: "linear-gradient(180deg,#a8291f,#63130e)", color: "#fbe8c8", icon: "🟥" },
    style: {
      backgroundImage:
        "radial-gradient(circle at 50% -6%, rgba(255,214,140,0.30), transparent 58%), repeating-linear-gradient(45deg, rgba(255,208,128,0.055) 0 7px, transparent 7px 14px), repeating-linear-gradient(-45deg, rgba(255,208,128,0.045) 0 7px, transparent 7px 14px), linear-gradient(180deg,#a82a20 0%,#5d120d 100%)",
      color: "#fbeacb",
      textShadow: "0 1px 3px rgba(0,0,0,0.5)",
    },
  },
  {
    id: "wall-starfield-deep",
    name: "银河深处",
    desc: "比星河更深的夜，星尘成带状横贯，思念有光。",
    tier: "buyout",
    priceFen: 4900,
    points: 4900,
    preview: { background: "radial-gradient(circle at 30% 20%, #3a4f78, #060a12)", color: "#e8eefc", icon: "🌠" },
    style: {
      backgroundImage:
        "radial-gradient(ellipse 120% 16% at 52% 44%, rgba(150,178,236,0.20), transparent 70%), radial-gradient(1.8px 1.8px at 10% 18%, rgba(255,255,255,0.95), transparent 60%), radial-gradient(1.5px 1.5px at 30% 40%, rgba(255,255,255,0.8), transparent 60%), radial-gradient(2px 2px at 54% 12%, rgba(255,255,255,0.9), transparent 60%), radial-gradient(1.4px 1.4px at 70% 34%, rgba(255,255,255,0.75), transparent 60%), radial-gradient(1.7px 1.7px at 88% 22%, rgba(255,255,255,0.85), transparent 60%), radial-gradient(1.3px 1.3px at 20% 66%, rgba(255,255,255,0.6), transparent 60%), radial-gradient(1.6px 1.6px at 46% 76%, rgba(255,255,255,0.55), transparent 60%), radial-gradient(1.4px 1.4px at 80% 70%, rgba(255,255,255,0.5), transparent 60%), linear-gradient(180deg,#0d1524 0%,#05080e 100%)",
      color: "#e8eefc",
    },
  },
  {
    id: "wall-brocade-gold",
    name: "缂丝金龙",
    desc: "缂丝为底、金龙盘绕，通体织金。一室之内，鱼龙变化。",
    tier: "buyout",
    priceFen: 5900,
    points: 5900,
    preview: { background: "linear-gradient(135deg,#3b2a12,#8a6320)", color: "#ffeec2", icon: "🐉" },
    style: {
      backgroundImage:
        "radial-gradient(ellipse 46% 60% at 50% 46%, rgba(255,228,150,0.20), transparent 68%), repeating-linear-gradient(38deg, rgba(226,186,102,0.13) 0 5px, transparent 5px 11px), repeating-linear-gradient(-38deg, rgba(226,186,102,0.10) 0 5px, transparent 5px 11px), repeating-linear-gradient(0deg, rgba(255,236,180,0.05) 0 2px, transparent 2px 9px), linear-gradient(165deg,#3b2a12 0%,#6d4d1c 48%,#33230e 100%)",
      color: "#ffeec6",
      textShadow: "0 1px 14px rgba(226,186,102,0.45)",
    },
  },
  {
    id: "wall-imperial-gold",
    name: "鎏金满堂",
    desc: "四壁通体鎏金，光线所至尽作金波。至尊之选。",
    tier: "buyout",
    priceFen: 8800,
    points: 8800,
    preview: { background: "linear-gradient(180deg,#f5da8c,#8a6512)", color: "#3a2905", icon: "👑" },
    style: {
      backgroundImage:
        "radial-gradient(ellipse 70% 34% at 50% -8%, rgba(255,254,232,0.70), transparent 62%), repeating-linear-gradient(45deg, rgba(255,255,255,0.09) 0 9px, transparent 9px 18px), repeating-linear-gradient(-45deg, rgba(120,86,10,0.06) 0 9px, transparent 9px 18px), linear-gradient(180deg,#f7dd93 0%,#c8a13a 52%,#8d660f 100%)",
      color: "#3d2c06",
      textShadow: "0 1px 0 rgba(255,255,255,0.45)",
    },
  },
];

// ---------------------------------------------------------------------------
// 地面/地纹（floor）
// ---------------------------------------------------------------------------
export const FLOORS: DecorItem[] = [
  {
    id: "floor-none",
    name: "无",
    desc: "不做地面处理",
    tier: "points",
    points: 0,
    priceFen: 0,
    preview: { background: "transparent" },
    style: {},
  },
  {
    id: "floor-marble",
    name: "素灰石",
    desc: "浅灰石面，稳重大方 · 建馆赠品",
    tier: "free",
    preview: { background: "linear-gradient(90deg,#e6e9ec 0 8px,#f2f4f6 8px 16px)" },
    style: {
      backgroundImage:
        "repeating-linear-gradient(90deg, rgba(159,167,175,0.30) 0 1px, transparent 1px 56px), linear-gradient(180deg, rgba(230,233,236,0.9), rgba(242,244,246,0.55))",
    },
  },
  {
    id: "floor-brick",
    name: "青石砖",
    desc: "错缝青砖，古意盎然",
    tier: "points",
    points: 180,
    priceFen: 180,
    preview: { background: "repeating-linear-gradient(0deg,#dbe0e4 0 6px,#e9edf0 6px 12px)" },
    style: {
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(140,150,158,0.35) 0 1px, transparent 1px 22px), repeating-linear-gradient(90deg, rgba(140,150,158,0.28) 0 1px, transparent 1px 44px), linear-gradient(180deg,#e4e8eb,#eff2f4)",
    },
  },
  {
    id: "floor-wood",
    name: "金丝楠木",
    desc: "原木地板，温暖厚重",
    tier: "points",
    points: 200,
    priceFen: 200,
    preview: { background: "repeating-linear-gradient(90deg,#b98d55 0 14px,#a97e49 14px 28px)" },
    style: {
      backgroundImage:
        "repeating-linear-gradient(90deg, rgba(90,60,28,0.22) 0 1px, transparent 1px 38px), linear-gradient(180deg,#c59b62,#ad8250)",
    },
  },
  {
    id: "floor-cloud",
    name: "云纹地毯",
    desc: "祥云暗纹，肃穆而不失暖意",
    tier: "points",
    points: 350,
    priceFen: 350,
    preview: { background: "radial-gradient(circle at 30% 50%, #8f7a9a, #4a3f52)", icon: "☁️" },
    style: {
      backgroundImage:
        "radial-gradient(ellipse 40% 40% at 20% 50%, rgba(255,255,255,0.10), transparent 70%), radial-gradient(ellipse 40% 40% at 70% 40%, rgba(255,255,255,0.08), transparent 70%), linear-gradient(180deg,#5b5064,#3f3749)",
    },
  },

  // -------------------------------------------------------------------------
  // 阶段 3 新增地面（2026-10）：旧地面最高只到 ¥3.5 的云纹毯，
  // 需要"金砖 / 汉白玉 / 织锦 / 云锦"把中高档地面补齐。
  // -------------------------------------------------------------------------
  {
    id: "floor-marble-veined",
    name: "汉白玉地",
    desc: "白玉铺地、石脉隐现，清冷莹润。与汉白玉纹墙面成套。",
    tier: "buyout",
    priceFen: 1800,
    points: 1800,
    preview: { background: "linear-gradient(180deg,#f2f4f1,#d3d9d4)" },
    style: {
      backgroundImage:
        "repeating-linear-gradient(90deg, rgba(150,164,158,0.26) 0 1px, transparent 1px 58px), repeating-linear-gradient(0deg, rgba(150,164,158,0.22) 0 1px, transparent 1px 44px), linear-gradient(180deg,#f6f8f5,#dfe4e0)",
    },
  },
  {
    id: "floor-goldbrick",
    name: "金砖墁地",
    desc: "御窑金砖，光可鉴人，落影成双。中档地面的正选。",
    tier: "buyout",
    priceFen: 2900,
    points: 2900,
    preview: { background: "repeating-linear-gradient(90deg,#7d6f52 0 1px,#504832 1px 46px)" },
    style: {
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(255,232,176,0.11) 0 1px, transparent 1px 40px), repeating-linear-gradient(90deg, rgba(255,232,176,0.10) 0 1px, transparent 1px 66px), radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,236,190,0.16), transparent 70%), linear-gradient(180deg,#84765a,#483f2c)",
    },
  },
  {
    id: "floor-brocade",
    name: "织锦铺地",
    desc: "满地织金团花，行走其上如踏锦绣。豪华之选。",
    tier: "buyout",
    priceFen: 5900,
    points: 5900,
    preview: { background: "repeating-linear-gradient(45deg,#9c2620 0 7px,#d8b25c 7px 14px)" },
    style: {
      backgroundImage:
        "radial-gradient(circle at 22% 34%, rgba(255,226,160,0.30) 0 7%, transparent 8%), radial-gradient(circle at 72% 28%, rgba(255,226,160,0.24) 0 6%, transparent 7%), radial-gradient(circle at 48% 76%, rgba(255,226,160,0.26) 0 7%, transparent 8%), repeating-linear-gradient(45deg, rgba(255,222,150,0.13) 0 8px, transparent 8px 17px), repeating-linear-gradient(-45deg, rgba(255,222,150,0.10) 0 8px, transparent 8px 17px), linear-gradient(180deg,#a02a24,#5e1613)",
    },
  },
  {
    id: "floor-cloudsilk",
    name: "云锦铺陈",
    desc: "云锦满地、金线走边，一步一景。与鎏金满堂同气。",
    tier: "buyout",
    priceFen: 8800,
    points: 8800,
    preview: { background: "repeating-linear-gradient(0deg,#c8a349 0 1px,#8b6a1c 1px 34px)" },
    style: {
      backgroundImage:
        "radial-gradient(ellipse 34% 22% at 18% 62%, rgba(255,246,206,0.34), transparent 70%), radial-gradient(ellipse 30% 20% at 56% 30%, rgba(255,246,206,0.28), transparent 68%), radial-gradient(ellipse 32% 22% at 84% 68%, rgba(255,246,206,0.26), transparent 68%), repeating-linear-gradient(90deg, rgba(255,240,190,0.10) 0 1px, transparent 1px 52px), repeating-linear-gradient(0deg, rgba(255,240,190,0.09) 0 1px, transparent 1px 38px), linear-gradient(180deg,#d6b055,#8a6716)",
    },
  },
];

// ---------------------------------------------------------------------------
// 挂饰/陈设（ornament）
// ---------------------------------------------------------------------------
export const ORNAMENTS: DecorItem[] = [
  {
    id: "orn-none",
    name: "无",
    desc: "不加挂饰",
    tier: "points",
    points: 0,
    priceFen: 0,
    preview: { background: "transparent" },
    style: {},
  },
  {
    id: "orn-lantern-red",
    name: "素灯笼",
    desc: "一对白纱灯笼，引路长明",
    tier: "points",
    points: 220,
    priceFen: 220,
    position: "top",
    preview: { background: "#f5efe4", icon: "🏮" },
    style: { ornament: { kind: "lantern", color: "#e8e1d3", count: 2 } },
  },
  {
    id: "orn-flower-white",
    name: "白菊一束",
    desc: "素菊寄思，清简庄重",
    tier: "points",
    points: 160,
    priceFen: 160,
    position: "corner",
    preview: { background: "#eef1ee", icon: "🌼" },
    style: { ornament: { kind: "flower", color: "#dfe6de" } },
  },
  {
    id: "orn-shelf",
    name: "供几案台",
    desc: "一处陈设，可供香烛花果",
    tier: "points",
    points: 260,
    priceFen: 260,
    position: "bottom",
    preview: { background: "#e9e2d6", icon: "🪵" },
    style: { ornament: { kind: "shelf", color: "#8a6a45" } },
  },
  {
    id: "orn-lantern-gold",
    name: "宫灯垂锦",
    desc: "六角宫灯配流苏，仪门生辉",
    tier: "points",
    points: 250,
    priceFen: 250,
    position: "top",
    preview: { background: "#4a3418", color: "#f0d79a", icon: "🏮" },
    style: { ornament: { kind: "lantern", color: "#f0d79a", count: 3 } },
  },
  {
    id: "orn-curtain",
    name: "素纱幔帐",
    desc: "垂纱成幔，静穆含情",
    tier: "points",
    points: 300,
    priceFen: 300,
    position: "surround",
    preview: { background: "#f3f1ec", icon: "🎏" },
    style: { ornament: { kind: "curtain", color: "#efe9dd" } },
  },
  {
    id: "orn-pillar",
    name: "楹联漆柱",
    desc: "朱漆立柱，撑起门庭气度",
    tier: "points",
    points: 450,
    priceFen: 450,
    position: "surround",
    preview: { background: "#7a2f26", color: "#f5e2b8", icon: "🏛️" },
    style: { ornament: { kind: "couplet-pillar", color: "#8c3a2e" } },
  },
  {
    id: "orn-halo",
    name: "金顶光晕",
    desc: "遗像之上的柔光，如沐天光（高级订阅）",
    tier: "premium",
    position: "top",
    preview: { background: "radial-gradient(circle, #f6d97a, #7a5a18)", icon: "✨" },
    style: { ornament: { kind: "halo", color: "#f6d97a" } },
  },
  {
    id: "orn-plaque",
    name: "神龛匾额",
    desc: "鎏金匾额悬于堂上（高级订阅）",
    tier: "premium",
    position: "top",
    preview: { background: "linear-gradient(90deg,#3a2c1e,#7a5a2a)", color: "#f6e3ae", icon: "🪧" },
    style: { ornament: { kind: "plaque", color: "#c9a961", text: "永怀" } },
  },
  {
    /*
      壁龛纪念墙：整幅实景场景，遗像随之安奉于墙面正中偏上的壁龛中。
      作为免费素材 —— 它是"实景感"的门面担当，而非奢华款，
      与项目「普通的免费，精美的收费」的既有原则一致。
    */
    id: "orn-niche-wall",
    name: "壁龛纪念墙",
    desc: "木格壁龛、长明灯柱、白菊寄思，遗像安奉于墙面正中 · 建馆赠品",
    tier: "free",
    position: "surround",
    preview: { background: "linear-gradient(180deg,#cdbca0,#9c8870)", color: "#3a2c1e", icon: "🕯️" },
    style: { ornament: { kind: "niche-wall", color: "#c9b393" } },
  },
  // -------------------------------------------------------------------------
  // 阶段 2 新增挂饰（2026-10）：补齐"入门档与豪华档长得一样"这一档空档
  // -------------------------------------------------------------------------
  //
  // 定价口径沿用户已确认的四段：入门 ¥5–15 / 中档 ¥15–39 / 豪华 ¥39–99。
  // ⚠️ 这里**一律不落 `free`**：免费集合必须与建馆赠品模板的零件**集合相等**
  //    （见 GRANTED_TEMPLATE_PARTS），多一件免费品就会让
  //    `verify-decor-3d.mjs` 的集合相等断言变红。
  {
    id: "orn-imperial-lantern",
    name: "六角宫灯",
    desc: "重檐出挑、垂锦五缕，仪门生辉",
    tier: "buyout",
    priceFen: 2900,
    points: 2900,
    position: "top",
    preview: { background: "linear-gradient(180deg,#4a3418,#241a0c)", color: "#f0d79a", icon: "🏮" },
    style: { ornament: { kind: "imperial-lantern", color: "#f0d79a", count: 2 } },
  },
  {
    id: "orn-plaque-pair",
    name: "匾联一堂",
    desc: "鎏金匾额居中，朱漆楹联分列两侧 —— 堂上规制",
    tier: "buyout",
    priceFen: 5900,
    points: 5900,
    position: "top",
    preview: { background: "linear-gradient(90deg,#2a1c10,#7a5a2a)", color: "#f6e3ae", icon: "🪧" },
    style: { ornament: { kind: "plaque-pair", color: "#c9a961", text: "祖德流芳" } },
  },
  {
    id: "orn-altar-table",
    name: "束腰供桌",
    desc: "马蹄四足、卷云牙板，四时供奉",
    tier: "buyout",
    priceFen: 1900,
    points: 1900,
    position: "bottom",
    preview: { background: "linear-gradient(180deg,#7a5230,#4a3018)", icon: "🪑" },
    style: { ornament: { kind: "altar-table", color: "#7a5230" } },
  },
  {
    id: "orn-incense-table",
    name: "三弯腿香几",
    desc: "独脚高挑，宜置香炉花瓶",
    tier: "buyout",
    priceFen: 1200,
    points: 1200,
    position: "bottom",
    preview: { background: "linear-gradient(180deg,#8a6a45,#5a4028)", icon: "🪵" },
    style: { ornament: { kind: "incense-table", color: "#8a6a45" } },
  },
  {
    id: "orn-vase",
    name: "青瓷花瓶",
    desc: "颈腹足三段，一枝清供",
    tier: "buyout",
    priceFen: 900,
    points: 900,
    position: "bottom",
    preview: { background: "linear-gradient(180deg,#dce8e0,#8ea89a)", icon: "🏺" },
    style: { ornament: { kind: "vase", color: "#9ac0b0" } },
  },
  {
    id: "orn-candlestick",
    name: "描金烛台",
    desc: "一对烛台，长明不熄",
    tier: "buyout",
    priceFen: 800,
    points: 800,
    position: "bottom",
    preview: { background: "linear-gradient(180deg,#f7e6a8,#8a6a18)", icon: "🕯️" },
    style: { ornament: { kind: "candlestick", color: "#c9a961" } },
  },
  {
    id: "orn-screen",
    name: "四扇折屏",
    desc: "绢面折屏，堂内分隔",
    tier: "buyout",
    priceFen: 2600,
    points: 2600,
    position: "bottom",
    preview: { background: "linear-gradient(180deg,#6a5238,#3a2a18)", icon: "🚪" },
    style: { ornament: { kind: "screen", color: "#7a5a33" } },
  },
  {
    id: "orn-screen-wall",
    name: "青砖影壁",
    desc: "山门照壁，回纹壁心",
    tier: "buyout",
    priceFen: 3600,
    points: 3600,
    position: "bottom",
    preview: { background: "linear-gradient(180deg,#9aa0a6,#5e584e)", icon: "🧱" },
    style: { ornament: { kind: "screen-wall", color: "#8b9098" } },
  },
  {
    id: "orn-scroll-painting",
    name: "山海图挂轴",
    desc: "一对挂轴，远山云水",
    tier: "buyout",
    priceFen: 1500,
    points: 1500,
    position: "surround",
    preview: { background: "linear-gradient(180deg,#e8e6dc,#8a9aa8)", icon: "🖼️" },
    style: { ornament: { kind: "scroll-painting", color: "#7a8a98" } },
  },

  // -------------------------------------------------------------------------
  // 阶段 3 新增挂饰（2026-10）：把"器物质感"的价格阶梯补齐
  // -------------------------------------------------------------------------
  //
  // 阶段 2 的 6 件新挂饰集中在 ¥8–59，最低那件（烛台 ¥8）也还不算"入门"。
  // 这里补 4 件 ¥5–18 的入门器物 + 4 件豪华整组，让 ¥5–15 段也有东西可挑。
  {
    id: "orn-bowl",
    name: "白瓷供碗",
    desc: "一对素白供碗，碗口微撇。最简的清供，入门之选。",
    tier: "buyout",
    priceFen: 500,
    points: 500,
    position: "bottom",
    preview: { background: "linear-gradient(180deg,#fbfbf9,#d5d8d4)", icon: "🥣" },
    style: { ornament: { kind: "vase", color: "#e2e6e0" } },
  },
  {
    id: "orn-tray",
    name: "铜盘果供",
    desc: "黄铜果盘，盛四时鲜果。小小一件，案上便有了活气。",
    tier: "buyout",
    priceFen: 800,
    points: 800,
    position: "bottom",
    preview: { background: "linear-gradient(180deg,#e8cf8a,#8a6a1c)", icon: "🍊" },
    style: { ornament: { kind: "incense-table", color: "#b08a34" } },
  },
  {
    id: "orn-tall-candlestick",
    name: "素铜烛台",
    desc: "一对素铜烛台，不描金也端正。入门档的稳妥选择。",
    tier: "buyout",
    priceFen: 1200,
    points: 1200,
    position: "bottom",
    preview: { background: "linear-gradient(180deg,#d8cbb0,#7a6a4a)", icon: "🕯️" },
    style: { ornament: { kind: "candlestick", color: "#c0b090" } },
  },
  {
    id: "orn-bookcase",
    name: "博古架",
    desc: "多宝格一架，可陈书可置器。读书人家的堂上常客。",
    tier: "buyout",
    priceFen: 1800,
    points: 1800,
    position: "bottom",
    preview: { background: "linear-gradient(180deg,#8a6a45,#4a3018)", icon: "🗄️" },
    style: { ornament: { kind: "shelf", color: "#8a6a45" } },
  },
  {
    id: "orn-caisson-lamp",
    name: "藻井长明灯",
    desc: "自藻井中心垂下的长明灯，灯光自上洒落，满堂生辉。",
    tier: "buyout",
    priceFen: 4900,
    points: 4900,
    position: "top",
    preview: { background: "linear-gradient(180deg,#f7e6a8,#5a3d08)", icon: "💡" },
    style: { ornament: { kind: "caisson-light", color: "#f0d79a" } },
  },
  {
    id: "orn-tang-scroll",
    name: "中堂立轴",
    desc: "大幅立轴悬于正壁，两侧配小轴。堂有书画，主人不俗。",
    tier: "buyout",
    priceFen: 2900,
    points: 2900,
    position: "surround",
    preview: { background: "linear-gradient(180deg,#f0ece2,#7a8a98)", icon: "📜" },
    style: { ornament: { kind: "scroll-painting", color: "#8a7a62" } },
  },
  {
    id: "orn-sixfold-screen",
    name: "六扇曲屏",
    desc: "六扇绢面曲屏，折出内外。一屏之隔，境界两分。",
    tier: "buyout",
    priceFen: 3900,
    points: 3900,
    position: "bottom",
    preview: { background: "linear-gradient(180deg,#7a5a33,#33230e)", icon: "🪟" },
    style: { ornament: { kind: "screen", color: "#8a6a3e" } },
  },
  {
    id: "orn-gilt-vase-pair",
    name: "鎏金花瓶一对",
    desc: "一对鎏金大瓶分立供桌左右，插时令花枝。堂上聚气。",
    tier: "buyout",
    priceFen: 3600,
    points: 3600,
    position: "bottom",
    preview: { background: "linear-gradient(180deg,#f8e7ac,#8a6512)", icon: "🏺" },
    style: { ornament: { kind: "vase", color: "#d4af37" } },
  },
];

// ---------------------------------------------------------------------------
// 遗像相框（frame）
// ---------------------------------------------------------------------------
export const FRAMES: DecorItem[] = [
  {
    id: "frame-none",
    name: "无框",
    desc: "简洁直呈",
    tier: "points",
    points: 0,
    priceFen: 0,
    preview: { border: "1px solid #e5e7eb" },
    style: {},
  },
  {
    id: "frame-line",
    name: "素线框",
    desc: "细线描边，克制干净",
    tier: "points",
    points: 120,
    priceFen: 120,
    preview: { border: "1px solid #2c3540" },
    style: { borderColor: "#2c3540", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" },
  },
  {
    id: "frame-double",
    name: "回纹双线",
    desc: "双线套框，中式传统",
    tier: "points",
    points: 180,
    priceFen: 180,
    preview: { border: "3px double #4a5868" },
    style: { borderColor: "#4a5868", boxShadow: "0 0 0 1px rgba(74,88,104,0.35) inset, 0 2px 6px rgba(0,0,0,0.10)" },
  },
  {
    id: "frame-wood",
    name: "实木相框",
    desc: "深色木纹边框，厚重温润",
    tier: "points",
    points: 150,
    preview: { border: "8px solid #7a5a33" },
    style: {
      borderColor: "#7a5a33",
      boxShadow:
        "0 0 0 2px #5a4023 inset, 0 0 0 1px rgba(255,255,255,0.15) inset, 0 6px 18px rgba(0,0,0,0.22)",
    },
  },
  {
    id: "frame-bronze",
    name: "青铜卷草",
    desc: "青铜色泽，卷草纹饰",
    tier: "points",
    points: 300,
    preview: { border: "6px solid #6f7a52" },
    style: {
      borderColor: "#78845a",
      boxShadow:
        "0 0 0 3px #4e5738 inset, 0 0 24px rgba(120,132,90,0.45), 0 8px 20px rgba(0,0,0,0.25)",
    },
  },
  {
    id: "frame-gold",
    name: "鎏金雕花",
    desc: "鎏金满雕，华彩庄重 · 建馆赠品",
    /*
      档位为 free 而不是 premium：tpl-niche（建馆赠品）的 frame 槽用的就是它。
      赠品模板的零件必须全部免费，否则用户建完馆看到的遗像框上挂着一把锁
      ——「赠送一套模板」直接沦为半成品。见 GRANTED_TEMPLATE_PARTS 的说明。
    */
    tier: "free",
    preview: { border: "8px solid #c9a961" },
    style: {
      borderColor: "#c9a961",
      boxShadow:
        "0 0 0 3px #8a6d2f inset, 0 0 0 1px rgba(255,255,255,0.35) inset, 0 0 34px rgba(201,169,97,0.55), 0 10px 26px rgba(0,0,0,0.28)",
    },
  },

  // -------------------------------------------------------------------------
  // 阶段 3 新增相框（2026-10）：旧相框最贵只到 ¥3 的青铜卷草，
  // 而 frame-gold（鎏金雕花）是赠品零件、永远免费 —— 于是"好框"这一栏
  // 出现了倒挂：赠品的框比能买到的框都气派。补两件中高档把阶梯接上。
  // -------------------------------------------------------------------------
  {
    id: "frame-brocade",
    name: "织锦框",
    desc: "锦缎包边、金线走框，与织锦铺地、缂丝墙面成一套。",
    tier: "buyout",
    priceFen: 2900,
    points: 2900,
    preview: { border: "9px solid #a8322c" },
    style: {
      borderColor: "#a8322c",
      boxShadow:
        "0 0 0 3px #d8b25c inset, 0 0 0 1px rgba(255,236,180,0.45) inset, 0 0 26px rgba(216,178,92,0.45), 0 9px 24px rgba(0,0,0,0.3)",
    },
  },
  {
    id: "frame-imperial",
    name: "御制雕龙",
    desc: "满雕云龙、通体赤金，框上压框。给最重要的那一张像。",
    tier: "buyout",
    priceFen: 5900,
    points: 5900,
    preview: { border: "11px double #e2bc60" },
    style: {
      borderColor: "#e2bc60",
      boxShadow:
        "0 0 0 4px #8a6512 inset, 0 0 0 7px #f8e7ac inset, 0 0 0 1px rgba(255,255,255,0.5) inset, 0 0 42px rgba(226,188,96,0.68), 0 12px 30px rgba(0,0,0,0.36)",
    },
  },
];

// ---------------------------------------------------------------------------
// 字体风格（font）
// ---------------------------------------------------------------------------
export const FONTS: DecorItem[] = [
  {
    id: "font-modern",
    name: "现代黑体",
    desc: "清晰易读，适合长文",
    tier: "points",
    points: 100,
    priceFen: 100,
    preview: { fontFamily: "system-ui", color: "#1f262e" },
    style: { fontFamily: "'PingFang SC','Microsoft YaHei',system-ui,sans-serif" },
  },
  {
    id: "font-serif",
    name: "宋体书卷",
    desc: "衬线书卷气，稳重典雅 · 建馆赠品",
    tier: "free",
    preview: { fontFamily: "serif", color: "#1f262e" },
    style: { fontFamily: "'Songti SC','SimSun',Georgia,serif" },
  },
  {
    id: "font-kai",
    name: "楷体手书",
    desc: "楷意温润，如亲笔手书",
    tier: "points",
    points: 200,
    preview: { fontFamily: "KaiTi", color: "#1f262e" },
    style: { fontFamily: "'Kaiti SC','KaiTi','STKaiti',serif", letterSpacing: "0.02em" },
  },
  {
    id: "font-fangsong",
    name: "仿宋碑铭",
    desc: "碑铭意味，清瘦端正",
    tier: "points",
    points: 250,
    preview: { fontFamily: "FangSong", color: "#1f262e" },
    style: { fontFamily: "'FangSong','STFangsong',serif", letterSpacing: "0.05em" },
  },
  {
    id: "font-brush",
    name: "宗师翰墨",
    desc: "行楷笔意，风骨自成（高级订阅）",
    tier: "premium",
    preview: { fontFamily: "cursive", color: "#1f262e" },
    style: {
      fontFamily: "'STXingkai','Xingkai SC','KaiTi',cursive",
      letterSpacing: "0.06em",
      textShadow: "0 1px 0 rgba(0,0,0,0.06)",
    },
  },

  // -------------------------------------------------------------------------
  // 阶段 3 新增字体（2026-10）：旧字体最高只到 ¥2.5 的仿宋碑铭，
  // 而 font-brush（宗师翰墨）是高级订阅 —— 中间那一段完全没有东西。
  // -------------------------------------------------------------------------
  {
    id: "font-lishu",
    name: "隶书碑刻",
    desc: "蚕头燕尾、一波三折，如读汉碑。字距疏朗，肃穆自生。",
    tier: "buyout",
    priceFen: 1800,
    points: 1800,
    preview: { fontFamily: "LiSu", color: "#1f262e" },
    style: {
      fontFamily: "'LiSu','STLiti','Noto Serif SC',serif",
      letterSpacing: "0.12em",
      textShadow: "0 1px 1px rgba(0,0,0,0.16)",
    },
  },
  {
    id: "font-imperial-brush",
    name: "御笔题额",
    desc: "如御笔亲题匾额，笔画开张、气度自足。堂上题名宜用此体。",
    tier: "buyout",
    priceFen: 2900,
    points: 2900,
    preview: { fontFamily: "cursive", color: "#1f262e" },
    style: {
      fontFamily: "'STXingkai','Xingkai SC','KaiTi',cursive",
      letterSpacing: "0.16em",
      textShadow: "0 2px 4px rgba(0,0,0,0.16), 0 0 10px rgba(201,169,97,0.28)",
    },
  },
];

// ---------------------------------------------------------------------------
// 整套模板（template）
// ---------------------------------------------------------------------------

/**
 * 各空间形态的**默认结构档位**。
 *
 * ⚠️ 这张表必须与 `lib/decor-3d.ts` 的 `SPACES[key].structureTier` 保持一致 ——
 *    它是"给旧模板补 `structure` 时该补几档"的依据。两边漂移会让
 *    `verify-decor-pricing-v2.mjs` 的"同 space 内档位不得低于空间默认"断言误报。
 *
 * 为什么要有这张表（不能直接从 decor-3d.ts import `space3d()`）：
 *    hall-decor.ts 是**数据层**，decor-3d.ts 是**表现层**。让数据层反向依赖
 *    表现层，等于把"装修内容"焊死在"当前渲染引擎"上 —— 以后换 WebGL 时，
 *    装修数据要跟着改。这里只抄一份**档位**（一个字符串），耦合面最小。
 */
export const SPACE_DEFAULT_TIER: Record<string, StructureTier> = {
  classic: "basic",
  niche: "basic",
  shrine: "grand",
  courtyard: "grand",
  gate: "grand",
  hall: "grand",
  pond: "basic",
  starfield: "none",
};

/**
 * 取某套模板的**实际结构档位**：模板自己声明的优先，否则用空间的默认档。
 *
 * 这是"价格升序 → 档次单调不降"断言的唯一取值口径 ——
 * 若各处各写一遍 `tpl.structure ?? SPACE_DEFAULT_TIER[tpl.space ?? "classic"]`，
 * 迟早有一处忘了兜底，断言就会在"模板没写 structure"时静默放过。
 */
export function templateStructure(tpl: DecorTemplate): StructureTier {
  return tpl.structure ?? SPACE_DEFAULT_TIER[tpl.space ?? "classic"] ?? "basic";
}

/**
 * 纪念馆「深色底」判定 —— 与宗祠的 `isClanDarkDecor` 同构。
 *
 * ⚠️ 这是**并存灰度**里的旧口径（硬编码 id 列表），新口径是 `skin.dark`
 *    （由素材自己声明）。两者覆盖的素材不完全重合，所以页面上取**并集**：
 *    宁可多判几个深色（最坏是多一层浅字），也不要漏判（漏判是"字看不见"）。
 *
 * 为什么提成函数：原先这段列表内联在公页里，控制台/预览要用就得再抄一份 ——
 * 而"同一件事两个实现"正是本阶段反复抓到的病（判定源分叉）。
 * 现在**只有这一处**，公页与控制台共用。
 */
export const HALL_DARK_WALLS = [
  "wall-night",
  "wall-goldweave",
  "wall-starry",
  "wall-lotuspond",
];

export function isHallDarkDecor(decor: HallDecor): boolean {
  return HALL_DARK_WALLS.includes(decor.slots.wall);
}

/** 取某套模板的货币价（分）。用于价格升序排序与档位区间校验 */
export function templatePriceFen(tpl: DecorTemplate): number {
  return tpl.priceFen ?? tpl.points ?? 0;
}

export const TEMPLATES: DecorTemplate[] = [
  {
    id: "tpl-plain",
    name: "素朴",
    desc: "白墙素线，干干净净。最克制的一套，适合一切场合。",
    tier: "points",
    points: 600,
    priceFen: 600,
    tags: ["积分", "简约", "通用"],
    slots: { wall: "wall-plain", floor: "floor-none", ornament: ["orn-none"], frame: "frame-line", font: "font-modern" },
    preview: { background: "#ffffff", color: "#1f262e", accent: "#4a5868", icon: "◻️" },
    /*
      入门档补 space：旧模板不写 space 就回落 classic（2 柱 + 1 枋），
      而 classic 也是**免费赠品**壁龛墙以外的兜底形态 —— 于是"花钱买的入门模板"
      与"没装修的样子"在 3D 里几乎分辨不出来，用户感受是"花了钱没变化"。
      pond 是"无建筑构件、靠光与纵深造境"的形态（1 对柱 + 卷棚顶），
      与素白留白的调子最合，又明确**不同于** classic。
    */
    space: "pond",
  },
  {
    id: "tpl-paper",
    name: "宣纸",
    desc: "暖宣纸底 + 双线回纹框 + 宋体书卷，传统而不繁复。",
    tier: "points",
    points: 800,
    priceFen: 800,
    tags: ["积分", "中式", "雅致"],
    slots: { wall: "wall-warm", floor: "floor-brick", ornament: ["orn-flower-white"], frame: "frame-double", font: "font-serif" },
    preview: { background: "#faf6ef", color: "#2c3540", accent: "#8f5f3d", icon: "📜" },
    space: "classic",
  },
  {
    id: "tpl-nightlight",
    name: "长明夜",
    desc: "深青夜色配素灯笼，为逝者留一盏不灭的灯。",
    tier: "points",
    points: 900,
    priceFen: 900,
    tags: ["积分", "追思", "夜"],
    slots: { wall: "wall-night", floor: "floor-none", ornament: ["orn-lantern-red"], frame: "frame-line", font: "font-serif" },
    preview: { background: "#1f2b33", color: "#e9eef2", accent: "#a8744f", icon: "🏮" },
    space: "pond",
  },
  {
    id: "tpl-inkwash",
    name: "水墨山房",
    desc: "远山淡墨、竹影摇风，配楷体手书，一派文人清供。",
    tier: "points",
    points: 800,
    tags: ["积分兑换", "文人", "水墨"],
    slots: { wall: "wall-inkwash", floor: "floor-wood", ornament: ["orn-curtain"], frame: "frame-wood", font: "font-kai" },
    preview: { background: "#eef2f5", color: "#2c3540", accent: "#3a4654", icon: "🏔️" },
    space: "classic",
  },
  {
    id: "tpl-zhuqi",
    name: "朱漆门庭",
    desc: "青石砖地、朱漆楹柱、金丝楠木几案，气象俨然。",
    tier: "points",
    points: 1200,
    tags: ["积分兑换", "宗祠", "隆重"],
    slots: { wall: "wall-warm", floor: "floor-wood", ornament: ["orn-pillar"], frame: "frame-bronze", font: "font-fangsong" },
    preview: { background: "#7a2f26", color: "#f5e2b8", accent: "#c9a961", icon: "🏛️" },
    /* 有楹联漆柱（orn-pillar）却没 space = 柱子只能贴墙画，撑不起空间 */
    space: "classic",
  },
  {
    id: "tpl-goldhall",
    name: "鎏金堂",
    desc: "鎏金织锦壁、宫灯垂锦、鎏金雕花相框，极尽庄重。（高级订阅）",
    tier: "premium",
    priceFen: 1800,
    tags: ["高级订阅", "至尊", "鎏金"],
    slots: { wall: "wall-goldweave", floor: "floor-wood", ornament: ["orn-lantern-gold"], frame: "frame-gold", font: "font-fangsong" },
    preview: { background: "linear-gradient(135deg,#3a2c1e,#6b4f2a)", color: "#f2dfae", accent: "#c9a961", icon: "👑" },
    /* 名为「鎏金堂」——「堂」就该是享堂形态（grand：斗拱 + 藻井 + 须弥座） */
    space: "hall",
  },
  {
    id: "tpl-lotuswake",
    name: "莲开九品",
    desc: "莲池月夜、云纹地毯、金顶光晕，愿往生者花开见佛。（高级订阅）",
    tier: "premium",
    priceFen: 2000,
    tags: ["高级订阅", "佛事", "往生"],
    slots: { wall: "wall-lotuspond", floor: "floor-cloud", ornament: ["orn-halo"], frame: "frame-gold", font: "font-brush" },
    preview: { background: "radial-gradient(ellipse at 50% 80%, #2c4a44, #0f1a19)", color: "#e8f5ef", accent: "#7ac4ad", icon: "🪷" },
    /* "莲池月夜" —— 它就是莲池原型的平面版；不补 space 反而与 tpl-lotuswake3d 语义打架 */
    space: "pond",
  },
  {
    id: "tpl-starry",
    name: "星河长明",
    desc: "深空星河、匾额悬堂、宗师翰墨，思念有光，不诉离别。（高级订阅）",
    tier: "premium",
    priceFen: 2000,
    tags: ["高级订阅", "星空", "诗意"],
    slots: { wall: "wall-starry", floor: "floor-cloud", ornament: ["orn-plaque"], frame: "frame-gold", font: "font-brush" },
    preview: { background: "radial-gradient(circle at 30% 20%, #2b3d55, #0b1119)", color: "#e6eefc", accent: "#c9a961", icon: "🌌" },
    space: "starfield",
  },
  {
    /*
      壁龛纪念堂：唯一一套「实景空间」模板。
      应用后馆页顶部会渲染一整幅壁龛纪念墙场景，逝者遗像自动安奉于
      墙面正中偏上的壁龛格内（见 components/hall/NicheWallScene.tsx）。
    */
    id: "tpl-niche",
    name: "壁龛纪念堂",
    desc: "木格壁龛、长明灯柱、白菊寄思、大理石地。遗像安奉于壁龛墙正中，庄重如亲临。",
    tier: "free",
    tags: ["赠品", "实景", "纪念堂"],
    slots: {
      wall: "wall-warm",
      floor: "floor-marble",
      ornament: ["orn-niche-wall"],
      frame: "frame-gold",
      font: "font-serif",
    },
    preview: { background: "linear-gradient(180deg,#cdbca0,#8c7a62)", color: "#3a2c1e", accent: "#c9a961", icon: "🕯️" },
    space: "niche",
  },

  // =========================================================================
  // 新增收费模板（2026-10）：10 套。
  //
  // 设计思路：不是"换几个颜色"，而是**十个不同的空间原型** ——
  // 每套都声明自己的 `space`（见 lib/decor-3d.ts），装修向导里
  // 的 3D 预览会呈现明显不同的建筑形态与光线，而不是同一间屋子刷漆。
  //
  // 定价原则：模板是打包价，¥8–18（points 同数量级，100 积分 = ¥1）。
  // =========================================================================

  {
    /* 原型：莲池水面。倒影是主角，色调偏青绿，纵深最大。 */
    id: "tpl-lotuswake3d",
    name: "莲开九品 · 立体",
    desc: "莲池月夜，水面倒影随视角浮动，金顶光晕环抱莲台。愿往生者花开见佛。",
    tier: "points",
    points: 3200,
    priceFen: 3200,
    tags: ["积分", "佛事", "往生", "3D"],
    slots: {
      wall: "wall-lotuspond",
      floor: "floor-cloud",
      ornament: ["orn-halo"],
      frame: "frame-gold",
      font: "font-brush",
    },
    preview: { background: "radial-gradient(ellipse at 50% 80%, #2c4a44, #0f1a19)", color: "#e8f5ef", accent: "#7ac4ad", icon: "🪷" },
    space: "pond",
  },
  {
    /* 原型：星河深空。无建筑构件，靠星点与纵深营造"天穹"感 */
    id: "tpl-starry3d",
    name: "星河长明 · 立体",
    desc: "深空环视，星河随视角缓缓流转，匾额悬于天穹之下。思念有光，不诉离别。",
    tier: "points",
    points: 3600,
    priceFen: 3600,
    tags: ["积分", "星空", "诗意", "3D"],
    slots: {
      wall: "wall-starry",
      floor: "floor-cloud",
      ornament: ["orn-plaque"],
      frame: "frame-gold",
      font: "font-brush",
    },
    preview: { background: "radial-gradient(circle at 30% 20%, #2b3d55, #0b1119)", color: "#e6eefc", accent: "#c9a961", icon: "🌌" },
    space: "starfield",
  },
  {
    id: "tpl-inkspace",
    name: "水墨山房 · 立体",
    desc: "远山淡墨、竹影摇风，三面围合的静室，视角一转，竹影跟着移。一派文人清供。",
    tier: "points",
    points: 1800,
    priceFen: 1800,
    tags: ["积分", "文人", "水墨", "3D"],
    slots: {
      wall: "wall-inkwash",
      floor: "floor-wood",
      ornament: ["orn-curtain"],
      frame: "frame-wood",
      font: "font-kai",
    },
    preview: { background: "#eef2f5", color: "#2c3540", accent: "#3a4654", icon: "🏔️" },
    /*
      ⚠️ 这里原本误写成 "classic" —— 名字却叫「· 立体」、desc 也写着"三面围合的静室"。
      后果很隐蔽：模板照常能应用、卡片照常显示，只是**永远不渲染 3D 场景**，
      用户的感受是"我买了立体版，怎么还是平面的"。
      商品页也一起哑掉（§商城详情页靠 space 判定是否出预览）。
      凡是名字带「立体」的模板，space 就不能是 classic —— 已加断言锁死。
    */
    space: "hall",
  },
  {
    id: "tpl-zhuqispace",
    name: "朱漆门庭 · 立体",
    desc: "青石砖地、朱漆楹柱、金丝楠木几案。立柱贴墙而立，环视时纵深清晰，气象俨然。",
    tier: "points",
    points: 2200,
    priceFen: 2200,
    tags: ["积分", "隆重", "立柱", "3D"],
    slots: {
      wall: "wall-warm",
      floor: "floor-wood",
      ornament: ["orn-pillar"],
      frame: "frame-bronze",
      font: "font-fangsong",
    },
    preview: { background: "#7a2f26", color: "#f5e2b8", accent: "#c9a961", icon: "🏛️" },
    space: "hall",
  },
  {
    id: "tpl-mistveil",
    name: "晨雾青纱",
    desc: "淡青渐层配垂纱成幔，光线自上洒落，空间如浸在晨雾里。清冷静谧。",
    tier: "points",
    points: 1000,
    priceFen: 1000,
    tags: ["积分", "清冷", "纱幔", "3D"],
    slots: {
      wall: "wall-mist",
      floor: "floor-marble",
      ornament: ["orn-curtain"],
      frame: "frame-line",
      font: "font-serif",
    },
    preview: { background: "linear-gradient(180deg,#f1f5f7,#ffffff)", color: "#2c3540", accent: "#8fa5b3", icon: "🌫️" },
    space: "classic",
  },
  {
    id: "tpl-longnight3d",
    name: "长明夜 · 立体",
    desc: "深青夜色中三盏素灯笼自檐下垂落，为逝者留一盏不灭的灯。环视四顾，灯影不散。",
    tier: "points",
    points: 1100,
    priceFen: 1100,
    tags: ["积分", "追思", "夜", "3D"],
    slots: {
      wall: "wall-night",
      floor: "floor-none",
      ornament: ["orn-lantern-gold"],
      frame: "frame-line",
      font: "font-serif",
    },
    preview: { background: "#1f2b33", color: "#e9eef2", accent: "#a8744f", icon: "🏮" },
    /*
      同上：名字带「· 立体」而 space 误写 classic。
      desc 写的是"深青夜色中三盏素灯笼自檐下垂落"——正是 `pond` 那类
      "无建筑构件、靠光与纵深造境"的空间，选 pond 与墙面色调也最搭。
    */
    space: "pond",
  },
  {
    id: "tpl-bambooherm",
    name: "竹影清室",
    desc: "竹影横斜映在白墙上，供几案台前置，一处清简的追思之所。",
    tier: "points",
    points: 900,
    priceFen: 900,
    tags: ["积分", "清简", "竹", "3D"],
    slots: {
      wall: "wall-bamboo",
      floor: "floor-brick",
      ornament: ["orn-shelf"],
      frame: "frame-wood",
      font: "font-kai",
    },
    preview: { background: "linear-gradient(180deg,#eef3ea,#fbfdf9)", color: "#2c3540", accent: "#4c6e4a", icon: "🎋" },
    space: "classic",
  },
  {
    id: "tpl-goldweavespace",
    name: "鎏金织锦 · 立体",
    desc: "暗金织纹满铺四壁，宫灯垂锦自横梁而下。横梁六道，光影层层递进。",
    tier: "premium",
    points: 0,
    priceFen: 6600,
    tags: ["订阅", "华贵", "织锦", "3D"],
    slots: {
      wall: "wall-goldweave",
      floor: "floor-wood",
      ornament: ["orn-lantern-gold"],
      frame: "frame-gold",
      font: "font-fangsong",
    },
    preview: { background: "linear-gradient(135deg,#3a2c1e,#6b4f2a)", color: "#f2dfae", accent: "#c9a961", icon: "🧵" },
    space: "hall",
  },
  {
    id: "tpl-clearfrost",
    name: "霜白净室",
    desc: "素白四壁、素线细框、现代黑体。最克制的一套立体空间，适合一切庄重场合。",
    tier: "points",
    points: 700,
    priceFen: 700,
    tags: ["积分", "简约", "克制", "3D"],
    slots: {
      wall: "wall-plain",
      floor: "floor-marble",
      ornament: ["orn-none"],
      frame: "frame-double",
      font: "font-modern",
    },
    preview: { background: "#ffffff", color: "#1f262e", accent: "#4a5868", icon: "◻️" },
    space: "classic",
  },
  {
    id: "tpl-paper3d",
    name: "宣纸书卷",
    desc: "暖宣纸底、回纹双线框、宋体书卷。白菊一束置于墙角，传统而不繁复。",
    tier: "points",
    points: 800,
    priceFen: 800,
    tags: ["积分", "中式", "雅致", "3D"],
    slots: {
      wall: "wall-warm",
      floor: "floor-brick",
      ornament: ["orn-flower-white"],
      frame: "frame-double",
      font: "font-serif",
    },
    preview: { background: "#faf6ef", color: "#2c3540", accent: "#8f5f3d", icon: "📜" },
    space: "classic",
  },

  // =========================================================================
  // 阶段 2 新增模板（2026-10）：让"新 kind"有真实入口
  // =========================================================================
  //
  // ⚠️ 为什么必须新增模板，而不是只加素材：
  // 模板才是**一键换整店**的入口（用户的主路径是"挑一套模板"，而不是
  // 逐个槽位去商城淘）。新 kind 若只挂在素材上、没有任何模板用到，
  // 用户实际几乎碰不到 —— 功能等于没做（"静默丢功能"的老毛病）。
  //
  // 四套各有一个明确的"器物质感"主题，彼此不重叠：
  //   堂上规制（匾联一堂）→ 香案清供 → 折屏分隔 → 山门影壁
  {
    /* 原型：宗祠正厅的"堂上规制"—— 金匾居中、朱联分列、宫灯成对。
       这是"豪华档"最该有的样子：一眼看出这家有规制，而不只是颜色深。 */
    id: "tpl-tangzhi",
    name: "堂上规制",
    desc: "鎏金匾额居中，朱漆楹联分列，重檐宫灯垂锦成对。一堂之上，井然有序。",
    tier: "buyout",
    priceFen: 9900,
    points: 9900,
    tags: ["买断", "中式", "规制", "3D"],
    slots: {
      wall: "wall-goldweave",
      floor: "floor-wood",
      ornament: ["orn-plaque-pair"],
      frame: "frame-gold",
      font: "font-fangsong",
    },
    preview: {
      background: "linear-gradient(180deg,#4a3418,#1e1408)",
      color: "#f6e3ae",
      accent: "#d4af37",
      icon: "🪧",
    },
    space: "hall",
  },
  {
    /* 原型：重檐宫灯垂锦成对。宫灯与素灯笼必须是**两套模板** ——
       挂饰槽只有一个，一套模板只能带一件挂饰（数据模型的硬约束）。
       所以"贵的那盏"通过独立模板来体现，而不是塞进别的模板里。 */
    id: "tpl-gongdeng",
    name: "宫灯垂锦",
    desc: "六角重檐宫灯成对悬于檐下，垂锦流苏随风轻摆。仪门生辉，夜如白昼。",
    tier: "buyout",
    priceFen: 2900,
    points: 2900,
    tags: ["买断", "宫灯", "仪门", "3D"],
    slots: {
      wall: "wall-goldweave",
      floor: "floor-brick",
      ornament: ["orn-imperial-lantern"],
      frame: "frame-gold",
      font: "font-fangsong",
    },
    preview: {
      background: "linear-gradient(180deg,#3a2814,#160e06)",
      color: "#f0d79a",
      accent: "#c9a961",
      icon: "🏮",
    },
    space: "hall",
  },
  {
    /* 原型：香案清供 —— 供桌 + 香几 + 花瓶 + 烛台成套。
       主打"这里有人常来祭扫"的生活感，与"空屋换色"划清界限。 */
    id: "tpl-qinggong",
    name: "香案清供",
    desc: "束腰供桌列烛台果盘，三弯腿香几置青瓷花瓶。四时供奉，案不生尘。",
    tier: "buyout",
    priceFen: 2900,
    points: 2900,
    tags: ["买断", "清供", "陈设", "3D"],
    slots: {
      wall: "wall-inkwash",
      floor: "floor-wood",
      ornament: ["orn-altar-table"],
      frame: "frame-wood",
      font: "font-kai",
    },
    preview: {
      background: "linear-gradient(180deg,#efe9dd,#c8bda8)",
      color: "#3a2c1e",
      accent: "#8f5f3d",
      icon: "🪑",
    },
    space: "hall",
  },
  {
    /* 原型：四扇折屏分隔内外。屏风是"空间里的一件家具"，
       与挂在墙上的挂饰是两种东西，用它来证明"付费能改变空间布局而非只是配色"。 */
    id: "tpl-zheping",
    name: "折屏静室",
    desc: "四扇绢面折屏隔出内外，山海挂轴悬于两侧。一室之内，自成一境。",
    tier: "buyout",
    priceFen: 3600,
    points: 3600,
    tags: ["买断", "屏风", "挂轴", "3D"],
    slots: {
      wall: "wall-inkwash",
      floor: "floor-cloud",
      ornament: ["orn-screen"],
      frame: "frame-bronze",
      font: "font-serif",
    },
    preview: {
      background: "linear-gradient(180deg,#e8e6dc,#a8b0b8)",
      color: "#2c3540",
      accent: "#6a5238",
      icon: "🚪",
    },
    space: "hall",
  },
  {
    /* 原型：两侧挂轴的中堂 —— 与"折屏静室"配成一对（折屏管分隔，挂轴管墙面）。
       挂轴是**侧墙挂件**，与贴地家具是两种摆位，故独立成套模板。 */
    id: "tpl-shuhua",
    name: "书画中堂",
    desc: "一对山海挂轴垂悬两侧，远山云水、水波细纹。室有书画，主人不俗。",
    tier: "buyout",
    priceFen: 1900,
    points: 1900,
    tags: ["买断", "书画", "挂轴", "3D"],
    slots: {
      wall: "wall-warm",
      floor: "floor-wood",
      ornament: ["orn-scroll-painting"],
      frame: "frame-double",
      font: "font-kai",
    },
    preview: {
      background: "linear-gradient(180deg,#f0ece2,#c8c2ae)",
      color: "#2c3540",
      accent: "#8f5f3d",
      icon: "🖼️",
    },
    space: "hall",
  },
  {
    /* 原型：山门影壁 —— 青砖照壁 + 石阶气象。
       影壁是"独立建筑体"，最能体现"装修能加一堵墙/一道壁"。 */
    id: "tpl-yingbi",
    name: "青砖影壁",
    desc: "山门之内立青砖照壁，回纹壁心、瓦顶压脊。入门先见壁，气象自不同。",
    tier: "buyout",
    priceFen: 3900,
    points: 3900,
    tags: ["买断", "影壁", "门庭", "3D"],
    slots: {
      wall: "wall-inkwash",
      floor: "floor-brick",
      ornament: ["orn-screen-wall"],
      frame: "frame-double",
      font: "font-fangsong",
    },
    preview: {
      background: "linear-gradient(180deg,#d8dade,#8b9098)",
      color: "#1f262e",
      accent: "#5e584e",
      icon: "🧱",
    },
    space: "gate",
  },

];

// ---------------------------------------------------------------------------
// 美化装饰套件（Decor Kit）
// ---------------------------------------------------------------------------
/**
 * 装饰套件 = 一组"风格一致"的素材打包。
 *
 * 与「整套模板（template）」的区别：
 *   - 模板给的是**空间骨架**（壁纸+地纹+挂饰+相框+字体，五槽全换）——
 *     换了模板，整个空间变样。
 *   - 套件给的是**美化点缀**（通常只换挂饰与相框/字体），
 *     保留用户已经挑好的墙与地 —— 换了套件，空间还是那个空间，但气质变了。
 *
 * 为什么套件要单独存在：用户认真挑过壁纸与地纹之后，通常不愿意被模板一键覆盖。
 * 套件让"我只想换点装饰"这个诉求有地方安放，而不是被迫接受整套替换。
 *
 * 购买后套件内的素材全部计入 `unlocked`（`buy:<id>`），用户可自行拆用。
 */
export type DecorKit = {
  id: string;
  name: string;
  desc: string;
  tier: DecorTier;
  points?: number;
  priceFen?: number;
  tags: string[];
  /** 套件包含的素材 id（挂饰/相框/字体等，不含壁纸地纹 —— 见上面的说明） */
  includes: string[];
  /** 套件应用后，建议同时选用的壁纸（可选，仅作视觉建议，不强制） */
  suggestWall?: string;
  /**
   * 整店套餐：应用时**直接落到这些槽位**（含 `wall` / `floor`）。
   *
   * 与 `includes` 的区别（**勿混用**）：
   *   - `includes` 是"**买**到手的零件"（权益），落库到 `unlocked`；
   *   - `applies` 是"**用**哪些零件"（方案），只改草稿里的 `slots`。
   * 一个套件可以只有 `includes`（旧语义：只换装饰、保留用户挑的墙与地），
   * 也可以两者都有（整套换掉，含墙地）。仓库里 `suggestWall` 那个旧字段
   * 只做"视觉建议"，从不真的写进 slots —— 所以它永远替代不了 `applies`。
   *
   * 缺省（不写）= 旧行为，一字节不变。
   */
  applies?: Partial<Record<DecorSlot, string>>;
  /** 套餐应用后的结构档位（可选，仅作提示；实际档位仍由模板/空间决定） */
  structure?: StructureTier;
  preview: { background: string; color: string; accent: string; icon: string };
  /** 全页换肤增量（可选；缺省按 id 推断，见 lib/decor-skin.ts） */
  skin?: Partial<SkinTokens>;
};

export const KITS: DecorKit[] = [
  {
    id: "kit-fourseasons",
    name: "四季流转套件",
    desc: "春樱、夏萤、秋枫、冬雪四组氛围挂饰。随节气更换，让思念不只有一种颜色。",
    tier: "points",
    points: 600,
    priceFen: 600,
    tags: ["积分", "氛围", "四季"],
    includes: ["orn-flower-white", "orn-lantern-red", "orn-shelf", "orn-halo"],
    preview: { background: "linear-gradient(135deg,#f6d6e0,#cfe3d4)", color: "#2c3540", accent: "#c07a8e", icon: "🍂" },
  },
  {
    id: "kit-scholar",
    name: "文房清供套件",
    desc: "竹、兰、香几与一方素砚。给读书人出身的长辈，一处最贴气的清供。",
    tier: "points",
    points: 700,
    priceFen: 700,
    tags: ["积分", "文人", "清供"],
    includes: ["orn-shelf", "orn-curtain", "orn-flower-white"],
    suggestWall: "wall-bamboo",
    preview: { background: "linear-gradient(135deg,#eef3ea,#fbfdf9)", color: "#2c3540", accent: "#4c6e4a", icon: "🖌️" },
  },
  {
    id: "kit-goldenlight",
    name: "金辉环伺套件",
    desc: "金顶光晕、鎏金匾额、宫灯垂锦三件套。堂上一亮，气度立刻不同。",
    tier: "points",
    points: 900,
    priceFen: 900,
    tags: ["积分", "金", "隆重"],
    includes: ["orn-halo", "orn-plaque", "orn-lantern-gold"],
    preview: { background: "linear-gradient(135deg,#3a2c1e,#7a5a2a)", color: "#f6e3ae", accent: "#c9a961", icon: "✨" },
  },
  {
    id: "kit-silentnight",
    name: "静夜追思套件",
    desc: "素灯笼一对、垂纱成幔、庙宇光晕。给夜里的探望，留一盏不灭的灯。",
    tier: "points",
    points: 500,
    priceFen: 500,
    tags: ["积分", "夜", "追思"],
    includes: ["orn-lantern-red", "orn-curtain", "orn-halo"],
    suggestWall: "wall-night",
    preview: { background: "linear-gradient(135deg,#1f2b33,#0f1a19)", color: "#e9eef2", accent: "#a8744f", icon: "🌙" },
  },
  {
    id: "kit-courtyard",
    name: "庭院立柱套件",
    desc: "朱漆楹联柱分列两侧、供几案台居中、白菊一束。撑起门庭气度。",
    tier: "points",
    points: 800,
    priceFen: 800,
    tags: ["积分", "立柱", "门庭"],
    includes: ["orn-pillar", "orn-shelf", "orn-flower-white"],
    preview: { background: "linear-gradient(135deg,#7a2f26,#a8442f)", color: "#f5e2b8", accent: "#c9a961", icon: "🏛️" },
  },
  {
    id: "kit-completeframe",
    name: "相框字体典藏套件",
    desc: "实木框、青铜卷草框、鎏金雕花框，配楷体与仿宋。给遗像与题词最好的礼遇。",
    tier: "premium",
    points: 0,
    priceFen: 1200,
    tags: ["订阅", "相框", "字体"],
    includes: ["frame-wood", "frame-bronze", "frame-gold", "font-kai", "font-fangsong", "font-brush"],
    preview: { background: "linear-gradient(135deg,#8a6d2f,#c9a961)", color: "#3a2c1e", accent: "#fff4d0", icon: "🖼️" },
  },

  // =========================================================================
  // 阶段 3 新增「整店套餐」（2026-10）：带 `applies`，含 wall / floor
  // =========================================================================
  //
  // 与旧套件的区别（用户口径「一键换整套」）：
  //   旧套件只换挂饰与相框/字体，**保留用户挑好的墙与地** —— 它解决的是
  //   "我认真挑了壁纸，不想被模板一键覆盖"。
  //   整店套餐反过来：`applies` 直接把五个槽位全落到一套配好的方案上，
  //   含 wall / floor —— 解决的是"我懒得挑，给我一套配好的"。
  //
  // ⚠️ `includes` 与 `applies` 的分工**勿混用**（见 DecorKit 类型注释）：
  //    includes 是"买到手的零件"（落 `unlocked`），applies 是"用哪些零件"（只改 slots）。
  //    整店套餐两者都写：includes 保证用户拆开单个零件也能用，
  //    applies 保证点一下就是完整的一套（否则用户会看到"套件买了，墙还是旧的"）。
  {
    id: "kit-scholar-retreat",
    name: "山房清供整装包",
    desc: "一面青绿山水墙、一地金丝楠木、一室书画清供。点一下，整店换成文人山房。含墙与地。",
    tier: "buyout",
    priceFen: 2200,
    points: 2200,
    tags: ["买断", "整装", "文人", "含墙地"],
    includes: [
      "wall-inklandscape",
      "floor-wood",
      "orn-scroll-painting",
      "frame-wood",
      "font-kai",
    ],
    applies: {
      wall: "wall-inklandscape",
      floor: "floor-wood",
      ornament: "orn-scroll-painting",
      frame: "frame-wood",
      font: "font-kai",
    },
    structure: "grand",
    preview: { background: "linear-gradient(135deg,#8fb4a8,#f0ece2)", color: "#26443c", accent: "#8f5f3d", icon: "🏞️" },
  },
  {
    id: "kit-imperial-hall",
    name: "金殿整装包",
    desc: "缂丝金龙满壁、织锦铺地、匾联一堂、御制雕龙框配御笔题额。极尽尊荣。含墙与地。",
    tier: "buyout",
    priceFen: 5900,
    points: 5900,
    tags: ["买断", "整装", "至尊", "含墙地"],
    includes: [
      "wall-brocade-gold",
      "floor-brocade",
      "orn-plaque-pair",
      "frame-imperial",
      "font-imperial-brush",
    ],
    applies: {
      wall: "wall-brocade-gold",
      floor: "floor-brocade",
      ornament: "orn-plaque-pair",
      frame: "frame-imperial",
      font: "font-imperial-brush",
    },
    structure: "imperial",
    preview: { background: "linear-gradient(135deg,#3b2a12,#a8322c)", color: "#ffeec2", accent: "#d4af37", icon: "👑" },
  },
];

// ---------------------------------------------------------------------------
// 典藏礼包（bundle）
// ---------------------------------------------------------------------------
/**
 * `listPriceFen` 由 `bundleListPrice()` **现算**，不在数据里手写。
 *
 * 为什么不手写：手写的"原价"一旦与包内商品调价脱节，划线价就成了假广告
 * （"原价 ¥380"里有两件其实涨过价）。现算的代价是 `BUNDLES` 不能用字面量 ——
 * 所以这里先声明 `BUNDLE_SPECS`（只写 includes 与礼包价），再由
 * `withListPrice()` 补上原价。
 *
 * ⚠️ 循环引用风险：`bundleListPrice` 要读 `TEMPLATES` / `KITS`，
 *    而它们在**同一文件的上方**，模块初始化顺序天然正确（不像 CLAN_KITS
 *    那种跨文件场景），所以这里可以放心直接引用。
 */
export const BUNDLE_SPECS: Omit<DecorBundle, "listPriceFen">[] = [
  {
    id: "decor-bundle-imperial",
    name: "御制典藏包",
    desc:
      "一次拥有五套顶级方案：堂上规制、宫灯垂锦、折屏静室、青砖影壁、鎏金织锦 · 立体，" +
      "外加金殿整装包、山房清供整装包。单买合计远超礼包价，典藏之选。",
    tier: "buyout",
    priceFen: 19900,
    points: 19900,
    tags: ["买断", "典藏", "礼包", "超值"],
    includes: [
      "tpl-tangzhi",
      "tpl-gongdeng",
      "tpl-zheping",
      "tpl-yingbi",
      "tpl-goldweavespace",
      "kit-imperial-hall",
      "kit-scholar-retreat",
    ],
    preview: {
      background: "linear-gradient(135deg,#3b2a12 0%,#a8322c 50%,#d4af37 100%)",
      color: "#ffeec2",
      accent: "#fff4d0",
      icon: "🏆",
    },
  },
  {
    id: "decor-bundle-reunion",
    name: "团圆典藏包",
    desc:
      "适合一切场合的三套方案：香案清供、书画中堂、星河长明 · 立体，" +
      "外加山房清供整装包。清简与华贵各有其一，怎么挑都不失礼。",
    tier: "buyout",
    priceFen: 9900,
    points: 9900,
    tags: ["买断", "典藏", "礼包", "通用"],
    includes: [
      "tpl-qinggong",
      "tpl-shuhua",
      "tpl-starry3d",
      "tpl-mistveil",
      "kit-scholar-retreat",
      "kit-silentnight",
    ],
    preview: {
      background: "linear-gradient(135deg,#efe9dd 0%,#8a9aa8 60%,#2b3d55 100%)",
      color: "#2c3540",
      accent: "#8f5f3d",
      icon: "🎁",
    },
  },
  {
    id: "decor-bundle-lotus",
    name: "莲开典藏包",
    desc: "莲池两式（莲开九品、莲开九品 · 立体）配折屏静室与山房清供整装包。愿往生者花开见佛。",
    tier: "buyout",
    priceFen: 7900,
    points: 7900,
    tags: ["买断", "典藏", "礼包", "佛事"],
    includes: ["tpl-lotuswake", "tpl-lotuswake3d", "tpl-zheping", "kit-scholar-retreat"],
    preview: {
      background: "radial-gradient(ellipse at 50% 80%, #2c4a44, #0f1a19)",
      color: "#e8f5ef",
      accent: "#7ac4ad",
      icon: "🪷",
    },
  },
];

/**
 * 算出一个礼包的**原价总和**（分）。
 *
 * 包内 id 既可能是模板也可能是套件，所以两边都要查；查不到就**抛错**。
 * 为什么抛错而不是跳过：礼包里写了不存在的 id，是"发货会静默少一件"的源头。
 * 宁可构建时炸掉，也不要让用户花 ¥199 只拿到六件（第七件查不到、静默跳过）。
 */
export function bundleListPrice(bundle: { includes: string[] }): number {
  let sum = 0;
  for (const id of bundle.includes) {
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (tpl) {
      sum += tpl.priceFen ?? tpl.points ?? 0;
      continue;
    }
    const kit = KITS.find((k) => k.id === id);
    if (kit) {
      sum += kit.priceFen ?? kit.points ?? 0;
      continue;
    }
    throw new Error(
      `[decor] 礼包引用了不存在的商品 id: ${id}（模板与套件表里都查不到）。` +
        `若是新增的商品，请先在 TEMPLATES / KITS 里登记。`,
    );
  }
  return sum;
}

export const BUNDLES: DecorBundle[] = BUNDLE_SPECS.map((b) => ({
  ...b,
  listPriceFen: bundleListPrice(b),
}));

export function findBundle(id: string): DecorBundle | undefined {
  return BUNDLES.find((b) => b.id === id);
}

/**
 * 礼包发货清单 → 解锁键列表。
 *
 * 包内每一项按 id 前缀判定该发 `tpl:` 还是 `kit:` 键。
 * 前缀判定而不是"查表判定"，是为了让发货**不依赖**表里是否恰好有这一项 ——
 * 但这也意味着拼错的 id 会静默发出一个永远不会被认的键，
 * 所以 `bundleListPrice()` 的"查不到就抛错"是这里的前置保险。
 */
export function bundleEntitlementKeys(bundle: DecorBundle): string[] {
  return bundle.includes.map((id) => {
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (tpl) return tplKey(id);
    return `kit:${id}`;
  });
}


/*
  宗祠装饰套件（CLAN_KITS）**不在这里定义** —— 它已迁到 lib/clan-decor.ts。
  为什么必须迁走（勿搬回来）：
    clan-decor.ts 要从这里 import 类型与 buyKey/tplKey 等工具，
    而 CLAN_DECOR_CATEGORIES（在 clan-decor.ts 里）又直接引用 CLAN_KITS 数组。
    若 CLAN_KITS 留在这里，客户端 bundle 一旦先求值 clan-decor，
    CLAN_KITS 还是 undefined，`items: CLAN_KITS` 就会把 undefined 塞进分类目录。
    实测症状：宗祠控制台整页崩，控制台报
      TypeError: Cannot set properties of undefined (setting 'clan-kit-incense')
    —— 报在套件 id 上，看着像数据写错，其实是模块初始化顺序。
    类型定义（DecorKit）可以共享，**值**必须留在各自文件里。
*/

// ---------------------------------------------------------------------------
// 典藏礼包（bundle）
// ---------------------------------------------------------------------------
/**
 * 典藏礼包 = 把若干**模板 / 套件**打包，以低于原价总和的礼包价出售。
 *
 * 与前三者的关系（粒度从细到粗）：
 *   `DecorItem`（单件素材） → `DecorKit`（零件打包） → `DecorTemplate`（五槽方案）
 *   → **`DecorBundle`（商品打包）**
 *
 * 礼包是**商品粒度的促销**，不是新的装修形态 —— 它自己不渲染任何东西，
 * 只负责"一次付钱、把包里的每一件都发到 `unlocked`"。
 *
 * ⚠️ 发货必须**逐件展开**（`includes` 里的每个 id 各发一个键），
 *    而不是只写一个 `bundle:<id>`。踩过的同源坑：套件只写 `kit:<id>`
 *    会让用户看到"套件买了，里面的挂饰还锁着"。
 *    礼包更严重——它包的是**整套模板**，漏展开就是"花了 ¥199 什么都没到手"。
 */
export type DecorBundle = {
  id: string;
  name: string;
  desc: string;
  tier: DecorTier;
  points?: number;
  /** 礼包价（**分**） */
  priceFen?: number;
  tags: string[];
  /**
   * 礼包内含的商品 id —— 可以是**模板 id（`tpl-*` / `clan-tpl-*`）**
   * 或**套件 id（`kit-*` / `clan-kit-*`）**。
   *
   * 发货时按前缀判定该发 `tpl:` 还是 `kit:` 键（见 lib/decor-products.ts）。
   * ⚠️ **不接受单件素材 id**：礼包里塞单件会让"原价"迅速虚高、
   *    且单件素材用户通常会自己挑，打包没有意义。
   */
  includes: string[];
  /** 原价总和（**分**）—— 仅用于展示"原价 ¥380 → 礼包 ¥199"的划线价 */
  listPriceFen: number;
  preview: { background: string; color: string; accent: string; icon: string };
  /** 全页换肤增量（可选；缺省按 id 推断，见 lib/decor-skin.ts） */
  skin?: Partial<SkinTokens>;
};

// ---------------------------------------------------------------------------
// 索引与查询
// ---------------------------------------------------------------------------
export const DECOR_CATEGORIES: {
  key: DecorCategory;
  label: string;
  hint: string;
  items: DecorItem[] | DecorTemplate[] | DecorKit[];
}[] = [
  { key: "template", label: "整套模板", hint: "一键应用全套搭配，空间形态与光线一起改变", items: TEMPLATES },
  { key: "kit", label: "装饰套件", hint: "成套搭配：普通套件只换装饰、保留你挑好的墙与地；「整装包」一键连墙带地全换", items: KITS },
  { key: "wall", label: "背景壁纸", hint: "空间的基调，决定整体气质", items: WALLS },
  { key: "floor", label: "地面地纹", hint: "脚下质感，垫起空间层次", items: FLOORS },
  { key: "ornament", label: "挂饰陈设", hint: "灯笼、幔帐、立柱等点缀", items: ORNAMENTS },
  { key: "frame", label: "遗像相框", hint: "为逝者照片配一副好框", items: FRAMES },
  { key: "font", label: "字体风格", hint: "文字的性格，也是纪念的语气", items: FONTS },
];

export const SLOT_ITEMS: Record<DecorSlot, DecorItem[]> = {
  wall: WALLS,
  floor: FLOORS,
  ornament: ORNAMENTS,
  frame: FRAMES,
  font: FONTS,
};

/**
 * 各槽位选中的素材 id。**挂饰槽是数组**（多选），其余槽位是单值。
 *
 * 这是装修的"单一真相源"：渲染层与保存校验一律从这里读，
 * 不再有平行的 `ornaments` 顶层字段（见 HallDecor 注释）。
 */
export type HallSlots = {
  wall: string;
  floor: string;
  ornament: string[];
  frame: string;
  font: string;
};

export const DEFAULT_DECOR: HallSlots = {
  wall: "wall-plain",
  floor: "floor-none",
  ornament: ["orn-none"],
  frame: "frame-line",
  font: "font-modern",
};

/** 单件陈设的坐标覆盖（空间单位；只覆盖拖过的维度，未拖维度沿用场景默认） */
export type PropLayout = { x?: number; z?: number; bottom?: number };

/** 各维度的合法范围（空间单位，SPACE.width=100）。超界即客户端伪造/脏数据，钳掉。 */
export const LAYOUT_BOUNDS = { x: [-60, 60], z: [-40, 40], bottom: [-20, 80] } as const;
/** 布局键上限：一个场景的陈设件数远小于此，防恶意膨胀 jsonb */
const LAYOUT_MAX_KEYS = 40;

/**
 * 清洗陈设布局覆盖（3D 拖拽落库的唯一入口校验）。
 *
 * 只做**形状与数值**校验（键名格式 / 数值钳制 / 数量上限），
 * **不做语义校验**（键是否对应真实陈设）——数据层不知道当前模板渲染哪些 id，
 * 语义交集由渲染层按当前 props 的 id 取（stale 键自然失效，两层各管各的）。
 *
 * 客户端可伪造，所以：非法形状整体丢弃、越界数值钳回边界、未知字段忽略。
 */
export function normalizeLayout(raw: unknown): Record<string, PropLayout> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const input = raw as Record<string, unknown>;
  const out: Record<string, PropLayout> = {};
  for (const [key, val] of Object.entries(input)) {
    if (Object.keys(out).length >= LAYOUT_MAX_KEYS) break;
    if (!/^[a-z0-9-]+$/.test(key)) continue; // 键必须是 id 形态（kind-0 / shrine-tablets 等）
    if (!val || typeof val !== "object" || Array.isArray(val)) continue;
    const v = val as Record<string, unknown>;
    const item: PropLayout = {};
    let has = false;
    for (const dim of ["x", "z", "bottom"] as const) {
      const n = v[dim];
      if (typeof n !== "number" || !Number.isFinite(n)) continue;
      const [lo, hi] = LAYOUT_BOUNDS[dim];
      item[dim] = Math.min(hi, Math.max(lo, n));
      has = true;
    }
    if (has) out[key] = item;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type HallDecor = {
  /** 当前使用的整套模板（可为空，表示自定义） */
  templateId?: string;
  /** 各槽位选中的素材 id（挂饰槽为数组，支持"同时陈设"多件） */
  slots: HallSlots;
  /**
   * 多挂饰"单一真相源"：slots.ornament 即要同时陈设的挂饰 id 列表，首件 = 主陈设
   * （3D 场景 / 缩略图 / 单件回退都只认 `slots.ornament[0]`）。
   *
   * 旧模型里曾有一份平行的 `ornaments?: string[]` 顶层字段 —— 那是"两个判据"
   * 冗余，已废弃（见 AGENTS.md「同一事实两个判据」）。旧数据
   * （`slots.ornament` 是字符串、且有顶层 `ornaments`）由 normalizeDecor 在读取时
   * 统一迁移成 `slots.ornament: string[]`，渲染与改造前逐字节一致（零回归）。
   */
  /** 已解锁的收费素材 id（`buy:<id>` / `tpl:<id>`） */
  unlocked?: string[];
  /**
   * 陈设布局覆盖（3D 场景拖拽）：键 = Prop3DSpec.id（底座如 `shrine-tablets`、
   * 挂饰如 `lantern-0`），值 = 该件的坐标覆盖（空间单位）。
   * 仅记录用户**拖过**的件；渲染层按当前 props 的 id 取交集，stale 键自然失效。
   * 形状/数值校验见 normalizeLayout；本字段绝不携带 slots/unlocked/granted 语义。
   */
  layout?: Record<string, PropLayout>;
  /**
   * 建馆赠品：建馆时一次性发放的模板 id，**永久有效**。
   *
   * 为什么必须与 `unlocked` 分开存（勿合并）：
   *   `unlocked` 是"我买过/兑过什么"，会被后台的档位调整、以及用户的
   *   「恢复默认」操作反复重写；赠品是**承诺过的权益**，一旦被这二者吃掉，
   *   用户就会看到"说好送的一套装修凭空没了"。历史上宗祠烟花就因为
   *   取数窗口写窄而静默丢过功能，这类"静默丢权益"最值得单独存一份。
   */
  granted?: string[];
  /**
   * 权益租期表（2026-10 商业模式调整）：解锁键 → 到期时间 ISO。
   *
   * 语义（与 premiumUntil 的到期模式同构）：
   *   - 条目**缺失**或值为 **null** = **永久持有**（存量已购的兼容口径 ——
   *     承诺过"买断"的权益不因商业模式调整缩水）；
   *   - 条目为未来时间 = 持有至该时刻；到期后素材在渲染/校验时**视为未持有**
   *     （公页回退免费档），但 `slots` 配置**保留不删**，续费（再购一次）即恢复；
   *   - `unlocked` 数组仍然记录"曾购键"，不随到期删除 —— 它是续费恢复的依据。
   *
   * ⚠️ 判定必须走 `isKeyActive()`，绝不在调用点手写 `new Date(ent[k]) > new Date()`
   *    —— 那是"同一事实多个判据"的老病（见 AGENTS.md「premium 判定统一」一节）。
   */
  entitlements?: DecorLeaseMap;
  /** 装修封面预览图（可选，用于列表展示） */
  updatedAt?: string;
};

/** 收费素材的解锁键。id 前加 `buy:`，与模板的 `tpl:` 区分，避免 id 撞车。 */
export function buyKey(id: string) {
  return `buy:${id}`;
}

/** 收费模板的解锁键 */
export function tplKey(id: string) {
  return `tpl:${id}`;
}

// ---------------------------------------------------------------------------
// 权益租期（2026-10 商业模式调整）
// ---------------------------------------------------------------------------
/**
 * 用户口径：「升级后的空间存储及装修套件到期后需续费，否则到期后即返回到免费版的状态」。
 *
 * 落地口径：
 *   - **新购**（buyout/points 档，无论货币还是积分、商城还是工坊）一律 365 天；
 *   - **存量已购**（entitlements 里没有条目的键）**保留永久** —— 承诺过的权益不缩水
 *     （与「存量老素材不集体提价」同一哲学，见 AGENTS.md）；
 *   - **到期行为**照抄 premium 订阅的现成模式：素材在渲染/校验时视为未持有
 *     （回退免费档/赠品），slots 配置保留不删，续费即恢复；
 *   - 高级订阅（premium 档素材）不受本表管理 —— 它的租期本来就是 premiumUntil。
 *
 * ⚠️ 这套函数是**唯一的**租期判定实现：normalize 链、发货三路径、
 *    DecorStudio 客户端镜像全部从这里 import，谁也不许手写日期比较。
 */
export const ENTITLEMENT_DAYS = 365;

/**
 * 权益租期表：解锁键 → 到期 ISO；缺条目 / null = 永久。
 *
 * ⚠️ 命名：这里叫 `DecorLeaseMap`（租期表）而不是 `DecorEntitlements` ——
 *    `lib/decor-save.ts` 里已有一个 `DecorEntitlements`（isPremium/unlocked/granted
 *    组成的**权益上下文**），两者同名不同义。TypeScript 结构化类型拦不住
 *    "把那一个传到这一个的位置"，而读代码的人一定会在两个同名之间迷路
 *    （"同一事实多个判据"的近亲：同一个名字、两种语义）。
 *    租期 = lease，权益 = entitlement，从名字上分开。
 */
export type DecorLeaseMap = Record<string, string | null>;

/**
 * 某个解锁键当前是否仍有效。
 * 条目缺失或 null = 永久（存量兼容）；到期未至 = 有效；已过期 = 失效。
 */
export function isKeyActive(
  key: string,
  entitlements: DecorLeaseMap | undefined,
  now: Date = new Date(),
): boolean {
  const exp = entitlements?.[key];
  if (exp === undefined || exp === null) return true; // 永久
  const t = new Date(exp);
  return !Number.isNaN(t.getTime()) && t > now;
}

/**
 * 续费基准：现有租期**未过期**则从到期日顺延叠加，已过期/无条目则从今天起算。
 * 与 premium 订阅续期（lib/pay.ts 的 base 逻辑）同构。
 */
export function nextExpiry(
  existing: string | null | undefined,
  days: number = ENTITLEMENT_DAYS,
): string {
  const now = new Date();
  const base = existing && new Date(existing) > now ? new Date(existing) : now;
  return new Date(base.getTime() + days * 86400000).toISOString();
}

/**
 * 清洗库里读出的租期表（jsonb 可能被手改出脏数据）。
 * 非法日期的条目**丢弃** —— 丢弃后该键缺失 → 回落"永久"，
 * 与"缺失=永久"的存量兼容语义一致（写路径只会产出合法 ISO，脏数据只来自手改库）。
 */
export function normalizeEntitlements(raw: unknown): DecorLeaseMap | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: DecorLeaseMap = {};
  let has = false;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k || !/^[a-z0-9:-]+$/.test(k)) continue; // 键必须是 `buy:xxx` / `tpl:xxx` / `kit:xxx` 形态
    if (v === null) {
      out[k] = null;
      has = true;
      continue;
    }
    if (typeof v !== "string") continue;
    const t = new Date(v);
    if (Number.isNaN(t.getTime())) continue;
    out[k] = v;
    has = true;
  }
  return has ? out : undefined;
}

/** 按 id 查素材（跨分类） */
export function findDecorItem(id: string): DecorItem | undefined {
  return [...WALLS, ...FLOORS, ...ORNAMENTS, ...FRAMES, ...FONTS].find((i) => i.id === id);
}

export function findTemplate(id: string): DecorTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** 素材分级：是否为收费素材 */
export function isPaidTier(tier: DecorTier) {
  return tier !== "free";
}

/**
 * 判断某素材对当前馆主是否可用。
 *  - free：始终可用
 *  - points / buyout：已解锁（`buy:<id>`）**且租期未过**，或高级订阅期内
 *  - premium：需高级订阅生效
 *
 * 注意 `granted` 参数：赠品模板用到的零件随赠品一起永久免费，
 * 这里用「该零件是否服务于某套赠品模板」来判定，而不是把零件塞进 `unlocked`。
 *
 * ⚠️ 租期判定走 `isKeyActive`（entitlements 缺条目 = 永久，存量兼容）——
 *    高级订阅用户不查租期（premium 是订阅语义，租期表管不着它）。
 */
export function isUnlocked(
  item: DecorItem,
  opts: {
    isPremium: boolean;
    unlocked: string[];
    granted?: string[];
    entitlements?: DecorLeaseMap;
  },
) {
  if (item.tier === "free") return true;
  if (opts.isPremium) return true;
  const granted = opts.granted ?? [];
  if (granted.length && isGrantedPart(item.id, granted)) return true;
  const key = buyKey(item.id);
  return (
    (opts.unlocked.includes(item.id) || opts.unlocked.includes(key)) &&
    isKeyActive(key, opts.entitlements)
  );
}

/**
 * 某零件是否属于任一套**赠品模板**。
 *
 * 这是"甲方案"的落地：赠品模板必须能被完整渲染出来，否则用户建完馆
 * 看到的是一面白墙 —— 「赠送一套模板」就成了一句空话。
 */
export function isGrantedPart(itemId: string, grantedTemplateIds: string[]) {
  return grantedTemplateIds.some((tid) =>
    GRANTED_TEMPLATE_PARTS[tid]?.includes(itemId),
  );
}

/**
 * 各套赠品模板用到的零件清单（赠品模板 → 零件 id[]）。
 *
 * 与 TEMPLATES 里的 slots 手工同步。这里显式列出而不是从 TEMPLATES 推导，
 * 是为了让"改了模板 slots 却忘了更新赠品零件"这件事在代码评审时一眼可见 ——
 * 推导会悄悄吸收改动，反而更容易出问题。
 *
 * 纪念馆与宗祠的赠品都登记在这一张表里：`isGrantedPart()` 是唯一的判定入口，
 * 两端共用，避免两边各写一份后判定口径漂移。
 */
export const GRANTED_TEMPLATE_PARTS: Record<string, string[]> = {
  // 纪念馆赠品：壁龛纪念堂
  "tpl-niche": ["wall-warm", "floor-marble", "orn-niche-wall", "frame-gold", "font-serif"],
  // 宗祠赠品：祖德流芳（clan-tpl-ancestral 的 slots 见 lib/clan-decor.ts）
  "clan-tpl-ancestral": [
    "clan-wall-brick",
    "clan-floor-stone",
    "clan-orn-censer",
    "clan-frame-wood",
    "clan-font-kai",
  ],
};

/** 纪念馆建馆赠品模板 id */
export const HALL_GRANT_TEMPLATE = "tpl-niche";


/** 将装修方案归一化：非法/未解锁素材回退到默认搭配 */
export function normalizeDecor(
  raw: unknown,
  opts: {
    isPremium: boolean;
    unlocked: string[];
    granted?: string[];
    entitlements?: DecorLeaseMap;
  },
): HallDecor {
  const input = (raw ?? {}) as Partial<HallDecor>;
  const rawSlots = (input.slots ?? {}) as Partial<HallSlots>;

  const slots: HallSlots = {
    wall: DEFAULT_DECOR.wall,
    floor: DEFAULT_DECOR.floor,
    frame: DEFAULT_DECOR.frame,
    font: DEFAULT_DECOR.font,
    ornament: [...DEFAULT_DECOR.ornament],
  };

  // 非挂饰槽位走通用逻辑（挂饰是数组，单独处理）
  (["wall", "floor", "frame", "font"] as const).forEach((slot) => {
    const id = rawSlots[slot];
    const item = id ? SLOT_ITEMS[slot].find((i) => i.id === id) : undefined;
    // 槽位与分类必须匹配，且素材必须已解锁，否则保持默认
    if (item && isUnlocked(item, opts)) slots[slot] = item.id;
  });

  /*
    合法的模板：免费的、赠品里的、已解锁**且租期未过**的，三者之一即可。
    早先只校验「模板 id 存在」—— 收费模板即使没解锁也会被原样保留，
    表现为"没买却一直在用"，权益判定形同虚设。
    租期已过的模板在这里被静默摘掉（slots 里的配置不动，续费即恢复）。
  */
  const tplId = input.templateId;
  const tpl = tplId ? findTemplate(tplId) : undefined;
  const granted = Array.isArray(input.granted) ? input.granted.map(String) : [];
  const templateId =
    tpl &&
    (tpl.tier === "free" ||
      opts.isPremium ||
      granted.includes(tpl.id) ||
      (opts.unlocked.includes(tplKey(tpl.id)) &&
        isKeyActive(tplKey(tpl.id), opts.entitlements)))
      ? tpl.id
      : undefined;

  /*
    多挂饰（阶段 9 · 单一真相源）：slots.ornament 即"同时陈设"的清单（首件 = 主陈设）。
    兼容三种旧形态（跨 lib 三层统一口径）：
      ① 旧 slots.ornament 为字符串       → 包装成 [string]
      ② 旧并行顶层 ornaments 数组        → 优先用于迁移（旧客户端/旧库可能仍带）
      ③ 新 slots.ornament 为数组         → 直接用
    不变量（非空 / 去重 / 逐项 isUnlocked / 长度 ≤ MAX_ORNAMENTS / 首件即主陈设）
    由本函数与 checkHallDraft 共同保证；旧数据到此归一后，渲染与改造前逐字节一致。
    素材可用性判定**必须**走与槽位同一套 isUnlocked ——
    在这里重写 tier 判断就是"保存时说过、刷新后变回去"类灵异的起点。
  */
  const rawOrn = (rawSlots as { ornament?: unknown }).ornament;
  // 旧模型里的并行顶层 ornaments 字段已废弃（见 HallDecor 注释），
  // 但仍可能存在于旧库/旧客户端草稿里，读取时按未知字段处理以做迁移。
  const legacyOrns = (input as { ornaments?: unknown }).ornaments;
  let srcOrns: unknown;
  if (Array.isArray(legacyOrns)) srcOrns = legacyOrns;
  else if (Array.isArray(rawOrn)) srcOrns = rawOrn;
  else if (typeof rawOrn === "string") srcOrns = [rawOrn];
  else srcOrns = [];

  const orns: string[] = [];
  for (const raw of srcOrns as unknown[]) {
    if (typeof raw !== "string" || !raw || orns.includes(raw)) continue;
    const ornItem = SLOT_ITEMS.ornament.find((i) => i.id === raw);
    if (ornItem && isUnlocked(ornItem, opts)) {
      orns.push(raw);
      if (orns.length >= MAX_ORNAMENTS) break;
    }
  }
  // 清单为空（全是失效/未解锁 id）→ 回落默认主件，渲染零回归
  if (orns.length === 0) orns.push(DEFAULT_DECOR.ornament[0]);
  slots.ornament = orns;

  return {
    templateId,
    slots,
    unlocked: opts.unlocked,
    granted,
    /*
      租期表**必须透传**（从库里读什么就原样带回去）。
      这是最容易踩的坑：writeDecor 是拿 normalizeDecor 的返回值整个写回库的，
      这里若不透传 entitlements，用户每保存一次装修 = 全部租期凭空丢失
      —— "静默丢权益"的又一形态（与 granted 被吃掉同源）。
      清洗交给 normalizeEntitlements（形状校验），语义不改。
    */
    entitlements: normalizeEntitlements(input.entitlements),
    layout: normalizeLayout((input as { layout?: unknown }).layout),
    updatedAt: input.updatedAt,
  };
}

/** 生成风格的完整内联样式（供公网馆页使用） */
export function decorStyle(slot: DecorSlot, decor: HallDecor): React.CSSProperties {
  const item = SLOT_ITEMS[slot].find((i) => i.id === slotMainValue(slot, decor));
  if (!item) return {};
  const s = item.style;
  return {
    backgroundColor: s.backgroundColor,
    backgroundImage: s.backgroundImage,
    backgroundSize: s.backgroundSize,
    backgroundPosition: s.backgroundPosition,
    color: s.color,
    borderColor: s.borderColor,
    boxShadow: s.boxShadow,
    fontFamily: s.fontFamily,
    letterSpacing: s.letterSpacing,
    textShadow: s.textShadow,
    backdropFilter: s.backdropFilter,
  } as React.CSSProperties;
}

export function decorItem(slot: DecorSlot, decor: HallDecor): DecorItem | undefined {
  return SLOT_ITEMS[slot].find((i) => i.id === slotMainValue(slot, decor));
}

/**
 * 取某槽位的"主值"字符串。
 * 挂饰槽是数组，取首件即主陈设；其余槽位是单值。
 * 渲染层凡是要"主素材"（缩略图 / 单件回退 / 风格）一律走这里，
 * 不直接读 `slots[slot]`，否则挂饰槽的 `string[]` 会让 `.find(i => i.id === id)`
 * 把数组当字符串比而全部落空。
 */
export function slotMainValue(slot: DecorSlot, decor: HallDecor): string {
  if (slot === "ornament") return decor.slots.ornament[0] ?? "";
  return decor.slots[slot] ?? "";
}

/**
 * 同时陈设的挂饰上限（2026-10 多挂饰改造）。
 * 上限取 3：场景层按 top/surround/bottom 三档锚点排位，
 * 超过 3 件画面会拥挤（且底部一排放不下），刻意收紧。
 */
export const MAX_ORNAMENTS = 3;

/**
 * 多挂饰解析：把装修方案解析成"要画哪些挂饰"（按序，首件 = 主陈设）。
 *
 * 口径（与 normalizeDecor 的写入规则一致）：
 *   - `decor.ornaments` 存在且非空 → 逐个查表取素材（未知/重复 id 跳过）；
 *   - 否则回落 `[slots.ornament]` —— 旧数据没有 ornaments 字段，
 *     渲染结果与单挂饰时代逐字节一致（零回归的基石）。
 *
 * 渲染层（HallDecorLayer / ClanDecorLayer / 工坊预览）一律走这里取挂饰，
 * 绝不直接读 `slots.ornament` —— 否则"多挂饰"会在部分视图悄悄退化成单件
 * （与 AGENTS.md 记的「同一事实两个判据」同源病）。
 */
export function resolveOrnamentItems(decor: HallDecor): DecorItem[] {
  // 单一真相源：slots.ornament 即清单。防御性接受 string（旧库未归一化）与 undefined。
  const raw = (decor.slots as { ornament?: string | string[] }).ornament;
  const list: string[] = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? [raw]
      : [];
  const out: DecorItem[] = [];
  for (const id of list) {
    const item = SLOT_ITEMS.ornament.find((i) => i.id === id);
    if (item && !out.some((x) => x.id === item.id)) out.push(item);
  }
  return out;
}

export const TIER_LABEL: Record<DecorTier, string> = {
  free: "建馆赠品",
  points: "积分兑换",
  buyout: "付费解锁",
  premium: "高级订阅",
};
