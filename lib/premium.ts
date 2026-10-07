/**
 * 高级订阅判定的统一出口。
 *
 * 背景：`premiumUntil` 存在于 User / MemorialHall / ClanHall 三个模型上，
 *      此前各处都是手写 `!!(x.premiumUntil && new Date(x.premiumUntil) > new Date())`，
 *      已出现 17 处重复。此文件作为唯一实现，新代码一律引用它。
 *
 * ⚠️⚠️ 2026-10 补记：本文件曾是**死代码**（定义了却无人 import），
 * 而各处手写判定已经分叉成**三种语义**：
 *
 *   | 变体 | 取源 | 典型位置 |
 *   |---|---|---|
 *   | 仅馆级 | `hall.premiumUntil` | 两个 console 的 actions.ts 里的 `isPremiumOf()` |
 *   | 仅用户级 | `user.premiumUntil` | `console/whispers`、`clan/genealogy` |
 *   | 馆级 OR 用户级 | 两者 | 两个控制台页 + 宗祠公页 |
 *
 *   **这就是「宗祠装修后无法保存」的根因**：宗祠控制台页用第三种（用户级
 *   订阅有效 → UI 显示「高级订阅生效中 · 全部装修素材可用」），
 *   而 `saveClanDecor` 用第一种（只认馆级 → 判为未解锁）→
 *   用户挑好模板点保存，服务端**静默驳回**，页面看起来"点了没反应"。
 *
 *   → **产品口径已定：馆级 OR 用户级**（用户买的订阅该覆盖他名下的馆/祠）。
 *     新代码一律 `isAnyPremium(user, hall)`，别再手写三元表达式。
 */

/**
 * 用户级 or 馆级 —— 装修/上传这类"馆主张有的能力"统一用这个。
 *
 * 为什么不叫 `isPremium`：`isPremium(obj)` 是**单来源**判定（上面那个），
 * 两者名字太像会误用。这里刻意起个不同的名字，逼调用方想一下"要不要并集"。
 */
export function isPremiumForUser(
  user: { premiumUntil?: Date | string | null } | null | undefined,
  hall: { premiumUntil?: Date | string | null } | null | undefined,
): boolean {
  return isAnyPremium(user, hall);
}

/** 判断某个 premiumUntil 是否仍在有效期内 */
export function isPremiumUntil(
  premiumUntil: Date | string | null | undefined,
): boolean {
  if (!premiumUntil) return false;
  const t = premiumUntil instanceof Date ? premiumUntil : new Date(premiumUntil);
  return !Number.isNaN(t.getTime()) && t > new Date();
}

/** 从带 premiumUntil 的对象上判断 */
export function isPremium(obj: {
  premiumUntil?: Date | string | null;
} | null | undefined): boolean {
  return isPremiumUntil(obj?.premiumUntil);
}

/** 多来源任一有效即视为高级（如 用户级 或 馆级） */
export function isAnyPremium(
  ...sources: ({ premiumUntil?: Date | string | null } | null | undefined)[]
): boolean {
  return sources.some((s) => isPremium(s));
}

/** 剩余天数（负数表示已过期；无值返回 0） */
export function premiumDaysLeft(
  premiumUntil: Date | string | null | undefined,
): number {
  if (!premiumUntil) return 0;
  const t = premiumUntil instanceof Date ? premiumUntil : new Date(premiumUntil);
  if (Number.isNaN(t.getTime())) return 0;
  return Math.ceil((t.getTime() - Date.now()) / 86400000);
}
