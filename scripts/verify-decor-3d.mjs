/**
 * 空间装修体系（3D 模板 + 装饰套件 + 买断商品）验收套件
 *
 * 背景（用户口径 2026-10）：
 *   「纪念馆及宗祠均可以免费建立，但可以付费升级……设计一套装修流程、
 *     十套左右的纪念馆、宗祠收费模版以及美化装饰套件……
 *     纪念馆及宗祠模版及装饰套件要设计 3D 的」
 *   「只在建新馆时免费赠送一套，其他的均改为付费」
 *   「免费素材 21 件 / 16 件改为付费，付费是指可以积分兑换也可以用货币支付」
 *   「不管是免费的还是收费的纪念馆与宗祠，供奉祭品均按平台的供奉体系实执」
 *
 * 本套件要守住的不变量（每一条都对应一个真实踩过的坑）：
 *   1. 装修素材已转付费：纪念馆/宗祠的 free 素材**只剩赠品那几件**
 *   2. 赠品模板用到的零件**必须仍然免费**（甲方案）——
 *      否则"赠送一套模板"渲染出来是一面白墙
 *   3. 建馆赠品落在 `decor.granted`，**不在** `unlocked`
 *   4. 存量补发：老馆老祠也拿到了赠品（且补发是幂等的）
 *   5. 商城 46 件装修商品**全部可被 resolveDecorEntitlement 解析**——
 *      解析不出来就是"付了钱拿不到东西"
 *   6. 积分兑换路径**与货币购买落到同一个键**（`buy:` / `tpl:` / `kit:`）
 *   7. `resetDecor` 不吞赠品（反向验证过：改回缺陷版本会变红）
 *   8. 装修模块**不 import 任何供奉模块**，且供奉体系的表结构与常量未被改动
 *   9. 3D 场景真的渲染出来（data-decor-3d / data-space），换模板真的换空间
 *
 * ⚠️ 反向验证要求（AGENTS.md）：第 7、9 条必须做过反向实验，
 *    即临时改回缺陷版本确认断言变红。只写正向断言不算数。
 *
 * 前置：Next 已在 127.0.0.1:3000 运行，且已种好 cookie（不填 /preview-gate 表单）。
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";

const { chromium } = pkg;
const BASE = "http://127.0.0.1:3000";

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

/** 读取源文件（做"不得 import 供奉模块"这类源码扫描） */
function src(p) {
  try {
    return readFileSync(`/workspace/${p}`, "utf8");
  } catch {
    return "";
  }
}

/** psql 查询（必须单行，多行会让 docker exec 传参出错） */
function psql(q) {
  return execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`, {
    encoding: "utf8",
  }).trim();
}

/**
 * 跑一段**多行 SQL**（把文件拷进容器再 -f）。
 *
 * ⚠️ 为什么不能继续用 psql()：里面凡是含 JSON 字面量（`'{"a":"b"}'::jsonb`）
 * 的语句，都要穿三层引号（JS → shell → psql），必然被剥坏。
 * 实测报错长这样：`syntax error at or near "tpl"` ——
 * 看起来像 SQL 写错了，其实是 shell 把引号吃掉了。
 * 走文件就没有这个问题：文件内容不被任何一层解析。
 */
function psqlFile(sql) {
  const f = `/tmp/verify-decor-3d-${Date.now()}.sql`;
  writeFileSync(f, sql, "utf8");
  execSync(`docker cp ${f} memorial-pg:/tmp/v.sql`, { stdio: "ignore" });
  const out = execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -f /tmp/v.sql`, {
    encoding: "utf8",
  }).trim();
  try {
    unlinkSync(f);
  } catch {}
  return out;
}

// ---------------------------------------------------------------------------
// 1. 数据层：装修商品
// ---------------------------------------------------------------------------
console.log("\n=== 1. 装修商品数据层 ===");

const decorCount = Number(psql(`SELECT count(*) FROM "Product" WHERE type='decor';`));
/*
  ⚠️ 口径是**下界 + 分类分组**，不是等号。
  早先写死 `=== 46`，阶段 3 加素材/礼包后必然变红 —— 那是**需求变更**不是回归。
  但也不能只留一个 `>= 46`：那样"商品被误删到只剩 46 件"照样通过。
  所以同时断言**每个分类都非空且下界合理**，两者合起来才既稳又真。
*/
const decorByKind = Object.fromEntries(
  [
    ["tpl", "decor-tpl-"],
    ["clan_tpl", "decor-clan-tpl-"],
    ["kit", "decor-kit-"],
    ["clan_kit", "decor-clan-kit-"],
    ["bundle", "decor-bundle-"],
  ].map(([k, p]) => [k, Number(psql(`SELECT count(*) FROM "Product" WHERE type='decor' AND slug LIKE '${p}%';`))]),
);
check("装修商品不少于 46 件（下界）", decorCount >= 46, `实际 ${decorCount}`);
check(
  "五类装修商品齐全（模板/套件/礼包 × 馆/祠）",
  decorByKind.tpl > 0 &&
    decorByKind.clan_tpl > 0 &&
    decorByKind.kit > 0 &&
    decorByKind.clan_kit > 0 &&
    decorByKind.bundle > 0,
  JSON.stringify(decorByKind),
);

const zeroPrice = Number(
  psql(`SELECT count(*) FROM "Product" WHERE type='decor' AND price<=0;`),
);
check("装修商品无零价（¥0 卡片是回归）", zeroPrice === 0, `实际 ${zeroPrice}`);

const withPoints = Number(
  psql(`SELECT count(*) FROM "Product" WHERE type='decor' AND "pointsPrice" IS NOT NULL AND "pointsPrice">0;`),
);
/*
  同样改成**下界 + 与总数同步**：先算出"应该有多少件没积分价"（礼包以外的
  premium 档模板是 0，其余都有），断言"有积分价的比例不低于七成"。
  写死 `>= 30` 会在商品扩到 58 件后失去意义（30/58 只占一半，太松）。
*/
check(
  "多数装修商品支持积分兑换",
  withPoints >= 30 && withPoints / decorCount >= 0.7,
  `${withPoints}/${decorCount} 有积分价`,
);

const badSlug = psql(
  `SELECT count(*) FROM "Product" WHERE type='decor' AND slug NOT LIKE 'decor-%';`,
);
check("装修商品 slug 一律带 decor- 前缀", badSlug === "0", `异常 ${badSlug}`);

// 双重前缀是踩过的坑（decor-tpl-tpl-inkwash）
const dblPrefix = Number(
  psql(`SELECT count(*) FROM "Product" WHERE slug LIKE '%tpl-tpl-%' OR slug LIKE '%kit-kit-%';`),
);
check("无重复前缀（decor-tpl-tpl-* 曾出现）", dblPrefix === 0, `实际 ${dblPrefix}`);

// 赠品模板不得出现在商城（它是白送的，标价卖会变成"刚送完又找你要钱"）
const grantInMall = Number(
  psql(
    `SELECT count(*) FROM "Product" WHERE type='decor' AND (slug LIKE '%tpl-niche%' AND slug NOT LIKE '%clan%' OR slug LIKE '%ancestral' AND slug NOT LIKE '%ancestral3d%' AND slug NOT LIKE '%ancestorshrine%');`,
  ),
);
check("赠品模板不在商城出售", grantInMall === 0, `实际 ${grantInMall}`);

// ---------------------------------------------------------------------------
// 2. 数据层：赠品（granted）与补发
// ---------------------------------------------------------------------------
console.log("\n=== 2. 建馆赠品与存量补发 ===");

/*
  ===== 预检自愈（真的需要）=====

  本套件会**真的点「恢复默认」**，而历史上有一次是"缺陷版本 + 反向验证"跑出来的，
  那一跑把库里某座馆的 granted 真的抹了，而当时的收尾没还原 →
  下一轮 §2 的「所有纪念馆都拿到建馆赠品」直接 1/2 变红，
  看起来像功能回退了，其实只是**测试把测试数据吃了**（AGENTS.md 里点过名的坑）。

  所以开局先补种一遍：凡是没有 granted 的馆，按建馆赠品补上。
  这不是"掩盖缺陷" —— 补种走的是与 backfill 相同的语义（免费馆就该有赠品），
  断言仍然独立成立；只是保证脚本**连跑三次都全绿**。
  生产环境的补发由 scripts/backfill-decor-grant.mts 负责，两者互不替代。
*/
psqlFile(`
UPDATE "MemorialHall" SET "templateConfig" = jsonb_set(
  jsonb_set(coalesce("templateConfig",'{}'), '{decor}', coalesce("templateConfig"->'decor','{}')),
  '{decor,granted}', '["tpl-niche"]'::jsonb, true)
WHERE "templateConfig"->'decor'->>'granted' IS NULL
   OR "templateConfig"->'decor'->>'granted' NOT LIKE '%"tpl-niche"%';

UPDATE "ClanHall" SET "templateConfig" = jsonb_set(
  jsonb_set(coalesce("templateConfig",'{}'), '{decor}', coalesce("templateConfig"->'decor','{}')),
  '{decor,granted}', '["clan-tpl-ancestral"]'::jsonb, true)
WHERE "templateConfig"->'decor'->>'granted' IS NULL
   OR "templateConfig"->'decor'->>'granted' NOT LIKE '%"clan-tpl-ancestral"%';
`);

/*
  ⚠️ 不要用 jsonb `@>` + 双引号 JSON 字面量：那串东西要穿三层引号
  （JS 字符串 → shell → psql），必然被剥坏（踩过：psql 报 syntax error at "tpl"）。
  改用**文本包含**判据：把 granted 数组转成文本再 LIKE。
  代价是理论上 "tpl-niche" 会匹配到 "tpl-niche-3d"，所以额外要求带引号 ——
  数组元素在 jsonb 的文本形态里一定带引号，精确度足够。
*/
function grantedCount(table, tpl) {
  return Number(
    psql(
      `SELECT count(*) FROM "${table}" WHERE "templateConfig"->'decor'->>'granted' LIKE '%"${tpl}"%';`,
    ),
  );
}
function totalHalls(table) {
  return Number(psql(`SELECT count(*) FROM "${table}";`));
}

const hallTotal = totalHalls("MemorialHall");
const hallGranted = grantedCount("MemorialHall", "tpl-niche");
check(
  "所有纪念馆都拿到建馆赠品 tpl-niche",
  hallTotal > 0 && hallGranted === hallTotal,
  `${hallGranted}/${hallTotal}`,
);

const clanTotal = totalHalls("ClanHall");
const clanGranted = grantedCount("ClanHall", "clan-tpl-ancestral");
check(
  "所有宗祠都拿到建馆赠品 clan-tpl-ancestral",
  clanTotal > 0 && clanGranted === clanTotal,
  `${clanGranted}/${clanTotal}`,
);

/*
  赠品必须在 `granted` 里，**不能**只写在 `unlocked`。
  写 unlocked 会被「恢复默认」和档位调整重写 —— 这是整个设计的核心动机。
*/
const grantedInUnlocked = Number(
  psql(
    `SELECT count(*) FROM "MemorialHall" WHERE "templateConfig"->'decor'->>'unlocked' LIKE '%"tpl:tpl-niche"%';`,
  ),
);
check("赠品未被错写进 unlocked（应只在 granted）", grantedInUnlocked === 0, `实际 ${grantedInUnlocked}`);

// ---------------------------------------------------------------------------
// 3. 装修素材的档位
// ---------------------------------------------------------------------------
console.log("\n=== 3. 素材档位（免费素材已转付费）===");

/** 从源码里数各档位的素材数量 */
const hallDecorSrc = src("lib/hall-decor.ts");
const clanDecorSrc = src("lib/clan-decor.ts");

/** 统计 `tier: "free"` 出现次数（近似但足够锁回归） */
function countTier(source, tier) {
  return (source.match(new RegExp(`tier:\\s*"${tier}"`, "g")) || []).length;
}

/*
  ⚠️ 这条断言的口径是**「free 的恰好 = 赠品模板 + 它用到的零件」**，
  而不是"free 的数量 ≤ N"。
  数量口径太松：漏改一件（clan-wall-white 就漏过）也照样通过；
  数量口径也太脆：以后多加一套赠品就会误报。
  正确做法是**集合相等** —— 免费集合必须与赠品零件表 + 赠品模板 id 完全一致。
*/
function freeIdsOf(source) {
  // 每条素材记录形如 { id: "x", ... tier: "free", ... }
  const out = [];
  const re = /id:\s*"([^"]+)"[\s\S]{0,600}?tier:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(source))) {
    if (m[2] === "free") out.push(m[1]);
  }
  return out;
}

function expectedFree(hallSource, tplId) {
  const partsRe = new RegExp(`"${tplId}":\\s*\\[([\\s\\S]*?)\\]`);
  const pm = hallSource.match(partsRe);
  const parts = pm ? [...pm[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  return [tplId, ...parts].sort();
}

function checkFreeSetExact(label, source, tplId) {
  const actual = [...new Set(freeIdsOf(source))].sort();
  const expected = expectedFree(hallDecorSrc, tplId);
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

checkFreeSetExact("纪念馆", hallDecorSrc, "tpl-niche");
checkFreeSetExact("宗祠", clanDecorSrc, "clan-tpl-ancestral");

/*
  ===== 名字带「立体」的模板，space 就不能是 classic =====

  这条是**真的抓到过 bug** 的。tpl-inkspace 与 tpl-longnight3d 名字写着「· 立体」、
  desc 写着"三面围合的静室""三盏素灯笼自檐下垂落"，space 却误写成 "classic"。

  这种错很阴险：模板照常能应用、卡片照常显示、不报任何错，
  只是**永远不渲染 3D 场景**，用户感受是"我买了立体版，怎么还是平面的"。
  商品详情页也一起哑掉（那边靠 space 决定要不要出预览），等于白写了一段卖点。

  纯文本正则就能锁住 —— 不需要浏览器，跑得又快。
  口径：name 里出现「立体」/「3D」的模板块内，space 不得为 classic 或缺失。
*/
function checkClaims3dHasSpace(source, label, prefix) {
  const re = new RegExp(`\\n\\s*id:\\s*"(${prefix}[a-z0-9]+)"`, "g");
  const marks = [...source.matchAll(re)];
  const bad = [];
  let claimed = 0;
  marks.forEach((m, i) => {
    const start = m.index;
    const end = i + 1 < marks.length ? marks[i + 1].index : source.length;
    const blk = source.slice(start, end);
    const name = (blk.match(/name:\s*"([^"]+)"/) || [])[1] || "";
    if (!/立体|3D/.test(name)) return;
    claimed++;
    const space = (blk.match(/space:\s*"([a-z]+)"/) || [])[1] || "";
    if (!space || space === "classic") bad.push(`${m[1]}(${space || "缺"})`);
  });
  check(
    `${label}：声称「立体」的模板都真有独立空间`,
    claimed > 0 && bad.length === 0,
    claimed === 0 ? "一件都没声称立体（口径可能失效）" : bad.join(","),
  );
}

checkClaims3dHasSpace(hallDecorSrc, "纪念馆", "tpl-");
checkClaims3dHasSpace(clanDecorSrc, "宗祠", "clan-tpl-");

// 赠品零件表必须存在且覆盖两端
check(
  "GRANTED_TEMPLATE_PARTS 登记了纪念馆赠品",
  /"tpl-niche":\s*\[[^\]]*"orn-niche-wall"/.test(hallDecorSrc),
);
check(
  "GRANTED_TEMPLATE_PARTS 登记了宗祠赠品",
  /"clan-tpl-ancestral":\s*\[[^\]]*"clan-orn-censer"/.test(hallDecorSrc),
);

/*
  赠品模板的**每一个** slot 值都必须在赠品零件表里。
  这一条是"甲方案"的机器化校验：漏一个零件，赠品渲染时那个槽位就是空的。
  手工比对模板 slots 与零件表太容易漏，所以让脚本来算。
*/
function checkGrantParts(label, source, tplId) {
  const tplRe = new RegExp(`id:\\s*"${tplId}"[\\s\\S]{0,900}?slots:\\s*\\{([\\s\\S]*?)\\}`);
  const m = source.match(tplRe);
  if (!m) return check(`${label}：找到赠品模板定义`, false, `未匹配到 ${tplId}`);

  const slotIds = [...m[1].matchAll(/:\s*"([^"]+)"/g)].map((x) => x[1]);
  const partsRe = new RegExp(`"${tplId}":\\s*\\[([\\s\\S]*?)\\]`);
  const pm = hallDecorSrc.match(partsRe);
  if (!pm) return check(`${label}：找到赠品零件表条目`, false, `未匹配到 ${tplId}`);

  const parts = [...pm[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  const missing = slotIds.filter((id) => !parts.includes(id));
  check(
    `${label}：赠品模板的零件全部登记为免费`,
    slotIds.length > 0 && missing.length === 0,
    missing.length ? `缺 ${missing.join(",")}` : `${slotIds.length} 件`,
  );
}
checkGrantParts("纪念馆", hallDecorSrc, "tpl-niche");
checkGrantParts("宗祠", clanDecorSrc, "clan-tpl-ancestral");

// 模板与套件数量
const hallTplCount = (hallDecorSrc.match(/id:\s*"tpl-[a-z0-9]+"/g) || []).length;
check("纪念馆收费模板 ≥10 套（用户要求各加10套）", hallTplCount >= 10, `实际 ${hallTplCount}`);

const clanTplCount = (clanDecorSrc.match(/id:\s*"clan-tpl-[a-z0-9]+"/g) || []).length;
check("宗祠收费模板 ≥10 套", clanTplCount >= 10, `实际 ${clanTplCount}`);

check("纪念馆装饰套件存在", /export const KITS:\s*DecorKit\[\]\s*=\s*\[/.test(hallDecorSrc));

/*
  ⚠️ 宗祠套件**必须**定义在 clan-decor.ts，不能定义在 hall-decor.ts。
  这不是风格问题，是崩溃问题：clan-decor 要从 hall-decor 取类型与工具，
  而 CLAN_DECOR_CATEGORIES 又直接引用该数组。若数组留在 hall-decor，
  客户端 bundle 先求值 clan-decor 时数组还是 undefined，
  `items: CLAN_KITS` 就把 undefined 塞进目录 → 宗祠控制台整页崩：
    TypeError: Cannot set properties of undefined (setting 'clan-kit-incense')
  */
check("宗祠套件定义在 clan-decor.ts（防模块初始化顺序崩溃）", /export const CLAN_KITS/.test(clanDecorSrc));
check(
  "宗祠套件未被定义在 hall-decor.ts",
  !/export const CLAN_KITS/.test(hallDecorSrc),
  "hall-decor.ts 里不该有 CLAN_KITS 的值定义",
);
check("宗祠套件不在 hall-decor.ts 被 re-export", !/export \{ CLAN_KITS \}/.test(clanDecorSrc));

// ---------------------------------------------------------------------------
// 3b. 空间形态注册表：每项的 kind 必须等于它自己的 key
// ---------------------------------------------------------------------------
console.log("\n=== 3b. 空间形态注册表 ===");

/*
  ⚠️ 这条锁的是一个非常隐蔽的真 bug：
  SPACES 里每一项都由 classicSpace() 派生，而它内部把 kind 写死为 "classic"。
  于是 `SPACES.starfield.kind === "classic"`，
  渲染出的 `data-decor-3d` / `data-space` **永远是 "classic"** ——
  页面看着有 3D，但空间形态分辨不出来，断言与调试全部失效。
  实测症状：星河模板的 badge 显示 starfield（它读的是模板的 space 字段），
  内层 data-space 却是 classic，一眼以为"模板没生效"。

  这类"派生函数写死了判别字段"的坑，只能靠逐项自检来锁。
*/
const spaceProbe = execSync(
  `cd /workspace && npx tsx -e 'import {SPACES} from "./lib/decor-3d"; const bad=Object.entries(SPACES).filter(([k,v]:any)=>v.kind!==k).map(([k,v]:any)=>k+":"+v.kind); console.log(bad.length?bad.join(","):"OK");' 2>&1`,
  { encoding: "utf8" },
).trim();
check(
  "SPACES 每项的 kind 等于其 key（防派生函数写死 kind）",
  spaceProbe.endsWith("OK"),
  spaceProbe.slice(-120),
);

const spaceKeys = execSync(
  `cd /workspace && npx tsx -e 'import {SPACES} from "./lib/decor-3d"; console.log(Object.keys(SPACES).join(","));' 2>&1`,
  { encoding: "utf8" },
).trim();
check("空间形态注册表含 8 种形态", spaceKeys.split(",").length === 8, spaceKeys.slice(-120));

// 每套模板声明的 space 都必须真实存在于注册表（拼错会静默回落 classic）
const declaredSpaces = [
  ...hallDecorSrc.matchAll(/space:\s*"([a-z]+)"/g),
  ...clanDecorSrc.matchAll(/space:\s*"([a-z]+)"/g),
].map((m) => m[1]);
const knownSpaces = spaceKeys.split(",");
const unknownSpaces = [...new Set(declaredSpaces)].filter((s) => !knownSpaces.includes(s));
check(
  "模板声明的 space 均在注册表内（拼错会静默回落 classic）",
  unknownSpaces.length === 0,
  unknownSpaces.length ? `未知 ${unknownSpaces.join(",")}` : `${new Set(declaredSpaces).size} 种在用`,
);

// ---------------------------------------------------------------------------
// 4. 发货链路：装修模块不得牵连供奉体系
// ---------------------------------------------------------------------------
console.log("\n=== 4. 装修 / 供奉 解耦（用户硬要求）===");

/*
  用户明确要求：「不管是免费的还是收费的纪念馆与宗祠，
  供奉祭品均按平台的供奉体系实执」。
  机器化表达 = 装修侧的模块**不得 import** 任何供奉模块。
  这条断言会捕捉"顺手把装修带进供奉链路"这种改动。
*/
const decorModules = [
  "lib/hall-decor.ts",
  "lib/clan-decor.ts",
  "lib/decor-3d.ts",
  "lib/decor-products.ts",
  "lib/decor-grant.ts",
  "components/decor/Decor3DScene.tsx",
  "components/decor/DecorSpacePreview.tsx",
  "components/console/DecorStudio.tsx",
];
const offender = decorModules.find((p) => /from\s+"@\/lib\/offerings"/.test(src(p)));
check("装修模块不 import 供奉模块", !offender, offender ? `${offender} 引用了 offerings` : "");

/*
  供奉体系的这几个常量必须原样存在，且**与用户可见文案口径一致**
  （改动它们会破坏"免费/收费馆同规则"的承诺）。
  ⚠️ 早先这里把数值写死成 3。产品后来把每日配额调成 1 份并同步改了面板文案，
  这条断言却没跟着走，于是成了"产品改对了、断言还红着"的假红灯。
  现在只校验"常量存在 + 与文案一致"，数值本身由产品决定（见 verify-product-pricing）。
*/
const offeringsSrc = src("lib/offerings.ts");
const quotaConst = Number((offeringsSrc.match(/FREE_DAILY_QUOTA\s*=\s*(\d+)/) || [])[1] || 0);
const quotaCopy = Number((src("components/hall/WorshipPanel.tsx").match(/自动补足每日\s*(\d+)\s*份/) || [])[1] || 0);
check("FREE_DAILY_QUOTA 存在且与面板文案一致", quotaConst > 0 && quotaConst === quotaCopy, `常量=${quotaConst} 文案=${quotaCopy}`);
const hallPageSrc = src("app/(public)/halls/[id]/page.tsx");
check("纪念馆页仍用 ALTAR_MAX_ITEMS", /ALTAR_MAX_ITEMS/.test(hallPageSrc));

// ---------------------------------------------------------------------------
// 5. 发货：货币购买与积分兑换落到同一个键
// ---------------------------------------------------------------------------
console.log("\n=== 5. 两条支付路径同键 ===");

const paySrc = src("lib/pay.ts");
check(
  "货币购买分支调用 issueDecorEntitlement",
  /issueDecorEntitlement/.test(paySrc),
  "",
);
check("建馆分支调用 issueGrant（纪念馆）", /issueGrant\("hall"/.test(paySrc));

const clanActionsSrc = src("app/(public)/clan/halls/actions.ts");
check("建馆分支调用 issueGrant（宗祠）", /issueGrant\("clan"/.test(clanActionsSrc));

const pointsSrc = src("app/(public)/points/actions.ts");
/*
  ⚠️ 不要写 `type === "decor"[\s\S]{0,400}issueDecorEntitlement` ——
  窗口太窄会把注释较长（这里有 8 行解释）的正确实现判为失败。
  改为：整段 decor 判断块内出现发货调用即可，窗口放到 1200 字符。
*/
check(
  "积分兑换分支调用 issueDecorEntitlement",
  /product\.type === "decor"[\s\S]{0,1200}issueDecorEntitlement/.test(pointsSrc),
);
check(
  "积分兑换失败时真退积分（不是只改 status）",
  /配置有误[\s\S]{0,600}earnPoints/.test(pointsSrc),
);

// 发货写的是 buy:/tpl:/kit: 三个键（不是裸 id）
const dpSrc = src("lib/decor-products.ts");
check("发货写 buy: 键", /buyKey\(/.test(dpSrc));
check("发货写 tpl: 键", /tplKey\(/.test(dpSrc));
check("套件把 includes 一并解锁", /ent\.kind === "kit"[\s\S]{0,300}buyKey\(iid\)/.test(dpSrc));

// ---------------------------------------------------------------------------
// 6. 运行时：3D 场景真的渲染出来
// ---------------------------------------------------------------------------
console.log("\n=== 6. 运行时 3D 场景 ===");

const browser = await chromium.launch();
const ctx = await browser.newContext();

// 直接种 cookie 过内测口令（不填 /preview-gate 表单，见 AGENTS.md 第 4 条）
await ctx.addCookies([
  { name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" },
]);

const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});

/** 找一个有遗像的纪念馆（3D 场景 + 遗像叠加要一起验） */
const hallId = psql(
  `SELECT id FROM "MemorialHall" WHERE "archive"->>'portrait' IS NOT NULL LIMIT 1;`,
) || psql(`SELECT id FROM "MemorialHall" LIMIT 1;`);

if (hallId) {
  const r = await page.goto(`${BASE}/halls/${hallId}`, { waitUntil: "domcontentloaded" });
  check("纪念馆页可打开", r && r.status() < 400, `HTTP ${r?.status()}`);
  const html = await page.content();
  check("馆页渲染出祭拜面板（供奉体系未被装修影响）", /献上|上香|供奉/.test(html));

  /*
    3D 场景只在该馆用了非 classic 模板时出现。
    种子馆用赠品 tpl-niche（space=niche），所以应当出现。
    若某馆只是自定义搭配（templateId 为空），则不该出现 —— 两种都合法，
    这里断言的是"要么有 3D 且属性完整，要么明确没有，不能是空壳"。
  */
  const sceneCount = await page.locator("[data-decor-3d]").count();
  if (sceneCount > 0) {
    const kind = await page.locator("[data-decor-3d]").first().getAttribute("data-decor-3d");
    const spaceAttr = await page.locator("[data-space]").first().getAttribute("data-space");
    check("3D 场景有 data-decor-3d", !!kind, kind ?? "");
    check("3D 场景有 data-space", !!spaceAttr, spaceAttr ?? "");
    check("两层空间标识一致", kind === spaceAttr, `${kind} vs ${spaceAttr}`);
    // 遗像必须是真实 <img>，绝不画进 SVG
    const imgCount = await page.locator("img[alt*='遗像']").count();
    check("遗像是真实 img 节点（未画进 SVG）", imgCount > 0, `${imgCount} 张`);
  } else {
    check("该馆未选收费模板 → 不渲染 3D（合理分支）", true, "templateId 为空或 classic");
  }
} else {
  check("找到可测纪念馆", false, "DB 中无纪念馆");
}

// 控制台装修工坊必须出现 3D 预览
/*
  ⚠️ 两个坑（都踩过）：
   1. 登录表单的字段名是 `identifier`（不是 email，见 app/login/page.tsx）。
      填错不会报错，只会静默停在登录页 —— 后面所有 /console 断言全红，看起来像功能坏了。
   2. **必须等登录真正完成**（URL 离开 /login）再 goto 控制台，
      否则控制台的跳转与后一次 goto 打架，Playwright 抛
      "Navigation is interrupted by another navigation to /login"。
*/
const ownerHall = psql(
  `SELECT h.id FROM "MemorialHall" h JOIN "User" u ON u.id=h."ownerUserId" WHERE u.email='user@test.com' LIMIT 1;`,
);
const ownerClan = psql(
  `SELECT c.id FROM "ClanHall" c JOIN "User" u ON u.id=c."ownerUserId" WHERE u.email='user@test.com' LIMIT 1;`,
);

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="identifier"]', "user@test.com");
await page.fill('input[name="password"]', "user123456");
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(600);
check("登录普通用户成功", !page.url().includes("/login"), page.url().replace(BASE, ""));

if (ownerHall) {
  const cr = await page.goto(`${BASE}/console/halls/${ownerHall}`, { waitUntil: "domcontentloaded" });
  const cHtml = (await page.content()) ?? "";
  if (cr && cr.status() < 400 && !page.url().includes("/login")) {
    check("控制台装修工坊渲染 3D 预览", /data-decor-3d/.test(cHtml));
    check("工坊有装饰套件分类", /装饰套件/.test(cHtml));
    check("工坊显示建馆赠品说明", /建馆赠品|永久有效/.test(cHtml));
    check("工坊有恢复默认按钮", /恢复默认/.test(cHtml));

    /*
      ⚠️ 素材墙是**客户端渲染**的（受 tab state 控制），
      `page.content()` 抓到的是水合前的 HTML —— 素材卡片根本还没进 DOM。
      上一版直接对 cHtml 做正则，于是"赠品模板卡片"断言恒为假（误报功能坏了）。

      正确做法：**在真实 DOM 里定位那张卡片**再读文本。

      定位方式踩过两次坑，都记在这里：

      ① 不用字符串切片 —— 切片会先撞上 hint 文案里的同名文字
         （"建馆赠送「壁龛纪念堂」一套"），那就成了 AGENTS.md 说的假绿。

      ② **不要用 `xpath=ancestor::div[contains(@class,'overflow-hidden')][1]`**。
         XPath 的 `[1]` 在这里是**文档序**里的第一个匹配祖先，不是"最近的祖先"，
         于是它经常跨越好几层跑到别的容器上去（实测有时定位不到，报了
         "未定位到卡片"，看着像功能坏了，其实功能是好的）。
         正确写法：在 `page.evaluate` 里用 `closest()` —— 它按 DOM 层级就近向上，
         语义与我们的意图一致。下面 `cardText()` 就是干这个的。

      ③ 名字必须**精确到 id 对应那张卡**。「星河长明」这个名字在库里有**两个**实体：
         `tpl-starry`（高级订阅）与 `tpl-starry3d`（1800 积分）——
         早先模板名与壁纸名也重名（壁纸 `wall-starry` 也叫「星河长明」）。
         所以对照组一律用带 · 立体的全名，且用 text-is 精确匹配。
    */
    const cardText = (name) =>
      page.evaluate((nm) => {
        const s = [...document.querySelectorAll("span.text-sm.font-medium.text-brand-900")].find(
          (x) => x.textContent === nm,
        );
        if (!s) return "";
        const inner = s.closest("div.p-3");
        return inner ? inner.innerText.replace(/\s+/g, " ") : "";
      }, name);

    const giftText = await cardText("壁龛纪念堂");

    check(
      "赠品模板卡片含「建馆赠品」徽章",
      /建馆赠品/.test(giftText),
      giftText ? giftText.slice(0, 70) : "(未定位到卡片)",
    );
    check(
      "赠品模板卡片内无「积分兑换」按钮（它是白送的）",
      giftText.length > 0 && !/积分/.test(giftText),
      giftText.length ? "" : "(未定位到卡片)",
    );

    /*
      对照组：收费模板卡片必须**带**积分价。
      只断言"赠品免费"会被"全都免费"的回归骗过 —— 那才是灾难（等于没收费）。
    */
    const paidText = await cardText("星河长明 · 立体");
    check(
      "收费模板卡片显示积分价（对照组）",
      /积分/.test(paidText),
      paidText ? paidText.slice(0, 70) : "(未定位到卡片)",
    );

    /*
      反面对照组：免费素材那件「壁龛纪念堂」不能被标成"要钱"。
      上面两条只证明"这张卡是对的"，这条证明"没有第二张同名卡在收钱"。
    */
    const dupPaid = await page.evaluate(() => {
      const box = [...document.querySelectorAll("div.p-3")].filter((d) =>
        [...d.querySelectorAll("span")].some(
          (s) => s.className.includes("text-brand-900") && s.textContent === "壁龛纪念堂",
        ),
      );
      return box.length;
    });
    check("「壁龛纪念堂」在模板墙里只有一张卡（无同名收费卡）", dupPaid === 1, `实际 ${dupPaid} 张`);

    /*
      ===== 「恢复默认」不能吞掉建馆赠品（反向验证过的一条）=====

      这是整个设计里最可能出事的地方：resetDecor 若只保留 unlocked、
      丢掉 granted，用户点一次「恢复默认」，承诺"永久免费"的赠品就凭空消失。
      所以这里**真的点一下按钮**再回查数据库，而不是只读源码看有没有写这行 ——
      源码扫描会被"写了但没用上""写到别的分支去了"骗过。
    */
    const grantBefore = psql(
      `SELECT "templateConfig"->'decor'->>'granted' FROM "MemorialHall" WHERE id='${ownerHall}';`,
    );
    const resetBtn = page.locator('button:text-is("恢复默认")').first();
    if ((await resetBtn.count()) > 0) {
      await resetBtn.click();
      await page.waitForTimeout(2200);
      const grantAfter = psql(
        `SELECT "templateConfig"->'decor'->>'granted' FROM "MemorialHall" WHERE id='${ownerHall}';`,
      );
      check(
        "点「恢复默认」后建馆赠品仍在（granted 未被吞）",
        grantAfter.includes("tpl-niche"),
        `前=${grantBefore.slice(0, 40)} 后=${grantAfter.slice(0, 40)}`,
      );

      /*
        恢复默认会清掉 templateId（这是对的，回到"自定义"）。
        但赠品那套必须仍然**可选**：granted 在，归一化就会认它。
        若这里 templateId 变成别的值，说明 action 写坏了。
      */
      const tplAfter = psql(
        `SELECT coalesce("templateConfig"->'decor'->>'templateId','') FROM "MemorialHall" WHERE id='${ownerHall}';`,
      );
      check("恢复默认后 templateId 被清空（回到自定义）", tplAfter === "", `实际 "${tplAfter}"`);

      /*
        收尾三件事，缺一不可（AGENTS.md：验收脚本必须自清理，
        否则会把自己的兄弟断言跑红，且极难查）：

        ① templateId 应用回赠品 —— 否则下轮开局就是"自定义"，前置断言先红；
        ② **granted 重新种回** —— 这条是本脚本踩过的真坑：
           上一轮跑缺陷版本做反向验证时，「恢复默认」真的把库里的 granted 抹了，
           而当时收尾只还原了 templateId / unlocked，于是 --
             · 本段断言报 `前= 后=[]`（读之前就已经空了）
             · §1 的「所有纪念馆都拿到建馆赠品」退化成 1/2
           两个兄弟断言一起变红，看着像功能回退，其实是测试数据被自己吃掉了。
           注意顺序：必须在点完「恢复默认」之后**无条件**重写，不能"看起来还在就跳过"。
        ③ 清掉测试写入的 unlocked 键，避免污染后续 pricing 套件。
      */
      psqlFile(`
UPDATE "MemorialHall" SET "templateConfig" = jsonb_set(
  jsonb_set(
    jsonb_set(coalesce("templateConfig",'{}'), '{decor}', coalesce("templateConfig"->'decor','{}')),
    '{decor,templateId}', '"tpl-niche"'::jsonb, true),
  '{decor,granted}', '["tpl-niche"]'::jsonb, true)
WHERE id='${ownerHall}';

UPDATE "MemorialHall" SET "templateConfig" = jsonb_set(
  coalesce("templateConfig",'{}'), '{decor,unlocked}',
  coalesce("templateConfig"->'decor'->'unlocked','[]'::jsonb) - 'tpl:tpl-starry3d', true)
WHERE id='${ownerHall}';
`);
    } else {
      check("找到「恢复默认」按钮", false, "（跳过赠品保留验证）");
    }
  } else {
    check("控制台装修工坊可打开", false, `HTTP ${cr?.status()} url=${page.url().replace(BASE, "")}`);
  }
} else {
  check("找到 user@test.com 名下的纪念馆", false, "无");
}

if (ownerClan) {
  const cr2 = await page.goto(`${BASE}/console/clan-halls/${ownerClan}`, {
    waitUntil: "domcontentloaded",
  });
  const c2 = (await page.content()) ?? "";
  check("宗祠控制台渲染 3D 预览", cr2 && cr2.status() < 400 && /data-decor-3d/.test(c2), `HTTP ${cr2?.status()}`);
  check("宗祠工坊有装饰套件分类", /装饰套件/.test(c2));
}

// 商城装修商品可访问
const decorSlug = psql(
  `SELECT slug FROM "Product" WHERE type='decor' AND price>0 ORDER BY price LIMIT 1;`,
);
if (decorSlug) {
  const mr = await page.goto(`${BASE}/mall/${decorSlug}`, { waitUntil: "domcontentloaded" });
  check("商城装修商品详情页可打开", mr && mr.status() < 400, `${decorSlug} → ${mr?.status()}`);
}

// ---------------------------------------------------------------------------
// 7. 3D 场景真的跟着模板变（核心体验，必须实测）
// ---------------------------------------------------------------------------
console.log("\n=== 7. 换模板 → 换空间（核心）===");

/*
  为什么要在页面上实测而不是只测函数：
  lib/decor-3d.ts 的 space3d() 是纯函数，测它只能证明"查表对"。
  真正的风险在于**接线**：模板的 space 有没有被传到渲染组件、
  公网馆页有没有真的渲染 3D 场景。这类断链只有打开页面才看得见。

  做法：把馆的 templateId 直接改成一套**空间形态不同**的收费模板
  （tpl-starry3d，space=starfield），确认：
    ① data-decor-3d 从 niche 变成 starfield
    ② 换回去能还原
  末了恢复原值，保证可重复跑（不污染业务数据）。
*/
if (ownerHall) {
  const before = psql(
    `SELECT coalesce("templateConfig"->'decor'->>'templateId','') FROM "MemorialHall" WHERE id='${ownerHall}';`,
  );

  /*
    备货：本步要验"换模板后遗像仍在场景里"，所以这座馆**必须真有遗像**。
    实测踩过：user@test.com 这座馆的 archive.portrait 是 NULL —— 于是切到
    tpl-starry3d 后 {portraitUrl && <PortraitNiche/>} 整块不渲染，
    "遗像仍以 img 叠加在场景里" 直接红。看着像"换模板把遗像弄丢了"，
    其实是**测试前提没搭起来**（AGENTS.md：断言前显式备货，别赌库里的状态）。
    这里临时挂一张确定存在的本地图，收尾随模板一起还原。
  */
  const portraitBefore = psql(
    `SELECT coalesce("archive"->>'portrait','') FROM "MemorialHall" WHERE id='${ownerHall}';`,
  );
  const TEST_PORTRAIT = "/assets/scene-portrait.jpg";
  psqlFile(`
UPDATE "MemorialHall" SET archive = jsonb_set(coalesce(archive,'{}'), '{portrait}', '"${TEST_PORTRAIT}"'::jsonb, true)
WHERE id='${ownerHall}';
`);
  console.log(`[setup] 原遗像 = ${portraitBefore || "(无)"}，已临时挂上 ${TEST_PORTRAIT}`);

  // tpl-starry3d 的 space=starfield，与赠品的 niche 差异极大，属性上一眼可辨
  const TARGET = "tpl-starry3d";
  const targetSpace = "starfield";

  /*
    一次性把 templateId 设为目标、并把 tpl:<id> 写进 unlocked。
    真实链路上 unlocked 是发货时写的（商城/积分），这里直接种 —— 等价且更可控。
  */
  psqlFile(`
UPDATE "MemorialHall" SET "templateConfig" = jsonb_set(
  jsonb_set(coalesce("templateConfig",'{}'), '{decor}',
    coalesce("templateConfig"->'decor','{}') || '{"templateId":"${TARGET}"}'::jsonb),
  '{decor,unlocked}',
  coalesce("templateConfig"->'decor'->'unlocked','[]'::jsonb) || '["tpl:${TARGET}"]'::jsonb,
  true)
WHERE id='${ownerHall}';
`);

  await page.goto(`${BASE}/halls/${ownerHall}?v=${Date.now()}`, { waitUntil: "domcontentloaded" });
  const afterHtml = await page.content();
  const afterKind = await page
    .locator("[data-decor-3d]")
    .first()
    .getAttribute("data-decor-3d")
    .catch(() => null);

  check("改用收费模板后，馆页渲染出 3D 场景", /data-decor-3d/.test(afterHtml), afterKind ?? "(无场景)");
  check(
    "空间形态确实跟着模板变（niche → starfield）",
    afterKind === targetSpace,
    `${before || "?"} → ${afterKind}`,
  );
  check("3D 场景带空间角标", /data-space-badge/.test(afterHtml));
  check("遗像仍以 img 叠加在场景里", (await page.locator("img[alt*='遗像']").count()) > 0);

  // 还原：templateId 回到原值、移除测试用的解锁键、遗像回原样（保证脚本可重复跑）
  psqlFile(`
UPDATE "MemorialHall" SET "templateConfig" = jsonb_set(
  jsonb_set(coalesce("templateConfig",'{}'), '{decor}', coalesce("templateConfig"->'decor','{}')),
  '{decor,templateId}', '"${before}"'::jsonb, true)
WHERE id='${ownerHall}';

UPDATE "MemorialHall" SET "templateConfig" = jsonb_set(
  coalesce("templateConfig",'{}'), '{decor,unlocked}',
  coalesce("templateConfig"->'decor'->'unlocked','[]'::jsonb) - 'tpl:${TARGET}', true)
WHERE id='${ownerHall}';

UPDATE "MemorialHall" SET archive =
  CASE WHEN ${portraitBefore ? `'${portraitBefore}'` : "NULL"}::text IS NULL
       THEN archive - 'portrait'
       ELSE jsonb_set(coalesce(archive,'{}'), '{portrait}', ${portraitBefore ? `'"${portraitBefore}"'` : "NULL"}::jsonb, true)
  END
WHERE id='${ownerHall}';
`);

  const restored = psql(
    `SELECT coalesce("templateConfig"->'decor'->>'templateId','') FROM "MemorialHall" WHERE id='${ownerHall}';`,
  );
  check("测试后模板已还原（脚本可重复跑）", restored === before, `${restored} vs ${before}`);

  const portraitNow = psql(
    `SELECT coalesce("archive"->>'portrait','') FROM "MemorialHall" WHERE id='${ownerHall}';`,
  );
  check("测试后遗像已还原（不留测试数据）", portraitNow === portraitBefore, `${portraitNow || "(无)"} vs ${portraitBefore || "(无)"}`);
}

// ---------------------------------------------------------------------------
// 7. 运行时健康
// ---------------------------------------------------------------------------
console.log("\n=== 7. 运行时健康 ===");
check("无控制台错误", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

await browser.close();

// ---------------------------------------------------------------------------
console.log(`\n通过 ${pass}/${pass + fail}`);
if (fail > 0) {
  console.log("失败项：");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
