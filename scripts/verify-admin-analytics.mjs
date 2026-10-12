// 后台「运营监控 · 分析大盘」验收（流量/渠道/漏斗/留存/趋势/地域设备）
// 登录 admin 后访问 /admin，校验新增的 6 个分析板块均已渲染且含真实数据。
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;

const BASE = "http://localhost:3000";
const results = [];
const check = (name, ok, extra = "") => results.push({ name, ok: !!ok, extra });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 } });
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
await page.waitForTimeout(3000);
check("运营监控大盘可达", page.url().endsWith("/admin"));

const body = await page.textContent("body");

// 板块标题
const heads = ["核心指标", "流量与获客", "渠道来源", "转化漏斗", "营收分析", "用户留存", "运营趋势", "地域 & 设备", "内容与祭献"];
for (const h of heads) {
  check(`板块标题存在：「${h}」`, body.includes(h));
}

// 流量与获客关键数字
check("流量含「访问会话」", body.includes("访问会话"));
check("流量含「独立访客 UV」", body.includes("独立访客 UV"));
check("流量含 DAU/WAU/MAU", body.includes("DAU / WAU") && body.includes("MAU"));

// 渠道来源：至少出现若干渠道标签与一行数据
const chanLabels = ["直接访问", "搜索引擎", "社交媒体", "分享链接", "外部引荐", "付费推广"];
const chanFound = chanLabels.filter((l) => body.includes(l));
check("渠道来源标签渲染", chanFound.length >= 3, `命中 ${chanFound.length}/${chanLabels.length}`);
check("渠道含「首购 GMV」列", body.includes("首购 GMV"));
check("渠道含「注册率」列", body.includes("注册率"));

// 漏斗（人口径：付费层级应显示「付费用户」而非订单数）
check("漏斗含「访问会话」步骤", body.includes("访问会话"));
check("漏斗含「付费用户」步骤", body.includes("付费用户"));
check("漏斗含「访问→注册」转化", body.includes("访问→注册"));
check("漏斗含「建馆→付费」转化", body.includes("建馆→付费"));

// 营收分析（订单/金额口径，与漏斗分层）
check("营收含「累计 GMV」", body.includes("累计 GMV"));
check("营收含「付费订单数」", body.includes("付费订单数"));
check("营收含「客单价」", body.includes("客单价"));
check("营收含「人均付费（ARPPU）」", body.includes("人均付费"));
check("营收含「复购倍数」", body.includes("复购倍数"));

// 地域 & 设备
check("地域含「访客地域分布」", body.includes("访客地域分布"));
check("设备含「设备分布」", body.includes("设备分布"));

// 自动刷新组件仍在
const autoCount = await page.locator('[data-autorefresh="true"]').count();
check("自动刷新组件已挂载", autoCount >= 1, `data-autorefresh 数量=${autoCount}`);

// 金额/数字已渲染（证明分析聚合有产出）
const yuanCount = (body.match(/¥/g) || []).length;
check("大盘渲染出金额数据", yuanCount >= 3, `¥ 出现 ${yuanCount} 次`);

// 无控制台错误
const realErrors = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
check("无控制台错误", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

// ---- 反向验证：断言一个不可能存在的文本，预期 FAIL（证明脚本在观察真实 DOM）----
// check("反向验证-应失败", body.includes("__THIS_TEXT_SHOULD_NOT_EXIST__"));

await browser.close();

console.log("");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra ? `  (${r.extra})` : ""}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n===== 运营监控·分析大盘：${passed}/${results.length} PASS =====`);
process.exit(passed === results.length ? 0 : 1);
