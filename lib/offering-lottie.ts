// 祭品封面 → 墨金 Lottie 微动图 映射
// 产品 coverImage 形如 /assets/free-candle.png 或 /assets/prod-flower.jpg
// 映射其文件名基名到 public/assets/lottie/<archetype>.json
// 未知封面返回 null，由调用方回退到原图。

const MAP: Record<string, string> = {
  // 免费祭品（30）
  "free-bell": "bell",
  "free-bow": "bow",
  "free-candle": "candle",
  "free-chime": "chime",
  "free-clean": "clean",
  "free-dove": "dove",
  "free-firework": "firework",
  "free-flower": "flower",
  "free-food": "food",
  "free-fruit": "fruit",
  "free-incense": "incense",
  "free-kite": "kite",
  "free-lantern": "lantern",
  "free-letter": "letter",
  "free-lotus": "lotus",
  "free-message": "message",
  "free-moon": "moon",
  "free-music": "music",
  "free-poem": "book",
  "free-prayer": "prayer",
  "free-rice": "rice",
  "free-scripture": "scripture",
  "free-song": "music",
  "free-star": "star",
  "free-story": "book",
  "free-tea": "tea",
  "free-tree": "tree",
  "free-willow": "willow",
  "free-wine": "wine",
  "free-wreath": "wreath",
  // 付费祭品 / 服务 / 素材（15）
  "prod-hall": "hall",
  "prod-cloud": "cloud",
  "prod-flower": "flower",
  "prod-supplies": "supplies",
  "prod-service": "service",
  "prod-svc-bio": "bio",
  "prod-svc-obituary": "obituary",
  "prod-svc-video": "video",
  "prod-svc-meeting": "meeting",
  "prod-svc-qr": "qr",
  "prod-video": "video",
  "prod-decor-bundle": "decor",
  "prod-decor-kit": "decor",
  "prod-decor-tpl": "decor",
  "prod-wreath": "wreath",
  "prod-storage": "storage",
};

function baseName(cover: string): string {
  const f = cover.split("/").pop() || "";
  return f.replace(/\.[^.]+$/, "");
}

/** 返回 Lottie JSON 的公开路径；不匹配则返回 null（调用方回退原图）。 */
export function lottieForCover(cover: string | null | undefined): string | null {
  if (!cover) return null;
  const arch = MAP[baseName(cover)];
  return arch ? `/assets/lottie/${arch}.json` : null;
}
