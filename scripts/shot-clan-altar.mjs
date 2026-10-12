// 宗祠空间「供台」升级截图：暗色祭拜舞台（烛台 + 供台陈列 + 撤供）+ 一键献祭网格
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "/workspace/docs/验收截图";
mkdirSync(OUT, { recursive: true });

const hallId = process.env.HALL_ID || "cmulkwa570001ly4yzf6p5xls";

const browser = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

// 登录（等 hydration，避免表单退化成原生 GET）
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);
await page.fill('input[name="identifier"]', "user@test.com");
await page.fill('input[name="password"]', "user123456");
await page.click('button[type="submit"]');
for (let t = 0; t < 24; t++) {
  if (!page.url().includes("/login")) break;
  await page.waitForTimeout(500);
}

await page.goto(`${BASE}/clan/halls/${hallId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// 献上三份供品，让供台有陈列
for (const label of ["供果", "祭酒", "清茶", "擦拭", "三鞠躬"]) {
  const btn = page.locator(`button[title^="献上${label}"]`).first();
  if ((await btn.count()) > 0 && !(await btn.isDisabled())) {
    await btn.click();
    await page.waitForTimeout(2600);
  }
}

const worship = page.locator('h2:has-text("献祭 · 敬奉先祖")').locator("xpath=..");
await worship.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await worship.screenshot({ path: `${OUT}/宗祠-供台-祭拜舞台.png` });

const txt = await worship.innerText();
console.log("供台板块文本：", txt.replace(/\s+/g, " ").slice(0, 260));
console.log("供台陈列件数：", (txt.match(/供台 · (\d+) 件/) || [])[1] ?? "(无)");
console.log("按钮总数：", await page.locator('button[title^="献上"]').count());

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/宗祠-供台-整页.png`, fullPage: true });

console.log("已截图：宗祠-供台-祭拜舞台.png / 宗祠-供台-整页.png");
await browser.close();
