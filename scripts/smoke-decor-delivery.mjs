/**
 * 装修体系交付冒烟（人工巡检用，不做判定、不进批量）。
 *
 * 用途：一眼确认三处入口都活着 —— 商城商品页、控制台工坊、公网馆页。
 *
 * ⚠️ **不要写死馆/祠的 id**。这是踩过的坑：
 *    - verify-clan-e2e 每跑一次就新建一座宗祠，写死的 id 很快就失效；
 *    - 馆/祠归属不同用户（admin 名下的用 user@test.com 登录会被重定向回 /console），
 *      表现是"工坊卡片=0 / 装修套件分类=false"，看着像工坊崩了，其实是没有权限。
 * 所以这里**按当前登录用户动态查**。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { execSync } from "node:child_process";

const BASE = "http://127.0.0.1:3000";
const EMAIL = process.env.SMOKE_EMAIL || "admin@test.com";
const PASS = process.env.SMOKE_PASS || "admin123456";

const psql = (q) =>
  execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`, {
    encoding: "utf8",
  }).trim();

const uid = psql(`SELECT id FROM "User" WHERE email='${EMAIL}' LIMIT 1;`);
if (!uid) {
  console.error(`找不到用户 ${EMAIL}`);
  process.exit(1);
}
const hallId = psql(`SELECT id FROM "MemorialHall" WHERE "ownerUserId"='${uid}' LIMIT 1;`);
const clanId = psql(`SELECT id FROM "ClanHall" WHERE "ownerUserId"='${uid}' LIMIT 1;`);
const pubHall = hallId || psql(`SELECT id FROM "MemorialHall" LIMIT 1;`);

console.log(`用户 ${EMAIL} → 馆=${hallId || "(无)"} 祠=${clanId || "(无)"}\n`);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

// 1) 商城装修商品（纪念馆侧 + 宗祠侧 + classic 对照）
console.log("── 商城装修商品详情页 ──");
for (const s of ["decor-tpl-starry3d", "decor-clan-tpl-ancestral3d", "decor-tpl-plain"]) {
  const r = await page.goto(BASE + "/mall/" + s, { waitUntil: "domcontentloaded" });
  const h = await page.content();
  const badge = (h.match(/data-space-badge="([^"]+)"/) || [])[1] || "-";
  console.log(`  ${s.padEnd(30)} ${r?.status()}  3D预览=${/data-decor-3d/.test(h)}  空间=${badge}`);
}

// 2) 登录后进两个工坊
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.fill('input[name="identifier"]', EMAIL);
await page.fill('input[name="password"]', PASS);
await page.click('button[type="submit"]');
await page.waitForTimeout(4500);

console.log("── 控制台装修工坊 ──");
/*
  ⚠️ 馆与祠常常不在同一个用户名下（种子数据里纪念馆多属 user、宗祠多属 admin），
  所以这里**按账号分别登录**，各查各的，避免"跳过"掩盖真实问题。
*/
const ACCOUNTS = [
  ["admin@test.com", "admin123456"],
  ["user@test.com", "user123456"],
];
for (const [email, pass] of ACCOUNTS) {
  const u = psql(`SELECT id FROM "User" WHERE email='${email}' LIMIT 1;`);
  if (!u) continue;
  const hId = psql(`SELECT id FROM "MemorialHall" WHERE "ownerUserId"='${u}' LIMIT 1;`);
  const cId = psql(`SELECT id FROM "ClanHall" WHERE "ownerUserId"='${u}' LIMIT 1;`);
  if (!hId && !cId) continue;

  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4500);

  for (const [label, path, id] of [
    ["纪念馆工坊", "/console/halls/", hId],
    ["宗祠工坊", "/console/clan-halls/", cId],
  ]) {
    if (!id) continue;
    await page.goto(BASE + path + id, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2800);
    const hh = await page.content();
    const cards = await page.evaluate(
      () => document.querySelectorAll("span.text-sm.font-medium").length,
    );
    const redirected = !page.url().includes(path + id);
    console.log(
      `  ${email.split("@")[0].padEnd(6)} ${label.padEnd(10)} ${redirected ? "被重定向(归属不符)" : "OK"}  3D预览=${/data-decor-3d/.test(hh)}  模板卡=${cards}  套件分类=${/装饰套件/.test(hh)}`,
    );
  }
}

// 3) 公网馆页：装修不得影响供奉体系
console.log("── 公网馆页（装修 ⇄ 供奉解耦）──");
const r = await page.goto(BASE + "/halls/" + pubHall, { waitUntil: "domcontentloaded" });
const h = await page.content();
console.log(
  `  /halls/${pubHall}  ${r?.status()}  壁龛墙=${/壁龛纪念墙/.test(h)}  3D=${/data-decor-3d/.test(h)}  祭祀面板=${/一键祭拜|献上上香|献祭/.test(h)}`,
);

await b.close();
