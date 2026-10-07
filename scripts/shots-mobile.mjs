/**
 * 抓手机端关键页面截图，供人工确认观感。
 * 不进批量套件（只产出图片，不做判定）。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium, devices } = pkg;
import fs from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/workspace/mobile-shots";
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["iPhone 13"], locale: "zh-CN" });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

const shot = async (name, full = false) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log("已存", `${name}.png`);
};

// 内测口令页 + 登录页
await page.goto(BASE + "/preview-gate", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await shot("01-内测口令页");

await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await shot("02-登录页");

// 真登录
await page.fill('input[name="identifier"]', "user@test.com");
await page.fill('input[name="password"]', "user123456");
await page.click('button[type="submit"]');
await page.waitForTimeout(5000);

await page.goto(BASE + "/console", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await shot("03-控制台", true);

// 纪念馆公页
const hallId = "cmujvoq35000m8uu68r71mo0c";
await page.goto(`${BASE}/halls/${hallId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
await shot("04-纪念馆首屏");
await shot("04b-纪念馆全页", true);

// 宗祠
const clanId = await page.evaluate(async () => {
  const r = await fetch("/console");
  const t = await r.text();
  const m = t.match(/\/clan\/halls\/([a-z0-9]{20,})/);
  return m ? m[1] : null;
});
if (clanId) {
  await page.goto(`${BASE}/clan/halls/${clanId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  await shot("05-宗祠首屏");
}

// 装修工坊
const ownHall = await page.evaluate(async () => {
  const r = await fetch("/console");
  const t = await r.text();
  const m = t.match(/\/console\/halls\/([a-z0-9]{20,})/);
  return m ? m[1] : null;
});
if (ownHall) {
  await page.goto(`${BASE}/console/halls/${ownHall}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await shot("06-装修工坊", true);
}

await b.close();
console.log("完成");
