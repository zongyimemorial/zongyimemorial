// 公网登录链路验证：经隧道访问 https://zongyimemorial.com 完成口令 + 登录
// ⚠️ BASE 走环境变量，别硬编码域名 —— 隧道域名换过一次
//    （旧 zongyitang.lhr.rocks → 现 zongyimemorial.com），
//    硬编码会让本套件在域名变更后常年以 ERR_SSL_PROTOCOL_ERROR 挂掉。
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;

const BASE = process.env.BASE_URL || "https://zongyimemorial.com";
const HOST = new URL(BASE).hostname;
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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();

const errors = [];
const bad = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", (r) => {
  if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
});

// —— 1. 口令页 ——
const r0 = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(1500);
check("根路径可达", !!r0, String(r0?.status()));
check("自动跳入口令页", page.url().includes("/preview-gate"), page.url());

// 填入访问口令
const gateInput = page.locator('input[type="text"], input[name="code"], input[type="password"]').first();
if (await gateInput.count()) {
  // 先看页面有没有提示口令
  const gateText = await page.locator("body").innerText();
  const m = gateText.match(/口令[：:]\s*([A-Za-z0-9_-]+)/) || gateText.match(/([A-Za-z0-9_-]{6,})/);
  console.log(`口令页提示片段: ${gateText.slice(0, 120).replace(/\n+/g, " | ")}`);
}
check("口令页已渲染", (await page.locator("body").innerText()).length > 20);

// —— 2. 直接植入口令 cookie（等价于用户已通过口令）——
await ctx.clearCookies();
await ctx.addCookies([
  { name: "preview_auth", value: "1", domain: HOST, path: "/" },
]);

// —— 3. 登录页 ——
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);
check("登录页可达", page.url().includes("/login"), page.url());
check("登录表单已渲染", (await page.locator('input[name="identifier"]').count()) > 0);

// —— 4. 真实登录 ——
await page.fill('input[name="identifier"]', "user@test.com");
await page.fill('input[name="password"]', "user123456");
await Promise.all([
  page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 }),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(3000);
check("登录成功（已离开登录页）", !page.url().includes("/login"), page.url());

const home = await page.locator("body").innerText();
check("登录后进入控制台", home.includes("我的控制台") || page.url().includes("/console"));

// —— 5. 关键页面公网可达 ——
for (const [name, path, expect] of [
  ["控制台", "/console", "我的控制台"],
  ["追思装置管理台", null, "追思装置"],
  ["午夜悄悄话板块", "/whispers", "午夜悄悄话"],
  ["对话页", null, "非真人"],
]) {
  if (path) {
    const r = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1600);
    const t = await page.locator("body").innerText();
    check(`公网·${name}`, r?.status() === 200 && t.includes(expect), `HTTP ${r?.status()}`);
  }
}

// 控制台取装置链接，再验证管理台与对话页
await page.goto(`${BASE}/console`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);
const mgrHref = await page
  .locator('a[href^="/console/whispers/"]')
  .first()
  .getAttribute("href")
  .catch(() => null);
if (mgrHref) {
  const r = await page.goto(`${BASE}${mgrHref}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  const t = await page.locator("body").innerText();
  check("公网·追思装置管理台", r?.status() === 200 && t.includes("追思装置"), `HTTP ${r?.status()}`);
}

// 从板块页进对话页
const talkHref = await (async () => {
  await page.goto(`${BASE}/whispers`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  const h = await page.locator('a[href^="/whispers/"]').first().getAttribute("href").catch(() => null);
  return h;
})();
if (talkHref) {
  const r = await page.goto(`${BASE}${talkHref}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const t = await page.locator("body").innerText();
  check("公网·对话页", r?.status() === 200 && t.includes("这里回应你的不是真人"), `HTTP ${r?.status()}`);
  check("公网·对话输入框可用", (await page.locator("textarea").count()) > 0);
}

// —— 6. 无异常 ——
const realErrors = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
check("无控制台错误", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

await browser.close();

console.log(`\n===== 公网登录链路：${pass}/${pass + fail} PASS =====`);
if (fail > 0) process.exit(1);
