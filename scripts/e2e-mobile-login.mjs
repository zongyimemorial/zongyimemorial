import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium, devices } = pkg;

const BASE = process.env.BASE_URL || "http://localhost:3000";

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

// 2) 手机端模拟
const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices["iPhone 12"],
  baseURL: BASE,
});
const page = await context.newPage();
if (cookie) {
  const [name, value] = cookie.split("=");
  await context.addCookies([{ name, value, domain: "localhost", path: "/" }]);
}

const logs = [];
page.on("console", (msg) => logs.push(msg.type() + ": " + msg.text()));
page.on("pageerror", (e) => logs.push("PAGEERROR: " + e.message));

console.log("→ 打开 /login");
await page.goto("/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800); // prod 水合后稍候

// 3) 切到手机验证码登录
console.log("→ 点击「手机验证码登录」标签");
await page.click('button:has-text("手机验证码登录")');
await page.waitForTimeout(300);

// 4) 填手机号并发验证码
const phone = "13800000000";
await page.fill('input[name="phone"]', phone);
console.log("→ 点击「发送验证码」");
await page.click('button:has-text("发送验证码")');

// 5) 等待并读取 mock 验证码
await page.waitForSelector("text=内测验证码", { timeout: 8000 });
const codeText = await page.locator("span.font-semibold").first().innerText();
console.log("→ 读取到 mock 验证码:", codeText);

// 6) 填验证码并提交
await page.fill('input[name="code"]', codeText);
await page.screenshot({ path: "/workspace/.e2e-login-filled.png" });
console.log("→ 点击「登录」");
await page.click('button[type="submit"]');

// 7) 等待跳转 /console
await page.waitForURL("**/console**", { timeout: 10000 });
const url = page.url();
console.log("→ 登录后 URL:", url);
await page.screenshot({ path: "/workspace/.e2e-console.png", fullPage: false });

const ok = url.includes("/console");
console.log(ok ? "\n✅ 手机端登录 E2E 通过：成功跳转 /console" : "\n❌ 未跳转到 /console");
if (logs.length) {
  console.log("--- 页面日志 ---");
  logs.slice(0, 10).forEach((l) => console.log("  " + l));
}
await browser.close();
process.exit(ok ? 0 : 1);
