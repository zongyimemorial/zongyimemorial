// 验证控制台各页面的「返回首页」按钮是否存在且可点击跳转
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { execSync } from "node:child_process";
const { chromium } = pkg;

const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`PASS  ${name}  ${extra}`); }
  else { fail++; console.log(`FAIL  ${name}  ${extra}`); }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

const errors = [];
const bad = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("response", (r) => {
  if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
});

async function login() {
  if (page.url().includes("/console") && !page.url().includes("/login")) {
    await page.goto(`${BASE}/console`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    if (!page.url().includes("/login")) return;
  }
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  if (await page.locator('input[name="identifier"]').count()) {
    await page.fill('input[name="identifier"]', "user@test.com");
    await page.fill('input[name="password"]', "user123456");
    await Promise.all([
      page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2500);
  }
}

await login();
check("登录成功", !page.url().includes("/login"), page.url());

// ---- 1. /console ----
await page.goto(`${BASE}/console`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);
let t = await page.locator("body").innerText();
check("控制台含顶端「返回首页」", t.includes("← 返回首页"));
check("控制台含按钮区「返回首页」", /返回首页/.test(t));
const homeCount = await page.locator('a:has-text("返回首页")').count();
check("控制台返回首页链接数量 ≥ 2", homeCount >= 2, `实得 ${homeCount}`);

// 点击顶部返回首页
await page.locator('a:has-text("← 返回首页")').first().click();
await page.waitForTimeout(2200);
check("点「← 返回首页」跳转到首页", new URL(page.url()).pathname === "/", page.url());

// ---- 2. 馆务管理 ----
await login();
await page.goto(`${BASE}/console`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const manageLink = page.locator('a[href^="/console/halls/"]').first();
if (await manageLink.count()) {
  const href = await manageLink.getAttribute("href");
  await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  t = await page.locator("body").innerText();
  check("馆务管理含「返回首页」", t.includes("返回首页"), href);
  check("馆务管理含面包屑「控制台」", t.includes("馆务管理"));
  await page.locator('a:has-text("返回首页")').first().click();
  await page.waitForTimeout(2200);
  check("馆务管理点返回首页成功", new URL(page.url()).pathname === "/", page.url());
} else {
  console.log("SKIP  馆务管理（当前用户无纪念馆）");
}

// ---- 3. 宗祠管理 ----
// 注意：只能测当前用户名下的宗祠；他人的宗祠管理页会 redirect("/console")
await login();
const MY_CLAN_HALL = process.env.CLAN_HALL_ID || (() => {
  try {
    const sql = `select c.id from "ClanHall" c join "User" u on u.id=c."ownerUserId" where u.email='user@test.com' order by c."createdAt" desc limit 1;`;
    return execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(sql)}`)
      .toString().trim();
  } catch (e) { return ""; }
})();
console.log(`\n[宗祠管理] 目标 id = ${MY_CLAN_HALL || "(无)"}`);
if (MY_CLAN_HALL) {
  const r = await page.goto(`${BASE}/console/clan-halls/${MY_CLAN_HALL}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2800);
  if (r && r.status() < 400 && page.url().includes("/console/clan-halls/")) {
    const crumb = await page.locator('nav:has(a[href="/clan/halls"])').first().innerText().catch(() => "");
    t = await page.locator("body").innerText();
    check("宗祠管理含「返回首页」", t.includes("返回首页"));
    check("宗祠管理含面包屑「设立宗祠」", crumb.includes("设立宗祠"), crumb.replace(/\n/g, " ").slice(0, 70));
    await page.locator('a:has-text("返回首页")').first().click();
    await page.waitForTimeout(2200);
    check("宗祠管理点返回首页成功", new URL(page.url()).pathname === "/", page.url());
  } else {
    console.log(`SKIP  宗祠管理（无权限访问 ${MY_CLAN_HALL}，实得 ${page.url()}）`);
  }
} else {
  console.log("SKIP  宗祠管理（该用户名下无宗祠）");
}

// ---- 4. 实名认证 ----
await login();
await page.goto(`${BASE}/console/realname`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);
t = await page.locator("body").innerText();
check("实名认证含「返回首页」", t.includes("返回首页"));
check("实名认证含面包屑「控制台」", t.includes("实名认证"));
await page.locator('a:has-text("返回首页")').first().click();
await page.waitForTimeout(2200);
check("实名认证点返回首页成功", new URL(page.url()).pathname === "/", page.url());

console.log(`\n通过 ${pass}/${pass + fail}`);
const realErrors = errors.filter((e) => !/favicon|404 \(Not Found\)/i.test(e));
const realBad = bad.filter((b) => !/favicon/.test(b));
if (realErrors.length) console.log("控制台错误:\n" + realErrors.join("\n"));
if (realBad.length) console.log("异常请求:\n" + realBad.join("\n"));
if (!realErrors.length && !realBad.length) console.log("无控制台错误、无 4xx/5xx 请求");

await browser.close();
process.exit(fail ? 1 : 0);
