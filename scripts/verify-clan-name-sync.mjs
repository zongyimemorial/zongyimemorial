// 验证：宗祠「主体资料」表单中直接编辑「宗祠名称」(hallName) 后，
// 控制台列表与公页都实时更新；且它是独立字段（改堂号不会影响名称）。
// 跑完还原演示数据。
import { createRequire } from "module";
const require = createRequire("/workspace/");
const { PrismaClient } = require("@prisma/client");
const { chromium } = require("/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js");
const prisma = new PrismaClient();

const BASE = "http://localhost:3000";
const OWNER_EMAIL = "user@test.com";
const OWNER_PWD = "user123456";
const CLAN_ID = "cmumsbdha003xmn57sqr6eu4b"; // 陆氏宗祠（user@test.com 名下）
const NEW_HALLNAME = "陆氏孝思宗祠";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
function assert(cond, msg) {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) failed++;
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sleep(800);
  await page.fill('input[name="identifier"]', OWNER_EMAIL);
  await page.fill('input[name="password"]', OWNER_PWD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]).catch(() => {});
  await sleep(1000);

  // 进入宗祠管理页
  await page.goto(`${BASE}/console/clan-halls/${CLAN_ID}`, { waitUntil: "domcontentloaded" });
  await sleep(1500);

  const hallInput = page.locator('input[name="hallName"]');
  assert((await hallInput.count()) === 1, "表单存在「宗祠名称」直接编辑输入框");
  await hallInput.fill(NEW_HALLNAME);
  await page.getByRole("button", { name: "保存修改" }).click();
  await sleep(1500);

  // 控制台列表应同步
  await page.goto(`${BASE}/console`, { waitUntil: "domcontentloaded" });
  await sleep(1500);
  const consoleHtml = await page.content();
  assert(consoleHtml.includes(NEW_HALLNAME), `控制台列表已同步新宗祠名称「${NEW_HALLNAME}」`);
  assert(!consoleHtml.includes("陆氏宗祠"), "控制台列表旧名称已不再出现");

  // 公页应同步
  await page.goto(`${BASE}/clan/halls/${CLAN_ID}`, { waitUntil: "domcontentloaded" });
  await sleep(1500);
  const publicHtml = await page.content();
  assert(publicHtml.includes(NEW_HALLNAME), `公页已同步新宗祠名称「${NEW_HALLNAME}」`);

  // 堂号（name）作为独立字段，不应被名称变更影响
  const row = await prisma.clanHall.findUnique({ where: { id: CLAN_ID }, select: { name: true, hallName: true } });
  assert(row.name === "河南堂", `堂号(独立字段)保持「河南堂」未被影响，实际="${row.name}"`);

  // 还原
  await prisma.clanHall.update({ where: { id: CLAN_ID }, data: { hallName: "陆氏宗祠" } });
  console.log("🔄 已还原演示数据：陆氏宗祠 / 河南堂");

  await browser.close();
  console.log(failed === 0 ? "\n全部通过 ✅" : `\n失败 ${failed} 项 ❌`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
