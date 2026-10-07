/**
 * 宗祠空间装修素材库与模板目录
 *
 * 与纪念馆装修（lib/hall-decor.ts）平行实现，复用其类型定义，但目录与归一化逻辑完全独立，
 * 以免改动纪念馆线上行为。
 *
 * 设计原则（2026-10 改版，勿按旧注释理解）：
 *  - 「建馆赠一套，其余皆付费」：新宗祠建成时自动获赠一套模板（`clan-tpl-ancestral`
 *    祖德流芳），**永久免费**，赠品用到的零件也随之永久免费。
 *  - 赠品之外的一切（含原先的免费素材）均为收费：**可积分兑换，也可货币支付买断**。
 *  - 高级订阅（premiumUntil / User.premiumUntil 有效期内）仍可直接使用全部素材。
 *  - 所有渲染参数均为纯 CSS / 内联样式，不依赖任何外部图片资源。
 *  - 祠堂专属装饰件（石狮 / 香炉 / 牌位墙 / 幡旗）通过 ClanOrnamentSpec 扩展描述，
 *    不改动 hall-decor.ts 中封闭的 OrnamentSpec 联合类型。
 *
 * ⚠️ 素材 id / kind 值**一律不得变更** —— 数据库里已存了用户的装修方案。
 */

import type { CSSProperties } from "react";
import {
  buyKey,
  isGrantedPart,
  isKeyActive,
  isPaidTier,
  MAX_ORNAMENTS,
  normalizeEntitlements,
  normalizeLayout,
  slotMainValue,
  SPACE_DEFAULT_TIER,
  templatePriceFen,
  templateStructure,
  tplKey,
  type DecorCategory,
  type DecorLeaseMap,
  type DecorItem,
  type DecorKit,
  type DecorSlot,
  type DecorTemplate,
  type DecorTier,
  type HallDecor,
  type HallSlots,
  type OrnamentSpec,
} from "@/lib/hall-decor";

// ---------------------------------------------------------------------------
// 祠堂专属装饰件
// ---------------------------------------------------------------------------
/** 复用纪念馆 7 种挂饰，并扩展 4 种祠堂专属（石狮 / 香炉 / 牌位墙 / 幡旗） */
export type ClanOrnamentSpec =
  | OrnamentSpec
  | { kind: "stone-lion"; color: string; count?: number }
  | { kind: "incense-burner"; color: string }
  | { kind: "tablet-wall"; color: string; count?: number }
  | { kind: "banner-pair"; color: string; text?: [string, string] };
// ---------------------------------------------------------------------------
// 建筑形制参数（arch）
// ---------------------------------------------------------------------------
/**
 * 建筑形制：把「抽象的色块装修」升级为「真实祠堂建筑构件」。
 *
 * 与 slots 的关系：
 *  - slots 决定**用哪件素材**（id、名称、档位、积分解锁规则完全不变，数据库里存的是它们）；
 *  - arch 决定**这件素材渲染成什么样的建筑形制**（屋面/门楼/月台的样式）。
 *
 * 因此 arch 是纯"呈现层"参数：它不参与解锁判定，也不改变任何 id。
 * 若数据库中某件素材没有 arch，则回退到 CLAN_ARCH_PRESETS[id] 或 DEFAULT_ARCH。
 */

/** 屋面形制：硬山 / 悬山（gable）/ 庑殿（hip）/ 重檐（double） */
export type ClanRoofForm = "hard" | "gable" | "hip" | "double";
/** 门楼形制：随墙门（arch）/ 门屋（post）/ 牌坊（paifang） */
export type ClanGateForm = "arch" | "post" | "paifang";
/** 台基形制：无 / 普通台基（platform）/ 月台（moon） */
export type ClanTerraceForm = "none" | "platform" | "moon";

/** 全套建筑形制参数 */
export type ClanArchParams = {
  roof: ClanRoofForm;
  gate: ClanGateForm;
  terrace: ClanTerraceForm;
  /** 台基级数（1–3），影响台基高度与踏步数量 */
  steps: number;
  /** 是否绘制斗拱层（小式建筑可无） */
  dougong: boolean;
  /** 是否绘制月台望柱栏板 */
  railing: boolean;
};

/** 带祠堂挂饰的素材项（仅 style.ornament 的类型被拓宽） */
export type ClanDecorItem = Omit<DecorItem, "style"> & {
  style: Omit<DecorItem["style"], "ornament"> & { ornament?: ClanOrnamentSpec };
  /** 建筑形制（可选；缺省回退到 CLAN_ARCH_PRESETS / DEFAULT_ARCH） */
  arch?: Partial<ClanArchParams>;
};

/** 缺省形制：最常见的「小式硬山 + 门屋 + 台基」，稳妥不出错 */
export const DEFAULT_ARCH: ClanArchParams = {
  roof: "hard",
  gate: "post",
  terrace: "platform",
  steps: 1,
  dougong: true,
  railing: false,
};

/**
 * 各墙面素材的建筑形制预设。
 *
 * 设计意图：让六种墙面在**建筑等级**上拉开差距 ——
 *   青砖墙   → 小式硬山、无斗拱（民居感）
 *   夯土墙   → 硬山 + 无台基（更朴拙）
 *   白粉墙   → 悬山 + 月台（江南祠堂）
 *   朱红墙   → 重檐庑殿 + 牌坊 + 月台（高等级官式）
 *   楠木墙   → 重檐 + 门屋（大木作）
 *   金饰墙   → 重檐庑殿 + 月台 + 望柱栏板（最高规格）
 */
export const CLAN_ARCH_PRESETS: Record<string, Partial<ClanArchParams>> = {
  "clan-wall-brick": { roof: "hard", gate: "post", terrace: "platform", steps: 1, dougong: false },
  "clan-wall-earth": { roof: "hard", gate: "arch", terrace: "none", steps: 1, dougong: false },
  "clan-wall-white": { roof: "gable", gate: "post", terrace: "moon", steps: 2, dougong: true, railing: true },
  "clan-wall-vermilion": { roof: "double", gate: "paifang", terrace: "moon", steps: 3, dougong: true, railing: true },
  "clan-wall-nanmu": { roof: "double", gate: "post", terrace: "moon", steps: 2, dougong: true, railing: true },
  "clan-wall-gilt": { roof: "double", gate: "paifang", terrace: "moon", steps: 3, dougong: true, railing: true },
};

/** 合并出某墙面素材的完整形制参数（素材自带 arch 优先于预设） */
export function clanArchParams(
  wallId: string,
  item?: ClanDecorItem | DecorItem,
): ClanArchParams {
  const own = (item as ClanDecorItem | undefined)?.arch;
  return {
    ...DEFAULT_ARCH,
    ...(CLAN_ARCH_PRESETS[wallId] ?? {}),
    ...(own ?? {}),
  };
}

// ---------------------------------------------------------------------------
// 背景壁纸（wall）
// ---------------------------------------------------------------------------
export const CLAN_WALLS: ClanDecorItem[] = [
  {
    id: "clan-wall-brick",
    name: "青砖墙",
    desc: "清水青砖，古朴肃穆 · 建馆赠品",
    tier: "free",
    preview: { background: "linear-gradient(180deg,#8d959b,#6b7378)", icon: "🧱" },
    style: {
      backgroundColor: "#7d858b",
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 1px, transparent 1px 26px), repeating-linear-gradient(90deg, rgba(0,0,0,0.10) 0 1px, transparent 1px 52px), linear-gradient(180deg,#8f979d 0%,#697076 100%)",
      color: "#f6f4f0",
    },
  },
  {
    id: "clan-wall-earth",
    name: "夯土墙",
    desc: "黄泥夯筑，返璞归真",
    tier: "points",
    points: 130,
    priceFen: 130,
    preview: { background: "linear-gradient(180deg,#d8c3a0,#b99f78)", icon: "🟫" },
    style: {
      backgroundColor: "#c9b391",
      backgroundImage:
        "radial-gradient(circle at 30% 20%, rgba(120,90,50,0.14), transparent 60%), radial-gradient(circle at 75% 70%, rgba(120,90,50,0.10), transparent 55%), linear-gradient(180deg,#ddc9a8 0%,#bda57f 100%)",
      color: "#3b2f1e",
    },
  },
  {
    id: "clan-wall-white",
    name: "白粉墙",
    desc: "石灰抹面，洁净明快 · 900 积分",
    /*
      档位为 points：它**不是**赠品零件（clan-tpl-ancestral 用的是 clan-wall-brick）。
      早先漏在 free 档，属于档位迁移时漏改 —— 白送一件本该收费的主力墙面材质。
    */
    tier: "points",
    points: 900,
    preview: { background: "linear-gradient(180deg,#fbfbf9,#eeeee9)" },
    style: {
      backgroundColor: "#f7f6f2",
      backgroundImage:
        "radial-gradient(circle at 50% 0%, rgba(0,0,0,0.04), transparent 65%), linear-gradient(180deg,#fbfaf7 0%,#efeee8 100%)",
      color: "#2b2b28",
    },
  },
  {
    id: "clan-wall-vermilion",
    name: "朱漆墙",
    desc: "大漆朱红，庄严显赫 · 300 积分",
    tier: "points",
    points: 300,
    preview: { background: "linear-gradient(180deg,#a3281f,#6d1610)", color: "#fdf3e3", icon: "🟥" },
    style: {
      backgroundColor: "#8e2018",
      backgroundImage:
        "radial-gradient(circle at 50% 8%, rgba(255,200,120,0.18), transparent 60%), linear-gradient(180deg,#a72a20 0%,#711812 100%)",
      color: "#fdf3e3",
      textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    },
  },
  {
    id: "clan-wall-nanmu",
    name: "金丝楠木",
    desc: "楠木纹理，温润沉稳 · 高级订阅",
    tier: "premium",
    preview: { background: "linear-gradient(180deg,#8a6234,#4d3418)", color: "#f7ecd8", icon: "🪵" },
    style: {
      backgroundColor: "#6d4c26",
      backgroundImage:
        "repeating-linear-gradient(88deg, rgba(255,225,170,0.10) 0 2px, transparent 2px 14px), radial-gradient(circle at 40% 10%, rgba(255,210,140,0.22), transparent 62%), linear-gradient(180deg,#93693a 0%,#4c3318 100%)",
      color: "#f8eedb",
      textShadow: "0 1px 3px rgba(0,0,0,0.5)",
    },
  },
  {
    id: "clan-wall-gilt",
    name: "鎏金殿",
    desc: "金箔满堂，极致华贵 · 高级订阅",
    tier: "premium",
    preview: { background: "linear-gradient(180deg,#e8c568,#8b6a1e)", color: "#3a2a08", icon: "👑" },
    style: {
      backgroundColor: "#c9a240",
      backgroundImage:
        "radial-gradient(circle at 50% -10%, rgba(255,255,230,0.55), transparent 58%), repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0 8px, transparent 8px 16px), linear-gradient(180deg,#eccd75 0%,#96731f 100%)",
      color: "#3b2c09",
      textShadow: "0 1px 0 rgba(255,255,255,0.35)",
    },
  },

  // -------------------------------------------------------------------------
  // 阶段 3 新增墙面（2026-10）：与纪念馆侧同口径，把 ¥15–99 段补齐。
  // 旧墙面最高只到「高级订阅」（clan-wall-nanmu / clan-wall-gilt），
  // 中间 ¥15–39 一整段是空的 —— 用户看不到"再攒攒能换什么"。
  // ⚠️ 一律不落 `free`（宗祠赠品零件集合相等断言会变红）。
  // -------------------------------------------------------------------------
  {
    id: "clan-wall-plaster-gray",
    name: "纸筋灰墙",
    desc: "纸筋灰抹面，细看有纤痕。比白粉墙多一层旧气。入门之选。",
    tier: "buyout",
    priceFen: 1200,
    points: 1200,
    preview: { background: "linear-gradient(180deg,#e9e6de,#c8c3b7)", icon: "🧱" },
    style: {
      backgroundColor: "#ddd9d0",
      backgroundImage:
        "radial-gradient(circle at 26% 18%, rgba(120,112,96,0.10), transparent 62%), radial-gradient(circle at 74% 74%, rgba(120,112,96,0.08), transparent 58%), linear-gradient(180deg,#eae7df 0%,#c7c2b6 100%)",
      color: "#33302a",
    },
  },
  {
    id: "clan-wall-hanbai",
    name: "汉白玉墙",
    desc: "白玉墙面、石脉隐现，清冷莹润。与青石月台同气。",
    tier: "buyout",
    priceFen: 1800,
    points: 1800,
    preview: { background: "linear-gradient(135deg,#f6f7f5,#d7dcd8)", icon: "🤍" },
    style: {
      backgroundColor: "#eef1ee",
      backgroundImage:
        "radial-gradient(ellipse 60% 22% at 24% 26%, rgba(160,172,168,0.34), transparent 68%), radial-gradient(ellipse 40% 16% at 72% 62%, rgba(160,172,168,0.26), transparent 66%), linear-gradient(170deg,#fbfcfa 0%,#e3e7e3 100%)",
      color: "#2f3a36",
      overlay:
        "repeating-linear-gradient(64deg, rgba(120,134,128,0.055) 0 1px, transparent 1px 24px)",
    },
  },
  {
    id: "clan-wall-lacquer-gold",
    name: "朱漆描金墙",
    desc: "大漆朱红、描金云纹，堂上一亮，气象立刻不同。",
    tier: "buyout",
    priceFen: 2900,
    points: 2900,
    preview: { background: "linear-gradient(180deg,#a8291f,#63130e)", color: "#fbe8c8", icon: "🟥" },
    style: {
      backgroundColor: "#8e2018",
      backgroundImage:
        "radial-gradient(circle at 50% -6%, rgba(255,214,140,0.30), transparent 58%), repeating-linear-gradient(45deg, rgba(255,208,128,0.055) 0 7px, transparent 7px 14px), repeating-linear-gradient(-45deg, rgba(255,208,128,0.045) 0 7px, transparent 7px 14px), linear-gradient(180deg,#a82a20 0%,#5d120d 100%)",
      color: "#fbeacb",
      textShadow: "0 1px 3px rgba(0,0,0,0.5)",
    },
  },
  {
    id: "clan-wall-brocade-dragon",
    name: "缂丝蟠龙墙",
    desc: "缂丝为底、蟠龙盘绕，通体织金。祠堂之极，鱼龙变化。",
    tier: "buyout",
    priceFen: 6900,
    points: 6900,
    preview: { background: "linear-gradient(135deg,#3b2a12,#8a6320)", color: "#ffeec2", icon: "🐉" },
    style: {
      backgroundColor: "#4d3818",
      backgroundImage:
        "radial-gradient(ellipse 46% 60% at 50% 46%, rgba(255,228,150,0.20), transparent 68%), repeating-linear-gradient(38deg, rgba(226,186,102,0.13) 0 5px, transparent 5px 11px), repeating-linear-gradient(-38deg, rgba(226,186,102,0.10) 0 5px, transparent 5px 11px), repeating-linear-gradient(0deg, rgba(255,236,180,0.05) 0 2px, transparent 2px 9px), linear-gradient(165deg,#3b2a12 0%,#6d4d1c 48%,#33230e 100%)",
      color: "#ffeec6",
      textShadow: "0 1px 14px rgba(226,186,102,0.45)",
    },
  },
  {
    id: "clan-wall-ninefive",
    name: "九五鎏金殿",
    desc: "四壁通体鎏金，光线所至尽作金波。九五之尊，唯祖庭可用。",
    tier: "buyout",
    priceFen: 9900,
    points: 9900,
    preview: { background: "linear-gradient(180deg,#f5da8c,#8a6512)", color: "#3a2905", icon: "👑" },
    style: {
      backgroundColor: "#d4af37",
      backgroundImage:
        "radial-gradient(ellipse 70% 34% at 50% -8%, rgba(255,254,232,0.70), transparent 62%), repeating-linear-gradient(45deg, rgba(255,255,255,0.09) 0 9px, transparent 9px 18px), repeating-linear-gradient(-45deg, rgba(120,86,10,0.06) 0 9px, transparent 9px 18px), linear-gradient(180deg,#f7dd93 0%,#c8a13a 52%,#8d660f 100%)",
      color: "#3d2c06",
      textShadow: "0 1px 0 rgba(255,255,255,0.45)",
    },
  },
];

// ---------------------------------------------------------------------------
// 地面地纹（floor）
// ---------------------------------------------------------------------------
export const CLAN_FLOORS: ClanDecorItem[] = [
  {
    id: "clan-floor-plain",
    name: "素土",
    desc: "不加雕饰，干净素朴",
    tier: "points",
    points: 0,
    priceFen: 0,
    preview: { background: "linear-gradient(180deg,#e6e2d9,#d3cec2)" },
    style: {},
  },
  {
    id: "clan-floor-stone",
    name: "青石板",
    desc: "方正石板，庭院气象 · 建馆赠品",
    tier: "free",
    preview: { background: "repeating-linear-gradient(90deg,#b9bcc0 0 1px,#a7abb0 1px 40px)" },
    style: {
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0 1px, transparent 1px 34px), repeating-linear-gradient(90deg, rgba(0,0,0,0.14) 0 1px, transparent 1px 56px), linear-gradient(180deg,#c3c6ca,#9fa4a9)",
    },
  },
  {
    id: "clan-floor-goldbrick",
    name: "金砖铺地",
    desc: "御窑金砖，光可鉴人 · 400 积分",
    tier: "points",
    points: 400,
    preview: { background: "repeating-linear-gradient(90deg,#6f6249 0 1px,#4e452f 1px 44px)" },
    style: {
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(255,230,170,0.10) 0 1px, transparent 1px 38px), repeating-linear-gradient(90deg, rgba(255,230,170,0.09) 0 1px, transparent 1px 62px), linear-gradient(180deg,#7a6b4e,#493f2b)",
    },
  },
  {
    id: "clan-floor-cloud",
    name: "云纹毯",
    desc: "祥云纹样，步步生辉 · 高级订阅",
    tier: "premium",
    preview: { background: "radial-gradient(circle at 30% 40%,#e3c98a,#8d6f2f)" },
    style: {
      backgroundImage:
        "radial-gradient(circle at 20% 50%, rgba(255,240,200,0.35) 0 12%, transparent 13%), radial-gradient(circle at 60% 30%, rgba(255,240,200,0.28) 0 10%, transparent 11%), radial-gradient(circle at 82% 62%, rgba(255,240,200,0.26) 0 11%, transparent 12%), linear-gradient(180deg,#c9a861,#7c6127)",
    },
  },
  {
    id: "clan-floor-brocade",
    name: "锦纹毯",
    desc: "织锦铺陈，礼数周全 · 高级订阅",
    tier: "premium",
    preview: { background: "repeating-linear-gradient(45deg,#9d2c28 0 6px,#d9b45f 6px 12px)" },
    style: {
      backgroundImage:
        "repeating-linear-gradient(45deg, rgba(255,215,140,0.22) 0 8px, transparent 8px 16px), repeating-linear-gradient(-45deg, rgba(255,215,140,0.16) 0 8px, transparent 8px 16px), linear-gradient(180deg,#a8322c,#6d1c19)",
    },
  },

  // -------------------------------------------------------------------------
  // 阶段 3 新增地面（2026-10）：把中高档地面补齐（旧地面只到 ¥4 的金砖铺地）
  // -------------------------------------------------------------------------
  {
    id: "clan-floor-hanbai",
    name: "汉白玉地",
    desc: "白玉铺地、石脉隐现，月台之上清光一片。",
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
    id: "clan-floor-imperial-brick",
    name: "御窑细砖",
    desc: "御窑细料，磨砖对缝、光可鉴人。比金砖更细一层。",
    tier: "buyout",
    priceFen: 2900,
    points: 2900,
    preview: { background: "repeating-linear-gradient(90deg,#8a7b5c 0 1px,#544a34 1px 46px)" },
    style: {
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(255,232,176,0.12) 0 1px, transparent 1px 40px), repeating-linear-gradient(90deg, rgba(255,232,176,0.11) 0 1px, transparent 1px 66px), radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,236,190,0.18), transparent 70%), linear-gradient(180deg,#8d7f60,#4c422e)",
    },
  },
  {
    id: "clan-floor-brocade-gold",
    name: "金线织锦地",
    desc: "满地织金团花，步履其上如踏锦绣。祖庭礼数，步步生辉。",
    tier: "buyout",
    priceFen: 5900,
    points: 5900,
    preview: { background: "repeating-linear-gradient(45deg,#a02a24 0 7px,#dcb85e 7px 14px)" },
    style: {
      backgroundImage:
        "radial-gradient(circle at 22% 34%, rgba(255,226,160,0.30) 0 7%, transparent 8%), radial-gradient(circle at 72% 28%, rgba(255,226,160,0.24) 0 6%, transparent 7%), radial-gradient(circle at 48% 76%, rgba(255,226,160,0.26) 0 7%, transparent 8%), repeating-linear-gradient(45deg, rgba(255,222,150,0.14) 0 8px, transparent 8px 17px), repeating-linear-gradient(-45deg, rgba(255,222,150,0.11) 0 8px, transparent 8px 17px), linear-gradient(180deg,#a02a24,#5e1613)",
    },
  },
  {
    id: "clan-floor-ninesilk",
    name: "九重云锦地",
    desc: "云锦满地、金线走边，九重祥云层层铺开。与九五鎏金殿同气。",
    tier: "buyout",
    priceFen: 9900,
    points: 9900,
    preview: { background: "repeating-linear-gradient(0deg,#c8a349 0 1px,#8b6a1c 1px 34px)" },
    style: {
      backgroundImage:
        "radial-gradient(ellipse 34% 22% at 18% 62%, rgba(255,246,206,0.34), transparent 70%), radial-gradient(ellipse 30% 20% at 56% 30%, rgba(255,246,206,0.28), transparent 68%), radial-gradient(ellipse 32% 22% at 84% 68%, rgba(255,246,206,0.26), transparent 68%), repeating-linear-gradient(90deg, rgba(255,240,190,0.10) 0 1px, transparent 1px 52px), repeating-linear-gradient(0deg, rgba(255,240,190,0.09) 0 1px, transparent 1px 38px), linear-gradient(180deg,#d6b055,#8a6716)",
    },
  },
];

// ---------------------------------------------------------------------------
// 挂饰陈设（ornament）
// ---------------------------------------------------------------------------
export const CLAN_ORNAMENTS: ClanDecorItem[] = [
  {
    id: "clan-orn-none",
    name: "不加挂饰",
    desc: "只留空间本身",
    tier: "points",
    points: 0,
    priceFen: 0,
    preview: { icon: "⬜" },
    style: {},
  },
  {
    id: "clan-orn-lantern",
    name: "红灯高照",
    desc: "两盏宫灯，喜气迎门",
    tier: "points",
    points: 200,
    priceFen: 200,
    preview: { icon: "🏮" },
    style: { ornament: { kind: "lantern", color: "#c0392b", count: 2 } },
    position: "top",
  },
  {
    id: "clan-orn-censer",
    name: "青铜香炉",
    desc: "一方香炉，香烟袅袅 · 建馆赠品",
    tier: "free",
    preview: { icon: "🪔" },
    style: { ornament: { kind: "incense-burner", color: "#7a6a45" } },
    position: "bottom",
  },
  {
    id: "clan-orn-pillar",
    name: "朱红立柱",
    desc: "两侧廊柱，气象庄严",
    tier: "points",
    points: 380,
    priceFen: 380,
    preview: { icon: "🟥" },
    style: { ornament: { kind: "couplet-pillar", color: "#9b2c22" } },
    position: "surround",
  },
  {
    id: "clan-orn-lion",
    name: "石狮镇门",
    desc: "一对石狮，镇守宗门 · 300 积分",
    tier: "points",
    points: 300,
    preview: { icon: "🦁" },
    style: { ornament: { kind: "stone-lion", color: "#a9a49b", count: 2 } },
    position: "bottom",
  },
  {
    id: "clan-orn-altar",
    name: "供桌陈设",
    desc: "香烛果品，四时供奉 · 500 积分",
    tier: "points",
    points: 500,
    preview: { icon: "🍊" },
    style: { ornament: { kind: "shelf", color: "#7a5230" } },
    position: "bottom",
  },
  {
    id: "clan-orn-imperial-plaque",
    name: "御赐匾额",
    desc: "金匾高悬，光耀门楣 · 800 积分",
    tier: "points",
    points: 800,
    preview: { icon: "🪧" },
    style: { ornament: { kind: "plaque", color: "#d4af37", text: "祖德流芳" } },
    position: "top",
  },
  {
    id: "clan-orn-tablet-wall",
    name: "牌位墙",
    desc: "列祖列宗，昭穆有序 · 1000 积分",
    tier: "points",
    points: 1000,
    preview: { icon: "🀄" },
    style: { ornament: { kind: "tablet-wall", color: "#8c6239", count: 7 } },
    position: "top",
  },
  {
    id: "clan-orn-banner",
    name: "幡旗招展",
    desc: "两侧长幡，威仪有度 · 高级订阅",
    tier: "premium",
    preview: { icon: "🚩" },
    style: { ornament: { kind: "banner-pair", color: "#a3281f", text: ["祖", "宗"] } },
    position: "surround",
  },
  {
    id: "clan-orn-dragonhaze",
    name: "云龙光晕",
    desc: "金光氤氲，瑞气盈门 · 高级订阅",
    tier: "premium",
    preview: { icon: "✨" },
    style: { ornament: { kind: "halo", color: "#e8c568" } },
    position: "top",
  },
  // -------------------------------------------------------------------------
  // 阶段 2 新增（2026-10）：与纪念馆共用渲染器，但**在祠堂语境下重新命名**
  // -------------------------------------------------------------------------
  //
  // 为什么不直接复用纪念馆的 orn-* id：宗祠装修存在自己的权益键空间
  // （`buy:` / `tpl:` / `kit:` 前缀 + clan 命名空间），跨库引用 id 会让
  // "在宗祠里买了纪念馆的素材"这种脏数据成为可能。
  // ⚠️ 新增一律不落 `free` —— 宗祠赠品零件的集合相等断言同样成立
  //    （`CLAN_GRANT_TEMPLATE` 的零件见 lib/hall-decor.ts 的 GRANTED_TEMPLATE_PARTS）。
  {
    id: "clan-orn-imperial-lantern",
    name: "六角宫灯",
    desc: "重檐垂锦，门前生辉 · 2900 积分",
    tier: "points",
    points: 2900,
    preview: { icon: "🏮" },
    style: { ornament: { kind: "imperial-lantern", color: "#f0d79a", count: 2 } },
    position: "top",
  },
  {
    id: "clan-orn-plaque-pair",
    name: "匾联一堂",
    desc: "金匾居中，朱联分列两侧 · 堂上规制 · 高级订阅",
    tier: "premium",
    preview: { icon: "🪧" },
    style: { ornament: { kind: "plaque-pair", color: "#d4af37", text: "祖德流芳" } },
    position: "top",
  },
  {
    id: "clan-orn-screen-wall",
    name: "青砖影壁",
    desc: "山门照壁，回纹壁心 · 3600 积分",
    tier: "points",
    points: 3600,
    preview: { icon: "🧱" },
    style: { ornament: { kind: "screen-wall", color: "#8b9098" } },
    position: "bottom",
  },
  {
    id: "clan-orn-screen",
    name: "四扇折屏",
    desc: "绢面折屏，分隔内外 · 2600 积分",
    tier: "points",
    points: 2600,
    preview: { icon: "🚪" },
    style: { ornament: { kind: "screen", color: "#7a5a33" } },
    position: "bottom",
  },
  {
    id: "clan-orn-scroll",
    name: "祖宗挂轴",
    desc: "一对挂轴，两侧垂悬 · 1500 积分",
    tier: "points",
    points: 1500,
    preview: { icon: "🖼️" },
    style: { ornament: { kind: "scroll-painting", color: "#7a8a98" } },
    position: "surround",
  },
  {
    id: "clan-orn-candlestick",
    name: "描金烛台",
    desc: "一对烛台，长明不熄 · 800 积分",
    tier: "points",
    points: 800,
    preview: { icon: "🕯️" },
    style: { ornament: { kind: "candlestick", color: "#c9a961" } },
    position: "bottom",
  },

  // -------------------------------------------------------------------------
  // 阶段 3 新增挂饰（2026-10）：补齐 ¥5–18 的入门器物与豪华整组
  // -------------------------------------------------------------------------
  {
    id: "clan-orn-bowl",
    name: "白瓷供碗",
    desc: "一对素白供碗，碗口微撇。最简的清供，入门之选 · 500 积分",
    tier: "points",
    points: 500,
    priceFen: 500,
    preview: { icon: "🥣" },
    style: { ornament: { kind: "vase", color: "#e2e6e0" } },
    position: "bottom",
  },
  {
    id: "clan-orn-tray",
    name: "铜盘果供",
    desc: "黄铜果盘，盛四时鲜果。小小一件，案上便有了活气 · 800 积分",
    tier: "points",
    points: 800,
    priceFen: 800,
    preview: { icon: "🍊" },
    style: { ornament: { kind: "incense-table", color: "#b08a34" } },
    position: "bottom",
  },
  {
    id: "clan-orn-plain-candlestick",
    name: "素铜烛台",
    desc: "一对素铜烛台，不描金也端正 · 1200 积分",
    tier: "points",
    points: 1200,
    priceFen: 1200,
    preview: { icon: "🕯️" },
    style: { ornament: { kind: "candlestick", color: "#c0b090" } },
    position: "bottom",
  },
  {
    id: "clan-orn-bookcase",
    name: "博古架",
    desc: "多宝格一架，可陈谱牒可置器 · 1800 积分",
    tier: "points",
    points: 1800,
    priceFen: 1800,
    preview: { icon: "🗄️" },
    style: { ornament: { kind: "shelf", color: "#8a6a45" } },
    position: "bottom",
  },
  {
    id: "clan-orn-stone-drum",
    name: "抱鼓石",
    desc: "门侧一对抱鼓石，鼓面浮雕云纹。门第之辨，自此而始 · 2600 积分",
    tier: "points",
    points: 2600,
    priceFen: 2600,
    preview: { icon: "🪨" },
    style: { ornament: { kind: "stone-lion", color: "#b8b2a6", count: 2 } },
    position: "bottom",
  },
  {
    id: "clan-orn-caisson-lamp",
    name: "藻井长明灯",
    desc: "自藻井中心垂下的长明灯，灯光自上洒落，满堂生辉 · 4900 积分",
    tier: "points",
    points: 4900,
    priceFen: 4900,
    preview: { icon: "💡" },
    style: { ornament: { kind: "caisson-light", color: "#f0d79a" } },
    position: "top",
  },
  {
    id: "clan-orn-ancestral-scroll",
    name: "祖宗画像轴",
    desc: "大幅立轴悬于正壁，两侧配小轴。画像在前，如在目前 · 高级订阅",
    tier: "premium",
    preview: { icon: "📜" },
    style: { ornament: { kind: "scroll-painting", color: "#8a7a62" } },
    position: "surround",
  },
  {
    id: "clan-orn-sixfold-screen",
    name: "六扇曲屏",
    desc: "六扇绢面曲屏，折出内外。一屏之隔，内外两分 · 3900 积分",
    tier: "points",
    points: 3900,
    priceFen: 3900,
    preview: { icon: "🪟" },
    style: { ornament: { kind: "screen", color: "#8a6a3e" } },
    position: "bottom",
  },
];

// ---------------------------------------------------------------------------
// 相框（frame）
// ---------------------------------------------------------------------------
export const CLAN_FRAMES: ClanDecorItem[] = [
  {
    id: "clan-frame-plain",
    name: "素框",
    desc: "无饰细框，克制得体",
    tier: "points",
    points: 120,
    priceFen: 120,
    preview: { border: "1px solid #cfcac0" },
    style: { borderColor: "#cfcac0", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  },
  {
    id: "clan-frame-wood",
    name: "木框",
    desc: "原木浅框，质朴温和 · 建馆赠品",
    tier: "free",
    preview: { border: "3px solid #a9814f" },
    style: { borderColor: "#a9814f", boxShadow: "0 3px 10px rgba(80,50,20,0.20)" },
  },
  {
    id: "clan-frame-fret",
    name: "回纹框",
    desc: "回纹环饰，古雅有致 · 200 积分",
    tier: "points",
    points: 200,
    preview: { border: "4px double #8a6a3c" },
    style: {
      borderColor: "#8a6a3c",
      boxShadow: "0 0 0 3px #e6d8bd inset, 0 4px 12px rgba(70,45,15,0.25)",
    },
  },
  {
    id: "clan-frame-dragon",
    name: "云龙框",
    desc: "云龙盘绕，气势不凡 · 400 积分",
    tier: "points",
    points: 400,
    preview: { border: "4px solid #b08a34" },
    style: {
      borderColor: "#b08a34",
      boxShadow: "0 0 0 2px #f0e0b0 inset, 0 0 14px rgba(176,138,52,0.45), 0 5px 16px rgba(60,40,10,0.3)",
    },
  },
  {
    id: "clan-frame-gilt",
    name: "描金框",
    desc: "通体描金，尊贵庄重 · 高级订阅",
    tier: "premium",
    preview: { border: "5px solid #d9b64e" },
    style: {
      borderColor: "#d9b64e",
      boxShadow:
        "0 0 0 3px #fff4d0 inset, 0 0 22px rgba(217,182,78,0.65), 0 6px 20px rgba(60,40,10,0.35)",
    },
  },
  {
    id: "clan-frame-carved",
    name: "雕花框",
    desc: "繁复雕花，工不厌精 · 高级订阅",
    tier: "premium",
    preview: { border: "6px ridge #7b4b2a" },
    style: {
      borderColor: "#7b4b2a",
      boxShadow:
        "0 0 0 2px #c79a63 inset, 0 0 0 6px #5d3720 inset, 0 7px 22px rgba(40,20,5,0.4)",
    },
  },

  // -------------------------------------------------------------------------
  // 阶段 3 新增相框（2026-10）：旧相框最贵只到 ¥4 的云龙框，
  // 而 clan-frame-gilt / clan-frame-carved 是高级订阅 —— 中高档断档。
  // -------------------------------------------------------------------------
  {
    id: "clan-frame-brocade",
    name: "织锦框",
    desc: "锦缎包边、金线走框，与金线织锦地成套 · 2900 积分",
    tier: "points",
    points: 2900,
    priceFen: 2900,
    preview: { border: "9px solid #a8322c" },
    style: {
      borderColor: "#a8322c",
      boxShadow:
        "0 0 0 3px #d8b25c inset, 0 0 0 1px rgba(255,236,180,0.45) inset, 0 0 26px rgba(216,178,92,0.45), 0 9px 24px rgba(0,0,0,0.3)",
    },
  },
  {
    id: "clan-frame-imperial-dragon",
    name: "御制蟠龙框",
    desc: "满雕蟠龙、通体赤金，框上压框。给始祖画像最高的礼遇 · 5900 积分",
    tier: "points",
    points: 5900,
    priceFen: 5900,
    preview: { border: "11px double #e2bc60" },
    style: {
      borderColor: "#e2bc60",
      boxShadow:
        "0 0 0 4px #8a6512 inset, 0 0 0 7px #f8e7ac inset, 0 0 0 1px rgba(255,255,255,0.5) inset, 0 0 42px rgba(226,188,96,0.68), 0 12px 30px rgba(0,0,0,0.36)",
    },
  },
];

// ---------------------------------------------------------------------------
// 字体（font）
// ---------------------------------------------------------------------------
export const CLAN_FONTS: ClanDecorItem[] = [
  {
    id: "clan-font-song",
    name: "宋体",
    desc: "端正隽永，谱牒常用",
    tier: "points",
    points: 100,
    priceFen: 100,
    preview: { fontFamily: '"Songti SC","SimSun",serif' },
    style: { fontFamily: '"Songti SC","SimSun","Noto Serif SC",serif', letterSpacing: "0.04em" },
  },
  {
    id: "clan-font-kai",
    name: "楷体",
    desc: "温润舒展，碑帖气韵 · 建馆赠品",
    tier: "free",
    preview: { fontFamily: '"Kaiti SC","KaiTi",serif' },
    style: { fontFamily: '"Kaiti SC","KaiTi","STKaiti",serif', letterSpacing: "0.06em" },
  },
  {
    id: "clan-font-li",
    name: "隶书",
    desc: "蚕头燕尾，庙堂气息 · 200 积分",
    tier: "points",
    points: 200,
    preview: { fontFamily: '"LiSu","STLiti",serif' },
    style: {
      fontFamily: '"LiSu","STLiti","Noto Serif SC",serif',
      letterSpacing: "0.14em",
      textShadow: "0 1px 1px rgba(0,0,0,0.18)",
    },
  },
  {
    id: "clan-font-zhuan",
    name: "篆书",
    desc: "古篆蜿蜒，金石意味 · 300 积分",
    tier: "points",
    points: 300,
    preview: { fontFamily: '"Xingkai SC","STXingkai",serif' },
    style: {
      fontFamily: '"STXingkai","Xingkai SC","Serif",serif',
      letterSpacing: "0.2em",
      textShadow: "0 1px 2px rgba(0,0,0,0.22)",
    },
  },
  {
    id: "clan-font-imperial",
    name: "御笔",
    desc: "御题气象，落纸生辉 · 高级订阅",
    tier: "premium",
    preview: { fontFamily: '"STXingkai",cursive' },
    style: {
      fontFamily: '"STXingkai","Xingkai SC",cursive',
      letterSpacing: "0.24em",
      textShadow: "0 2px 4px rgba(0,0,0,0.3), 0 0 12px rgba(212,175,55,0.35)",
    },
  },

  // -------------------------------------------------------------------------
  // 阶段 3 新增字体（2026-10）：旧字体最高只到 ¥3 的篆书，
  // clan-font-imperial（御笔）是高级订阅 —— 中间那一段补上。
  // -------------------------------------------------------------------------
  {
    id: "clan-font-bei",
    name: "碑刻隶书",
    desc: "蚕头燕尾、一波三折，如读汉碑。字距疏朗，肃穆自生 · 1800 积分",
    tier: "points",
    points: 1800,
    priceFen: 1800,
    preview: { fontFamily: '"LiSu","STLiti",serif' },
    style: {
      fontFamily: '"LiSu","STLiti","Noto Serif SC",serif',
      letterSpacing: "0.12em",
      textShadow: "0 1px 1px rgba(0,0,0,0.16)",
    },
  },
  {
    id: "clan-font-yubi-grand",
    name: "御笔亲题",
    desc: "如御笔亲题匾额，笔画开张、气度自足。祖庭题名宜用此体 · 2900 积分",
    tier: "points",
    points: 2900,
    priceFen: 2900,
    preview: { fontFamily: '"STXingkai",cursive' },
    style: {
      fontFamily: '"STXingkai","Xingkai SC","KaiTi",cursive',
      letterSpacing: "0.16em",
      textShadow: "0 2px 4px rgba(0,0,0,0.16), 0 0 10px rgba(201,169,97,0.28)",
    },
  },
];

// ---------------------------------------------------------------------------
// 整套模板（template）
// ---------------------------------------------------------------------------
export const CLAN_TEMPLATES: DecorTemplate[] = [
  {
    id: "clan-tpl-plain",
    name: "素朴祠堂",
    desc: "白墙素地，清净不扰",
    tier: "points",
    points: 600,
    priceFen: 600,
    tags: ["积分", "素雅", "日常"],
    slots: {
      wall: "clan-wall-white",
      floor: "clan-floor-plain",
      ornament: ["clan-orn-censer"],
      frame: "clan-frame-plain",
      font: "clan-font-song",
    },
    space: "courtyard",
    preview: { background: "#f7f6f2", color: "#2b2b28", accent: "#b08a34", icon: "🏛️" },
  },
  {
    id: "clan-tpl-vermilion",
    name: "朱漆祠堂",
    desc: "朱红大漆，庄重显赫",
    tier: "points",
    points: 1200,
    priceFen: 1200,
    tags: ["积分", "传统", "庄重"],
    slots: {
      wall: "clan-wall-vermilion",
      floor: "clan-floor-plain",
      ornament: ["clan-orn-lantern"],
      frame: "clan-frame-wood",
      font: "clan-font-kai",
    },
    space: "hall",
    preview: { background: "#8e2018", color: "#fdf3e3", accent: "#d4af37", icon: "🏮" },
  },
  {
    id: "clan-tpl-ancestral",
    name: "祖德流芳",
    desc: "青砖香炉，古祠本色 · 建馆赠品",
    tier: "free",
    tags: ["赠品", "古朴", "常用"],
    slots: {
      wall: "clan-wall-brick",
      floor: "clan-floor-stone",
      ornament: ["clan-orn-censer"],
      frame: "clan-frame-wood",
      font: "clan-font-kai",
    },
    /*
      space 显式声明为 shrine（而不是留空走 classic）。
      原因：宗祠赠品是**每一座**宗祠的默认样子，它决定"没有花钱的宗祠长什么样"。
      留空会退化成通用的"三面墙厅堂"，与山门/享堂/寝堂的建筑语言脱节。
    */
    space: "shrine",
    preview: { background: "#7d858b", color: "#f6f4f0", accent: "#c9a240", icon: "🪔" },
  },
  {
    id: "clan-tpl-dragonmarble",
    name: "云龙汉白玉",
    desc: "白粉墙配云龙框，清贵之气 · 1400 积分",
    tier: "points",
    points: 1400,
    tags: ["清贵", "积分", "云龙"],
    slots: {
      wall: "clan-wall-white",
      floor: "clan-floor-stone",
      ornament: ["clan-orn-lion"],
      frame: "clan-frame-dragon",
      font: "clan-font-li",
    },
    space: "courtyard",
    preview: { background: "#f7f6f2", color: "#2b2b28", accent: "#b08a34", icon: "🦁" },
  },
  {
    id: "clan-tpl-hallplaque",
    name: "高堂悬匾",
    desc: "朱漆立柱，金匾高悬 · 2200 积分",
    tier: "points",
    points: 2200,
    tags: ["显赫", "积分", "匾额"],
    slots: {
      wall: "clan-wall-vermilion",
      floor: "clan-floor-goldbrick",
      ornament: ["clan-orn-imperial-plaque"],
      frame: "clan-frame-fret",
      font: "clan-font-li",
    },
    space: "hall",
    preview: { background: "#8e2018", color: "#fdf3e3", accent: "#d4af37", icon: "🪧" },
  },
  {
    id: "clan-tpl-imperial",
    name: "御赐宗祠",
    desc: "鎏金满堂，御笔题额 · 高级订阅",
    tier: "premium",
    priceFen: 6600,
    tags: ["华贵", "高级", "御赐"],
    slots: {
      wall: "clan-wall-gilt",
      floor: "clan-floor-brocade",
      ornament: ["clan-orn-imperial-plaque"],
      frame: "clan-frame-gilt",
      font: "clan-font-imperial",
    },
    space: "hall",
    preview: { background: "#c9a240", color: "#3b2c09", accent: "#fff4d0", icon: "👑" },
  },
  {
    id: "clan-tpl-ancestorshrine",
    name: "先祖圣殿",
    desc: "楠木牌位，香火不绝 · 高级订阅",
    tier: "premium",
    priceFen: 5200,
    tags: ["沉穆", "高级", "牌位"],
    slots: {
      wall: "clan-wall-nanmu",
      floor: "clan-floor-cloud",
      ornament: ["clan-orn-tablet-wall"],
      frame: "clan-frame-carved",
      font: "clan-font-zhuan",
    },
    space: "shrine",
    preview: { background: "#6d4c26", color: "#f8eedb", accent: "#d4af37", icon: "🀄" },
  },
  {
    id: "clan-tpl-xianghuo",
    name: "香火绵延",
    desc: "幡旗长明，瑞气云龙 · 高级订阅",
    tier: "premium",
    priceFen: 5800,
    tags: ["威仪", "高级", "幡旗"],
    slots: {
      wall: "clan-wall-nanmu",
      floor: "clan-floor-goldbrick",
      ornament: ["clan-orn-banner"],
      frame: "clan-frame-gilt",
      font: "clan-font-imperial",
    },
    space: "gate",
    preview: { background: "#8a6234", color: "#f7ecd8", accent: "#e8c568", icon: "🚩" },
  },

  // =========================================================================
  // 新增收费模板（2026-10）：10 套。
  //
  // 与纪念馆侧同构：每套声明自己的 `space`，3D 预览呈现不同建筑原型
  // （山门 / 天井庭院 / 享堂 / 寝堂），而不是同一间祠堂换壁纸。
  //
  // ⚠️ 宗祠的 `space` 必须落在 lib/decor-3d.ts 已注册的形态里。
  // =========================================================================

  {
    /* 原型：山门。最开阔的室外空间，环视 40°，地面有石缝网格 */
    id: "clan-tpl-gateway",
    name: "山门气象 · 立体",
    desc: "屋脊高耸、门楼对峙、抱鼓石分立两侧。立于门前环视，气象自成。",
    tier: "points",
    points: 2200,
    priceFen: 2200,
    tags: ["积分", "山门", "室外", "3D"],
    slots: {
      wall: "clan-wall-brick",
      floor: "clan-floor-stone",
      ornament: ["clan-orn-lion"],
      frame: "clan-frame-dragon",
      font: "clan-font-li",
    },
    preview: { background: "linear-gradient(180deg,#9aa3ab,#5f686e)", color: "#f6f4f0", accent: "#c9a240", icon: "⛩️" },
    space: "gate",
  },
  {
    /* 原型：庭院天井。露天无顶，环视 34°，青石网格铺地 */
    id: "clan-tpl-courtyard",
    name: "天井庭院 · 立体",
    desc: "四水归堂，两廊立柱撑起长幡。抬头是天，环顾是院，祖先在正堂。",
    tier: "points",
    points: 2200,
    priceFen: 2200,
    tags: ["积分", "庭院", "天井", "3D"],
    slots: {
      wall: "clan-wall-white",
      floor: "clan-floor-stone",
      ornament: ["clan-orn-banner"],
      frame: "clan-frame-fret",
      font: "clan-font-song",
    },
    preview: { background: "linear-gradient(180deg,#dfe7ee,#a9b6c0)", color: "#2b2b28", accent: "#b08a34", icon: "🏡" },
    space: "courtyard",
  },
  {
    id: "clan-tpl-thronehall",
    name: "高堂大殿 · 立体",
    desc: "六道斗拱横梁层层递进，朱漆立柱贴壁而立，御赐金匾自梁上垂落。",
    tier: "points",
    points: 3600,
    priceFen: 3600,
    tags: ["积分", "大殿", "斗拱", "3D"],
    slots: {
      wall: "clan-wall-vermilion",
      floor: "clan-floor-goldbrick",
      ornament: ["clan-orn-imperial-plaque"],
      frame: "clan-frame-fret",
      font: "clan-font-li",
    },
    preview: { background: "#8e2018", color: "#fdf3e3", accent: "#d4af37", icon: "🏯" },
    space: "hall",
  },
  {
    /* 原型：寝堂。牌位墙是主角，纵深中等，光线偏暖偏暗 */
    id: "clan-tpl-ancestral3d",
    name: "牌位寝堂 · 立体",
    desc: "整面牌位墙昭穆有序，青铜香炉置于香案正中，香烟袅袅向上。",
    tier: "points",
    points: 2800,
    priceFen: 2800,
    tags: ["积分", "寝堂", "牌位", "3D"],
    slots: {
      wall: "clan-wall-nanmu",
      floor: "clan-floor-goldbrick",
      ornament: ["clan-orn-tablet-wall"],
      frame: "clan-frame-carved",
      font: "clan-font-zhuan",
    },
    preview: { background: "#6d4c26", color: "#f8eedb", accent: "#d4af37", icon: "🀄" },
    space: "shrine",
  },
  {
    id: "clan-tpl-earthancient",
    name: "夯土古祠",
    desc: "黄泥夯筑的旧墙，不加雕饰的素土地面，一盏红灯高照。返璞归真。",
    tier: "points",
    points: 1000,
    priceFen: 1000,
    tags: ["积分", "古朴", "夯土", "3D"],
    slots: {
      wall: "clan-wall-earth",
      floor: "clan-floor-plain",
      ornament: ["clan-orn-lantern"],
      frame: "clan-frame-wood",
      font: "clan-font-kai",
    },
    preview: { background: "linear-gradient(180deg,#d8c3a0,#b99f78)", color: "#3b2f1e", accent: "#8a5a24", icon: "🟫" },
    space: "hall",
  },
  {
    id: "clan-tpl-whitewash",
    name: "白墙素堂",
    desc: "石灰抹面洁净明快，朱红立柱分列两侧，玉狮镇门。清贵得体。",
    tier: "points",
    points: 1200,
    priceFen: 1200,
    tags: ["积分", "清贵", "白墙", "3D"],
    slots: {
      wall: "clan-wall-white",
      floor: "clan-floor-stone",
      ornament: ["clan-orn-pillar"],
      frame: "clan-frame-fret",
      font: "clan-font-song",
    },
    preview: { background: "linear-gradient(180deg,#fbfbf9,#eeeee9)", color: "#2b2b28", accent: "#9b2c22", icon: "⬜" },
    space: "courtyard",
  },
  {
    id: "clan-tpl-incensehall",
    name: "香火长明",
    desc: "青铜香炉居中，供桌陈设四时果品，金砖铺地映出炉火。香火不绝。",
    tier: "points",
    points: 2600,
    priceFen: 2600,
    tags: ["积分", "香火", "供奉", "3D"],
    slots: {
      wall: "clan-wall-brick",
      floor: "clan-floor-goldbrick",
      ornament: ["clan-orn-altar"],
      frame: "clan-frame-wood",
      font: "clan-font-li",
    },
    preview: { background: "linear-gradient(180deg,#8a6234,#4d3418)", color: "#f7ecd8", accent: "#c9a240", icon: "🪔" },
    space: "shrine",
  },
  {
    id: "clan-tpl-bannerhall",
    name: "幡旗仪门",
    desc: "两侧长幡垂天，云龙光晕自顶上洒落。立于仪门之下，威仪有度。",
    tier: "premium",
    points: 6900,
    priceFen: 6900,
    tags: ["订阅", "幡旗", "威仪", "3D"],
    slots: {
      wall: "clan-wall-vermilion",
      floor: "clan-floor-goldbrick",
      ornament: ["clan-orn-banner"],
      frame: "clan-frame-gilt",
      font: "clan-font-imperial",
    },
    preview: { background: "#8a6234", color: "#f7ecd8", accent: "#e8c568", icon: "🚩" },
    space: "gate",
  },
  {
    id: "clan-tpl-dragonthrone",
    name: "云龙宝殿",
    desc: "鎏金满殿，云龙光晕自穹顶垂下，织锦铺地。极尽尊荣之能事。",
    tier: "premium",
    points: 9900,
    priceFen: 9900,
    tags: ["订阅", "鎏金", "穹顶", "3D"],
    slots: {
      wall: "clan-wall-gilt",
      floor: "clan-floor-brocade",
      ornament: ["clan-orn-dragonhaze"],
      frame: "clan-frame-carved",
      font: "clan-font-imperial",
    },
    preview: { background: "#c9a240", color: "#3b2c09", accent: "#fff4d0", icon: "🐉" },
    space: "hall",
  },
  {
    id: "clan-tpl-stoneterrace",
    name: "青石月台",
    desc: "青砖墙配青石板地，月台三阶，玉狮镇守。古祠本色，最是耐看。",
    tier: "points",
    points: 1200,
    priceFen: 1200,
    tags: ["积分", "青石", "月台", "3D"],
    slots: {
      wall: "clan-wall-brick",
      floor: "clan-floor-stone",
      ornament: ["clan-orn-lion"],
      frame: "clan-frame-plain",
      font: "clan-font-kai",
    },
    preview: { background: "#7d858b", color: "#f6f4f0", accent: "#c9a240", icon: "🪨" },
    space: "courtyard",
  },
];

// ---------------------------------------------------------------------------
// 宗祠装饰套件（值定义必须留在本文件，勿搬去 hall-decor.ts）
// ---------------------------------------------------------------------------
/**
 * 宗祠装饰套件。
 *
 * 与纪念馆套件（`KITS`）的关系：id 前缀区分（`clan-`），includes 引用宗祠自己的素材 id。
 * 两边**不可混用**（纪念馆买不到宗祠套件，反之亦然）——
 * 因为素材 id 命名空间不同，混用会让套件里的 includes 一半失效。
 *
 * ⚠️ 为什么这段**不能**放在 lib/hall-decor.ts（虽然类型 DecorKit 在那儿）：
 *    clan-decor.ts 要 import hall-decor 的类型与工具（buyKey/tplKey…），
 *    而下面的 CLAN_DECOR_CATEGORIES 又直接引用本数组。
 *    若数组定义在 hall-decor.ts，客户端 bundle 一旦先求值 clan-decor，
 *    数组还是 undefined，`items: CLAN_KITS` 就把 undefined 塞进分类目录，
 *    宗祠控制台整页崩：
 *      TypeError: Cannot set properties of undefined (setting 'clan-kit-incense')
 *    —— 报在套件 id 上，看着像数据写错，其实是模块初始化顺序。
 *    **类型可以共享，值必须留在各自文件里。**
 */
export const CLAN_KITS: DecorKit[] = [
  {
    id: "clan-kit-incense",
    name: "香火供奉套件",
    desc: "青铜香炉、供桌陈设、红灯高照。四时供奉，香火不绝。",
    tier: "points",
    points: 800,
    priceFen: 800,
    tags: ["积分", "香火", "供奉"],
    includes: ["clan-orn-censer", "clan-orn-altar", "clan-orn-lantern"],
    preview: { background: "linear-gradient(135deg,#7a6a45,#4d3418)", color: "#f7ecd8", accent: "#c9a240", icon: "🪔" },
  },
  {
    id: "clan-kit-dignity",
    name: "威仪仪门套件",
    desc: "石狮镇门、朱红立柱、幡旗招展。立于门前，气象自成。",
    tier: "points",
    points: 1100,
    priceFen: 1100,
    tags: ["积分", "威仪", "仪门"],
    includes: ["clan-orn-lion", "clan-orn-pillar", "clan-orn-banner"],
    preview: { background: "linear-gradient(135deg,#9b2c22,#6d1c19)", color: "#fdf3e3", accent: "#d4af37", icon: "🦁" },
  },
  {
    id: "clan-kit-imperial",
    name: "御赐金匾套件",
    desc: "御赐匾额高悬、云龙光晕笼罩、牌位墙昭穆有序。光耀门楣。",
    tier: "points",
    points: 1500,
    priceFen: 1500,
    tags: ["积分", "匾额", "牌位"],
    includes: ["clan-orn-imperial-plaque", "clan-orn-dragonhaze", "clan-orn-tablet-wall"],
    preview: { background: "linear-gradient(135deg,#c9a240,#8b6a1e)", color: "#3b2c09", accent: "#fff4d0", icon: "🪧" },
  },
  {
    id: "clan-kit-plain",
    name: "素朴清供套件",
    desc: "一方香炉、两盏红灯，不加多余装饰。清净不扰，最耐久看。",
    tier: "points",
    points: 500,
    priceFen: 500,
    tags: ["积分", "素朴", "清简"],
    includes: ["clan-orn-censer", "clan-orn-lantern"],
    preview: { background: "linear-gradient(135deg,#f7f6f2,#dfe7ee)", color: "#2b2b28", accent: "#b08a34", icon: "🕯️" },
  },
  {
    id: "clan-kit-frame",
    name: "祠堂相框字体套件",
    desc: "回纹框、云龙框、描金雕花框，配隶书与篆书。给祖宗画像与谱牒最好的礼遇。",
    tier: "premium",
    points: 0,
    priceFen: 1400,
    tags: ["订阅", "相框", "字体"],
    includes: ["clan-frame-fret", "clan-frame-dragon", "clan-frame-gilt", "clan-frame-carved", "clan-font-li", "clan-font-zhuan", "clan-font-imperial"],
    preview: { background: "linear-gradient(135deg,#7b4b2a,#c79a63)", color: "#fdf3e3", accent: "#fff4d0", icon: "🖼️" },
  },

  // =========================================================================
  // 阶段 3 新增「整店套餐」（2026-10）：带 `applies`，含 wall / floor
  // =========================================================================
  //
  // 与纪念馆侧 `kit-imperial-hall` / `kit-scholar-retreat` 同构：
  // `includes` 是"买到手的零件"，`applies` 是"点一下落到哪五个槽位"。
  // 两者都要写 —— 只写 includes 会让用户看到"套件买了，墙还是旧的"。
  {
    id: "clan-kit-ancestral-grand",
    name: "祖庭整装包",
    desc: "缂丝蟠龙满壁、金线织锦铺地、匾联一堂、御制蟠龙框配御笔亲题。点一下，整祠换新。含墙与地。",
    tier: "buyout",
    priceFen: 6900,
    points: 6900,
    tags: ["买断", "整装", "祖庭", "含墙地"],
    includes: [
      "clan-wall-brocade-dragon",
      "clan-floor-brocade-gold",
      "clan-orn-plaque-pair",
      "clan-frame-imperial-dragon",
      "clan-font-yubi-grand",
    ],
    applies: {
      wall: "clan-wall-brocade-dragon",
      floor: "clan-floor-brocade-gold",
      ornament: "clan-orn-plaque-pair",
      frame: "clan-frame-imperial-dragon",
      font: "clan-font-yubi-grand",
    },
    structure: "imperial",
    preview: { background: "linear-gradient(135deg,#3b2a12,#a02a24)", color: "#ffeec2", accent: "#d4af37", icon: "🏛️" },
  },
];

// ---------------------------------------------------------------------------
// 索引与查询
// ---------------------------------------------------------------------------
export const CLAN_DECOR_CATEGORIES: {
  key: DecorCategory;
  label: string;
  hint: string;
  items: ClanDecorItem[] | DecorTemplate[] | DecorKit[];
}[] = [
  { key: "template", label: "整套模板", hint: "一键应用全套搭配，建筑形态与光线一起改变", items: CLAN_TEMPLATES },
  { key: "kit", label: "装饰套件", hint: "成套搭配：普通套件只换装饰、保留你挑好的墙与地；「整装包」一键连墙带地全换", items: CLAN_KITS },
  { key: "wall", label: "墙面材质", hint: "祠堂的基调，决定整体气象", items: CLAN_WALLS },
  { key: "floor", label: "地面铺装", hint: "脚下质感，垫起空间层次", items: CLAN_FLOORS },
  { key: "ornament", label: "挂饰陈设", hint: "香炉、石狮、牌位墙、幡旗等", items: CLAN_ORNAMENTS },
  { key: "frame", label: "相框", hint: "为祖先画像配一副好框", items: CLAN_FRAMES },
  { key: "font", label: "字体风格", hint: "文字的性格，也是敬祖的语气", items: CLAN_FONTS },
];

export const CLAN_SLOT_ITEMS: Record<DecorSlot, ClanDecorItem[]> = {
  wall: CLAN_WALLS,
  floor: CLAN_FLOORS,
  ornament: CLAN_ORNAMENTS,
  frame: CLAN_FRAMES,
  font: CLAN_FONTS,
};

export const CLAN_DEFAULT_DECOR: HallSlots = {
  wall: "clan-wall-brick",
  floor: "clan-floor-plain",
  ornament: ["clan-orn-censer"],
  frame: "clan-frame-plain",
  font: "clan-font-song",
};

/** 按 id 查素材（跨分类） */
export function findClanDecorItem(id: string): ClanDecorItem | undefined {
  return [...CLAN_WALLS, ...CLAN_FLOORS, ...CLAN_ORNAMENTS, ...CLAN_FRAMES, ...CLAN_FONTS].find(
    (i) => i.id === id,
  );
}

export function findClanTemplate(id: string): DecorTemplate | undefined {
  return CLAN_TEMPLATES.find((t) => t.id === id);
}

/**
 * 判断某宗祠素材对当前馆主是否可用。
 *  - free：始终可用（改版后只剩赠品模板及其零件）
 *  - points / buyout：已解锁（`buy:<id>`）**且租期未过**，或高级订阅期内
 *  - premium：需高级订阅生效
 *
 * `granted` 为建馆赠品模板 id 列表；赠品用到的零件随之永久免费（甲方案）。
 * 租期口径与纪念馆侧 isUnlocked 完全一致（isKeyActive，缺条目=永久）。
 */
export function isClanUnlocked(
  item: ClanDecorItem | DecorItem,
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

/** 将宗祠装修方案归一化：非法/未解锁素材回退到默认搭配 */
export function normalizeClanDecor(
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
    wall: CLAN_DEFAULT_DECOR.wall,
    floor: CLAN_DEFAULT_DECOR.floor,
    frame: CLAN_DEFAULT_DECOR.frame,
    font: CLAN_DEFAULT_DECOR.font,
    ornament: [...CLAN_DEFAULT_DECOR.ornament],
  };

  // 非挂饰槽位走通用逻辑（挂饰是数组，单独处理）
  (["wall", "floor", "frame", "font"] as const).forEach((slot) => {
    const id = rawSlots[slot];
    const item = id ? CLAN_SLOT_ITEMS[slot].find((i) => i.id === id) : undefined;
    // 槽位与分类必须匹配，且素材必须已解锁，否则保持默认
    if (item && isClanUnlocked(item, opts)) slots[slot] = item.id;
  });

  /*
    合法的模板：免费的、赠品里的、已解锁**且租期未过**的，三者之一即可。
    （与纪念馆同口径 —— 早先只校验"模板 id 存在"，收费模板没买也一直在用。）
  */
  const tplId = input.templateId;
  const tpl = tplId ? findClanTemplate(tplId) : undefined;
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
    与 normalizeDecor（纪念馆）**同口径**地兼容三种旧形态：
      ① 旧 slots.ornament 字符串 ② 旧并行顶层 ornaments 数组 ③ 新 slots.ornament 数组。
    不变量（非空 / 去重 / 逐项 isClanUnlocked / 长度 ≤ MAX_ORNAMENTS / 首件即主陈设）
    两端一致，否则会出现"纪念馆能挂三件、宗祠只挂一件"的分叉。
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
    const ornItem = CLAN_SLOT_ITEMS.ornament.find((i) => i.id === raw);
    if (ornItem && isClanUnlocked(ornItem, opts)) {
      orns.push(raw);
      if (orns.length >= MAX_ORNAMENTS) break;
    }
  }
  if (orns.length === 0) orns.push(CLAN_DEFAULT_DECOR.ornament[0]);
  slots.ornament = orns;

  return {
    templateId,
    slots,
    unlocked: opts.unlocked,
    granted,
    /*
      租期表透传（与 normalizeDecor 同坑同修）：
      writeClanDecor 拿本函数返回值整个写回库，不透传就是
      "保存一次装修 = 全部租期丢失"。
    */
    entitlements: normalizeEntitlements(input.entitlements),
    layout: normalizeLayout((input as { layout?: unknown }).layout),
    updatedAt: input.updatedAt,
  };
}

/** 生成风格的完整内联样式（供公网宗祠页使用） */
export function clanDecorStyle(slot: DecorSlot, decor: HallDecor): CSSProperties {
  const item = CLAN_SLOT_ITEMS[slot].find((i) => i.id === slotMainValue(slot, decor));
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
  } as CSSProperties;
}

export function clanDecorItem(slot: DecorSlot, decor: HallDecor): ClanDecorItem | undefined {
  return CLAN_SLOT_ITEMS[slot].find((i) => i.id === slotMainValue(slot, decor));
}

/**
 * 多挂饰解析（宗祠侧）：把装修方案解析成"要画哪些挂饰"（按序，首件 = 主陈设）。
 * 口径与 resolveOrnamentItems（纪念馆）一致，素材表换成 CLAN_SLOT_ITEMS。
 * 渲染层（ClanDecorLayer / 工坊预览）一律走这里，绝不直接读 slots.ornament。
 */
export function resolveClanOrnamentItems(decor: HallDecor): ClanDecorItem[] {
  const raw = (decor.slots as { ornament?: string | string[] }).ornament;
  const list: string[] = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const out: ClanDecorItem[] = [];
  for (const id of list) {
    const item = CLAN_SLOT_ITEMS.ornament.find((i) => i.id === id);
    if (item && !out.some((x) => x.id === item.id)) out.push(item);
  }
  return out;
}

/** 深色墙面 id 列表：这些壁纸下正文需改用浅色文字 */
export const CLAN_DARK_WALLS = [
  "clan-wall-brick",
  "clan-wall-vermilion",
  "clan-wall-nanmu",
  "clan-wall-gilt",
];

/** 报告某装修方案是否为深色底（决定正文文字颜色） */
export function isClanDarkDecor(decor: HallDecor): boolean {
  return CLAN_DARK_WALLS.includes(decor.slots.wall);
}

/**
 * 建馆赠品模板 / 收费模板分组，便于设计器展示。
 *
 * 注意命名沿用 `CLAN_FREE_TEMPLATES`（改版后它的语义是「赠品模板」），
 * 不改名是因为已有组件按此名引用；新代码请优先用 `CLAN_GRANT_TEMPLATE`。
 */
export const CLAN_FREE_TEMPLATES = CLAN_TEMPLATES.filter((t) => t.tier === "free");
export const CLAN_PAID_TEMPLATES = CLAN_TEMPLATES.filter((t) => isPaidTier(t.tier));

/** 宗祠建馆赠品模板 id（新宗祠建成时自动发放，永久有效） */
export const CLAN_GRANT_TEMPLATE = "clan-tpl-ancestral";

/**
 * 宗祠赠品模板用到的零件（永久免费）。
 * 与 lib/hall-decor.ts 的 GRANTED_TEMPLATE_PARTS 同口径，靠 id 前缀区分。
 * 宗祠侧不放进 GRANTED_TEMPLATE_PARTS，是因为两库的零件 id 命名空间不同、
 * 且宗祠归由本文件自持，避免跨库耦合。
 */

export { isPaidTier };
export { SPACE_DEFAULT_TIER, templateStructure, templatePriceFen };
export { CLAN_TEMPLATES as TEMPLATES };
export type {
  DecorCategory,
  DecorItem,
  DecorKit,
  DecorSlot,
  DecorTemplate,
  DecorTier,
  HallDecor,
  OrnamentSpec,
};
