/*
  verify-password-eye.mjs —— 密码框「眼睛按钮」的端到端验收

  守的是三件事（都容易在实现时出错）：

   1. **切换真的生效**：点击后 input.type 必须在 password ↔ text 之间翻转。
      只断言"按钮存在"是不够的 —— 按钮在、onClick 没接对，是完全可能的。
   2. **按钮不吃掉提交**：眼睛按钮必须是 type="button"。
      在 <form> 里省略 type 默认是 submit —— 点一下眼睛就把表单提交了，
      这是本需求最危险的实现陷阱，且只在"有 form 包裹"的页面上复现。
      验法：点击眼睛后 **URL 不应变化**（若变成 ?identifier=...&password=... 就是退化成 GET 提交了）。
   3. **覆盖全站**：所有原本 type="password" 的输入框都要带上眼睛。
      判据是源码里不再有裸 `type="password"`（该组件自身除外）。
*/
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { makeChecks } from "./_check.mjs";

const BASE = "http://localhost:3000";
const { check, skip, summary } = makeChecks();

// ---------------------------------------------------------------- A. 源码覆盖
const files = execSync(
  `grep -rln 'type="password"' components/ app/ --include="*.tsx" 2>/dev/null || true`,
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .filter((f) => !f.includes("ui/PasswordInput.tsx"));

check(
  "A1 全站不再有裸 type=\"password\"（均改用 PasswordInput）",
  files.length === 0,
  files.length ? `仍存在：${files.join(", ")}` : "0 处残留",
);

const comp = readFileSync("components/ui/PasswordInput.tsx", "utf8");
check("A2 眼睛按钮显式 type=\"button\"（否则会触发提交）", /type="button"/.test(comp));
check("A3 按钮有可访问名称（aria-label）", /aria-label=\{visible \? "隐藏密码" : "显示密码"\}/.test(comp));
check("A4 按钮有 aria-pressed 表达当前态", /aria-pressed=\{visible\}/.test(comp));
check(
  "A5 输入框右侧留出按钮位置（pr-10/pr-11）",
  /pr-1[01]/.test(comp),
  "否则长密码会被按钮压住",
);

// ---------------------------------------------------------------- B. 浏览器实测
const b = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

/**
 * 在指定页面上验证眼睛按钮。
 * @param url       页面地址
 * @param label     报告用的名字
 * @param sel       定位 input 的选择器（默认取页面上第一个密码框）
 * @param typed     要输入的示例密码（不输入就切换，也应有明确回报）
 */
async function probeEye(url, label, sel = 'input[name="password"], input[name="pass"], input[type="password"]') {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);

  const urlBefore = page.url();
  const box = page.locator(sel).first();
  if ((await box.count()) === 0) {
    skip(`${label}：眼睛按钮切换`, "页面上没找到密码输入框（可能未登录/路由不同）");
    return;
  }
  await box.fill("TestPass123");

  const before = await box.getAttribute("type");
  check(`${label}：初始为隐藏态`, before === "password", `type=${before}`);

  const btn = page.locator('button[aria-label="显示密码"]').first();
  if ((await btn.count()) === 0) {
    check(`${label}：存在"显示密码"按钮`, false, "未找到 aria-label=显示密码 的按钮");
    return;
  }
  await btn.click();
  await page.waitForTimeout(400);

  /*
    ⚠️ 翻转后再查必须用**稳定选择器**。
    原先这里复用 `input[type="password"]` —— 一旦真的变成 text，那个选择器就选不到了，
    于是 getAttribute 超时。这个超时其实是"功能正常"的副作用，但报出来像脚本坏了。
    改用 name 定位（type 会变、name 不变）。
  */
  const mind = page.locator('input[name="password"], input[name="pass"]').first();
  const after = await mind.getAttribute("type");
  check(`${label}：点击后变为明文`, after === "text", `type=${after}`);

  // 值必须还在（切换 type 不应清空输入）
  const val = await mind.inputValue();
  check(`${label}：切换后已输入内容不丢失`, val === "TestPass123", `value=${val}`);

  /*
    关键：点眼睛**不能**导致提交。
    若按钮漏写 type="button"，浏览器会把它当 submit，
    表单走原生 GET → URL 变成 /login?identifier=..&password=..（密码明文进地址栏）。
    所以判据是 URL 不变。
  */
  check(
    `${label}：点眼睛不触发表单提交（密码不进 URL）`,
    page.url() === urlBefore,
    page.url() === urlBefore ? "" : `URL 变成了 ${page.url().slice(0, 90)}`,
  );

  // 再点一次应切回隐藏
  const btnOff = page.locator('button[aria-label="隐藏密码"]').first();
  if ((await btnOff.count()) > 0) {
    await btnOff.click();
    await page.waitForTimeout(400);
    const back = await page.locator('input[name="password"], input[name="pass"]').first().getAttribute("type");
    check(`${label}：再点一次切回隐藏`, back === "password", `type=${back}`);
  } else {
    check(`${label}：按钮切换为"隐藏密码"文案`, false);
  }
}

await probeEye(`${BASE}/login`, "登录页");

// 注册页：浏览器上下文已登录也无妨，注册页通常仍可访问
await probeEye(`${BASE}/register`, "注册页");

// 找回密码：需要交互才出现密码框，跳过更诚实
skip("找回密码页：眼睛按钮切换", "密码框需先通过验证码校验才渲染，非静态可测");

// 内测口令门：清掉 cookie 才会拦截
await ctx.clearCookies();
const gate = await ctx.newPage();
await gate.goto(`${BASE}/preview-gate`, { waitUntil: "domcontentloaded" });
await gate.waitForTimeout(900);
const gateInput = gate.locator('input[name="pass"]');
if ((await gateInput.count()) > 0) {
  const t0 = await gateInput.getAttribute("type");
  const gbtn = gate.locator('button[aria-label="显示密码"]').first();
  if ((await gbtn.count()) > 0) {
    await gbtn.click();
    await gate.waitForTimeout(400);
    const t1 = await gateInput.getAttribute("type");
    check("内测口令门：眼睛切换生效", t0 === "password" && t1 === "text", `${t0} → ${t1}`);
  } else {
    check("内测口令门：存在眼睛按钮", false);
  }
} else {
  skip("内测口令门：眼睛切换生效", "未出现口令输入框（可能已有 preview_auth）");
}
await gate.close();

await b.close();
const st = summary("verify-password-eye");
process.exit(st.fail === 0 ? 0 : 1);
