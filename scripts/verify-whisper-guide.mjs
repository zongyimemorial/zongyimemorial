// 午夜悄悄话 · 操作指引与显眼入口 验收
// 覆盖：Header 醒目徽章、列表页指引入口、/whispers/guide 指引页内容、移动端无溢出、无报错
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;

const BASE = "http://localhost:3000";
let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}  ${extra}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}  ${extra}`);
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

const errors = [];
const bad = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", (r) => {
  if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
});

// ============ 1. Header 导航：高亮跟随真实路径（不再是午夜悄悄话永久高亮）============
await page.goto(`${BASE}/mall`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const whisperLink = page.locator('header a[href="/whispers"]').first();
const whisperCount = await page.locator('header a[href="/whispers"]').count();
check("导航·午夜悄悄话入口存在且唯一", whisperCount === 1, `count=${whisperCount}`);
if (whisperCount === 1) {
  const wcls = (await whisperLink.getAttribute("class")) || "";
  const wtext = (await whisperLink.innerText()).trim();
  check("导航·保留月亮图标", wtext.includes("🌙"));
  // 在 /mall 页：午夜悄悄话不应高亮（修复前它一直高亮、误导用户）
  check("导航·非当前页不高亮（无永久胶囊）", !wcls.includes("bg-brand-900"));
  // 当前页（商城）应获得墨色高亮，普通链接不再与高亮项无差别
  const mallLink = page.locator('header a[href="/mall"]').first();
  const mcls = (await mallLink.getAttribute("class")) || "";
  check("导航·当前页（商城）获得墨色高亮", mcls.includes("bg-brand-900"));
}

// 切到 /whispers：午夜悄悄话此时应高亮、商城回落普通态
await page.goto(`${BASE}/whispers`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const wcls2 = (await page.locator('header a[href="/whispers"]').first().getAttribute("class")) || "";
check("导航·访问悄悄话页时该入口高亮", wcls2.includes("bg-brand-900"));
// 首页也应支持当前页高亮：回到 / 时「首页」获得墨色高亮
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const homeCls = (await page.locator('header nav a[href="/"]').first().getAttribute("class")) || "";
check("导航·访问首页时「首页」高亮", homeCls.includes("bg-brand-900"));

// ============ 2. 列表页指引入口 ============
await page.goto(`${BASE}/whispers`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const body1 = (await page.content()) || "";
check("列表页·含使用指引入口", body1.includes("/whispers/guide"));
check("列表页·指引入口文案含安全/学会等关键词", body1.includes("使用指引"));
const guideEntryVisible = await page.locator('a[href="/whispers/guide"]').first().isVisible();
check("列表页·指引入口可见（首屏）", guideEntryVisible);

// ============ 3. 指引页内容 ============
const resp = await page.goto(`${BASE}/whispers/guide`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const g = (await page.content()) || "";
check("指引页·可访问（200）", !!resp && resp.status() === 200, `status=${resp && resp.status()}`);
check("指引页·标题存在", g.includes("使用指引"));
check("指引页·是什么/不是什么对照", g.includes("它是什么") && g.includes("不是什么"));
check("指引页·馆主五步", g.includes("五步布置一个装置") && g.includes("创建追思装置") && g.includes("开启对话"));
check("指引页·来访者四步", g.includes("四步开始对话") && g.includes("说说话"));
check("指引页·安全须知六条", g.includes("安全须知") && g.includes("AI 生成") && g.includes("授权与伦理"));
check("指引页·隐私口径（仅本人可见）", g.includes("只有你能看见") || g.includes("仅会话本人可见"));
check("指引页·删除权", g.includes("随时可以删除") || g.includes("删除权"));
check("指引页·危机干预热线 12356", g.includes("12356"));
check("指引页·45 分钟软上限", g.includes("45 分钟"));
check("指引页·无数字人形象声明", g.includes("没有会动的数字人形象"));
check("指引页·FAQ 存在", g.includes("常见问题"));
check("指引页·底部行动入口", g.includes("/whispers") && g.includes("/console"));
// 反向：指引页不得把数字人形象当作功能宣传
check("指引页·反向：未宣传数字人形象功能", !g.includes("数字人形象选择") && !g.includes("创建数字人"));

// ============ 4. 指引页移动端无横向溢出 ============
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await mctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const mpage = await mctx.newPage();
await mpage.goto(`${BASE}/whispers/guide`, { waitUntil: "domcontentloaded" });
await mpage.waitForTimeout(1500);
const overflow = await mpage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check("指引页·移动端无横向溢出", overflow <= 2, `overflow=${overflow}px`);
const mOverflow2 = await (async () => {
  await mpage.goto(`${BASE}/mall`, { waitUntil: "domcontentloaded" });
  await mpage.waitForTimeout(1200);
  return mpage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
})();
check("导航改造后·其他页移动端无横向溢出", mOverflow2 <= 2, `overflow=${mOverflow2}px`);

// ============ 5. 全局健康 ============
check("无控制台错误", errors.length === 0, errors.slice(0, 2).join(" | "));
check("无异常 4xx/5xx", bad.length === 0, bad.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n使用指引验收：通过 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
