// 后台「运营监控」双口径改版截图：漏斗(人口径) + 营收分析(订单/金额口径)
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "/workspace/docs/验收截图";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.fill('input[name="identifier"]', "admin@test.com");
await page.fill('input[name="password"]', "admin123456");
await page.click('button[type="submit"]');
await page.waitForTimeout(3500);

await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

// 1) 漏斗 + 营收分析 区块（用完整标题精确匹配，避免混淆）
const funnel = page.locator('h2:has-text("转化漏斗（近 30 日）") + div');
await funnel.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await funnel.screenshot({ path: `${OUT}/运营监控-双口径-漏斗.png` });

const revHeading = page.locator('h2:has-text("营收分析（订单")');
await revHeading.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const revBlock = page.locator('h2:has-text("营收分析（订单") + div');
await revBlock.screenshot({ path: `${OUT}/运营监控-双口径-营收分析.png` });
console.log("营收区块文本：", (await revBlock.textContent())?.replace(/\s+/g, " ").slice(0, 300));
console.log("漏斗区块文本：", (await funnel.textContent())?.replace(/\s+/g, " ").slice(0, 300));

// 2) 整页
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/运营监控-双口径-全页.png`, fullPage: true });

console.log("已截图：运营监控-双口径-漏斗.png / 营收分析.png / 全页.png");
await browser.close();
