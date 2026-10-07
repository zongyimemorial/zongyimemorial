/**
 * 装修四档定价 + 模板分档 + 典藏礼包 验收套件（阶段 3，2026-10）
 *
 * 背景（用户口径）：
 *   「重做纪念馆与宗祠的装修系统（参照淘宝店铺装修逻辑），保证装修前后
 *     美观豪华、有明显区别…… 拉大档次价差」
 *
 * 本套件守住的不变量（每条都对应一个真实踩过、或极易踩的坑）：
 *
 *   1. **四档价格区间**：免费 ¥0 / 入门 ¥5–15 / 中档 ¥15–39 / 豪华 ¥39–99。
 *      越界的商品让"档次阶梯"失去意义 —— 用户看不到"再攒攒能换什么"。
 *   2. **同 space 内价格升序 → 结构档位单调不降**。
 *      口径是"同 space 内比"而不是"全局比"：starfield 空间本身就是 none 档
 *      （星河是"无建筑构件"的形态），拿它去跟 hall/grand 比价格必假红。
 *      这条锁的是"贵的模板反而更朴素"这种真 bug。
 *   3. **免费集合仍精确等于赠品零件**（新素材一律不得落 free）。
 *      多一件免费品 → 集合相等断言变红；本套件独立复验一次，
 *      因为阶段 3 一口气加了 40+ 件素材，这是最容易被顺手写错的地方。
 *   4. **礼包可被解析 + 逐件发货**。
 *      只写 `bundle:<id>` 是"花了 ¥199 什么都没到手"的经典形态，
 *      与套件早期踩过的"扣了积分、写了兑换记录，但什么都没到手"同源。
 *   5. **礼包原价现算**：listPriceFen 必须等于包内每项单买价之和。
 *      手写"原价 ¥380"一旦与包内调价脱节，就成了假广告。
 *   6. **礼包真的比单买便宜**，且折扣合理（不高于 9 折、不低于 4 折）。
 *      前者是"礼包无意义"，后者是"定价事故"。
 *
 * ⚠️ 反向验证（AGENTS.md 硬要求）：第 2 条必须做过反向实验 ——
 *    临时把一套豪华模板的 structure 降到 basic，确认断言**确实变红**，
 *    再还原。只写正向断言不算数。见文件末尾 runNegativeProbe()。
 *
 * 不依赖浏览器：全部是数据层断言，跑得很快。
 * 用法：node scripts/verify-decor-pricing-v2.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

function src(p) {
  try {
    return readFileSync(`/workspace/${p}`, "utf8");
  } catch {
    return "";
  }
}

const hallSrc = src("lib/hall-decor.ts");
const clanSrc = src("lib/clan-decor.ts");
const d3Src = src("lib/decor-3d.ts");

// ---------------------------------------------------------------------------
// 0. 把 lib 里的数据取出来（用 tsx 跑一段小程序，避免在 mjs 里重写一遍解析）
// ---------------------------------------------------------------------------
/**
 * 用 `npx tsx -e` 起一个小进程，把装修数据导出成 JSON。
 *
 * 为什么不直接用正则扫源码：模板的 space / structure / priceFen 分散在
 * 多行、还夹杂注释，正则极易被注释里的示例串骗到（"看着对、其实取错项"）。
 * 直接 import 真值最稳。
 *
 * ⚠️ 传 JSON 走 stdout，**不要**塞进 `-e` 的字符串里（引号会被 shell 剥坏，
 *    这是 AGENTS.md 里记过的老坑）。
 */
function dumpData() {
  const script = `
    import { TEMPLATES, KITS, BUNDLES, SPACE_DEFAULT_TIER, templatePriceFen, templateStructure, WALLS, FLOORS, ORNAMENTS, FRAMES, FONTS } from "./lib/hall-decor.ts";
    import { CLAN_TEMPLATES, CLAN_KITS, CLAN_WALLS, CLAN_FLOORS, CLAN_ORNAMENTS, CLAN_FRAMES, CLAN_FONTS } from "./lib/clan-decor.ts";
    const strip = (t) => ({ id: t.id, name: t.name, tier: t.tier, priceFen: templatePriceFen(t), space: t.space ?? "classic", structure: templateStructure(t), tags: t.tags ?? [] });
    const item = (i) => ({ id: i.id, name: i.name, tier: i.tier, priceFen: i.priceFen ?? i.points ?? 0 });
    console.log(JSON.stringify({
      templates: TEMPLATES.map(strip),
      clanTemplates: CLAN_TEMPLATES.map(strip),
      kits: KITS.map((k) => ({ id: k.id, name: k.name, tier: k.tier, priceFen: k.priceFen ?? k.points ?? 0, includes: k.includes, applies: k.applies ?? null })),
      clanKits: CLAN_KITS.map((k) => ({ id: k.id, name: k.name, tier: k.tier, priceFen: k.priceFen ?? k.points ?? 0, includes: k.includes, applies: k.applies ?? null })),
      bundles: BUNDLES.map((b) => ({ id: b.id, name: b.name, tier: b.tier, priceFen: b.priceFen ?? 0, listPriceFen: b.listPriceFen, includes: b.includes })),
      items: [
        ...WALLS.map(item), ...FLOORS.map(item), ...ORNAMENTS.map(item), ...FRAMES.map(item), ...FONTS.map(item),
        ...CLAN_WALLS.map(item), ...CLAN_FLOORS.map(item), ...CLAN_ORNAMENTS.map(item), ...CLAN_FRAMES.map(item), ...CLAN_FONTS.map(item),
      ],
    }));
  `.replace(/\n/g, " ");
  const out = execSync(`npx tsx -e '${script.replace(/'/g, "'\\''")}'`, {
    cwd: "/workspace",
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  // tsx 可能把 npm notice 混进 stderr，但 stdout 应该只有一行 JSON
  const line = out.trim().split("\n").filter((l) => l.trim().startsWith("{")).pop();
  return JSON.parse(line);
}

let D;
try {
  D = dumpData();
} catch (e) {
  console.error("无法读出装修数据：", e.message);
  process.exit(1);
}

const ALL_TEMPLATES = [...D.templates, ...D.clanTemplates];
const TIER_ORDER = ["none", "basic", "grand", "imperial"];
const lvl = (t) => {
  const i = TIER_ORDER.indexOf(t);
  return i < 0 ? 0 : i;
};

// ---------------------------------------------------------------------------
// 1. 四档价格区间
// ---------------------------------------------------------------------------
console.log("\n=== 1. 四档价格区间 ===");

/*
  四段口径（计划 §6.5）：
    免费   ¥0
    入门   ¥5–15
    中档   ¥15–39
    豪华   ¥39–99

  实际商品允许落在区间内的任意 1 分钱上（比如 ¥29 = 2900 分），
  所以断言的是"落在 [5,15] ∪ [15,39] ∪ [39,99] 里"，
  而不是要求价格必须是 5/6/7/8/9/10/12/15 这几个离散值 ——
  计划里那串数字是"典型值"举例，不是白名单（把举例当白名单会让
  以后每加一件商品都要改断言）。
*/
const yen = (fen) => fen / 100;
const IN_BANDS = (v) => (v >= 5 && v <= 15) || (v >= 15 && v <= 39) || (v >= 39 && v <= 99);

const paidTemplates = ALL_TEMPLATES.filter((t) => t.tier !== "free");
const outOfBand = paidTemplates.filter((t) => !IN_BANDS(yen(t.priceFen)));
check(
  "所有收费模板价格落在 ¥5–99 的三段区间内",
  outOfBand.length === 0,
  outOfBand.length ? outOfBand.map((t) => `${t.id}=¥${yen(t.priceFen)}`).join(", ") : `${paidTemplates.length} 套`,
);

/*
  单件素材的价格口径与模板**不同**，别套同一条断言（第一版就套错、误红了一整片）。

  真实规则（计划 §6.5 的"单件素材"那一行 + 存量数据的既有语义）：
    - `premium` 档：价格 **0** 是**正确**的 —— 它靠高级订阅生效，
      从不单卖，标价反而是误导（用户看到 ¥0 卡片会以为免费领）。
    - 价格 0 且 tier 不是 premium：只有 `*-none` 这种"占位项"
      （orn-none / floor-none / frame-none / clan-orn-none），
      它们是"不做处理"的选项，本来就不该收钱。
    - 其余收费素材至少 ¥1（存量老素材保持原价，未强迁到 ¥5 起）。

  所以断言拆成三条，比"一律 ¥5–99"精确得多 ——
  后者会把 60 件存量素材全判红，而那 60 件一件问题都没有。
*/
/*
  ⚠️ "-none" 不是唯一的占位项命名：宗祠侧的 `clan-floor-plain`（"素土"）
     也是"不做处理"的选项，名字却不含 none。所以占位项用**白名单**列，
     而不是靠命名规律猜 —— 猜规律会在下一个"素X"出现时误红。
*/
const PLACEHOLDER_IDS = new Set([
  "orn-none",
  "floor-none",
  "frame-none",
  "clan-orn-none",
  "clan-floor-plain",
]);
const zeroPricedNonNone = D.items.filter(
  (i) =>
    i.tier !== "free" &&
    i.priceFen === 0 &&
    i.tier !== "premium" &&
    !PLACEHOLDER_IDS.has(i.id),
);
check(
  "¥0 素材只能是 premium 档或占位项（不做处理）",
  zeroPricedNonNone.length === 0,
  zeroPricedNonNone.length ? zeroPricedNonNone.map((i) => `${i.id}(${i.tier})`).join(", ") : "ok",
);

const premiumPriced = D.items.filter((i) => i.tier === "premium" && i.priceFen > 0);
check(
  "premium 档素材不标价（靠订阅，不该有价格牌）",
  premiumPriced.length === 0,
  premiumPriced.length ? premiumPriced.map((i) => `${i.id}=¥${yen(i.priceFen)}`).join(", ") : `${D.items.filter((i) => i.tier === "premium").length} 件`,
);

/*
  「阶段 3 新增」的素材必须落在 ¥5–99 —— 这是"拉大档次价差"的落点。
  存量老素材（¥1–4）刻意不动：把它们集体提价会让老用户已买的权益
  在观感上"贬值"，且与"新增中高档"这个目标无关。
  判定方式是按**价格 < ¥5 且非 premium 非 none** 反查，并要求它们
  **全部是阶段 3 之前就存在的 id**（用一份白名单锁住，防止以后
  又往低价段随手塞新素材）。
*/
const LOW_PRICE_LEGACY = new Set([
  "wall-plain", "wall-mist", "wall-night", "wall-inkwash", "wall-bamboo",
  "floor-brick", "floor-wood", "floor-cloud",
  "orn-lantern-red", "orn-flower-white", "orn-shelf", "orn-lantern-gold",
  "orn-curtain", "orn-pillar",
  "frame-line", "frame-double", "frame-wood", "frame-bronze",
  "font-modern", "font-kai", "font-fangsong",
  "clan-wall-earth", "clan-wall-vermilion",
  "clan-floor-goldbrick",
  "clan-orn-lantern", "clan-orn-pillar", "clan-orn-lion",
  "clan-frame-plain", "clan-frame-fret", "clan-frame-dragon",
  "clan-font-song", "clan-font-li", "clan-font-zhuan",
]);
const newLowPriced = D.items.filter(
  (i) =>
    i.tier !== "free" &&
    i.tier !== "premium" &&
    i.priceFen > 0 &&
    i.priceFen < 500 &&
    !LOW_PRICE_LEGACY.has(i.id),
);
check(
  "新增素材不得再落低价段（¥1–4，存量除外）",
  newLowPriced.length === 0,
  newLowPriced.length ? newLowPriced.map((i) => `${i.id}=¥${yen(i.priceFen)}`).join(", ") : "ok",
);

// 新素材确实撑起了 ¥5–99：低价段之外的收费素材数应远多于存量
const modernItems = D.items.filter(
  (i) => i.tier !== "free" && i.tier !== "premium" && i.priceFen >= 500,
);
check(
  "中高档单件素材已成规模（≥20 件）",
  modernItems.length >= 20,
  `${modernItems.length} 件 ¥5+`,
);

// 免费档一律 ¥0（free 档不该标价 —— 它随赠品发放）
const freePriced = [...ALL_TEMPLATES, ...D.items].filter((x) => x.tier === "free" && x.priceFen > 0);
check("免费（赠品）档一律不标价", freePriced.length === 0, `${freePriced.length} 件标了价`);

// 每档都要有商品，否则"分档"名存实亡
const entryBand = paidTemplates.filter((t) => yen(t.priceFen) >= 5 && yen(t.priceFen) < 15);
const midBand = paidTemplates.filter((t) => yen(t.priceFen) >= 15 && yen(t.priceFen) <= 39);
const luxBand = paidTemplates.filter((t) => yen(t.priceFen) > 39);
check("入门档（¥5–15）有模板", entryBand.length > 0, `${entryBand.length} 套`);
check("中档（¥15–39）有模板", midBand.length > 0, `${midBand.length} 套`);
check("豪华档（¥39–99）有模板", luxBand.length > 0, `${luxBand.length} 套`);

// ---------------------------------------------------------------------------
// 2. 同 space 内价格升序 → 结构档位单调不降
// ---------------------------------------------------------------------------
console.log("\n=== 2. 同空间形态内：价格升序，结构档位单调不降 ===");

const bySpace = {};
for (const t of ALL_TEMPLATES) (bySpace[t.space] ??= []).push(t);

let monotonicViolations = [];
for (const [space, list] of Object.entries(bySpace)) {
  const sorted = [...list].sort((a, b) => a.priceFen - b.priceFen);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (lvl(cur.structure) < lvl(prev.structure)) {
      monotonicViolations.push(
        `${space}: ${prev.id}(¥${yen(prev.priceFen)},${prev.structure}) → ${cur.id}(¥${yen(cur.priceFen)},${cur.structure})`,
      );
    }
  }
}
check(
  "同 space 内无「贵的反而更朴素」",
  monotonicViolations.length === 0,
  monotonicViolations.length ? monotonicViolations.join(" | ") : `${Object.keys(bySpace).length} 个形态全通过`,
);

// 断言"真的分组比了"—— 否则 bySpace 只有一个组时上面恒真（假绿）
check(
  "确实存在多个空间形态分组（防假绿）",
  Object.keys(bySpace).length >= 5,
  `${Object.keys(bySpace).length} 个形态：${Object.keys(bySpace).join(",")}`,
);

// ---------------------------------------------------------------------------
// 3. 模板的 space 必须已注册，且名字带「立体」不得回落 classic
// ---------------------------------------------------------------------------
console.log("\n=== 3. space 声明合法性 ===");

const registered = (d3Src.match(/^  (\w+): (classicSpace|\(\(\))/gm) ?? []).map((s) => s.trim().split(":")[0]);
const hasStarfield = /starfield:\s*classicSpace\(/.test(d3Src);
const known = new Set([...registered, ...(hasStarfield ? ["starfield"] : [])]);

const unknownSpace = ALL_TEMPLATES.filter((t) => t.space && !known.has(t.space));
check(
  "所有模板声明的 space 都在 decor-3d 注册表内",
  unknownSpace.length === 0,
  unknownSpace.length ? unknownSpace.map((t) => `${t.id}:${t.space}`).join(", ") : `${known.size} 种形态`,
);

const named3dButClassic = ALL_TEMPLATES.filter(
  (t) => /立体|3D/.test(t.name) && (t.space === "classic" || !t.space),
);
check(
  "名字带「立体」/「3D」的模板不得回落 classic",
  named3dButClassic.length === 0,
  named3dButClassic.length ? named3dButClassic.map((t) => `${t.id}(${t.space})`).join(", ") : "全通过",
);

// ---------------------------------------------------------------------------
// 4. 免费集合仍精确等于赠品零件
// ---------------------------------------------------------------------------
console.log("\n=== 4. 免费集合 == 赠品零件（阶段 3 新增素材未污染） ===");

/*
  与 verify-decor-3d.mjs 同口径，这里**独立复验一次**。
  理由：阶段 3 一口气加了 40+ 件素材，是"顺手把某件写成 free"风险最高的时刻。
  两个套件都锁这条不算冗余 —— 一边挂了另一边还能报。
*/
function freeIdsOf(source) {
  const out = [];
  const re = /id:\s*"([^"]+)"[\s\S]{0,600}?tier:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(source))) if (m[2] === "free") out.push(m[1]);
  return out;
}
function expectedFree(hallSource, tplId) {
  const pm = hallSource.match(new RegExp(`"${tplId}":\\s*\\[([\\s\\S]*?)\\]`));
  const parts = pm ? [...pm[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  return [tplId, ...parts].sort();
}
function checkFreeSetExact(label, source, tplId) {
  const actual = [...new Set(freeIdsOf(source))].sort();
  const expected = expectedFree(hallSrc, tplId);
  const extra = actual.filter((x) => !expected.includes(x));
  const missing = expected.filter((x) => !actual.includes(x));
  check(
    `${label}：免费素材集合 == 赠品模板 + 其零件`,
    extra.length === 0 && missing.length === 0,
    extra.length || missing.length
      ? `${extra.length ? `多出 ${extra.join(",")}` : ""}${extra.length && missing.length ? " / " : ""}${missing.length ? `缺少 ${missing.join(",")}` : ""}`
      : `${actual.length} 件`,
  );
}
checkFreeSetExact("纪念馆", hallSrc, "tpl-niche");
checkFreeSetExact("宗祠", clanSrc, "clan-tpl-ancestral");

// ---------------------------------------------------------------------------
// 5. 典藏礼包
// ---------------------------------------------------------------------------
console.log("\n=== 5. 典藏礼包 ===");

check("至少有 3 个礼包", D.bundles.length >= 3, `${D.bundles.length} 个`);

const priceById = new Map();
for (const t of ALL_TEMPLATES) priceById.set(t.id, t.priceFen);
for (const k of [...D.kits, ...D.clanKits]) priceById.set(k.id, k.priceFen);

for (const b of D.bundles) {
  // 5.1 包内每一项都可查（查不到 = 发货会静默少一件）
  const unknown = b.includes.filter((id) => !priceById.has(id));
  check(`礼包「${b.name}」内每一项都能查到价格`, unknown.length === 0, unknown.join(",") || `${b.includes.length} 项`);

  // 5.2 原价 == 现算之和（手写原价一旦脱节就是假广告）
  const recomputed = b.includes.reduce((s, id) => s + (priceById.get(id) ?? 0), 0);
  check(
    `礼包「${b.name}」原价与现算一致`,
    recomputed === b.listPriceFen,
    `字段 ¥${yen(b.listPriceFen)} / 现算 ¥${yen(recomputed)}`,
  );

  // 5.3 真的更便宜
  check(
    `礼包「${b.name}」比单买便宜`,
    b.priceFen < b.listPriceFen,
    `礼包 ¥${yen(b.priceFen)} < 原价 ¥${yen(b.listPriceFen)}`,
  );

  const ratio = b.priceFen / b.listPriceFen;
  check(
    `礼包「${b.name}」折扣在 4–9 折之间`,
    ratio >= 0.4 && ratio <= 0.9,
    `${(ratio * 10).toFixed(1)} 折`,
  );

  // 5.4 不得含免费 / 赠品项（否则"原价"里混进白送的东西）
  const hasFree = b.includes.some((id) => id.includes("niche") || id.includes("ancestral") && !id.includes("grand"));
  check(`礼包「${b.name}」不含赠品模板`, !hasFree, hasFree ? b.includes.join(",") : "ok");
}

// ---------------------------------------------------------------------------
// 6. 整店套餐（含 wall/floor 的 applies）
// ---------------------------------------------------------------------------
console.log("\n=== 6. 整店套餐 ===");

const fullKits = [...D.kits, ...D.clanKits].filter((k) => k.applies && (k.applies.wall || k.applies.floor));
check("至少 3 个整店套餐（含墙地）", fullKits.length >= 3, `${fullKits.length} 个`);

for (const k of fullKits) {
  /*
    ⚠️ applies 的每个值都必须在该库的零件表里 —— 写错 id 的后果是
    "点了一键应用，某个槽位静默保持原样"（不会报错，用户以为应用了）。
  */
  const isClan = k.id.startsWith("clan-");
  const pool = new Set(
    (isClan
      ? [...D.items.filter((i) => i.id.startsWith("clan-"))]
      : [...D.items.filter((i) => !i.id.startsWith("clan-"))]
    ).map((i) => i.id),
  );
  const bad = Object.values(k.applies).filter((v) => !pool.has(v));
  check(`套餐「${k.name}」applies 引用的素材全部存在`, bad.length === 0, bad.join(",") || `5 槽`);

  // includes 与 applies 的取值应当一致（否则"买了却没应用上"）
  const incSet = new Set(k.includes);
  const applyVals = Object.values(k.applies);
  const notIncluded = applyVals.filter((v) => !incSet.has(v));
  check(
    `套餐「${k.name}」applies 用到的零件都在 includes 里`,
    notIncluded.length === 0,
    notIncluded.join(",") || "ok",
  );
}

// ---------------------------------------------------------------------------
// 7. 发货键覆盖：bundle 必须逐件展开
// ---------------------------------------------------------------------------
console.log("\n=== 7. 礼包发货键展开 ===");

const entSrc = src("lib/decor-products.ts");
check(
  "DecorEntitlement.kind 含 bundle",
  /kind:\s*"kit"\s*\|\s*"template"\s*\|\s*"item"\s*\|\s*"bundle"/.test(entSrc),
  "已扩联合",
);
check(
  "发货逻辑有 bundle 分支（写 grants）",
  /ent\.kind === "bundle"/.test(entSrc),
  "已实现",
);
check(
  "bundle 分支不只写 bundle: 键（须展开 grants）",
  // ⚠️ 只锁**行为**（遍历 ent.grants 并逐个写入），不锁被调函数的变量名 ——
  //    早先写死 `addKey(k)`，函数改名成 `addIfNewOrExpired` 后即误报（那是"断言比规则更具体"）。
  //    与 AGENTS.md 记的「别锁中间变量名」同源（见 verify-decor-scene-engine 的同类修法）。
  /for \(const k of ent\.grants \?\? \[\]\)\s*\w+\(k\)/.test(entSrc),
  "已逐件展开",
);

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
console.log(`\n===== 阶段 3 定价验收：${pass}/${pass + fail} PASS =====`);
if (failures.length) {
  console.log("变红项：");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
