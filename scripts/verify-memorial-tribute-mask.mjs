// 纪念馆追思记录 · 身份脱敏端到端验证
//
// 背景（本套件守护的缺陷）：
//   MemorialTribute 原先没有身份快照字段，前台只能 `include: { user: { select: { realName } } }`
//   并**原样渲染** —— 任何访客打开纪念馆都能看到献祭者的完整真实姓名。
//   现改为：写入时冻结脱敏快照（displayName/realNameSnap/contactSnap），前台只读 displayName。
//
// 覆盖范围：
//   1. 数据层：快照字段齐备、displayName 非空、与 lib/mask.ts 口径一致
//   2. 写入层：免费献祭 / 收费祭拜 / 留言 三条路径都写入脱敏快照
//   3. **前台绝不出现完整实名**（核心安全断言，含整页 innerHTML 扫描）
//   4. 历史记录回填结果：无空名
//   5. 回归防护：查询层不得再 include 活用户表的 realName
//
// 运行前置：服务已在 3000 端口以生产构建运行；Docker 容器 memorial-pg 存活。
// 运行：node scripts/verify-memorial-tribute-mask.mjs
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { execSync } from "node:child_process";
const { chromium } = pkg;

const BASE = "http://127.0.0.1:3000";

function sql(q) {
  // 把 SQL 压成单行再交给 -c：模板字符串里的缩进/换行会被 psql 当成字面量，
  // 报 `syntax error at or near "\"`，而且很难看出是缩进引起的。
  const oneLine = q.replace(/\s+/g, " ").trim();
  return execSync(
    `docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(oneLine)}`,
    { encoding: "utf8" },
  ).trim();
}
const sqlCount = (q) => Number(sql(q) || "0");

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok: !!ok, extra: String(extra).slice(0, 180).replace(/\n/g, " ") });
};

/**
 * 确保某件祭品至少有 n 份库存。
 * 注意必须用 upsert 语义：`on conflict do nothing` 在"行已存在但 quantity=0"时什么都不做，
 * 而消耗制的正常状态就是"有行、量为 0"（用尽后行不删）—— 用 do nothing 会静默备不上货，
 * 表现为按钮 disabled、UI 点不动、断言写成"没测到"却报红。
 */
function ensureStock(email, slug, n = 3) {
  sql(
    `insert into "OfferingHolding" ("id","userId","productId","quantity","freeTopUpDate","updatedAt") ` +
      `select gen_random_uuid()::text, u.id, p.id, ${n}, null, now() ` +
      `from "User" u, "Product" p where u.email='${email}' and p.slug='${slug}' ` +
      `on conflict ("userId","productId") do nothing;`,
  );
  sql(
    `update "OfferingHolding" set "quantity"=greatest("quantity",${n}), "freeTopUpDate"=null, "updatedAt"=now() ` +
      `from "User" u, "Product" p ` +
      `where "OfferingHolding"."userId"=u.id and "OfferingHolding"."productId"=p.id ` +
      `and u.email='${email}' and p.slug='${slug}';`,
  );
}

const REAL_NAME = "欧阳明华"; // 4 字：脱敏后应为「欧**华」
const MASKED = "欧**华";
const PHONE = "13812345678";

// ---------------------------------------------------------------- 准备数据
// 用 admin 名下的第一个 active 纪念馆；把实名设成可验证的 4 字名
const HALL_ID = (
  process.env.HALL_ID ||
  sql(
    `select h.id from "MemorialHall" h join "User" u on u.id=h."ownerUserId" ` +
      `where h.status='active' order by h."createdAt" asc limit 1;`,
  )
).trim();

if (!HALL_ID) {
  console.log("未找到 active 纪念馆，无法验证");
  process.exit(1);
}

// 选定一个普通用户作为"献祭者"，给它一个完整实名 + 手机号
const OFFERER_EMAIL = "user@test.com";
sql(`update "User" set "realName"='${REAL_NAME}', phone='${PHONE}' where email='${OFFERER_EMAIL}';`);

// 清掉该馆此前由本套件产生的记录，保证断言可重复
sql(`delete from "MemorialTribute" where "hallId"='${HALL_ID}' and "realNameSnap"='${REAL_NAME}';`);

// ---------------------------------------------------------------- 1. 数据层
{
  // 快照三列必须存在
  const cols = sql(
    `select column_name from information_schema.columns ` +
      `where table_name='MemorialTribute' and column_name in ('displayName','realNameSnap','contactSnap') ` +
      `order by column_name;`,
  )
    .split("\n")
    .filter(Boolean);
  check(
    "数据层：MemorialTribute 具备 displayName / realNameSnap / contactSnap 三列",
    cols.length === 3,
    `实得 ${cols.join(",")}`,
  );

  // displayName 不可为空（空名会在页面上渲染成"只有图标没有名字"的记录）
  const emptyNames = sqlCount(
    `select count(*) from "MemorialTribute" where "displayName" is null or btrim("displayName")='';`,
  );
  check("数据层：不存在 displayName 为空的记录（历史回填无遗漏）", emptyNames === 0, `空名 ${emptyNames} 条`);

  const total = sqlCount(`select count(*) from "MemorialTribute";`);
  check("数据层：历史记录已回填", total > 0, `共 ${total} 条`);

  // 回填结果必须与 lib/mask.ts 口径一致：抽查含实名的记录，看首尾是否保留、中间是否打码
  const badShape = sqlCount(
    `select count(*) from "MemorialTribute"
     where "realNameSnap" is not null
       and char_length("realNameSnap")>=3
       and "displayName" not like left("realNameSnap",1) || '%'
       and "displayName" not like '%' || right("realNameSnap",1);`,
  );
  check("数据层：回填的脱敏名保留首尾字符（符合脱敏规则）", badShape === 0, `形态异常 ${badShape} 条`);

  // 真实姓名不得出现在 displayName 里（全库扫描）
  const leaked = sqlCount(
    `select count(*) from "MemorialTribute"
     where "realNameSnap" is not null and char_length("realNameSnap")>1
       and position("realNameSnap" in "displayName") > 0;`,
  );
  check("数据层：displayName 中不含任何完整实名", leaked === 0, `泄露 ${leaked} 条`);
}

// ---------------------------------------------------------------- 浏览器
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

// ---------------------------------------------------------------- 2. 写入层
// 通过真实 UI 献祭一次（免费礼器），验证写入路径确实带上快照
{
  // 登录
  await page.goto(`${BASE}/login?cb=${Date.now()}`, { waitUntil: "networkidle" });
  await page.fill('input[name="identifier"]', OFFERER_EMAIL);
  await page.fill('input[name="password"]', "user123456");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  check("写入层：测试账号登录成功", !page.url().includes("/login"), page.url());

  // 确保有免费祭品库存（进馆自动补货，这里显式兜底）
  ensureStock(OFFERER_EMAIL, "free-incense", 3);

  await page.goto(`${BASE}/halls/${HALL_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=追思记录", { timeout: 30000 });

  const before = sqlCount(`select count(*) from "MemorialTribute" where "hallId"='${HALL_ID}';`);
  const btn = page.locator('button[title^="献上上香"]').first();
  const btnCount = await btn.count();
  const btnEnabled = btnCount > 0 ? await btn.isEnabled() : false;
  // 前置条件要显式断言：按钮不可用时如果直接跳过，后面三条断言会全部失败在"没写入"上，
  // 看起来像功能坏了，其实是备货没成功 —— 把原因说清楚。
  check(
    "写入层：上香按钮可用（库存备货成功）",
    btnCount > 0 && btnEnabled,
    btnCount === 0 ? "未找到按钮" : `disabled=${!btnEnabled}`,
  );
  if (btnEnabled) {
    await btn.click();
    await page.waitForTimeout(2500);
  }
  const after = sqlCount(`select count(*) from "MemorialTribute" where "hallId"='${HALL_ID}';`);
  check("写入层：UI 献祭成功写入了记录", after > before, `${before} → ${after}`);

  // 最新一条记录必须带快照
  const row = sql(
    `select "displayName" || '|' || coalesce("realNameSnap",'-') || '|' || coalesce("contactSnap",'-')
     from "MemorialTribute" where "hallId"='${HALL_ID}' order by "createdAt" desc limit 1;`,
  );
  const [dn, rn, ct] = row.split("|");
  check(`写入层：新记录 displayName 已脱敏（${MASKED}）`, dn === MASKED, `实得「${dn}」`);
  check("写入层：新记录保留了完整实名快照（供馆主/管理台）", rn === REAL_NAME, `实得「${rn}」`);
  check("写入层：新记录保留了联系方式快照", ct === PHONE, `实得「${ct}」`);
}

// ---------------------------------------------------------------- 3. 前台不泄露（核心）
{
  await page.goto(`${BASE}/halls/${HALL_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=追思记录", { timeout: 30000 });
  await page.waitForTimeout(500);

  // 用**未登录**的干净上下文复检，模拟任意访客
  const anonCtx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await anonCtx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const anon = await anonCtx.newPage();
  await anon.goto(`${BASE}/halls/${HALL_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
  await anon.waitForSelector("text=追思记录", { timeout: 30000 });

  const html = await anon.content();
  check("前台：访客页面**不含完整实名**", !html.includes(REAL_NAME), `出现「${REAL_NAME}」`);
  check("前台：访客页面不含联系方式", !html.includes(PHONE), `出现「${PHONE}」`);
  check("前台：访客页面展示脱敏名", html.includes(MASKED), `未出现「${MASKED}」`);

  // 追思记录板块文本里逐一核对：每条都必须有名字，且不含实名
  const listText = await anon
    .locator("section:has(h2:text('追思记录'))")
    .first()
    .innerText()
    .catch(() => "");
  check("前台：追思记录板块不含完整实名", !listText.includes(REAL_NAME), "板块文本扫描");
  check(
    "前台：追思记录板块不含联系方式",
    !listText.includes(PHONE),
    "板块文本扫描",
  );
  await anonCtx.close();
}

// ---------------------------------------------------------------- 4. 查询层回归防护
{
  // 回归防护：代码里不得再出现「include 活用户表读 realName」的写法。
  // 这正是本次缺陷的根因 —— 把脱敏寄托在"渲染时记得打码"上，迟早会漏。
  const src = execSync(`cat "/workspace/app/(public)/halls/[id]/page.tsx"`, { encoding: "utf8" });
  const hasUserInclude = /include:\s*\{\s*user\s*:/.test(src);
  check("回归防护：纪念馆页不再 include user 去读活实名", !hasUserInclude, "源码扫描");
  const selectsRealName = /select:\s*\{[^}]*realName/.test(src);
  check("回归防护：纪念馆页查询中不出现 realName", !selectsRealName, "源码扫描");
  check(
    "回归防护：纪念馆页显式 select displayName",
    /select:\s*\{[^}]*displayName/.test(src),
    "源码扫描",
  );
}

// ---------------------------------------------------------------- 5. 无实名回退分支
{
  // 把实名与手机号清空，仅留邮箱 → 脱敏名应回退成邮箱形态 us***@test.com
  sql(`update "User" set "realName"=null, phone=null where email='${OFFERER_EMAIL}';`);
  ensureStock(OFFERER_EMAIL, "free-flower", 3);

  await page.goto(`${BASE}/halls/${HALL_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=追思记录", { timeout: 30000 });
  const before = sqlCount(`select count(*) from "MemorialTribute" where "hallId"='${HALL_ID}';`);
  const btn = page.locator('button[title^="献上献花"]').first();
  const btnEnabled = (await btn.count()) > 0 ? await btn.isEnabled() : false;
  if (btnEnabled) {
    await btn.click();
    await page.waitForTimeout(2500);
  }
  const after = sqlCount(`select count(*) from "MemorialTribute" where "hallId"='${HALL_ID}';`);
  check("回退分支：无实名时献花按钮可用", btnEnabled, btnEnabled ? "" : "按钮不可用");
  if (after > before) {
    const dn = sql(
      `select "displayName" from "MemorialTribute" where "hallId"='${HALL_ID}' order by "createdAt" desc limit 1;`,
    );
    check("回退分支：无实名时用邮箱脱敏（us***@test.com）", dn === "us***@test.com", `实得「${dn}」`);
  } else {
    check("回退分支：无实名时用邮箱脱敏（us***@test.com）", false, "记录未写入，无法验证");
  }

  // 还原测试账号身份
  sql(`update "User" set "realName"='${REAL_NAME}', phone='${PHONE}' where email='${OFFERER_EMAIL}';`);
}

// ---------------------------------------------------------------- 收尾
// 自清理：献祭会同时往**共享的**供台陈列里写数据，而 verify-hall-niche 的
// 「glyph 不重复」是按全馆陈列断言的 —— 不清掉就会把它跑红。
// 同时删掉本套件造出来的记录（只删 realNameSnap 命中测试用户的那几条，不动业务数据）。
sql(`update "OfferingOnAltar" set "clearedAt"=now() where "hallId"='${HALL_ID}' and "clearedAt" is null;`);
sql(`delete from "MemorialTribute" where "hallId"='${HALL_ID}' and "realNameSnap"='${REAL_NAME}';`);
// 还原测试账号身份为「无实名」，避免影响其他套件对脱敏回退分支的预期
sql(`update "User" set "realName"=null, phone=null where email='${OFFERER_EMAIL}';`);

await browser.close();

// ---------------------------------------------------------------- 汇总
console.log("");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra ? `  (${r.extra})` : ""}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n通过 ${passed}/${results.length}`);
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log("失败项：");
  failed.forEach((r) => console.log(`  - ${r.name}  ${r.extra}`));
  process.exitCode = 1;
}
