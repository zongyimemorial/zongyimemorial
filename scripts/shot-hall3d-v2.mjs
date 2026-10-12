import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const HALL_ID = "cmujvoq35000m8uu68r71mo0c";
const prisma = new PrismaClient();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// 1) 预览口令
const unlock = await ctx.request.post(`${BASE}/api/preview-unlock`, {
  data: { pass: "neibu1234" },
});
console.log("unlock:", unlock.status());

// 2) 登录
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="identifier"]', "user@test.com");
await page.fill('input[name="password"]', "user123456");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 15000 });
console.log("logged in");

// 3) 精装态（当前 demo 馆配置）
await page.goto(`${BASE}/halls/${HALL_ID}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const stage = await page.$('[data-hall3d-stage="1"]');
console.log("3d stage present:", !!stage);
const badge = await page.evaluate(() => {
  const el = document.querySelector('[data-hall3d-stage="1"]');
  return el ? el.textContent : "";
});
console.log("badge decorated:", badge.includes("精装纪念空间"));
await page.screenshot({ path: "shots/v2-hall-decorated.png", clip: { x: 0, y: 0, width: 1280, height: 760 } });

// 4) 未装修态：临时把 templateConfig.decor 恢复默认槽位
const hall = await prisma.memorialHall.findUnique({ where: { id: HALL_ID } });
const origConfig = hall?.templateConfig ? JSON.parse(JSON.stringify(hall.templateConfig)) : null;
const DEFAULT_CONFIG = { decor: { slots: { wall: "wall-plain", floor: "floor-none", ornament: ["orn-none"], frame: "frame-line", font: "font-modern" } } };
await prisma.memorialHall.update({
  where: { id: HALL_ID },
  data: { templateConfig: DEFAULT_CONFIG },
});
await page.goto(`${BASE}/halls/${HALL_ID}`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const badge2 = await page.evaluate(() => {
  const el = document.querySelector('[data-hall3d-stage="1"]');
  return el ? el.textContent : "";
});
console.log("badge undecorated:", badge2.includes("标准纪念空间"));
await page.screenshot({ path: "shots/v2-hall-undecorated.png", clip: { x: 0, y: 0, width: 1280, height: 760 } });

// 5) 还原 demo 馆配置
await prisma.memorialHall.update({
  where: { id: HALL_ID },
  data: { templateConfig: origConfig },
});
console.log("restored");

await browser.close();
await prisma.$disconnect();
