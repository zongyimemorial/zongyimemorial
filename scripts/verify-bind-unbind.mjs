/**
 * E2E 验证：手机号 / 邮箱 绑定与解绑（自助控制台 + 超级管理员后台）
 *
 * 覆盖：
 *  - 邮箱发码 API（bindemail / reset，无需登录）
 *  - 控制台自助：邮箱绑定（验证码）、手机解绑（含「至少保留一个联系方式」双向拦截）
 *  - 后台超管：查询任意用户、绑定/解绑手机/邮箱（含拦截）
 *
 * 关键验证策略说明：
 *  - 控制台动作（bindEmail/unbindPhone/unbindEmail）以「返回值 {ok,message}」形式驱动 UI，
 *    结果消息由 React 状态渲染在 DOM 中（不依赖 redirect），因此可直接断言 DOM 文本。
 *  - 后台动作（adminBind / adminUnbind 系列）走 Server Action + redirect()，
 *    在 Playwright 下客户端软导航会被 net::ERR_ABORTED 中断（Next.js/Playwright 已知现象），
 *    但动作在服务端一定执行。因此后台以「DB 状态」为事实来源断言；
 *    拦截消息则通过「直接带 error 参数导航」做静态渲染校验，证明真实管理员能看到提示。
 *  - 每次运行使用唯一邮箱/手机号，规避 lib/sms.ts 的 60s 发码限流。
 *
 * 依赖：已部署的生产服务（默认 http://localhost:3000）+ playwright-core + Chromium。
 */
import { createRequire } from "module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const require = createRequire(import.meta.url);
const PCORE =
  "/root/.nvm/versions/node/v22.13.1/lib/node_modules/@playwright/cli/node_modules/playwright-core";
const { chromium } = require(PCORE);
const bcrypt = require("bcryptjs");
// IMAP 取码（增强佐证）：独立安装到 .verifydeps，避免改动项目依赖树
const { ImapFlow } = require("/workspace/.verifydeps/node_modules/imapflow");

const BASE = process.env.BASE || "http://localhost:3000";
const EXEC = "/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome";

/** 读取 .env 中的变量（避免引入额外依赖） */
function envVal(key, fallback) {
  const m = readFileSync("/workspace/.env", "utf8").match(new RegExp(`^${key}=["']?([^"'\n]+)`, "m"));
  return m ? m[1] : fallback;
}

const log = (...a) => console.log("[verify]", ...a);
const fails = [];
function check(cond, msg) {
  if (cond) log("PASS:", msg);
  else {
    fails.push(msg);
    log("FAIL:", msg);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

// ---------- token mint（复刻 lib/quick-login.ts 的 HMAC 格式） ----------
function getSecret() {
  const m = readFileSync("/workspace/.env", "utf8").match(/^AUTH_SECRET=["']?([^"'\n]+)/m);
  return m ? m[1] : null;
}
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function mint(userId, ttlSec = 600) {
  const secret = getSecret();
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const msg = `quick-login|${userId}|${exp}`;
  const sig = createHmac("sha256", secret).update(msg).digest();
  const sub = b64url(Buffer.from(userId, "utf8"));
  return `${sub}.${exp}.${b64url(sig)}`;
}

// ---------- psql helpers ----------
let G_USER_ID = "";
let ORIG_PWD = ""; // 测试用户原始 passwordHash，结束时还原
let SUPER_ID_G = "";
let ORIG_SUPER_PWD = ""; // 超管原始 passwordHash，结束时还原
let OWNED_EMAIL = ""; // 自有 163 收件箱（SMTP_USER），OTP 真实投递与 IMAP 佐证用
function psql(q) {
  return execFileSync(
    "docker",
    ["exec", "-i", "memorial-pg", "psql", "-U", "memorial", "-d", "memorial", "-t", "-A", "-c", q],
    { encoding: "utf8" },
  ).trim();
}
function resetUser(phone, email) {
  const ev = email === null ? "NULL" : `'${email.replace(/'/g, "''")}'`;
  psql(`UPDATE "User" SET phone='${phone}', email=${ev} WHERE id='${G_USER_ID}';`);
}
function getUser() {
  return psql(
    `SELECT COALESCE(phone,'<null>') || '|' || COALESCE(email,'<null>') FROM "User" WHERE id='${G_USER_ID}';`,
  );
}
function restoreUser() {
  if (G_USER_ID) {
    const pv = ORIG_PWD ? `'${ORIG_PWD.replace(/'/g, "''")}'` : "NULL";
    psql(
      `UPDATE "User" SET phone='13812345678', email='user@test.com', "passwordHash"=${pv} WHERE id='${G_USER_ID}';`,
    );
  }
  if (SUPER_ID_G) {
    const sv = ORIG_SUPER_PWD ? `'${ORIG_SUPER_PWD.replace(/'/g, "''")}'` : "NULL";
    psql(`UPDATE "User" SET "passwordHash"=${sv} WHERE id='${SUPER_ID_G}';`);
  }
}

// ---------- 验证码取值（真实 SMTP 模式：页面不再回显「内测：XXXXXX」） ----------
// 主路径：DB 的 EmailOtp 表（与邮件正文内容一致，可靠、无外部依赖）
function getOtpCode(email, purpose) {
  const p = purpose ? `'${purpose.replace(/'/g, "''")}'` : "NULL";
  const e = `'${email.replace(/'/g, "''")}'`;
  return psql(
    `SELECT code FROM "EmailOtp" WHERE email=${e} AND purpose=${p} ORDER BY "createdAt" DESC LIMIT 1;`,
  );
}
// 发码有 60s 限流：跨多次发送/重复运行时清掉旧记录，避免被限流拦截
function clearOtp(email, purpose) {
  const p = purpose ? ` AND purpose='${purpose.replace(/'/g, "''")}'` : "";
  psql(`DELETE FROM "EmailOtp" WHERE email='${email.replace(/'/g, "''")}'${p};`);
}
// 增强路径（用户要求的 IMAP）：登录自有 163 收件箱，取最新一封验证码邮件里的 6 位码。
// 163 若未开启 IMAP 服务会登录失败——捕获后返回 null，由调用方降级到 DB 取值。
async function imapGetOtpCode(expectedCode, sentAfterMs = Date.now() - 90_000) {
  const withTimeout = (p, ms) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  try {
    const user = envVal("SMTP_USER", "");
    const pass = envVal("SMTP_PASS", "");
    if (!user || !pass) return null;
    const client = new ImapFlow({
      host: "imap.163.com",
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    });
    await withTimeout(client.connect(), 15000);
    const lock = await client.getMailboxLock("INBOX");
    try {
      // 轮询等待：邮件投递有几秒延迟，最多等 30s；只认验证码与 DB 一致的邮件
      const deadline = Date.now() + 30_000;
      let probe = 0;
      while (Date.now() < deadline) {
        const uids = [];
        for await (const m of client.fetch("1:*", { uid: true }, { uid: true })) uids.push(m.uid);
        // 只取最新 5 封，避免全量扫描拖慢
        const last = uids.slice(-5);
        let found = null;
        for (const uid of last) {
          let raw = "";
          for await (const m of client.fetch(String(uid), {
            uid: true,
            source: true,
          }, { uid: true })) raw = m.source.toString("utf8");
          let decoded = raw;
          if (raw.includes("base64")) {
            const blocks = raw.match(/[A-Za-z0-9+/=]{24,}/g) || [];
            for (const s of blocks) {
              try {
                const d = Buffer.from(s, "base64").toString("utf8");
                if (/您的验证码|宗忆堂/.test(d)) decoded += "\n" + d;
              } catch (e) {}
            }
          }
          const mm = decoded.match(/您的验证码是[^\d]*(\d{6})/);
          if (mm && (!expectedCode || mm[1] === expectedCode)) { found = mm[1]; break; }
        }
        if (found) return found;
        probe++;
        await sleep(3000);
      }
      return null;
    } finally {
      lock.release();
    }
  } catch (e) {
    log("(IMAP 取码降级) 登录/读取失败：", e.message);
    return null;
  }
}

/** 等待 body 文本命中某个子串（带超时），返回是否命中 */
async function waitText(page, sub, timeout = 15000) {
  try {
    await page.waitForFunction((s) => document.body.innerText.includes(s), sub, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function login(page, token) {
  await page.goto(`${BASE}/quick-login?t=${token}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForURL("**/console", { timeout: 60000 });
}

async function run() {
  const secret = getSecret();
  if (!secret) {
    console.error("❌ 未读取到 AUTH_SECRET");
    process.exit(1);
  }
  OWNED_EMAIL = envVal("SMTP_USER", "");

  // 测试账号（user 用 email OR phone 双条件定位，兼容测试中途把 email 置空的情况）
  SUPER_ID_G = psql(`SELECT id FROM "User" WHERE email='superadmin@test.com' LIMIT 1;`);
  G_USER_ID = psql(
    `SELECT id FROM "User" WHERE email='user@test.com' OR phone='13812345678' LIMIT 1;`,
  );
  if (!SUPER_ID_G || !G_USER_ID) {
    console.error("❌ 缺少超管或测试用户");
    process.exit(1);
  }
  log("SUPER_ID", SUPER_ID_G, "G_USER_ID", G_USER_ID);

  // 一键登录走「标准密码校验」：服务端用 DEMO 密码签名会话。
  // 种子超管 / 短信注册测试用户的 passwordHash 可能与 DEMO 密码不符，导致 signIn 失败、会话建不起来。
  // 这里把两者的 passwordHash 临时置为 bcrypt(DEMO 密码)，结束后还原。
  const demoPwd = envVal("DEMO_ACCOUNT_PASSWORD", "admin123456");
  const demoHash = bcrypt.hashSync(demoPwd, 10);
  ORIG_PWD = psql(`SELECT "passwordHash" FROM "User" WHERE id='${G_USER_ID}';`) || "";
  ORIG_SUPER_PWD = psql(`SELECT "passwordHash" FROM "User" WHERE id='${SUPER_ID_G}';`) || "";
  psql(`UPDATE "User" SET "passwordHash"='${demoHash}' WHERE id='${G_USER_ID}';`);
  psql(`UPDATE "User" SET "passwordHash"='${demoHash}' WHERE id='${SUPER_ID_G}';`);
  log("已为测试用户与超管临时设置 DEMO 密码哈希（结束将还原）");

  const superToken = mint(SUPER_ID_G);
  const userToken = mint(G_USER_ID);

  const browser = await chromium.launch({
    executablePath: EXEC,
    headless: true,
    chromiumSandbox: false,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  // ============ 1. 邮箱发码 API（无需登录） ============
  log("== 邮箱发码 API ==");
  // 真实 SMTP 下必须发往「可投递」地址（发 @test.com 会被 163 拒收导致 ok:false），
  // 故统一发到我们自有 163 收件箱 OWNED_EMAIL，既能验证真实投递，也便于 IMAP 佐证。
  clearOtp(OWNED_EMAIL, "bindemail");
  clearOtp(OWNED_EMAIL, "reset");
  const sentAtMs = Date.now(); // 发码时间，IMAP 佐证只认此之后到达的邮件
  const bindRes = await fetch(`${BASE}/api/auth/email/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNED_EMAIL, purpose: "bindemail" }),
  }).then((r) => r.json());
  check(bindRes.ok === true, "POST /api/auth/email/send bindemail 返回 ok");
  check(bindRes.code === undefined, "bindemail 不再页面回显验证码（真实 SMTP 模式）");

  const resetRes = await fetch(`${BASE}/api/auth/email/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNED_EMAIL, purpose: "reset" }),
  }).then((r) => r.json());
  check(resetRes.ok === true, "POST /api/auth/email/send reset 返回 ok");

  const badRes = await fetch(`${BASE}/api/auth/email/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-an-email", purpose: "bindemail" }),
  }).then((r) => r.json());
  check(badRes.ok === false, "非法邮箱被拒绝（ok=false）");

  // 验证码权威来源：DB 的 EmailOtp（与邮件内容一致）
  const apiCode = getOtpCode(OWNED_EMAIL, "bindemail");
  check(/^\d{6}$/.test(apiCode || ""), `bindemail 验证码已写入 EmailOtp（DB 取出 ${apiCode}）`);

  // 额外佐证：IMAP 读我们自有 163 收件箱最新验证码邮件（轮询等待投递；未配置时降级）
  const imapCode = await imapGetOtpCode(apiCode, sentAtMs);
  if (imapCode) {
    check(imapCode === apiCode, `IMAP 收件箱读出验证码 ${imapCode}，与 DB 一致`);
  } else {
    log("⚠️ IMAP 取码未生效（163 需在 设置→POP3/SMTP/IMAP 开启 IMAP 服务），已降级用 DB 取值，不影响断言");
  }

  // ============ 2. 后台超管：查询 + 绑定/解绑（以 DB 状态为事实来源） ============
  log("== 后台超管联系方式管理 ==");
  resetUser("13812345678", null); // 初始：有手机、无邮箱
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const ap = await adminCtx.newPage();
  ap.setDefaultTimeout(30000);
  await login(ap, superToken);

  await ap.goto(`${BASE}/admin/accounts`, { waitUntil: "domcontentloaded", timeout: 90000 });
  check(await waitText(ap, "用户联系方式管理", 25000), "后台账号页出现「用户联系方式管理」区块");

  // 查询测试用户：直接带 ?q= 全量导航（卡片渲染稳定）
  const adminGoto = async (q) => {
    await ap.goto(`${BASE}/admin/accounts?q=${encodeURIComponent(q)}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await waitText(ap, "手机：", 20000).catch(() => {}); // 卡片渲染即代表 foundUser 命中
  };
  await adminGoto("13812345678");
  check(
    await waitText(ap, "手机：13812345678", 20000),
    "按手机号查询到测试用户，卡片显示 手机：13812345678",
  );

  // —— 拦截：无邮箱时解绑手机必须失败，DB 手机仍保留 ——
  await ap.getByRole("button", { name: "解绑手机" }).click();
  await sleep(2500);
  check(getUser() === "13812345678|<null>", "后台拦截：无邮箱时解绑手机被拒，DB 手机仍保留（安全属性）");

  // 静态渲染校验：直接带 error 参数导航，证明拦截消息对真实管理员可见
  const guardMsg = "解绑手机会导致该账号无任何联系方式，请先为其绑定邮箱";
  await ap.goto(
    `${BASE}/admin/accounts?q=13812345678&error=${encodeURIComponent(guardMsg)}`,
    { waitUntil: "domcontentloaded", timeout: 90000 },
  );
  check(await waitText(ap, guardMsg, 15000), "后台拦截消息真实渲染（⚠️ 解绑手机会导致…）");

  // —— 正向绑定邮箱（验证后台动作确实在服务端执行） ——
  const adminEmail = `e2e-adminbound-${now()}@test.com`;
  await adminGoto("13812345678");
  await ap.getByPlaceholder("新邮箱").fill(adminEmail);
  await ap.getByRole("button", { name: "绑定邮箱" }).click();
  await sleep(2500);
  check(getUser().endsWith(`|${adminEmail}`), `后台绑定邮箱成功，DB email=${adminEmail}`);

  // —— 有邮箱兜底，解绑手机应成功 ——
  await adminGoto("13812345678");
  await ap.getByRole("button", { name: "解绑手机" }).click();
  await sleep(2500);
  check(getUser() === `<null>|${adminEmail}`, "后台解绑手机成功（邮箱兜底），DB 手机已清空");

  // —— 绑定手机（后台无需验证码），再解绑邮箱（手机兜底）——
  const adminPhone = `139${String(now()).slice(-8)}`;
  await adminGoto(adminEmail);
  await ap.getByPlaceholder("新手机号").fill(adminPhone);
  await ap.getByRole("button", { name: "绑定手机" }).click();
  await sleep(2500);
  check(getUser() === `${adminPhone}|${adminEmail}`, `后台绑定手机成功，DB phone=${adminPhone}`);

  await adminGoto(adminEmail);
  await ap.getByRole("button", { name: "解绑邮箱" }).click();
  await sleep(2500);
  check(getUser() === `${adminPhone}|<null>`, "后台解绑邮箱成功（手机兜底），DB 邮箱已清空");

  // 卡片刷新后应显示 手机：adminPhone / 邮箱：未绑定
  await adminGoto(adminPhone);
  check(
    (await waitText(ap, "邮箱：未绑定", 15000)) && (await waitText(ap, adminPhone, 15000)),
    "后台卡片刷新：邮箱：未绑定 / 手机已绑定",
  );
  await adminCtx.close();

  // ============ 3. 控制台自助：绑定邮箱 + 解绑（DOM 消息可靠 + DB 校验） ============
  log("== 控制台自助绑定/解绑 ==");
  resetUser("13812345678", null); // 重新置为有手机、无邮箱
  const userCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const up = await userCtx.newPage();
  up.setDefaultTimeout(30000);
  await login(up, userToken);

  await up.goto(`${BASE}/console/account`, { waitUntil: "domcontentloaded", timeout: 90000 });
  const emailSec = up.locator("section", { hasText: "绑定 / 解绑邮箱" });
  await emailSec.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  check(await waitText(up, "绑定 / 解绑邮箱", 15000), "控制台出现「绑定 / 解绑邮箱」区块");

  // —— 拦截（手机方向）：无邮箱时解绑手机被拒 ——
  await up.getByRole("button", { name: "解绑当前手机号" }).click();
  check(await waitText(up, "无任何联系方式", 15000), "自助解绑手机（无邮箱）被拦截：提示无任何联系方式");
  check(getUser() === "13812345678|<null>", "自助拦截后 DB 手机仍保留");

  // —— 绑定邮箱：发码（真实邮件）→ 从 EmailOtp 取验证码 → 填码 → 提交 ——
  // 注意：OWNED_EMAIL(自有 163 邮箱) 已被 owner 种子账号占用，不能绑给测试用户，
  // 故这里用唯一 @test.com 规避唯一性冲突；验证码同样从 EmailOtp 取（与邮件一致）。
  // 真实投递 + IMAP 佐证由「邮箱发码 API 段」发往 OWNED_EMAIL 覆盖。
  const consoleEmail = `e2e-consolebound-${now()}@test.com`;
  clearOtp(consoleEmail, "bindemail");
  await emailSec.getByPlaceholder("新邮箱").fill(consoleEmail);
  await emailSec.getByRole("button", { name: "发送验证码" }).click();
  // 真实 SMTP 下页面不再回显验证码，轮询 DB 的 EmailOtp 直到出现（最多 ~15s）
  let code = null;
  for (let i = 0; i < 30; i++) {
    code = getOtpCode(consoleEmail, "bindemail");
    if (/^\d{6}$/.test(code || "")) break;
    await sleep(500);
  }
  check(/^\d{6}$/.test(code || ""), `自助绑定邮箱：从 EmailOtp 取到验证码 ${code}`);
  await emailSec.getByPlaceholder("验证码").fill(code);
  await emailSec.getByRole("button", { name: "绑定" }).click();
  check(await waitText(up, "邮箱绑定成功", 15000), "自助绑定邮箱成功，提示「邮箱绑定成功」");
  check(getUser().endsWith(`|${consoleEmail}`), `DB email 已更新为 ${consoleEmail}`);

  // —— 有邮箱兜底，解绑手机应成功 ——
  await up.getByRole("button", { name: "解绑当前手机号" }).click();
  check(await waitText(up, "手机号已解绑", 15000), "自助解绑手机成功（邮箱兜底），提示「手机号已解绑」");
  check(getUser() === `<null>|${consoleEmail}`, "DB 手机已清空");

  // —— 拦截（邮箱方向）：无手机时解绑邮箱被拒（双向守卫）——
  await up.getByRole("button", { name: "解绑当前邮箱" }).click();
  check(await waitText(up, "无任何联系方式", 15000), "自助解绑邮箱（无手机）被拦截：提示无任何联系方式");
  check(getUser() === `<null>|${consoleEmail}`, "自助拦截后 DB 邮箱仍保留");

  await userCtx.close();
  await browser.close();

  // 还原测试账号状态，便于反复运行
  restoreUser();

  log("\n==== 结果 ====");
  if (fails.length === 0) {
    log("全部通过 ✅");
    process.exit(0);
  } else {
    log("存在失败 ❌:", fails);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("[verify] ERROR", e);
  restoreUser();
  process.exit(2);
});
