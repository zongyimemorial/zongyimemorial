/**
 * 纪念馆 / 宗祠 存储空间容量体系（单一判据）
 * ------------------------------------------------------------------
 * 容量只由「免费额度 + 已购容量包」决定，与高级订阅（premium）**彻底解耦** ——
 * 杜绝「同一个事实两个判据」（本仓库已多次踩这个坑：premium 三种语义分叉
 * 曾导致「宗祠装修后无法保存」）。premium 仅保留「单张 20MB 高清原片上传」权限，
 * **不再决定容量上限**。
 *
 * 与装修租期（#224）同构：容量包按年订阅，到期回退免费额度、已存资料不删、不删 slots。
 *
 * 设计要点：
 *  - 免费额度是**常量**（按 kind：馆 1GB / 祠 2GB），不进库、不随馆漂移。
 *  - 已购容量包字节存 `storageSubBytes`（订阅 add-on），`storageUntil` 控制有效期。
 *  - 所有判据集中在这里；上传接口 / 控制台 / 回退全部调 `effectiveStorageQuota`，
 *    绝不在别处手写 `premiumUntil` 决定容量。
 */
export const GB = 1024 ** 3;

/** 纪念馆免费额度：1 GB（建馆即赠，永久） */
export const HALL_FREE_QUOTA = 1 * GB;
/** 宗祠免费额度：2 GB（建祠即赠，永久；宗祠承载全族影像，额度高于纪念馆） */
export const CLAN_FREE_QUOTA = 2 * GB;

export type StorageKind = "hall" | "clan";

/**
 * 字节字段在 Prisma 里是 **BigInt**（见 schema.prisma 注释：500GB 溢出 Int），
 * 但业务运算用 number 就够（最大 500GB ≈ 5.4e11，远小于 Number.MAX_SAFE_INTEGER 9e15）。
 * 这里统一收口成 number，避免调用处到处 `Number(...)`。
 */
type ByteLike = number | bigint | null | undefined;
function toNum(v: ByteLike): number {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : v;
}

/**
 * 容量包单一事实来源（与装修 TIER_SPECS 同构）。
 * 商城 seed 引用同一份，避免「两端价格漂移」。
 *
 * 定价推导（见 docs/存储容量与定价.md）：取云存储裸成本中位 0.10 元/GB/月
 * = 1.20 元/GB/年；平台有效成本（压缩+冷存+低利用率）约 0.40 元/GB/年。
 * 毛利率：标准 59% / 进阶 39% / 专业 20% / 旗舰在裸成本下偏薄、有效成本下显著盈利。
 */
export const STORAGE_PLANS = {
  "storage-10g": { gb: 10, priceFen: 2900, points: 2900, name: "标准存储 10GB/年" },
  "storage-50g": { gb: 50, priceFen: 9900, points: 9900, name: "进阶存储 50GB/年" },
  "storage-200g": { gb: 200, priceFen: 29900, points: 29900, name: "专业存储 200GB/年" },
  "storage-500g": { gb: 500, priceFen: 59900, points: 59900, name: "旗舰存储 500GB/年" },
} as const;

export type StoragePlanSlug = keyof typeof STORAGE_PLANS;

/** 按 slug 取容量包定义（不存在返回 null） */
export function getStoragePlan(slug: string | null | undefined) {
  if (!slug) return null;
  return (STORAGE_PLANS as Record<string, (typeof STORAGE_PLANS)[StoragePlanSlug] | undefined>)[slug] ?? null;
}

/** 免费额度（按 kind） */
export function freeQuotaOf(kind: StorageKind): number {
  return kind === "clan" ? CLAN_FREE_QUOTA : HALL_FREE_QUOTA;
}

/** 容量订阅是否仍在有效期内（null = 仅免费额度） */
export function isStorageActive(hall: {
  storageUntil?: Date | string | null;
} | null | undefined): boolean {
  if (!hall?.storageUntil) return false;
  const t = hall.storageUntil instanceof Date ? hall.storageUntil : new Date(hall.storageUntil);
  return !Number.isNaN(t.getTime()) && t > new Date();
}

/** 当前已购订阅容量字节（仅订阅有效期内计入；过期回退 0） */
export function storageSubBytesOf(hall: {
  storageSubBytes?: ByteLike;
  storageUntil?: Date | string | null;
} | null | undefined): number {
  if (!isStorageActive(hall)) return 0;
  return toNum(hall?.storageSubBytes);
}

/**
 * 单一判据：有效存储配额 = 免费额度 + (订阅有效 ? 订阅字节 : 0)。
 * 只读 hall 自身字段，**不读 premium**。这是容量判定的唯一出口。
 */
export function effectiveStorageQuota(
  hall: {
    storageSubBytes?: ByteLike;
    storageUntil?: Date | string | null;
  } | null | undefined,
  kind: StorageKind,
): number {
  return freeQuotaOf(kind) + storageSubBytesOf(hall);
}

/** 当前生效的容量包 slug（用于展示「已购：标准存储 10GB/年」）；无则 null */
export function activeStoragePlanSlug(hall: {
  storageSubBytes?: ByteLike;
  storageUntil?: Date | string | null;
} | null | undefined): StoragePlanSlug | null {
  if (!isStorageActive(hall)) return null;
  const bytes = toNum(hall?.storageSubBytes);
  for (const [slug, plan] of Object.entries(STORAGE_PLANS)) {
    if (plan.gb * GB === bytes) return slug as StoragePlanSlug;
  }
  return null;
}

/** 人类可读容量（自动 GB / MB / KB） */
export function formatBytes(n: number): string {
  if (n >= GB) return `${(n / GB).toFixed(n % GB === 0 ? 0 : 2)} GB`;
  const MB = 1024 ** 2;
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(1)} KB`;
}

/** 进度百分比（0–100，封顶 100） */
export function storagePercent(used: number, quota: number): number {
  if (quota <= 0) return 0;
  return Math.min(100, Math.round((used / quota) * 100));
}

/* ============================================================
 * 高清原片（单张 20MB）上传权限 —— 单一判据
 * ------------------------------------------------------------
 * 历史：这条权限原属 `premiumUntil`（"高级订阅 = 8MB→20MB"）。
 * 2026-10 起改为：**持有有效容量包（storageUntil 有效）即享 20MB**，
 * premium 仍保留（存量已购用户的权益不能剥夺）。
 *
 * 为什么必须并进来：容量包卖的本来就是"装更多照片"，
 * 却卡在 8MB 单张上限上——用户花 599 元买了 500GB，
 * 想传一张 12MB 的高清原片却被拒，理由还写着"升级高级订阅"，
 * 而那个"高级订阅"（premium-storage ¥99/年）拥有 50GB 容量、
 * 比容量包还少。**这是本仓库典型的「同一件事两套判据」**。
 *
 * ⚠️ 判据集中在这里。两个上传 route 一律调 `hasHdUpload()`，
 *    绝不再各自手写 `isPremium ? 20 : 8`。
 * ⚠️ 字节常量就定义在这里（lib/upload.ts 的旧名只是别名转出）。
 * ============================================================ */

/** 单张图片上限：普通 8MB */
export const MAX_BYTES_STD = 8 * 1024 * 1024;
/** 单张图片上限：高清原片 20MB（有效容量包 / 有效高级订阅） */
export const MAX_BYTES_HD = 20 * 1024 * 1024;

/** 能触发 20MB 高清原片的两类来源（任一有效即可） */
export function hasHdUpload(hall: {
  storageUntil?: Date | string | null;
  premiumUntil?: Date | string | null;
} | null | undefined): boolean {
  if (!hall) return false;
  if (isStorageActive(hall)) return true;
  if (!hall.premiumUntil) return false;
  const t = hall.premiumUntil instanceof Date ? hall.premiumUntil : new Date(hall.premiumUntil);
  return !Number.isNaN(t.getTime()) && t > new Date();
}

/**
 * 单张图片上限（字节）。`hasHdUpload` 为真 → 20MB，否则 8MB。
 * 上传 route 直接用它，不要自己写三元。
 */
export function maxImageBytes(hall: Parameters<typeof hasHdUpload>[0]): number {
  return hasHdUpload(hall) ? MAX_BYTES_HD : MAX_BYTES_STD;
}
