/**
 * 宗族活动发布（双入口 + 先审后显）验收
 *
 * 覆盖：
 *  ① 祠主在宗祠控制台发布本族活动 → 写入 DB 且 reviewStatus=pending
 *  ② 【反向验证】未过审活动不出现在公页「宗族活动」
 *  ③ 管理员在 /admin/review 通过 → reviewStatus=approved → 公页出现
 *  ④ 管理员在后台 /admin/activities 直接发布 → approved → 公页可见
 *  ⑤ 自清理（脚本可重复跑）
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { execSync } from "node:child_process";

const BASE = "http://127.0.0.1:3000";
const psql = (q) =>
  execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`, {
    encoding: "utf8",
  }).trim();

let pass = 0;
let fail = 0;
const check = (n, ok, d = "") => {
  if (ok) {
    pass++;
    console.log(`PASS  ${n}${d ? `  (${d})` : ""}`);
  } else {
    fail++;
    console.log(`FAIL  ${n}${d ? `  (${d})` : ""}`);
  }
};

// ── 测试目标 ───────────────────────────────────────────────────────
const clanId = psql(
  `SELECT id FROM "ClanHall" WHERE "ownerUserId"=(SELECT id FROM "User" WHERE email='user@test.com') AND status='active' ORDER BY "createdAt" ASC LIMIT 1;`,
);
check("找到测试宗祠（user@test.com 名下）", !!clanId, clanId || "未找到");
check("祠主已实名", psql(`SELECT "idVerified" FROM "User" WHERE email='user@test.com';`) === "t");

const TITLE = `验收祠主活动 ${Date.now()}`;
const TITLE2 = `验收平台活动 ${Date.now()}`;
// 清理上次残留（可重复跑）
psql(`DELETE FROM "ClanActivity" WHERE title LIKE '验收祠主活动 %' OR title LIKE '验收平台活动 %';`);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

console.log("\n===== 宗族活动发布（双入口 + 审核）验收 =====\n");

// ── ① 祠主控制台发布 ────────────────────────────────────────────────
console.log("── ① 祠主控制台发布 ──");
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.fill('input[name="identifier"]', "user@test.com");
await page.fill('input[name="password"]', "user123456");
await page.click('button[type="submit"]');
await page.waitForTimeout(4000);

await page.goto(`${BASE}/console/clan-halls/${clanId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
let body = await page.locator("body").innerText();
check("控制台含「宗族活动」板块", body.includes("宗族活动") && body.includes("发布本祠活动"));

const ownerForm = page.locator('form:has(button:has-text("提交活动"))').first();
check("祠主发布表单存在", (await ownerForm.count()) > 0);
if ((await ownerForm.count()) > 0) {
  await ownerForm.locator('input[name="title"]').fill(TITLE);
  await ownerForm.locator('select[name="kind"]').selectOption("宗亲联谊");
  await ownerForm.locator('input[name="startAt"]').fill("2026-12-20T10:00");
  await ownerForm.locator('input[name="location"]').fill("验收测试地点 · 线上会议");
  await ownerForm.locator('button:has-text("提交活动")').click();
  await page.waitForTimeout(2500);
}

const st1 = psql(`SELECT "reviewStatus" FROM "ClanActivity" WHERE title='${TITLE}' LIMIT 1;`);
check("祠主发布写入 DB", !!st1, st1 || "未写入");
check("新发布默认「待审 pending」", st1 === "pending", st1);

// ── ② 反向验证：未过审不出现在公页 ─────────────────────────────────
console.log("\n── ② 反向验证：未过审不出现在公页 ──");
await page.goto(BASE + "/clan/activities", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
body = await page.locator("body").innerText();
check("公页不显示未过审活动（过滤生效）", !body.includes(TITLE), body.includes(TITLE) ? "泄漏！" : "正确隐藏");

// ── ③ 管理员审核通过 ────────────────────────────────────────────────
console.log("\n── ③ 管理员审核通过 ──");
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.fill('input[name="identifier"]', "admin@test.com");
await page.fill('input[name="password"]', "admin123456");
await page.click('button[type="submit"]');
await page.waitForTimeout(4000);

await page.goto(BASE + "/admin/activities", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
body = await page.locator("body").innerText();
check("后台 /admin/activities 可达", body.includes("宗族活动") && body.includes("新建活动"));

await page.goto(BASE + "/admin/review", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
body = await page.locator("body").innerText();
check("审核页含「宗族活动审核」段", body.includes("宗族活动审核"));
check("审核页出现待审活动", body.includes(TITLE));

const h3 = page.locator(`h3:text-is("${TITLE}")`).first();
let clicked = false;
if ((await h3.count()) > 0) {
  const card = h3.locator("xpath=..");
  const btn = card.locator('button:has-text("通过")').first();
  if ((await btn.count()) > 0) {
    await btn.click();
    await page.waitForTimeout(3000);
    clicked = true;
  }
}
check("定位并点击待审活动的「通过」", clicked);

const st2 = psql(`SELECT "reviewStatus" FROM "ClanActivity" WHERE title='${TITLE}' LIMIT 1;`);
check("审核后状态=approved", st2 === "approved", st2);

// ── ④ 审核通过后公页出现 ────────────────────────────────────────────
console.log("\n── ④ 审核通过后公页出现 ──");
await page.goto(BASE + "/clan/activities", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
body = await page.locator("body").innerText();
check("审核通过后公页显示该活动", body.includes(TITLE));
check("公页显示主办宗祠", body.includes("陆氏宗祠 主办") || body.includes("主办"));

// ── ⑤ 管理员后台「直接发布」 ────────────────────────────────────────
console.log("\n── ⑤ 后台直接发布 ──");
await page.goto(BASE + "/admin/activities/new", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
const aform = page.locator('form:has(button:has-text("直接发布"))').first();
check("后台新建表单存在", (await aform.count()) > 0);
if ((await aform.count()) > 0) {
  await aform.locator('input[name="title"]').fill(TITLE2);
  await aform.locator('input[name="startAt"]').fill("2026-12-25T15:00");
  await aform.locator('input[name="location"]').fill("平台验收地点");
  await aform.locator('button:has-text("直接发布")').click();
  await page.waitForTimeout(3000);
}
const st3 = psql(`SELECT "reviewStatus" FROM "ClanActivity" WHERE title='${TITLE2}' LIMIT 1;`);
check("后台直接发布=approved", st3 === "approved", st3 || "未写入");

await page.goto(BASE + "/clan/activities", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
check("后台直发活动公页可见", (await page.locator("body").innerText()).includes(TITLE2));

// ── ⑥ 清理 ──────────────────────────────────────────────────────────
console.log("\n── ⑥ 清理 ──");
psql(`DELETE FROM "ClanActivitySignup" WHERE "activityId" IN (SELECT id FROM "ClanActivity" WHERE title='${TITLE}' OR title='${TITLE2}');`);
psql(`DELETE FROM "ClanActivity" WHERE title='${TITLE}' OR title='${TITLE2}';`);
check(
  "清理测试活动",
  psql(`SELECT count(*) FROM "ClanActivity" WHERE title='${TITLE}' OR title='${TITLE2}';`) === "0",
);

await b.close();
console.log(`\n通过 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
