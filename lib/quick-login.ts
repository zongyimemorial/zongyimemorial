/**
 * 一键登录令牌（内测阶段专用）
 *
 * 用途：给测试/演示账号签发一条「手机点开即可登录」的链接，
 * 免去手输账号密码。典型场景：把链接发到手机微信群，点开即进控制台。
 *
 * 设计取舍（与 lib/share.ts 同源）：
 *   令牌 = base64url(userId) + "." + exp + "." + base64url(HMAC-SHA256(secret, `login|${userId}|${exp}`))
 *
 *   - **HMAC 签名**，密钥为 AUTH_SECRET（仅服务端持有）→ 无法伪造；
 *   - userId **明文可见但被签名覆盖** → 篡改 userId 会导致签名失配，不能"换个账号登"；
 *     （明文是必要的：校验时必须知道"这是给谁的令牌"才能重算签名。）
 *   - 绑死 exp → 不能自行续期；
 *   - 常量时间比较，避免时序侧信道。
 *
 * ⚠️ 安全边界（刻意的）：
 *   - **有效期极短**：默认 10 分钟（远短于分享令牌的 60 天）——
 *     登录令牌等价于"临时密码"，有效期必须足够小，降低链接被转发的风险。
 *   - 只在**内测期**启用；上线前应删除本模块与 `/quick-login` 路由。
 *   - 令牌**只用于登录**，不含任何其他权限；登录后走的是标准 JWT 会话，
 *     与正常密码登录完全等价（同样的 role / idVerified）。
 *
 * ⚠️ 与 lib/share.ts 同样的运行时分叉约束：
 *   **本文件绝不能出现 `node:crypto` 引用（含惰性 import）** ——
 *   原因见 lib/share.ts 顶部注释（webpack 打包 Edge bundle 会直接失败）。
 *   这里只用 Web Crypto（`globalThis.crypto.subtle`），Node 18+ 与 Edge 均可用。
 */

/** 一键登录令牌有效期：10 分钟 */
const TTL_SECONDS = 10 * 60;

/** 手机验证码登录的身份票据有效期：2 分钟（仅够 signIn 用一次） */
const SMS_TICKET_TTL_SECONDS = 2 * 60;

/** 签名 scope 常量（并入签名，避免与分享令牌互相冒用） */
const SCOPE = "quick-login";

/** 手机已验证票据的 scope（与一键登录隔离，两类票据不能互相冒用） */
const SCOPE_SMS = "sms-verified";

function getSecret(): string | null {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 16) return null;
  return s;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function b64urlToString(s: string): string {
  const bytes = b64urlToBytes(s);
  return new TextDecoder().decode(bytes);
}

function stringToB64url(s: string): string {
  return bytesToB64url(new TextEncoder().encode(s));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

let keyPromise: Promise<CryptoKey> | null = null;

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }
  return keyPromise;
}

async function sign(secret: string, scope: string, subject: string, exp: number): Promise<Uint8Array> {
  const key = await hmacKey(secret);
  const msg = new TextEncoder().encode(`${scope}|${subject}|${exp}`);
  const sig = await crypto.subtle.sign("HMAC", key, msg);
  return new Uint8Array(sig);
}

/** 通用：签发「scope + subject + exp」三元素的签名令牌 */
async function createTicket(
  scope: string,
  subject: string,
  ttlSec: number,
  now: Date,
): Promise<string | null> {
  const secret = getSecret();
  if (!secret || !subject || ttlSec <= 0) return null;
  const exp = Math.floor(now.getTime() / 1000) + ttlSec;
  const sig = await sign(secret, scope, subject, exp);
  return `${stringToB64url(subject)}.${exp}.${bytesToB64url(sig)}`;
}

/** 通用：校验令牌，返回其绑定的 subject（无效则 null） */
async function verifyTicket(
  scope: string,
  token: string | null | undefined,
  now: Date,
): Promise<string | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [subB64, expStr, sigB64] = parts;
  if (!subB64 || !expStr || !sigB64) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || !Number.isInteger(exp)) return null;
  if (exp * 1000 < now.getTime()) return null;

  let subject: string;
  try {
    subject = b64urlToString(subB64);
  } catch {
    return null;
  }
  if (!subject) return null;

  const expected = await sign(secret, scope, subject, exp);
  try {
    return constantTimeEqual(expected, b64urlToBytes(sigB64)) ? subject : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 一键登录令牌（scope = quick-login，subject = userId）
// ---------------------------------------------------------------------------

/**
 * 为某个用户签发一键登录令牌。
 *
 * @param userId  目标用户的 User.id（明文可见但被签名覆盖，篡改即失配）
 * @param ttlSec  有效期秒数（默认 600 = 10 分钟）
 * @returns 令牌串；密钥缺失时返回 `null`（倒向安全，不抛异常）
 */
export async function createQuickLoginToken(
  userId: string,
  ttlSec: number = TTL_SECONDS,
  now: Date = new Date(),
): Promise<string | null> {
  return createTicket(SCOPE, userId, ttlSec, now);
}

/**
 * 校验一键登录令牌，返回其绑定的 userId（无效则 null）。
 *
 * 全部失败路径返回 null：格式错 / 无密钥 / 过期 / 签名不符。
 */
export async function verifyQuickLoginToken(
  token: string | null | undefined,
  now: Date = new Date(),
): Promise<string | null> {
  return verifyTicket(SCOPE, token, now);
}

// ---------------------------------------------------------------------------
// 手机已验证票据（scope = sms-verified，subject = phone）
// ---------------------------------------------------------------------------
//
// 为什么需要它：`authorize` 原本靠一个**明文参数** `smsMode=1` 跳过密码校验，
// 于是任何人 POST /api/auth/callback/credentials 带上它即可免密登录任意账号
// （含管理员）—— 实测确凿（2026-10）。
//
// 修法：验证码校验**通过之后**由服务端签发一张短时效票据，`authorize` 只认票据。
// 票据绑定手机号 + HMAC 签名 + 2 分钟过期，客户端无法伪造。

/** 验证码校验通过后签发「手机已验证」票据（2 分钟有效） */
export async function createSmsVerifiedTicket(
  phone: string,
  ttlSec: number = SMS_TICKET_TTL_SECONDS,
  now: Date = new Date(),
): Promise<string | null> {
  return createTicket(SCOPE_SMS, phone, ttlSec, now);
}

/**
 * 校验「手机已验证」票据，返回其绑定的手机号（无效则 null）。
 *
 * 这是 `authorize` 判断"能否免密登录"的**唯一依据** ——
 * 不再有任何明文开关可以绕过。
 */
export async function verifySmsVerifiedTicket(
  token: string | null | undefined,
  now: Date = new Date(),
): Promise<string | null> {
  return verifyTicket(SCOPE_SMS, token, now);
}
