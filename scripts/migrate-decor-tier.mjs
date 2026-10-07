/**
 * 装修素材档位迁移（2026-10 改版）
 *
 * 改版口径（用户已确认）：
 *   「只在建新馆时免费赠送一套，其他的均改为付费」
 *   「免费素材 21 件 / 16 件改为付费，付费是指可以积分兑换也可以用货币支付」
 *   甲方案：「赠品模板的零件永久免费，其余全部转付费」
 *
 * 本脚本做两件事（幂等，可重复执行）：
 *   1. 把 lib/hall-decor.ts / lib/clan-decor.ts 里**原免费素材**的
 *      `tier: "free"` 改写为 `tier: "points"`，并补上 `points` 与 `priceFen`。
 *      例外：赠品模板用到的零件保持 free。
 *   2. 把原免费模板（tpl-plain / tpl-paper / tpl-nightlight / clan-tpl-*3）
 *      改写为付费档。
 *
 * 用法：node scripts/migrate-decor-tier.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");

/**
 * 价格表：id → { points, priceFen }
 *
 * 定价原则：
 *   - 单价与「能带来的观感提升」挂钩，不按成本随手定
 *   - 100 积分 = ¥1（平台既有口径），所以 points 与 priceFen 大致 1:1 换算，
 *     再给"用积分换"留一点点折扣（积分是玩家体系，不该比现金更亏）
 *   - 单个零件便宜（¥1–4），整套模板贵（¥8–18）—— 模板是打包价
 */
const HALL_PRICE = {
  // ---- 壁纸 ----
  "wall-plain": { points: 100, priceFen: 100 },
  "wall-mist": { points: 150, priceFen: 150 },
  "wall-night": { points: 250, priceFen: 250 },
  // wall-warm 是赠品模板零件，保持 free
  "wall-inkwash": { points: 300, priceFen: 300 },
  "wall-bamboo": { points: 400, priceFen: 400 },
  "wall-goldweave": { points: 500, priceFen: 500 },
  // wall-starry / wall-lotuspond 原为 premium，保持不动
  // ---- 地纹 ----
  "floor-none": { points: 0, priceFen: 0 },
  // floor-marble 是赠品模板零件，保持 free
  "floor-brick": { points: 180, priceFen: 180 },
  "floor-wood": { points: 200, priceFen: 200 },
  "floor-cloud": { points: 350, priceFen: 350 },
  // ---- 挂饰 ----
  "orn-none": { points: 0, priceFen: 0 },
  "orn-lantern-red": { points: 220, priceFen: 220 },
  "orn-flower-white": { points: 160, priceFen: 160 },
  "orn-shelf": { points: 260, priceFen: 260 },
  "orn-lantern-gold": { points: 250, priceFen: 250 },
  "orn-curtain": { points: 300, priceFen: 300 },
  "orn-pillar": { points: 450, priceFen: 450 },
  // orn-niche-wall 是赠品模板零件，保持 free
  // orn-halo / orn-plaque 原为 premium，保持不动
  // ---- 相框 ----
  "frame-none": { points: 0, priceFen: 0 },
  "frame-line": { points: 120, priceFen: 120 },
  "frame-double": { points: 180, priceFen: 180 },
  // frame-wood / frame-bronze 原为 points，已有价，保持不动
  // frame-gold 原为 premium，保持不动
  // ---- 字体 ----
  "font-modern": { points: 100, priceFen: 100 },
  // font-serif 是赠品模板零件，保持 free
  // font-kai / font-fangsong 原为 points，已有价，保持不动
  // font-brush 原为 premium，保持不动
  // ---- 模板 ----
  "tpl-plain": { points: 300, priceFen: 300 },
  "tpl-paper": { points: 800, priceFen: 800 },
  "tpl-nightlight": { points: 900, priceFen: 900 },
  // tpl-niche 是赠品，保持 free
  // tpl-inkwash / tpl-zhuqi 原为 points，已有价
  // tpl-goldhall / tpl-lotuswake / tpl-starry 原为 premium
};

const CLAN_PRICE = {
  // ---- 墙面 ----
  "clan-wall-brick": { points: 150, priceFen: 150 },
  "clan-wall-earth": { points: 130, priceFen: 130 },
  // clan-wall-white 是赠品模板零件，保持 free
  // clan-wall-vermilion 原为 points，已有价
  // clan-wall-nanmu / clan-wall-gilt 原为 premium
  // ---- 地面 ----
  "clan-floor-plain": { points: 0, priceFen: 0 },
  "clan-floor-stone": { points: 170, priceFen: 170 },
  // clan-floor-goldbrick / clan-floor-cloud / clan-floor-brocade 保持不动
  // ---- 挂饰 ----
  "clan-orn-none": { points: 0, priceFen: 0 },
  "clan-orn-lantern": { points: 200, priceFen: 200 },
  // clan-orn-censer 是赠品模板零件，保持 free
  "clan-orn-pillar": { points: 380, priceFen: 380 },
  // clan-orn-lion / altar / imperial-plaque / tablet-wall 原为 points
  // clan-orn-banner / dragonhaze 原为 premium
  // ---- 相框 ----
  "clan-frame-plain": { points: 120, priceFen: 120 },
  // clan-frame-wood 是赠品模板零件，保持 free
  // clan-frame-fret / dragon 原为 points；gilt / carved 原为 premium
  // ---- 字体 ----
  "clan-font-song": { points: 100, priceFen: 100 },
  "clan-font-kai": { points: 200, priceFen: 200 },
  // clan-font-li / zhuan 原为 points；imperial 原为 premium
  // ---- 模板 ----
  "clan-tpl-plain": { points: 300, priceFen: 300 },
  "clan-tpl-vermilion": { points: 600, priceFen: 600 },
  "clan-tpl-ancestral": { points: 700, priceFen: 700 },
  // clan-tpl-* 其余：dragonmarble/hallplaque 原为 points；imperial 等原为 premium
};

/**
 * 需要改写的条目：把 `tier: "free",` 替换成 `tier: "points",` + 价格字段。
 *
 * 实现方式：按 id 定位，向后查找最近的 `tier: "free",` 行并替换。
 * 不用正则全局替换 —— 那样会误伤赠品零件。
 */
function rewrite(src, priceMap, label) {
  const lines = src.split("\n");
  const out = [];
  let changed = 0;
  let pendingId = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 记录当前正在处理的素材 id
    const idMatch = line.match(/^\s*id:\s*"([^"]+)",\s*$/);
    if (idMatch) pendingId = idMatch[1];

    // 命中 tier: "free", 且该 id 在价格表里 → 改写
    if (/^\s*tier:\s*"free",\s*$/.test(line) && pendingId && priceMap[pendingId]) {
      const p = priceMap[pendingId];
      const indent = line.match(/^\s*/)[0];
      // points: 0 的条目（"无"）保持免费语义，但仍要进商城可选项之外；
      // 这里统一转 points 档，价格为 0 表示"可直接选用"。
      out.push(`${indent}tier: "points",`);
      out.push(`${indent}points: ${p.points},`);
      out.push(`${indent}priceFen: ${p.priceFen},`);
      changed++;
      pendingId = null;
      continue;
    }

    // 已经有 points/priceFen 的条目，补 priceFen（若缺失）
    if (/^\s*points:\s*\d+,\s*$/.test(line) && pendingId && priceMap[pendingId]) {
      out.push(line);
      const indent = line.match(/^\s*/)[0];
      const next = lines[i + 1] ?? "";
      if (!/^\s*priceFen:/.test(next)) {
        out.push(`${indent}priceFen: ${priceMap[pendingId].priceFen},`);
      }
      continue;
    }

    out.push(line);
  }

  console.log(`${label}: 改写 ${changed} 条`);
  return { src: out.join("\n"), changed };
}

const targets = [
  { file: "lib/hall-decor.ts", map: HALL_PRICE, label: "纪念馆" },
  { file: "lib/clan-decor.ts", map: CLAN_PRICE, label: "宗祠" },
];

let total = 0;
for (const t of targets) {
  const src = readFileSync(t.file, "utf8");
  const { src: next, changed } = rewrite(src, t.map, t.label);
  total += changed;
  if (!DRY && changed > 0) writeFileSync(t.file, next, "utf8");
}
console.log(DRY ? `[dry-run] 共 ${total} 条待改写` : `共改写 ${total} 条`);
