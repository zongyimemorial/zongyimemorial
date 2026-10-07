/**
 * 礼器（可一键祭拜的祭品）的共享元数据。
 *
 * 产品体系重构后，礼器分两类：
 *   免费礼器（isFree=true）  —— 直接点，走 offerFreeTribute
 *   收费礼器（isFree=false）—— 需先购买，购买后走 offerPaidTribute
 * 两类都是 isRitual=true，在祭拜面板里都要有按钮和动效。
 */

export type TributeType = "flower" | "candle" | "lamp" | "message" | "offering" | "music";

export const RITUAL_SLUGS = [
  // 免费 10 个
  "free-incense",
  "free-flower",
  "free-candle",
  "free-fruit",
  "free-tea",
  "free-wine",
  "free-clean",
  "free-bow",
  "free-message",
  "free-music",
  // 收费 20 个
  "free-star",
  "free-moon",
  "free-willow",
  "free-wreath",
  "free-prayer",
  "free-kite",
  "free-dove",
  "free-lantern",
  "free-lotus",
  "free-tree",
  "free-song",
  "free-bell",
  "free-food",
  "free-rice",
  "free-story",
  "free-poem",
  "free-letter",
  "free-scripture",
  "free-chime",
  "free-firework",
] as const;

/** slug → 追思记录 type（写 MemorialTribute.type 用；全量覆盖 30 个礼器） */
export const SLUG_TO_TRIBUTE_TYPE: Record<string, TributeType> = {
  "free-incense": "candle",
  "free-flower": "flower",
  "free-candle": "candle",
  "free-fruit": "offering",
  "free-tea": "offering",
  "free-wine": "offering",
  "free-clean": "offering",
  "free-bow": "offering",
  "free-message": "message",
  "free-music": "music",
  "free-star": "lamp",
  "free-moon": "lamp",
  "free-willow": "flower",
  "free-wreath": "flower",
  "free-prayer": "offering",
  "free-kite": "offering",
  "free-dove": "offering",
  "free-lantern": "lamp",
  "free-lotus": "lamp",
  "free-tree": "flower",
  "free-song": "music",
  "free-bell": "music",
  "free-food": "offering",
  "free-rice": "offering",
  "free-story": "message",
  "free-poem": "message",
  "free-letter": "message",
  "free-scripture": "music",
  "free-chime": "music",
  "free-firework": "lamp",
};

export function tributeTypeOf(slug: string): TributeType {
  return SLUG_TO_TRIBUTE_TYPE[slug] ?? "offering";
}

/** 需要用户输入文字的礼器（留言类） */
export const MESSAGE_SLUGS = new Set([
  "free-message",
  "free-letter",
  "free-story",
  "free-poem",
]);

/**
 * slug → 图标（emoji）。
 *
 * 这里是**唯一权威来源**：祭拜面板的按钮、供台陈列、场景供台
 * 都必须取这张表，否则同一件祭品在面板上和供台上会长得不一样。
 */
export const SLUG_TO_ICON: Record<string, string> = {
  "free-incense": "🕯️",
  "free-flower": "🌸",
  "free-candle": "✨",
  "free-fruit": "🍊",
  "free-tea": "🍵",
  "free-wine": "🍶",
  "free-clean": "🧹",
  "free-bow": "🙇",
  "free-message": "✉️",
  "free-music": "🎵",
  "free-star": "⭐",
  "free-moon": "🌙",
  "free-willow": "🌿",
  "free-wreath": "💐",
  "free-prayer": "🙏",
  "free-kite": "🪁",
  "free-dove": "🕊️",
  "free-lantern": "🏮",
  "free-lotus": "🪷",
  "free-tree": "🌳",
  "free-song": "🎼",
  "free-bell": "🔔",
  "free-food": "🍱",
  "free-rice": "🌾",
  "free-story": "📖",
  "free-poem": "📜",
  "free-letter": "📮",
  "free-scripture": "📿",
  "free-chime": "🛎️",
  "free-firework": "🎆",
};

export function iconOf(slug: string): string {
  return SLUG_TO_ICON[slug] ?? "🕊️";
}
