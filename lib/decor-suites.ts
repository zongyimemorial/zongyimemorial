/**
 * 三层九档套装（装修方案目录层）
 *
 * 阶段 7 · 第②步（2026-10 落地）。
 *
 * 设计要点（用户已拍板 + AGENTS.md 纪律）：
 *  - **新文件、单向依赖**：本文件只 `import` 自 `hall-decor.ts` / `clan-decor.ts`，
 *    两者不回 import 本文件 —— 否则会触发循环依赖（`hall-decor` 与 `clan-decor`
 *    本就不能互 import，再加第三个文件必须保持单向）。
 *  - **套装不嵌 bundle、只列 template / kit**（用户原话「不嵌 bundle，只列 template，
 *    避免循环依赖与划线价虚高」）。所以 `DecorSuite.items` 只引用模板/套件 id，
 *    **绝不**出现 `bundle-*` 前缀（渲染层按 `tpl:`/`kit:` 判解锁，塞 bundle 键没人认）。
 *  - **三层 = 免费 / 标准 / 尊享 三权益层**：目录按权益层分块，套装在块内成列。
 *  - **九档 = 九个价格区间档位**：`PRICE_BRACKETS` 连续无重叠、覆盖 0..∞，
 *    用于目录分段筛选导航（与 `tier` 四档正交，叠加而非替换）。
 *  - **总价现算**：`suitePriceFen()` 由引用项的 `priceFen` 求和得出，**绝不手写原价**
 *    （同源教训：手写的原价一旦与包内调价脱节就成了假广告；与 `bundleListPrice()` 一致）。
 *  - 本轮**不做履约**：套装详情页直接深链到现有可购买商品页
 *    (`/mall/decor-tpl-*`)，不新建 Product 行、不走 bundle 发货（留待后续步骤）。
 */

import { findTemplate, KITS, type DecorTemplate, type DecorKit } from "@/lib/hall-decor";
import { findClanTemplate, CLAN_KITS } from "@/lib/clan-decor";
import { fubFromFen, fubOnly } from "@/lib/fortune";

/** 套装里的单项：引用一个模板或套件的 id（不含 bundle） */
export type DecorSuiteItem = {
  /** 完整 id，如 `tpl-plain`（纪念馆模板）/`clan-kit-incense`（宗祠套件） */
  ref: string;
  kind: "template" | "kit";
};

/** 三层权益层 key */
export type SuiteBenefitTierKey = "free" | "standard" | "premium";

/** 套装 = 一个策展式目录分组（引用模板/套件，不嵌 bundle） */
export type DecorSuite = {
  id: string;
  name: string;
  desc: string;
  /** 权益层：免费 / 标准 / 尊享 */
  tier: SuiteBenefitTierKey;
  /** 适用端：纪念馆 / 宗祠 */
  target: "hall" | "clan";
  items: DecorSuiteItem[];
  tags: string[];
  preview: { background: string; color: string; accent: string; icon: string };
  notes?: string;
};

/** 三层权益层（目录分块用） */
export const SUITE_BENEFIT_TIERS: { key: SuiteBenefitTierKey; label: string; desc: string }[] = [
  { key: "free", label: "免费层", desc: "入门轻盈，免费用户也能拥有的一席之地" },
  { key: "standard", label: "标准层", desc: "进阶搭配，积分或人民币皆可解锁" },
  { key: "premium", label: "尊享层", desc: "高端典藏，订阅与买断双通道" },
];

/**
 * 九档价格区间（单位：分）。连续、无重叠、覆盖 0..∞。
 * `maxFen: null` 表示无上限（最后一档）。
 */
export const PRICE_BRACKETS: { key: string; label: string; minFen: number; maxFen: number | null }[] = [
  { key: "b1", label: "¥0–9", minFen: 0, maxFen: 900 },
  { key: "b2", label: "¥9–19", minFen: 900, maxFen: 1900 },
  { key: "b3", label: "¥19–29", minFen: 1900, maxFen: 2900 },
  { key: "b4", label: "¥29–39", minFen: 2900, maxFen: 3900 },
  { key: "b5", label: "¥39–59", minFen: 3900, maxFen: 5900 },
  { key: "b6", label: "¥59–79", minFen: 5900, maxFen: 7900 },
  { key: "b7", label: "¥79–99", minFen: 7900, maxFen: 9900 },
  { key: "b8", label: "¥99–199", minFen: 9900, maxFen: 19900 },
  { key: "b9", label: "¥199+", minFen: 19900, maxFen: null },
];

// ---------------------------------------------------------------------------
// 纪念馆套装（HALL_SUITES）
// ---------------------------------------------------------------------------
export const HALL_SUITES: DecorSuite[] = [
  // —— 免费层 ——
  {
    id: "suite-hall-free-breeze",
    name: "清霜初章",
    desc: "一方晨霜素白，给刚建馆的思念一处干净的落脚。",
    tier: "free",
    target: "hall",
    items: [{ ref: "tpl-clearfrost", kind: "template" }],
    tags: ["免费层", "入门", "素白"],
    preview: { background: "linear-gradient(135deg,#eef3f6,#ffffff)", color: "#2c3540", accent: "#7fa8c9", icon: "❄️" },
  },
  {
    id: "suite-hall-free-inkquiet",
    name: "墨白小筑",
    desc: "水墨淡影配静夜垂纱，清简不扰，最耐久看。",
    tier: "free",
    target: "hall",
    items: [
      { ref: "tpl-inkwash", kind: "template" },
      { ref: "kit-silentnight", kind: "kit" },
    ],
    tags: ["免费层", "水墨", "夜"],
    preview: { background: "linear-gradient(135deg,#1f2b33,#0f1a19)", color: "#e9eef2", accent: "#a8744f", icon: "🌙" },
  },
  {
    id: "suite-hall-free-paper",
    name: "纸香书斋",
    desc: "宣纸暖白配文房清供，给读书人出身的长辈一处贴气。",
    tier: "free",
    target: "hall",
    items: [
      { ref: "tpl-paper", kind: "template" },
      { ref: "kit-scholar", kind: "kit" },
    ],
    tags: ["免费层", "文人", "清供"],
    preview: { background: "linear-gradient(135deg,#f3eee2,#fbfdf9)", color: "#3a342a", accent: "#6b8e5a", icon: "📜" },
  },

  // —— 标准层 ——
  {
    id: "suite-hall-std-mistbamboo",
    name: "雾竹清韵",
    desc: "晨雾青墙、竹影疏朗，四季挂饰点缀其间。",
    tier: "standard",
    target: "hall",
    items: [
      { ref: "tpl-mistveil", kind: "template" },
      { ref: "tpl-bambooherm", kind: "template" },
      { ref: "kit-fourseasons", kind: "kit" },
    ],
    tags: ["标准层", "竹", "四季"],
    preview: { background: "linear-gradient(135deg,#dfeae3,#f6fbf7)", color: "#2c3540", accent: "#4c6e4a", icon: "🎋" },
  },
  {
    id: "suite-hall-std-elegant",
    name: "朱漆雅室",
    desc: "朱漆立柱、夜灯成双，庄重里见温度。",
    tier: "standard",
    target: "hall",
    items: [
      { ref: "tpl-zhuqi", kind: "template" },
      { ref: "tpl-nightlight", kind: "template" },
      { ref: "kit-goldenlight", kind: "kit" },
    ],
    tags: ["标准层", "朱漆", "隆重"],
    preview: { background: "linear-gradient(135deg,#7a2f26,#a8442f)", color: "#f5e2b8", accent: "#c9a961", icon: "🏮" },
  },
  {
    id: "suite-hall-std-complete",
    name: "莲醒全套",
    desc: "莲醒空间配书画长卷与庭院立柱，一馆气象自成。",
    tier: "standard",
    target: "hall",
    items: [
      { ref: "tpl-lotuswake", kind: "template" },
      { ref: "tpl-shuhua", kind: "template" },
      { ref: "kit-courtyard", kind: "kit" },
    ],
    tags: ["标准层", "莲", "书画"],
    preview: { background: "linear-gradient(135deg,#e8eef0,#fbfdfd)", color: "#2c3540", accent: "#3f7d7a", icon: "🪷" },
  },

  // —— 尊享层 ——
  {
    id: "suite-hall-prem-goldhall",
    name: "金殿华堂",
    desc: "鎏金厅堂配整装金辉，一键连墙带地全换。",
    tier: "premium",
    target: "hall",
    items: [
      { ref: "tpl-goldhall", kind: "template" },
      { ref: "kit-imperial-hall", kind: "kit" },
    ],
    tags: ["尊享层", "金", "整装"],
    preview: { background: "linear-gradient(135deg,#3a2c1e,#7a5a2a)", color: "#f6e3ae", accent: "#c9a961", icon: "👑" },
  },
  {
    id: "suite-hall-prem-starry",
    name: "星河长明",
    desc: "星河无垠配金线织锦，夜里也长明不灭。",
    tier: "premium",
    target: "hall",
    items: [
      { ref: "tpl-starry3d", kind: "template" },
      { ref: "tpl-goldweavespace", kind: "template" },
    ],
    tags: ["尊享层", "星河", "3D"],
    preview: { background: "linear-gradient(135deg,#0b1026,#1b2350)", color: "#f3f6ff", accent: "#9db4ff", icon: "🌌" },
  },
  {
    id: "suite-hall-prem-ultimate",
    name: "传世典藏",
    desc: "唐制厅堂、金辉环伺、织锦铺地、御笔长卷，一次集齐顶级配置。",
    tier: "premium",
    target: "hall",
    items: [
      { ref: "tpl-goldweavespace", kind: "template" },
      { ref: "tpl-tangzhi", kind: "template" },
      { ref: "tpl-yingbi", kind: "template" },
      { ref: "kit-imperial-hall", kind: "kit" },
    ],
    tags: ["尊享层", "典藏", "全套"],
    preview: { background: "linear-gradient(135deg,#2a1d12,#6a4a1e)", color: "#ffeec2", accent: "#d4af37", icon: "💠" },
  },
];

// ---------------------------------------------------------------------------
// 宗祠套装（CLAN_SUITES）—— 与纪念馆同口径、同结构（用户要求两端同步）
// ---------------------------------------------------------------------------
export const CLAN_SUITES: DecorSuite[] = [
  // —— 免费层 ——
  {
    id: "suite-clan-free-plain",
    name: "素朴祠堂",
    desc: "一方素墙、两盏红灯，清净不扰，最耐久看。",
    tier: "free",
    target: "clan",
    items: [{ ref: "clan-tpl-plain", kind: "template" }],
    tags: ["免费层", "素朴", "宗祠"],
    preview: { background: "linear-gradient(135deg,#f7f6f2,#dfe7ee)", color: "#2b2b28", accent: "#b08a34", icon: "🕯️" },
  },
  {
    id: "suite-clan-free-earth",
    name: "黄土宗风",
    desc: "古陶土墙配素朴清供，回到最本真的祠堂气。",
    tier: "free",
    target: "clan",
    items: [
      { ref: "clan-tpl-earthancient", kind: "template" },
      { ref: "clan-kit-plain", kind: "kit" },
    ],
    tags: ["免费层", "古陶", "清供"],
    preview: { background: "linear-gradient(135deg,#e7ddc9,#f6f1e6)", color: "#3a342a", accent: "#9c7b3f", icon: "🏺" },
  },
  {
    id: "suite-clan-free-whitewash",
    name: "粉墙香火",
    desc: "粉白照壁配香火供奉，四时供奉香火不绝。",
    tier: "free",
    target: "clan",
    items: [
      { ref: "clan-tpl-whitewash", kind: "template" },
      { ref: "clan-kit-incense", kind: "kit" },
    ],
    tags: ["免费层", "粉墙", "香火"],
    preview: { background: "linear-gradient(135deg,#f2efe9,#e8e2d6)", color: "#2b2b28", accent: "#c9a240", icon: "🪔" },
  },

  // —— 标准层 ——
  {
    id: "suite-clan-std-vermilion",
    name: "朱门仪制",
    desc: "朱红照壁配石台与威仪仪门，气象自成。",
    tier: "standard",
    target: "clan",
    items: [
      { ref: "clan-tpl-vermilion", kind: "template" },
      { ref: "clan-tpl-stoneterrace", kind: "template" },
      { ref: "clan-kit-dignity", kind: "kit" },
    ],
    tags: ["标准层", "朱红", "仪门"],
    preview: { background: "linear-gradient(135deg,#9b2c22,#6d1c19)", color: "#fdf3e3", accent: "#d4af37", icon: "🚪" },
  },
  {
    id: "suite-clan-std-gateway",
    name: "门庭联立",
    desc: "仪门、庭院、香火三件套，撑起门庭气度。",
    tier: "standard",
    target: "clan",
    items: [
      { ref: "clan-tpl-gateway", kind: "template" },
      { ref: "clan-tpl-courtyard", kind: "template" },
      { ref: "clan-kit-incense", kind: "kit" },
    ],
    tags: ["标准层", "门庭", "庭院"],
    preview: { background: "linear-gradient(135deg,#7a6a45,#4d3418)", color: "#f7ecd8", accent: "#c9a240", icon: "🏛️" },
  },
  {
    id: "suite-clan-std-hallplaque",
    name: "匾联一堂",
    desc: "匾额高悬、香火供奉、御赐金匾点缀，一堂肃穆。",
    tier: "standard",
    target: "clan",
    items: [
      { ref: "clan-tpl-hallplaque", kind: "template" },
      { ref: "clan-tpl-incensehall", kind: "template" },
      { ref: "clan-kit-imperial", kind: "kit" },
    ],
    tags: ["标准层", "匾额", "供奉"],
    preview: { background: "linear-gradient(135deg,#5a3b22,#8b6a1e)", color: "#fff4d0", accent: "#d4af37", icon: "🪧" },
  },

  // —— 尊享层 ——
  {
    id: "suite-clan-prem-throne",
    name: "寝堂威仪",
    desc: "宝座寝堂配 3D 牌位寝堂与御赐金匾，光耀门楣。",
    tier: "premium",
    target: "clan",
    items: [
      { ref: "clan-tpl-thronehall", kind: "template" },
      { ref: "clan-tpl-ancestral3d", kind: "template" },
      { ref: "clan-kit-imperial", kind: "kit" },
    ],
    tags: ["尊享层", "寝堂", "3D"],
    preview: { background: "linear-gradient(135deg,#3b2a12,#a02a24)", color: "#ffeec2", accent: "#d4af37", icon: "⛩️" },
  },
  {
    id: "suite-clan-prem-imperial",
    name: "御赐整装",
    desc: "御赐宗祠配祖庭整装包，一键连墙带地全换。",
    tier: "premium",
    target: "clan",
    items: [
      { ref: "clan-tpl-imperial", kind: "template" },
      { ref: "clan-kit-ancestral-grand", kind: "kit" },
    ],
    tags: ["尊享层", "御赐", "整装"],
    preview: { background: "linear-gradient(135deg,#c9a240,#8b6a1e)", color: "#3b2c09", accent: "#fff4d0", icon: "👑" },
  },
  {
    id: "suite-clan-prem-banner",
    name: "旌旗典藏",
    desc: " Banner 大厅、蟠龙宝座、祖庭整装，宗祠顶级配置一次集齐。",
    tier: "premium",
    target: "clan",
    items: [
      { ref: "clan-tpl-bannerhall", kind: "template" },
      { ref: "clan-tpl-dragonthrone", kind: "template" },
      { ref: "clan-kit-ancestral-grand", kind: "kit" },
    ],
    tags: ["尊享层", "典藏", "全套"],
    preview: { background: "linear-gradient(135deg,#2a1d12,#6a4a1e)", color: "#ffeec2", accent: "#d4af37", icon: "🏯" },
  },
];

// ---------------------------------------------------------------------------
// 查询与计算 helper
// ---------------------------------------------------------------------------

/** 全部套装（两端） */
export function allSuites(): DecorSuite[] {
  return [...HALL_SUITES, ...CLAN_SUITES];
}

/** 按 id 查套装（跨两端） */
export function findSuite(id: string): DecorSuite | undefined {
  return allSuites().find((s) => s.id === id);
}

/** 按端取套装 */
export function suitesOfTarget(target: "hall" | "clan"): DecorSuite[] {
  return allSuites().filter((s) => s.target === target);
}

/** 按权益层取套装 */
export function suitesByTier(tier: SuiteBenefitTierKey): DecorSuite[] {
  return allSuites().filter((s) => s.tier === tier);
}

/**
 * 把套装里的单项引用解析成真实素材（模板/套件）。
 * 解析不到时 `found: false`（验收脚本据此抓悬空引用）。
 */
export type ResolvedSuiteItem = {
  ref: string;
  kind: "template" | "kit";
  target: "hall" | "clan";
  name: string;
  priceFen: number;
  preview: { background: string; color: string; accent: string; icon: string };
  /** 对应商品页 slug，如 `decor-tpl-plain` / `decor-clan-kit-incense` */
  slug: string;
  /** 深链地址 `/mall/<slug>` */
  href: string;
  found: boolean;
};

/** 由引用 id + kind 推算商品页 slug（与 `prisma/seed-decor.mts` 的 `shortId` 同口径） */
export function suiteItemSlug(ref: string, kind: "template" | "kit"): string {
  const isClan = ref.startsWith("clan-");
  const seg = kind === "template" ? "tpl" : "kit";
  const short = ref.replace(/^clan-/, "").replace(/^(tpl|kit|bundle)-/, "");
  return `decor-${isClan ? "clan-" : ""}${seg}-${short}`;
}

type ResolvedCore = {
  name: string;
  priceFen: number;
  preview: { background: string; color: string; accent: string; icon: string };
};
function resolveRef(ref: string, kind: "template" | "kit"): ResolvedCore | null {
  const isClan = ref.startsWith("clan-");
  if (kind === "template") {
    const tpl: DecorTemplate | undefined = isClan ? findClanTemplate(ref) : findTemplate(ref);
    if (!tpl) return null;
    return {
      name: tpl.name,
      priceFen: tpl.priceFen ?? tpl.points ?? 0,
      preview: tpl.preview,
    };
  }
  const kit: DecorKit | undefined = (isClan ? CLAN_KITS : KITS).find((k) => k.id === ref);
  if (!kit) return null;
  return {
    name: kit.name,
    priceFen: kit.priceFen ?? kit.points ?? 0,
    preview: kit.preview,
  };
}

/** 解析套装全部单项（含商品页深链） */
export function suiteItemEntries(suite: DecorSuite): ResolvedSuiteItem[] {
  return suite.items.map((it) => {
    const slug = suiteItemSlug(it.ref, it.kind);
    const r = resolveRef(it.ref, it.kind);
    if (!r) {
      return {
        ref: it.ref,
        kind: it.kind,
        target: suite.target,
        name: it.ref,
        priceFen: 0,
        preview: { background: "#eee", color: "#333", accent: "#999", icon: "❓" },
        slug,
        href: `/mall/${slug}`,
        found: false,
      };
    }
    return {
      ref: it.ref,
      kind: it.kind,
      target: suite.target,
      name: r.name,
      priceFen: r.priceFen,
      preview: r.preview,
      slug,
      href: `/mall/${slug}`,
      found: true,
    };
  });
}

/**
 * 套装总价（分）—— **现算求和**，绝不手写。
 * 与 `bundleListPrice()` 同源纪律：原价必须由引用项推导，
 * 否则包内调价后划线与实付脱节成假广告。
 */
export function suitePriceFen(suite: DecorSuite): number {
  return suiteItemEntries(suite).reduce((s, x) => s + x.priceFen, 0);
}

/**
 * 套装总价（福币，用于展示）。
 *
 * ⚠️ 输出走 `fubOnly(fubFromFen(...))` 的**统一口径**，绝不自己写 `(fen/100).toFixed(2)`。
 * 旧版返回 "21.00 福币"（两位小数），与 `fubOnly` 的 "21 福币"（整元不补零）
 * 在同一个页面上并存 —— 这正是本仓库反复踩的「同一个事实有两个判据」。
 *
 * 注意：`lib/fortune.ts` 是**通用货币工具**（不是供奉模块），
 * 不违反 `verify-decor-3d.mjs` §4「装修模块不 import 供奉模块」那条分层约束。
 */
export function suitePriceYuan(suite: DecorSuite): string {
  return fubOnly(fubFromFen(suitePriceFen(suite)));
}

/** 把价格（分）映射到九档 key；越界返回最后一档 */
export function bracketOf(priceFen: number): string {
  for (const b of PRICE_BRACKETS) {
    if (priceFen >= b.minFen && (b.maxFen === null || priceFen < b.maxFen)) return b.key;
  }
  return PRICE_BRACKETS[PRICE_BRACKETS.length - 1].key;
}
