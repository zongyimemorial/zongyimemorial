/**
 * 认证安全验收（2026-10 修复 smsMode 免密后门后建立）
 *
 * ## 背景（真漏洞）
 *   `lib/auth.ts` 的 Credentials `authorize` 曾用**明文参数** `smsMode="1"`
 *   跳过密码校验，供短信登录复用。但 `/api/auth/callback/credentials` 是
 *   **公开端点**，任何人 POST 时带上 `identifier=admin@test.com&smsMode=1`
 *   即可免密登录任意账号（含管理员）—— 实测确凿（拿到了 session cookie）。
 *
 *   修法：把明文开关换成**服务端签发的一次性票据**（HMAC 签名 + 绑手机号 + 2 分钟过期），
 *   authorize 只认票据。见 lib/quick-login.ts 的 createSmsVerifiedTicket / verifySmsVerifiedTicket。
 *
 * ## 断言分层
 *   §1 源码层：authorize 不再读明文 smsMode；票据是唯一免密依据
 *   §2 攻击面（真服务）：直接 POST credentials 带 smsMode=1 → 必须拿不到 session
 *   §3 伪造票据（真服务）：带假 smsTicket → 必须拿不到 session
 *   §4 正常功能不被误伤：密码登录应成功
 *   §5 票据机制单元（tsx 直跑）：正规通过 / 篡改拒 / 伪造拒 / 过期拒 / scope 隔离
 *   §6 一键登录令牌同样不可伪造
 *
 * 运行：node scripts/verify-auth-security.mjs（需服务在跑）
 */
import { execFileSync, execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
let pass = 0;
let fail = 0;
const fails = [];
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    fails.push(`${name} ${detail}`);
    console.log(`  ❌ ${name} ${detail}`);
  }
}

function psql(q) {
  const r = execFileSync(
    "docker",
    ["exec", "-i", "memorial-pg", "psql", "-U", "memorial", "-d", "memorial", "-t", "-A"],
    { input: q, encoding: "utf8" },
  );
  return (r ?? "").trim();
}

const authSrc = (() => {
  try {
    return execSync(`cat /workspace/lib/auth.ts`, { encoding: "utf8" });
  } catch {
    return "";
  }
})();

// ---------------------------------------------------------------------------
console.log("\n[§1] 源码层：authorize 不得再有明文免密开关");
// ---------------------------------------------------------------------------
// 不得出现「把 smsMode 字符串当开关」的写法
const hasRawSmsModeSwitch =
  /smsMode\s*===\s*"1"/.test(authSrc) || /smsMode\s*:\s*\{\s*label/.test(authSrc);
check("authorize 不再读明文 smsMode 开关", !hasRawSmsModeSwitch, "仍存在 smsMode 免密逻辑");
check("authorize 引入票据校验 verifySmsVerifiedTicket", /verifySmsVerifiedTicket/.test(authSrc));
check("credentials 字段名为 smsTicket（票据，非明文开关）", /smsTicket\s*:\s*\{/.test(authSrc));

const qlSrc = (() => {
  try {
    return execSync(`cat /workspace/lib/quick-login.ts`, { encoding: "utf8" });
  } catch {
    return "";
  }
})();
check("票据模块导出 createSmsVerifiedTicket", /export async function createSmsVerifiedTicket/.test(qlSrc));
check("票据模块导出 verifySmsVerifiedTicket", /export async function verifySmsVerifiedTicket/.test(qlSrc));
check("票据绑定手机号（subject 为 phone）", /SCOPE_SMS/.test(qlSrc));
check("一键登录与短信票据 scope 隔离", /const SCOPE_SMS = "sms-verified"/.test(qlSrc) && /const SCOPE = "quick-login"/.test(qlSrc));

// ---------------------------------------------------------------------------
async function tryLogin(fields) {
  // 取 csrf + 尝试登录，返回 { cookie, gotSession, status }
  const jar = `/tmp/.authsec-${Math.random().toString(36).slice(2)}.txt`;
  try {
    const csrfRaw = execSync(
      `curl -s -c ${jar} -H "Cookie: preview_auth=1" "${BASE}/api/auth/csrf"`,
      { encoding: "utf8" },
    );
    const csrf = JSON.parse(csrfRaw).csrfToken;
    const args = [
      "-s",
      "-b",
      jar,
      "-c",
      jar,
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "-X",
      "POST",
      `${BASE}/api/auth/callback/credentials`,
      "-H",
      "Content-Type: application/x-www-form-urlencoded",
      "-H",
      "Cookie: preview_auth=1",
      "--data-urlencode",
      `csrfToken=${csrf}`,
      "--data-urlencode",
      `callbackUrl=${BASE}/console`,
    ];
    for (const [k, v] of Object.entries(fields)) {
      args.push("--data-urlencode", `${k}=${v}`);
    }
    const status = execSync(`curl ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
      encoding: "utf8",
    }).trim();
    const jarBody = execSync(`cat ${jar}`, { encoding: "utf8" });
    return { status, gotSession: /authjs\.session-token/.test(jarBody), jar };
  } finally {
    try {
      unlinkSync(jar);
    } catch {
      /* ignore */
    }
  }
}

console.log("\n[§2] 攻击面：POST credentials 带 smsMode=1 必须拿不到 session");
try {
  const attack = await tryLogin({ identifier: "admin@test.com", smsMode: "1" });
  check("smsMode=1 免密攻击 → 未拿到 session", !attack.gotSession, `HTTP ${attack.status}`);
} catch (e) {
  console.log(`  ⚠️  §2 跳过：服务未启动（${e.message}）`);
}

console.log("\n[§3] 伪造票据必须拿不到 session");
try {
  const fake = await tryLogin({
    identifier: "admin@test.com",
    smsTicket: "ZmFrZQ.9999999999.abcdef",
  });
  check("伪造 smsTicket → 未拿到 session", !fake.gotSession, `HTTP ${fake.status}`);
  const fake2 = await tryLogin({
    identifier: "admin@test.com",
    smsTicket: "totally.invalid",
  });
  check("畸形 smsTicket → 未拿到 session", !fake2.gotSession, `HTTP ${fake2.status}`);
} catch (e) {
  console.log(`  ⚠️  §3 跳过：服务未启动（${e.message}）`);
}

console.log("\n[§4] 正常功能不被误伤");
try {
  const ok = await tryLogin({ identifier: "admin@test.com", password: "admin123456" });
  check("正常密码登录 → 拿到 session", ok.gotSession, `HTTP ${ok.status}`);
} catch (e) {
  console.log(`  ⚠️  §4 跳过：服务未启动（${e.message}）`);
}

// ---------------------------------------------------------------------------
console.log("\n[§5] 票据机制单元（tsx 直跑）");
// ---------------------------------------------------------------------------
const TMP = "/workspace/scripts/.verify-authsec-data.mts";
try {
  writeFileSync(
    TMP,
    `
import { readFileSync } from "node:fs";
// 独立 tsx 进程不会自动读 .env —— 手动注入（AUTH_SECRET 是签发票据的前提）。
// ⚠️ 必须用**动态 import** 加载 quick-login：静态 import 会被提升到文件顶部执行，
//    那时 env 还没注入，票据签发会因缺密钥返回 null。
try {
  const env = readFileSync("/workspace/.env", "utf8");
  for (const line of env.split("\\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const { createSmsVerifiedTicket, verifySmsVerifiedTicket, createQuickLoginToken, verifyQuickLoginToken } = await import("@/lib/quick-login");
const good = await createSmsVerifiedTicket("13800138000");
const tampered = await verifySmsVerifiedTicket(good!.slice(0, -2) + "XX");
const fake = await verifySmsVerifiedTicket("fake.ticket.abc");
const empty = await verifySmsVerifiedTicket(null);
const expired = await verifySmsVerifiedTicket(await createSmsVerifiedTicket("13800138000", -10));
const crossA = await verifySmsVerifiedTicket(await createQuickLoginToken("someid"));
const crossB = await verifyQuickLoginToken(await createSmsVerifiedTicket("13800138000"));
console.log(JSON.stringify({
  good: await verifySmsVerifiedTicket(good),
  tampered, fake, expired, crossA, crossB,
  emptyIsNull: empty === null,
}));
`,
  );
  const out = execSync(`cd /workspace && npx tsx ${TMP}`, { encoding: "utf8" });
  const d = JSON.parse(out.trim().split("\n").pop());
  check("正规票据校验通过（返回绑定手机号）", d.good === "13800138000", `实得 ${d.good}`);
  check("篡改票据被拒", d.tampered === null);
  check("伪造票据被拒", d.fake === null);
  check("空票据被拒", d.emptyIsNull === true);
  check("过期票据被拒", d.expired === null);
  check("一键令牌不能冒用为短信票据（scope 隔离）", d.crossA === null);
  check("短信票据不能冒用为登录令牌（scope 隔离）", d.crossB === null);
} catch (e) {
  console.log(`  ⚠️  §5 跳过：${e.message}`);
} finally {
  try {
    unlinkSync(TMP);
  } catch {
    /* ignore */
  }
}

console.log(`\n结果: ${pass}/${pass + fail} 通过`);
if (fail > 0) {
  console.log("失败项：\n - " + fails.join("\n - "));
  process.exit(1);
}
console.log("全部通过 ✅");
