// 公页板块顺序：馆主在控制台拖拽重排，落库到
//   MemorialHall.sectionOrder / ClanHall.sectionOrder（Json?）。
//
// 设计要点（见 AGENTS.md「场景优先 / 不删板块」硬约束）：
//   - 默认序严格等于现状 DOM 顺序，因此 sectionOrder 为 null 的存量数据
//     渲染输出与今日逐字节一致 → 30+ 现有验收套件零回归。
//   - resolveSectionOrder 永不删除板块：不在 defaults 里的未知 key 直接忽略，
//     defaults 中未出现在 stored 的 key 按默认序追加到末尾。

export const HALL_DEFAULT_ORDER = [
  "hero", // 壁龛 / 3D 首屏（两者互斥，只渲染其一）
  "worship", // 祭拜面板
  "cover", // 封面图（条件渲染）
  "profile", // 遗像 + 生平速览
  "couplet", // 挽联横版（条件）
  "paidTributes", // 敬献祭品（条件）
  "archive", // 故人数字档案（条件）
  "tributes", // 追思记录
  "community", // 亲友交流社区
  "panorama", // 3D 全景（条件）
  "decorInfo", // 装修信息
] as const;

export const CLAN_DEFAULT_ORDER = [
  "tour", // 四段 3D 漫游连廊（山门→天井→享堂→寝堂）
  "info", // 主图 + 名号 + 字辈诗
  "worship", // 献祭 · 敬奉先祖
  "photos", // 宗祠影像（条件）
  "tributes", // 祭祀记录
  "community", // 宗亲交流社区
  "decorSummary", // 当前陈设
  "aboutDecor", // 关于装修素材
  "links", // 关联入口
  "ground", // 落地场景（2026-10 起可重排；默认仍页尾，存量 null 零回归）
] as const;

/**
 * 把存储的板块顺序解析成最终渲染顺序。
 * @param stored   库里的 sectionOrder（可能是 null / 非数组 / 含未知 key）
 * @param defaults 默认板块顺序（= 现状 DOM 顺序）
 * @returns 长度 === defaults.length 的数组，包含所有板块，永不删除
 */
export function resolveSectionOrder(
  stored: unknown,
  defaults: readonly string[],
): string[] {
  const def = [...defaults];

  // null / 非数组 / 空数组 → 原样返回默认序
  if (!Array.isArray(stored) || stored.length === 0) return def;

  const valid = new Set(def);
  const seen = new Set<string>();
  const out: string[] = [];

  // 1) 按 stored 顺序排已知 key（忽略未知 key 与重复 key）
  for (const raw of stored) {
    if (typeof raw !== "string") continue;
    if (!valid.has(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }

  // 2) defaults 中未出现于 stored 的 key，按 defaults 顺序追加到末尾（永不删板块）
  for (const k of def) {
    if (!seen.has(k)) out.push(k);
  }

  return out;
}
