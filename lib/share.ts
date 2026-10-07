/**
 * 分享免口令令牌（内测阶段专用）。
 *
 * 背景：内测期全站被 /preview-gate 口令页拦着，分享出去的链接亲友点开只会看到口令页。
 * 但「一键分享」的产品承诺就是"点开即看"，两者直接冲突。
 *
 * 解法不是"给分享链接加个 ?share=1 就放行"——那是给全站开后门，
 * 任何人手拼参数即可绕过口令页。这里用 HMAC 签名把令牌**绑死到具体路径**：
 *
 *   令牌 = base64url(exp) + "." + base64url(HMAC-SHA256(secret, `${scope}|${pathname}|${exp}`))
 *
 * 于是：
 *   - 改路径 → 签名失配（拿纪念馆的令牌打不开宗祠页）；
 *   - 改有效期 → 签名失配（不能自己续期）；
 *   - 无密钥 → 无法伪造（AUTH_SECRET 只在服务端）。
 *
 * ⚠️ 安全边界（刻意的）：
 *   - 令牌只对**公开页面**有意义。中间件仍会做路径白名单校验（见 middleware.ts），
 *     所以即使有人拿到令牌，也打不开 /console /admin /pay 这些私有路径。
 *   - 令牌不携带任何身份信息，不登录、不授权任何写操作，仅"允许看一眼这个公开页"。
 *   - 有效期 60 天：足够社交平台慢速抓取与亲友晚点再点，又不会永不过期。
 *   - 撤门口（上线）后本模块可以整体不再被调用，令牌自然失效，零残留风险。
 *
 * ⚠️⚠️ 运行时分叉（2026-10 踩到的真 bug，务必读完再动这个文件）：
 *
 *   ⚠️⚠️ **本文件里绝不能出现任何 `node:crypto` 引用 —— 包括"惰性 import"。**
 *
 *   实测（2026-10 反向验证）：webpack 打包 Edge bundle 时，只要
 *   `import("node:crypto")` 出现在被 middleware import 链遍历到的模块里，
 *   构建就**直接失败**：
 *
 *     Module build failed: UnhandledSchemeError:
 *     Reading from "node:crypto" is not handled by plugins
 *
 *   连"静态引用一下但从不调用"也会触发。所以"惰性 import 就安全"是**错觉** ——
 *   安全的前提是**整个文件里根本没有它**。
 *
 *   因此本文件只用 Web Crypto（`globalThis.crypto.subtle`），
 *   它在 Node 18+ 与 Edge 里都存在，且都是标准 API。
 *   所有函数带 async —— 这是必要的代价，不是设计失误。
 *
 *   （同步版 API 已删除：它零调用方，留着只会是个构建期地雷。
 *     将来若确需 Node 侧同步 API，请新开 `lib/share-node.ts` 并加
 *     `import "server-only"`，让它在结构上不可能被 middleware 引用。）
 */

const TTL_SECONDS = 60 * 60 * 24 * 60; // 60 天

/** 读取签名密钥。缺失时返回 null —— 所有函数**倒向安全**（生成 null / 校验 false）。 */
function getSecret(): string | null {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 16) return null;
  return s;
}

// ---------------------------------------------------------------------------
// base64url（Edge 里没有 Buffer，用 btoa + 手工转义）
// ---------------------------------------------------------------------------

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // btoa 存在与否取决于运行时；Node 18+/Edge 都有全局 btoa
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

/** 定长常量时间比较（不依赖 node:crypto 的 timingSafeEqual）。 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Web Crypto HMAC
// ---------------------------------------------------------------------------

let keyPromise: Promise<CryptoKey> | null = null;

async function hmacKey(secret: string): Promise<CryptoKey> {
  // 同一进程内密钥不变，缓存派生结果（每次请求重新 importKey 很浪费）
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

async function sign(secret: string, scope: string, pathname: string, exp: number): Promise<Uint8Array> {
  const key = await hmacKey(secret);
  const msg = new TextEncoder().encode(`${scope}|${pathname}|${exp}`);
  const sig = await crypto.subtle.sign("HMAC", key, msg);
  return new Uint8Array(sig);
}

// ---------------------------------------------------------------------------
// 公开 API（异步）
// ---------------------------------------------------------------------------

/**
 * 为某个路径签发分享令牌。
 *
 * @param pathname 必须与将来访问的路径**逐字相同**（含尾部斜杠与否）。
 *                 签名绑死路径，是"令牌不能横向复用"的根据。
 * @param scope    语义标签（如 "hall" / "clan" / "news"），并入签名。
 * @returns 令牌串；密钥缺失或参数非法时返回 `null`（**不抛异常**：
 *          分享按钮应当优雅降级为"只复制链接"，而不是让整页崩掉）。
 */
export async function createShareToken(
  pathname: string,
  scope: string,
  now: Date = new Date(),
): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  if (!pathname.startsWith("/")) return null;
  if (!scope) return null;

  const exp = Math.floor(now.getTime() / 1000) + TTL_SECONDS;
  const sig = await sign(secret, scope, pathname, exp);
  return `${exp}.${bytesToB64url(sig)}`;
}

/**
 * 校验分享令牌是否对该路径有效。
 *
 * 全部失败路径都返回 `false`（倒向安全）：
 *   - 格式不对 / 无密钥 / 已过期 / 签名不符 / scope 不符 → false
 * 用常量时间比较，避免时序侧信道。
 */
export async function verifyShareToken(
  token: string | null | undefined,
  pathname: string,
  scope: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!token) return false;
  const secret = getSecret();
  if (!secret) return false;
  if (!scope) return false;

  const dot = token.indexOf(".");
  if (dot <= 0) return false;

  const expStr = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || !Number.isInteger(exp)) return false;
  if (exp * 1000 < now.getTime()) return false;

  const expected = await sign(secret, scope, pathname, exp);
  return constantTimeEqual(expected, b64urlToBytes(given));
}

/**
 * 把令牌拼到路径上，得到可分享的完整路径。
 * `createShareToken` 返回 null 时返回**原始路径**（优雅降级：链接仍可用，
 * 只是访客需要过口令页）。
 */
export async function withShareToken(
  pathname: string,
  scope: string,
  now: Date = new Date(),
): Promise<string> {
  const token = await createShareToken(pathname, scope, now);
  if (!token) return pathname;
  const sep = pathname.includes("?") ? "&" : "?";
  return `${pathname}${sep}share=${encodeURIComponent(token)}`;
}
