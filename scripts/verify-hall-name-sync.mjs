// 验证：在挽联/档案表单修改「逝者姓名（匾额名讳）」后，纪念馆馆名应同步联动。
// 跑完会把演示数据还原回「陆老先生纪念空间 / 陆老先生」，不留测试残留。
import { createRequire } from "module";
const require = createRequire("/workspace/");
const { PrismaClient } = require("@prisma/client");
const { chromium } = require("/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js");
const prisma = new PrismaClient();

const BASE = "http://localhost:3000";
const OWNER_EMAIL = "user@test.com";
const OWNER_PWD = "user123456";
const HALL_ID = "cmujvoq35000m8uu68r71mo0c";
const NEW_NAME = "陈府尊翁"; // 测试用新逝者名
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

  // 登录
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sleep(800);
  await page.fill('input[name="identifier"]', OWNER_EMAIL);
  await page.fill('input[name="password"]', OWNER_PWD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]).catch(() => {});
  await sleep(1000);

  // 进入馆务管理页
  await page.goto(`${BASE}/console/halls/${HALL_ID}`, { waitUntil: "domcontentloaded" });
  await sleep(1500);

  // 改逝者名
  const input = page.locator('input[name="deceasedName"]');
  assert((await input.count()) === 1, "页面存在「逝者姓名（匾额名讳）」输入框");
  await input.fill(NEW_NAME);
  await page.getByRole("button", { name: "保存配置" }).click();
  await sleep(1500);

  // 控制台列表卡片应包含联动后的新馆名
  await page.goto(`${BASE}/console`, { waitUntil: "domcontentloaded" });
  await sleep(1500);
  const consoleHtml = await page.content();
  assert(consoleHtml.includes(`${NEW_NAME}纪念空间`), `控制台列表馆名已联动为「${NEW_NAME}纪念空间」`);
  assert(!consoleHtml.includes("陆老先生纪念空间"), "控制台列表旧馆名已不再出现");

  // 公页标题应包含新馆名
  await page.goto(`${BASE}/halls/${HALL_ID}`, { waitUntil: "domcontentloaded" });
  await sleep(1500);
  const publicHtml = await page.content();
  assert(publicHtml.includes(NEW_NAME), `公页展示已同步新逝者名「${NEW_NAME}」`);

  // 还原演示数据
  await prisma.memorialHall.update({
    where: { id: HALL_ID },
    data: { name: "陆老先生纪念空间", deceasedName: "陆老先生" },
  });
  console.log("🔄 已还原演示数据：陆老先生纪念空间 / 陆老先生");

  await browser.close();
  console.log(failed === 0 ? "\n全部通过 ✅" : `\n失败 ${failed} 项 ❌`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
