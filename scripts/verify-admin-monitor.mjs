// 后台「运营监控大盘 + 纪念馆/宗祠消费台帐」验收
// 含反向验证：脚本末尾的 reverseCheck 故意断言一个不存在的文本，应 FAIL，
// 用于证明脚本确实在观察真实 DOM（本地临时，提交前已还原为正向断言）。
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;

const BASE = "http://localhost:3000";
const results = [];
const check = (name, ok, extra = "") => results.push({ name, ok: !!ok, extra });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

// ---- 管理员登录 ----
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.fill('input[name="identifier"]', "admin@test.com");
await page.fill('input[name="password"]', "admin123456");
await page.click('button[type="submit"]');
await page.waitForTimeout(3500);
check("管理员登录成功", !/\/login/.test(page.url()), page.url());

// ---- 运营监控大盘 ----
await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
check("运营监控大盘可达", page.url().endsWith("/admin"));
const dashText = await page.textContent("body");
check("大盘含标题「运营监控」", dashText.includes("运营监控"));
check("大盘含「今日成交额」", dashText.includes("今日成交额"));
check("大盘含「近 7 日成交额」", dashText.includes("近 7 日成交额"));
check("大盘含「累计成交额」", dashText.includes("累计成交额"));
check("大盘含「今日供奉次数」", dashText.includes("今日供奉次数"));
const autoCount = await page.locator('[data-autorefresh="true"]').count();
check("自动刷新组件已挂载", autoCount >= 1, `data-autorefresh 数量=${autoCount}`);
const hasMoney = (dashText.match(/¥/g) || []).length;
check("大盘渲染出金额数据", hasMoney >= 3, `¥ 出现 ${hasMoney} 次`);

// ---- 纪念馆消费台帐 列表 ----
await page.goto(`${BASE}/admin/ledger/halls`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
check("纪念馆台帐可达", page.url().includes("/admin/ledger/halls"));
const hallText = await page.textContent("body");
check("列表含标题「纪念馆消费台帐」", hallText.includes("纪念馆消费台帐"));
check("列表含「累计消费」列", hallText.includes("累计消费"));
check("列表含「供奉次数」列", hallText.includes("供奉次数"));
const hallLinks = page.locator('a:has-text("查看明细")');
const hallLinkCount = await hallLinks.count();
check("列表存在可下钻的明细入口", hallLinkCount >= 1, `明细入口=${hallLinkCount}`);

// ---- 纪念馆台帐 详情下钻 ----
if (hallLinkCount >= 1) {
  await hallLinks.first().click();
  await page.waitForTimeout(2500);
  check("纪念馆明细页可达", /\/admin\/ledger\/halls\/.+/.test(page.url()), page.url());
  const dText = await page.textContent("body");
  check("明细含「按品类拆分」", dText.includes("按品类拆分"));
  check("明细含「近期订单」", dText.includes("近期订单"));
  check("明细含「累计消费」汇总", dText.includes("累计消费"));
}

// ---- 宗祠消费台帐 列表 ----
await page.goto(`${BASE}/admin/ledger/clans`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
check("宗祠台帐可达", page.url().includes("/admin/ledger/clans"));
const clanText = await page.textContent("body");
check("列表含标题「宗祠消费台帐」", clanText.includes("宗祠消费台帐"));
check("列表含「累计消费」列", clanText.includes("累计消费"));
const clanLinks = page.locator('a:has-text("查看明细")');
const clanLinkCount = await clanLinks.count();
check("列表存在可下钻的明细入口", clanLinkCount >= 1, `明细入口=${clanLinkCount}`);

// ---- 宗祠台帐 详情下钻 ----
if (clanLinkCount >= 1) {
  await clanLinks.first().click();
  await page.waitForTimeout(2500);
  check("宗祠明细页可达", /\/admin\/ledger\/clans\/.+/.test(page.url()), page.url());
  const cText = await page.textContent("body");
  check("明细含「按品类拆分」", cText.includes("按品类拆分"));
  check("明细含「近期订单」", cText.includes("近期订单"));
}

// ---- 无控制台错误 ----
const realErrors = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
check("无控制台错误", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

// ---- 反向验证（临时）：断言一个不可能存在的文本，预期 FAIL；提交前已还原 ----
// check("反向验证-应失败", dashText.includes("__THIS_TEXT_SHOULD_NOT_EXIST__"));

await browser.close();

console.log("");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra ? `  (${r.extra})` : ""}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n===== 后台运营监控 + 消费台帐：${passed}/${results.length} PASS =====`);
process.exit(passed === results.length ? 0 : 1);
