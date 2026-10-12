import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium, devices } = pkg;

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ID = process.env.LOGIN_ID || "user@test.com";
const PW = process.env.LOGIN_PW || "user123456";

const host = new URL(BASE).host;

// 1) 取内测门 cookie
const unlock = await fetch(BASE + "/api/preview-unlock", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ pass: "neibu1234" }),
});
const sc = unlock.headers.get("set-cookie") || "";
const m = sc.match(/preview_auth=[^;]+/);
const cookie = m ? m[0] : "";
console.log("preview cookie:", cookie || "(无)");

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["iPhone 12"], baseURL: BASE });
const page = await context.newPage();
if (cookie) {
  const [name, value] = cookie.split("=");
  await context.addCookies([{ name, value, domain: host, path: "/" }]);
}

const logs = [];
page.on("console", (msg) => logs.push(msg.type() + ": " + msg.text()));
page.on("pageerror", (e) => logs.push("PAGEERROR: " + e.message));

console.log("→ 打开 /login（默认密码登录 tab）");
await page.goto("/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);

// 默认 tab 即 password；若当前在 sms，切回
const smsActive = await page.locator('button:has-text("手机验证码登录")').evaluate((el) => el.className.includes("text-brand-700")).catch(() => false);
if (smsActive) {
  console.log("→ 切回密码登录 tab");
  await page.click('button:has-text("密码登录")');
  await page.waitForTimeout(200);
}

console.log(`→ 填账号 ${ID} / 密码 ****`);
await page.fill('input[name="identifier"]', ID);
await page.fill('input[name="password"]', PW);
 await page.screenshot({ path: "/workspace/.e2e-pw-filled.png" });
console.log("→ 点击「登录」");
await page.click('button[type="submit"]');

let ok = false, errText = "";
try {
  await page.waitForURL("**/console**", { timeout: 12000 });
  ok = page.url().includes("/console");
} catch {
  // 可能返回错误而非跳转
  errText = await page.locator("p.text-red-600").innerText().catch(() => "");
}
if (!ok) {
  const stillPending = await page.locator('button:has-text("登录中")').count();
  if (stillPending) errText = errText || "按钮仍显示「登录中…」（卡死）";
}
const url = page.url();
console.log("→ 登录后 URL:", url);
if (ok) await page.screenshot({ path: "/workspace/.e2e-console.png", fullPage: false });

console.log(ok ? "\n✅ 密码登录 E2E 通过：成功跳转 /console" : "\n❌ 密码登录失败：" + (errText || url));
if (logs.length) { console.log("--- 页面日志 ---"); logs.slice(0, 12).forEach((l) => console.log("  " + l)); }
await browser.close();
process.exit(ok ? 0 : 1);
