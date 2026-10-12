// 方案 B 端到端冒烟：¥10 购买「声音克隆资格」→ 解锁克隆入口
// 验证点：
//   1) 免费档未申请时，克隆入口锁定（提交审核横幅 + 资格申请框 + 上传按钮禁用 + 服务端 403）
//   2) 走 /mall/whisper-clone → 模拟支付 → DB.cloneApplied=true
//   3) 解锁后：横幅消失 + 「克隆资格已申请」绿框 + 上传按钮可用 + 服务端放行
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const { chromium } = pkg;

const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`PASS  ${name}  ${extra}`); }
  else { fail++; console.log(`FAIL  ${name}  ${extra}`); }
}

function sql(q) {
  return execSync(
    `docker exec -i memorial-pg psql -U memorial -d memorial -t -A -F '|' -c ${JSON.stringify(q)}`,
    { encoding: "utf8" },
  ).trim();
}

const profileId = sql(
  `SELECT p.id FROM "WhisperProfile" p JOIN "User" u ON u.id=p."ownerUserId" WHERE u.email='user@test.com' LIMIT 1;`,
);
const userId = sql(`SELECT id FROM "User" WHERE email='user@test.com';`);
console.log(`profileId=${profileId}  userId=${userId}`);

// —— 重置为「免费档 + 未申请 + 无克隆声线」的干净基线（名下全部装置） ——
sql(`UPDATE "WhisperProfile" SET "cloneApplied"=false WHERE "ownerUserId"='${userId}';`);
sql(`UPDATE "WhisperQuota" SET plan='free', "monthlyMins"=0, "monthlyRounds"=30, "extraMins"=0, "periodEnd"=NULL WHERE "userId"='${userId}';`);
sql(`DELETE FROM "WhisperVoice" WHERE "profileId"='${profileId}' AND "isPreset"=false;`);
console.log(`重置基线：cloneApplied=${sql(`SELECT "cloneApplied" FROM "WhisperProfile" WHERE id='${profileId}';`)}`);

// 生成一个最小有效 WAV（用于服务端上传闸门验证）
function makeWavB64() {
  const sr = 8000, dur = 1, n = sr * dur;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) { const s = Math.round(Math.sin(i / 12) * 3000); buf.writeInt16LE(s, o); o += 2; }
  return buf.toString("base64");
}
const wavB64 = makeWavB64();
writeFileSync("/tmp/whisper-sample.wav", Buffer.from(wavB64, "base64"));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

async function login() {
  for (let a = 1; a <= 2; a++) {
    try {
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      if (!(await page.locator('input[name="identifier"]').count())) {
        if (!page.url().includes("/login")) return true;
        continue;
      }
      await page.fill('input[name="identifier"]', "user@test.com");
      await page.fill('input[name="password"]', "user123456");
      await Promise.all([
        page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 }),
        page.click('button[type="submit"]'),
      ]);
      await page.waitForTimeout(2000);
      return !page.url().includes("/login");
    } catch {
      if (a === 2) return false;
      await page.waitForTimeout(2000);
    }
  }
  return false;
}
check("登录成功", await login());

// ===================== 阶段 1：购买前 —— 克隆入口应锁定 =====================
await page.goto(`${BASE}/console/whispers/${profileId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
const beforeBody = await page.locator("body").innerText();
check("购买前·提交审核横幅提示「尚未解锁声音克隆资格」", beforeBody.includes("尚未解锁声音克隆资格"));
check("购买前·显示资格申请引导框（体验版不含额度）", beforeBody.includes("不含声音克隆额度"));
const uploadBtn = page.locator('button:has-text("上传样本并创建声线")').first();
check("购买前·上传按钮禁用（canClone=false）", (await uploadBtn.count()) > 0 && (await uploadBtn.isDisabled()));

// 服务端闸门：直接 POST 上传接口应被 403 拦截
const gateBefore = await page.evaluate(async ({ pid, b64 }) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const fd = new FormData();
  fd.set("file", new Blob([arr], { type: "audio/wav" }), "s.wav");
  const r = await fetch(`/api/whispers/${pid}/upload`, { method: "POST", body: fd });
  return { status: r.status, body: await r.json() };
}, { pid: profileId, b64: wavB64 });
check("购买前·服务端上传接口拒绝 403", gateBefore.status === 403, `HTTP ${gateBefore.status} ${gateBefore.body?.error ?? ""}`);
check("购买前·拒绝文案含「尚未解锁声音克隆资格」", String(gateBefore.body?.error ?? "").includes("尚未解锁声音克隆资格"));

// ===================== 阶段 2：走真实 UI 购买 ¥10 克隆资格 =====================
await page.goto(`${BASE}/mall/whisper-clone`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
check("商品页可达", page.url().includes("/mall/whisper-clone"));
const buyBtn = page.locator('button:has-text("立即购买")').first();
check("商品页·存在「立即购买」按钮", (await buyBtn.count()) > 0);
if ((await buyBtn.count()) > 0) {
  await buyBtn.click();
  // BuyButton 下单后 router.push(`/pay/${orderNo}`)
  try {
    await page.waitForURL((u) => u.pathname.startsWith("/pay/"), { timeout: 30000 });
  } catch {
    check("下单→跳转 /pay 成功", false, page.url());
  }
  check("下单→跳转 /pay 成功", page.url().includes("/pay/"), page.url());

  const payBtn = page.locator('button:has-text("确认模拟支付（内测）")').first();
  check("支付页·存在模拟支付按钮", (await payBtn.count()) > 0);
  if ((await payBtn.count()) > 0) {
    await payBtn.click();
  }
}
// 等待 DB.cloneApplied 置位（SimulatePayButton 会在 900ms 后跳 /console）
let applied = false;
for (let i = 0; i < 20; i++) {
  const v = sql(`SELECT "cloneApplied" FROM "WhisperProfile" WHERE id='${profileId}';`);
  if (v === "t" || v === "true") { applied = true; break; }
  await new Promise((r) => setTimeout(r, 500));
}
check("支付后·DB.cloneApplied=true", applied, `cloneApplied=${sql(`SELECT "cloneApplied" FROM "WhisperProfile" WHERE id='${profileId}';`)}`);

// 确认订单确实是 whisper-clone 且金额 ¥10
const orderInfo = sql(
  `SELECT o."payAmount", p.slug FROM "Order" o JOIN "OrderItem" i ON i."orderId"=o.id JOIN "Product" p ON p.id=i."productId" WHERE o."userId"='${userId}' ORDER BY o."createdAt" DESC LIMIT 1;`,
);
check("下单商品=whisper-clone 且金额 ¥10", orderInfo.includes("whisper-clone") && orderInfo.startsWith("1000|"), orderInfo);

// ===================== 阶段 3：购买后 —— 克隆入口应解锁 =====================
await page.goto(`${BASE}/console/whispers/${profileId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
const afterBody = await page.locator("body").innerText();
check("购买后·「尚未解锁声音克隆资格」横幅消失", !afterBody.includes("尚未解锁声音克隆资格"));
check("购买后·显示「克隆资格已申请」绿框", afterBody.includes("克隆资格已申请"));
const uploadBtn2 = page.locator('button:has-text("上传样本并创建声线")').first();
check("购买后·上传按钮可用（canClone=true）", (await uploadBtn2.count()) > 0 && !(await uploadBtn2.isDisabled()));

// 服务端闸门：购买后直接 POST 上传接口应放行
const gateAfter = await page.evaluate(async ({ pid, b64 }) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const fd = new FormData();
  fd.set("file", new Blob([arr], { type: "audio/wav" }), "s.wav");
  const r = await fetch(`/api/whispers/${pid}/upload`, { method: "POST", body: fd });
  return { status: r.status, body: await r.json() };
}, { pid: profileId, b64: wavB64 });
check("购买后·服务端上传接口放行（200/ok）", gateAfter.status === 200 && gateAfter.body?.ok === true, `HTTP ${gateAfter.status} ${gateAfter.body?.error ?? ""}`);

// ===================== 收尾 =====================
const realErrors = errors.filter(
  (e) => !/favicon|Download the React DevTools/i.test(e) && !/403 \(Forbidden\)/.test(e),
);
check("无控制台错误", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n===== 方案 B 克隆解锁冒烟：${pass}/${pass + fail} PASS =====`);
if (fail > 0) process.exit(1);
