// 公益纪念堂（Public Welfare Memorial）共享工具
// 合规隔离：本模块纯公益、零付费引导，与收费纪念馆体系解耦。

import { prisma } from "@/lib/db";
import { findSuite } from "@/lib/decor-suites";

export type MemorialCategory = "CELEBRITY" | "HEROIC" | "GOOD_DEED" | "NATIONAL_HERO";
export type PublicMemorialStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "TAKEN_DOWN";

export const CATEGORY_LABEL: Record<MemorialCategory, string> = {
  CELEBRITY: "名人",
  HEROIC: "见义勇为",
  GOOD_DEED: "好人好事",
  NATIONAL_HERO: "民族英雄",
};

export const STATUS_LABEL: Record<PublicMemorialStatus, string> = {
  PENDING: "待审核",
  APPROVED: "已上线",
  REJECTED: "已驳回",
  TAKEN_DOWN: "已下架",
};

/** 生成 slug：姓名 + 随机后缀，保证唯一且可读 */
export function slugify(name: string): string {
  const base = name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 24);
  const tail = Math.random().toString(36).slice(2, 8);
  return `${base || "memorial"}-${tail}`;
}

/** 生卒年展示，如「1958 – 2021」；缺失年份省略 */
export function lifeSpan(birth?: number | null, death?: number | null): string {
  if (!birth && !death) return "";
  return [birth ?? "?", death ?? "?"].join(" – ");
}

// ===========================================================================
// 平台赠礼（公益板块零付费，由平台统一赠予顶级装修方案 + 旗舰存储）
// ===========================================================================

/** 默认赠予的顶级套装 id（对应 lib/decor-suites.ts 的 HALL_SUITES「传世典藏·尊享层」） */
export const DEFAULT_GIFT_SUITE_ID = "suite-hall-prem-ultimate";
/** 默认赠予的旗舰存储容量（GB） */
export const DEFAULT_GIFT_STORAGE_GB = 500;

export type GiftSuiteInfo = {
  id: string;
  name: string;
  desc: string;
  preview: { background: string; color: string; accent: string; icon: string };
};

/** 取赠礼套装信息（找不到回退到默认顶级套装的兜底文案） */
export function giftSuite(suiteId: string | null | undefined): GiftSuiteInfo {
  const s = findSuite(suiteId || DEFAULT_GIFT_SUITE_ID);
  if (s) {
    return { id: s.id, name: s.name, desc: s.desc, preview: s.preview };
  }
  return {
    id: DEFAULT_GIFT_SUITE_ID,
    name: "传世典藏",
    desc: "唐制厅堂、金辉环伺、织锦铺地、御笔长卷，一次集齐顶级配置。",
    preview: { background: "linear-gradient(135deg,#2a1d12,#6a4a1e)", color: "#ffeec2", accent: "#d4af37", icon: "💠" },
  };
}

// ===========================================================================
// 平台赠礼「顶级装修方案」→ 3D 厅堂场景素材映射
// 公益馆由平台统一赠予尊享层，详情页直接渲染"精装纪念空间"效果（对齐收费馆）。
// ===========================================================================

/** 赠礼可选的尊享层方案（平台可切换，公众无感知、零付费） */
export const GIFT_SUITE_CHOICES: { id: string; name: string }[] = [
  { id: "suite-hall-prem-ultimate", name: "传世典藏" },
  { id: "suite-hall-prem-goldhall", name: "金殿华堂" },
  { id: "suite-hall-prem-starry", name: "星河长明" },
];

/** 3D 厅堂场景素材（壁纸 + 挂饰），供 Hall3DStage 渲染精装效果 */
export type PublicDecor = { wallId: string; ornamentIds: string[] };

/** 由赠礼方案 id 取 3D 场景素材；找不到回退到「传世典藏」金辉厅堂 */
export function giftDecor(suiteId: string | null | undefined): PublicDecor {
  switch (suiteId) {
    case "suite-hall-prem-goldhall":
      return { wallId: "wall-imperial-gold", ornamentIds: ["orn-lantern-gold"] };
    case "suite-hall-prem-starry":
      return { wallId: "wall-starfield-deep", ornamentIds: ["orn-halo"] };
    case "suite-hall-prem-ultimate":
    default:
      return { wallId: "wall-goldweave", ornamentIds: ["orn-lantern-red", "orn-imperial-lantern"] };
  }
}

// ===========================================================================
// 挽联（与收费纪念馆 couplet 同结构 { left 上联, right 下联, horizontal 横批 }）
// ===========================================================================
export type PublicCouplet = {
  left?: string;
  right?: string;
  horizontal?: string;
} | null;

/** 安全解析 couplet 字段（JSON 可能为空或非对象） */
export function coupletOf(raw: unknown): PublicCouplet {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    const left = typeof r.left === "string" ? r.left : undefined;
    const right = typeof r.right === "string" ? r.right : undefined;
    const horizontal = typeof r.horizontal === "string" ? r.horizontal : undefined;
    if (left || right || horizontal) return { left, right, horizontal };
  }
  return null;
}

// ===========================================================================
// 遗像占位图（公益馆尚未配置遗像时，3D 厅堂壁龛内展示的庄重占位）
// ===========================================================================

/** 生成"遗像待平台补全"的 SVG data URI（不依赖外部素材，断网可用） */
export function memorialPlaceholderDataUri(name: string): string {
  const safe = (name || "故人")
    .replace(/[<>&"]/g, "")
    .slice(0, 16);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'>` +
    `<rect width='300' height='400' fill='#1a1208'/>` +
    `<text x='150' y='175' font-size='84' text-anchor='middle' fill='#d4af37' font-family='serif'>🕊️</text>` +
    `<text x='150' y='252' font-size='22' text-anchor='middle' fill='#e9c987' font-family='serif'>${safe}</text>` +
    `<text x='150' y='292' font-size='14' text-anchor='middle' fill='#b9a06a' font-family='serif'>遗像待平台补全</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ===========================================================================
// 公众敬献大花圈（平台免费提供，免登录、免付费，同馆同时最多 2 个）
// ===========================================================================
export const PUBLIC_WREATH_MAX = 2;
export const PUBLIC_WREATH_TTL_MS = 3 * 24 * 3600 * 1000;

/** 懒清理：把已过期但未标记的花圈置为 removedAt（幂等） */
export async function sweepExpiredPublicWreaths(memorialId?: string) {
  const now = new Date();
  await prisma.publicMemorialWreath.updateMany({
    where: {
      removedAt: null,
      expiresAt: { lte: now },
      ...(memorialId ? { memorialId } : {}),
    },
    data: { removedAt: now },
  });
}

/** 馆内当前有效花圈数（未撤下且未过期） */
export async function countActivePublicWreaths(memorialId: string): Promise<number> {
  return prisma.publicMemorialWreath.count({
    where: { memorialId, removedAt: null, expiresAt: { gt: new Date() } },
  });
}

/** 馆内有效花圈（展示用，最多 2 个，新在前） */
export async function listActivePublicWreaths(memorialId: string) {
  await sweepExpiredPublicWreaths(memorialId);
  return prisma.publicMemorialWreath.findMany({
    where: { memorialId, removedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: PUBLIC_WREATH_MAX,
    select: { id: true, nickname: true, message: true, createdAt: true, expiresAt: true },
  });
}

// ===========================================================================
// 公众免费祭品（平台免费祭品，免登录、随时可献、无每日上限）
// ===========================================================================
export type FreeOfferingDef = { type: string; label: string; icon: string };

/** 平台免费祭品目录（与纪念馆「每日免费祭品」同源，但面向公众全开放） */
export const FREE_PUBLIC_OFFERINGS: FreeOfferingDef[] = [
  { type: "flower", label: "白菊", icon: "🌼" },
  { type: "incense", label: "清香", icon: "🪔" },
  { type: "candle", label: "长明灯", icon: "🕯️" },
  { type: "elegy", label: "挽联", icon: "🎗️" },
];

/** 由 type 取免费祭品定义（找不到回退到白菊） */
export function freeOfferingType(type: string | null | undefined): FreeOfferingDef {
  return FREE_PUBLIC_OFFERINGS.find((o) => o.type === type) ?? FREE_PUBLIC_OFFERINGS[0];
}
