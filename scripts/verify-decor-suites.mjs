/**
 * 第②步验收：三层九档套装（装修方案目录层）
 *
 * 覆盖：
 *  §1 结构：HALL_SUITES / CLAN_SUITES 已定义；tier ∈ {free,standard,premium}、target ∈ {hall,clan}
 *  §2 无悬空引用：每 item.ref 都解析成功（found=true），且**绝不含 bundle-** 前缀
 *  §3 价格现算：suitePriceFen == 引用项 priceFen 之和（不比对任何硬编码原价）
 *  §4 九档：PRICE_BRACKETS 恰好 9 项、连续无重叠、覆盖 0..∞
 *  §5 三权益层：三层均至少一套
 *  §6 目录 UI：GET /suites=200；GET /suites/<id>=200 且列出项；?bracket= 收窄生效
 *
 * 反向验证（证明断言能变红，而非恒绿）：
 *  - 把一个不存在的 ref 喂给 suiteItemEntries → found 必须为 false（§2 检测有效）
 *  - 构造一组有缝隙/重叠的档位喂给同款连续性检查器 → 必须判 false（§4 检测有效）
 *
 * 数据层取数方式：用 `npx tsx` 跑一个落在 /workspace 内的临时 .mts，
 * 由它 import `@/lib/decor-suites` 并把真值导出成 JSON（与 verify-decor-skin.mjs 同法）。
 */
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const TMP = "/workspace/scripts/.verify-suites-data.mts";

let pass = 0;
let fail = 0;
const fails = [];
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    fails.push(`${name} ${detail}`);
    console.log(`  ❌ ${name} ${detail}`);
  }
}

// 取数：写一个临时 ts，npx tsx 跑，读 stdout JSON
const ts = `
import { allSuites, suitePriceFen, suiteItemEntries, SUITE_BENEFIT_TIERS, PRICE_BRACKETS, bracketOf, type DecorSuite } from "@/lib/decor-suites";
const suites = allSuites();
const data = {
  tiers: SUITE_BENEFIT_TIERS,
  brackets: PRICE_BRACKETS,
  suites: suites.map((s) => {
    const entries = suiteItemEntries(s);
    const price = suitePriceFen(s);
    return {
      id: s.id, tier: s.tier, target: s.target,
      items: s.items.map((it) => ({ ref: it.ref, kind: it.kind })),
      entries: entries.map((e) => ({ ref: e.ref, kind: e.kind, found: e.found, priceFen: e.priceFen, name: e.name })),
      priceFen: price,
      bracket: bracketOf(price),
    };
  }),
};
// 反向：不存在的 ref 必须 found=false
const broken = suiteItemEntries({ id:"x", name:"x", desc:"", tier:"free", target:"hall", items:[{ref:"tpl-NOPE-NOPE", kind:"template"}], tags:[], preview:{background:"",color:"",accent:"",icon:""} } as DecorSuite);
(data as any).reverseBrokenFound = broken[0] ? broken[0].found : null;
console.log(JSON.stringify(data));
`;

let data;
try {
  writeFileSync(TMP, ts);
  const out = execSync(`cd /workspace && npx tsx ${TMP} 2>/dev/null`).toString();
  data = JSON.parse(out.trim().split("\n").pop());
} catch (e) {
  console.error("取数失败：", e.message);
  process.exit(1);
} finally {
  try { unlinkSync(TMP); } catch {}
}

console.log("===== 第②步验收：三层九档套装 =====");
console.log(`套装总数：${data.suites.length}（纪念馆 ${data.suites.filter((s) => s.target === "hall").length} / 宗祠 ${data.suites.filter((s) => s.target === "clan").length}）`);

// §1 结构
console.log("\n[§1] 结构");
const validTiers = new Set(["free", "standard", "premium"]);
const validTargets = new Set(["hall", "clan"]);
check("HALL/CLAN 套装均已定义", data.suites.length > 0, `共 ${data.suites.length} 套`);
check(
  "每套 tier ∈ {免费,标准,尊享}",
  data.suites.every((s) => validTiers.has(s.tier)),
  JSON.stringify(data.suites.filter((s) => !validTiers.has(s.tier)).map((s) => s.id)),
);
check(
  "每套 target ∈ {纪念馆,宗祠}",
  data.suites.every((s) => validTargets.has(s.target)),
  JSON.stringify(data.suites.filter((s) => !validTargets.has(s.target)).map((s) => s.id)),
);
check("SUITE_BENEFIT_TIERS 恰好三层", data.tiers.length === 3, `实际 ${data.tiers.length}`);

// §2 无悬空引用 + 不含 bundle
console.log("\n[§2] 无悬空引用 / 不嵌 bundle");
let dangling = [];
let bundleRefs = [];
for (const s of data.suites) {
  for (const e of s.entries) {
    if (!e.found) dangling.push(`${s.id} -> ${e.ref}`);
    if (e.ref.startsWith("bundle-")) bundleRefs.push(`${s.id} -> ${e.ref}`);
  }
}
check("无悬空引用（全部 found=true）", dangling.length === 0, dangling.join(", "));
check("绝不引用 bundle（无 bundle- 前缀）", bundleRefs.length === 0, bundleRefs.join(", "));
// 反向：不存在的 ref 必须被检测为 found=false
check("反向·检测逻辑对坏 ref 报 found=false", data.reverseBrokenFound === false, `实际 ${data.reverseBrokenFound}`);

// §3 价格现算
console.log("\n[§3] 价格现算（suitePriceFen == 引用项求和，不硬编码）");
let priceMismatch = [];
for (const s of data.suites) {
  const sum = s.entries.reduce((a, e) => a + e.priceFen, 0);
  if (sum !== s.priceFen) priceMismatch.push(`${s.id}: 求和=${sum} 标称=${s.priceFen}`);
}
check("每套总价 == 引用项 priceFen 之和", priceMismatch.length === 0, priceMismatch.join("; "));
check("所有套装有正价格", data.suites.every((s) => s.priceFen > 0), JSON.stringify(data.suites.filter((s) => s.priceFen <= 0).map((s) => s.id)));

// §4 九档
console.log("\n[§4] 九档价格区间");
check("PRICE_BRACKETS 恰好 9 项", data.brackets.length === 9, `实际 ${data.brackets.length}`);
const contiguous = (bs) => {
  for (let i = 0; i < bs.length; i++) {
    if (i === 0 && bs[i].minFen !== 0) return false;
    if (i > 0 && bs[i].minFen !== bs[i - 1].maxFen) return false;
    if (i < bs.length - 1 && bs[i].maxFen === null) return false;
  }
  return true;
};
check("九档连续无重叠、覆盖 0..∞", contiguous(data.brackets), JSON.stringify(data.brackets.map((b) => [b.minFen, b.maxFen])));
const overlap = [{ key: "a", label: "a", minFen: 0, maxFen: 900 }, { key: "b", label: "b", minFen: 500, maxFen: 1900 }];
check("反向·重叠档位被连续性检查器判 false", contiguous(overlap) === false, "");
// 每套都能落到一个档
check("所有套装都能映射到九档之一", data.suites.every((s) => data.brackets.some((b) => b.key === s.bracket)), JSON.stringify(data.suites.filter((s) => !data.brackets.some((b) => b.key === s.bracket)).map((s) => s.id)));

// §5 三权益层
console.log("\n[§5] 三权益层均有套");
for (const t of data.tiers) {
  const n = data.suites.filter((s) => s.tier === t.key).length;
  check(`权益层「${t.label}」至少 1 套`, n >= 1, `实际 ${n}`);
}

// §6 目录 UI（需服务在跑）
console.log("\n[§6] 目录 UI（GET）");
async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: "preview_auth=1" }, redirect: "manual" });
  const body = await r.text();
  return { status: r.status, body };
}
try {
  const idx = await get("/suites");
  check("GET /suites = 200", idx.status === 200, `status=${idx.status}`);
  if (idx.status === 200) {
    const ids = [...idx.body.matchAll(/data-suite-id="([^"]+)"/g)].map((m) => m[1]);
    check("目录页渲染出套装卡片", ids.length >= data.suites.length, `渲染 ${ids.length} / 共 ${data.suites.length}`);
    // 取一个有效 id 测详情页
    const firstId = data.suites[0].id;
    const det = await get(`/suites/${firstId}`);
    check(`GET /suites/${firstId} = 200`, det.status === 200, `status=${det.status}`);
    if (det.status === 200) {
      const items = [...det.body.matchAll(/data-suite-item="([^"]+)"/g)].map((m) => m[1]);
      check("详情页列出所含项", items.length === data.suites[0].entries.length, `列出 ${items.length} / 应 ${data.suites[0].entries.length}`);
      check("详情页含「去购买」深链", det.body.includes("/mall/decor-"), "");
    }
    // 九档筛选收窄：b9 只应出现落在 b9 的套装
    const b9 = await get("/suites?bracket=b9");
    if (b9.status === 200) {
      const b9ids = [...b9.body.matchAll(/data-suite-id="([^"]+)"/g)].map((m) => m[1]);
      const b9brackets = [...b9.body.matchAll(/data-suite-bracket="([^"]+)"/g)].map((m) => m[1]);
      check("?bracket=b9 仅显示 b9 档套装", b9brackets.every((b) => b === "b9"), `出现 ${JSON.stringify([...new Set(b9brackets)])}`);
      const allB9count = data.suites.filter((s) => s.bracket === "b9").length;
      check("?bracket=b9 数量与数据集一致", b9ids.length === allB9count, `页 ${b9ids.length} / 数据 ${allB9count}`);
    }
  }
} catch (e) {
  console.log(`  ⚠️  §6 跳过：服务未启动（${BASE} 不可达）—— 请先 npm run start 后再跑。`);
  console.log(`      ${e.message}`);
}

/*
 * §7 装修案例厅（/gallery/decor）死链检查 —— 2026-10 修复后的防回归
 *
 * 背景（真 bug）：画廊页曾**手写**商品 slug（`decor-clan-${t.id}`），
 * 而 CLAN_TEMPLATES 的 id 本身以 `clan-` 开头 → 生成 `decor-clan-clan-tpl-*`
 * （双 clan-），18 套宗祠主题全部 404；另有 2 套免费档赠品（无商品）也成了死链。
 *
 * 判据（关键：必须从**页面真实渲染的 HTML** 里抓链接，不能自己拼 slug）：
 *   自己拼 slug 去比对数据库 = 验证的是"我的假设"，不是页面行为 ——
 *   改不改页面都会显示同样的结果（假绿/假红都可能）。这是本仓反复踩的坑。
 */
try {
  const gal = await get("/gallery/decor");
  check("GET /gallery/decor = 200", gal.status === 200, `status=${gal.status}`);

  if (gal.status === 200) {
    // 抓页面真实渲染出的 /mall/ 链接（href 出现在 anchor 上）
    const mallHrefs = [...gal.body.matchAll(/href="(\/mall\/[^"]+)"/g)].map((m) => m[1]);
    const uniq = [...new Set(mallHrefs)];
    check("画廊页渲染出可点击商品深链", uniq.length >= 30, `实得 ${uniq.length} 个`);

    // 取数据库在售 slug 集合
    let dbSlugs = new Set();
    try {
      const out = execSync(
        `docker exec -i memorial-pg psql -U memorial -d memorial -t -A -c "SELECT slug FROM \\"Product\\" WHERE status='active';"`,
        { encoding: "utf8" },
      );
      dbSlugs = new Set(out.split("\n").map((s) => s.trim()).filter(Boolean));
    } catch {
      /* 数据库不可用则跳过该项 */
    }
    if (dbSlugs.size > 0) {
      const danglingLinks = uniq.filter((h) => !dbSlugs.has(h.replace(/^\/mall\//, "")));
      check(
        "画廊每个可点击深链都对应在售商品（无死链）",
        danglingLinks.length === 0,
        danglingLinks.join(", "),
      );
      // 反向验证标志：双 clan- 前缀的坏 slug 必须为 0
      const doubleClan = uniq.filter((h) => /decor-clan-clan-/.test(h));
      check("无「decor-clan-clan-」双前缀坏 slug", doubleClan.length === 0, doubleClan.join(", "));
    }

    // 免费档赠品：必须是不可点击卡片（页面出现「建馆赠送/建祠赠送」且无对应 /mall 链接）
    const hasFreeBadge = /建馆赠送|建祠赠送/.test(gal.body);
    check("免费档赠品标注「建馆/建祠赠送」", hasFreeBadge, "");
    const freeTplLinks = uniq.filter((h) => /decor-tpl-niche|decor-clan-tpl-ancestral$/.test(h));
    check("免费档赠品不再链向商城（无死链）", freeTplLinks.length === 0, freeTplLinks.join(", "));
  }
} catch (e) {
  console.log(`  ⚠️  §7 跳过：服务未启动（${BASE} 不可达）—— 请先 npm run start 后再跑。`);
  console.log(`      ${e.message}`);
}

console.log(`\n结果: ${pass}/${pass + fail} 通过`);
if (fail > 0) {
  console.log("失败项：\n - " + fails.join("\n - "));
  process.exit(1);
}
console.log("全部通过 ✅");
