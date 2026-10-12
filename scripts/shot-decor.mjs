import { createRequire } from "module";
const require = createRequire("/workspace/");
const { chromium } = require("/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js");
const BASE = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

await page.goto(`${BASE}/gallery/decor`, { waitUntil: "networkidle" }).catch(() => {});
await sleep(1000);
// 取首屏 h1 文案（含套数），判断与 metadata 的 "43 套" 是否一致
const h1 = await page.$eval("h1", (e) => e.textContent.trim()).catch(() => "?");
const metaDesc = await page.$eval('meta[name="description"]', (e) => e.getAttribute("content")).catch(() => "");
console.log("H1:", h1);
console.log("META:", metaDesc);
await page.screenshot({ path: "/workspace/shots/gallery-decor.png", fullPage: false });

await page.goto(`${BASE}/mall/decor-tpl-plain`, { waitUntil: "networkidle" }).catch(() => {});
await sleep(1000);
await page.screenshot({ path: "/workspace/shots/decor-tpl-plain.png", fullPage: false });

await browser.close();
console.log("screenshots saved");
