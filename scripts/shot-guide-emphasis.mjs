// 供台面板「补货指引」文字加亮加粗后的对比截图（纪念馆 + 宗祠两个面板）
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "/workspace/docs/验收截图";
mkdirSync(OUT, { recursive: true });

const CLAN = process.env.CLAN_ID || "cmulkwa570001ly4yzf6p5xls";
const HALL = process.env.HALL_ID || null;

const browser = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
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

async function shotGuide(url, name, anchorText) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  const p = page.locator(`p:has-text("${anchorText}"), span:has-text("${anchorText}")`).first();
  if ((await p.count()) === 0) {
    console.log(`${name}: 未找到指引行`);
    return;
  }
  const style = await p.evaluate((el) => {
    const cs = getComputedStyle(el);
    const a = el.querySelector("a");
    return {
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      color: cs.color,
      linkColor: a ? getComputedStyle(a).color : null,
    };
  });
  console.log(`${name} 指引行样式：`, JSON.stringify(style));
  /*
    boundingBox() 给的是**视口坐标**，而 page.screenshot 的 clip 是**整页绝对坐标** ——
    直接拿来裁会被判「区域在图像外」（页面还没滚到那儿时报错）。
    先把元素滚进视口再原地截，位置就对上了。
  */
  await p.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box = await p.boundingBox();
  if (box) {
    await page.screenshot({
      path: `${OUT}/${name}.png`,
      clip: { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 14), width: Math.min(1100, box.width + 24), height: box.height + 28 },
    });
  }
}

if (HALL) {
  await shotGuide(`${BASE}/halls/${HALL}`, "供台指引-纪念馆", "每份用一次");
} else {
  console.log("未提供 HALL_ID，跳过纪念馆截图");
}
await shotGuide(`${BASE}/clan/halls/${CLAN}`, "供台指引-宗祠", "面板只展示我持有的供品");

console.log("完成");
await browser.close();
