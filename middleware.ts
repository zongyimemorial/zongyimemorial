import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyShareToken } from "@/lib/share";

// 内测访问口令：未持 preview_auth cookie 一律挡到 /_preview_gate
// 仅放行：口令页本身、解锁接口、静态资源、登录与认证回调（过口令后才能用 /login）
const ALLOWED_PREFIXES = [
  "/preview-gate",
  "/api/preview-unlock",
  // 一键登录（内测演示用）：手机点链接即登录，不能先被口令页拦住。
  // 安全性由令牌本身保证（HMAC 签名 + 10 分钟有效期，见 lib/quick-login.ts）。
  "/quick-login",
  "/login",
  "/forgot-password",
  "/api/auth",
  // 已上传的图片资源：由 /uploads/[...path] 路由读盘返回。
  // 图片本身不是敏感内容（链接不可枚举），放行可避免 <img> 被 307 挡住。
  "/uploads",
  // 品牌静态素材（public/assets 打包进库，零敏感）：next/image 迁移后，
  // 图片优化器在服务端 self-fetch 源图（/_next/image → /assets/xxx.png），
  // 内部请求不带 preview_auth cookie → 被 307 → 优化器拿到门页 HTML → 全部 400
  // （"The requested resource isn't a valid image ... received null"，实测踩到）。
  // 裸 <img> 时代浏览器带着 cookie 所以无恙；这是图片迁移的必要配套。
  "/assets",
];

// ---------------------------------------------------------------------------
// P0 增长基建（2026-10）：搜索引擎爬虫与社交分享卡抓取器放行公开页。
//
// 为什么放行：/preview-gate 全站拦截曾是 SEO 的头号杀手——爬虫每次来访都吃 307，
// 全站 41 个公开页在搜索引擎里一条都收不到。内测门的真实目的是挡住「真人流量」，
// 不是挡搜索引擎；收录越早，上线时的自然流量池越厚。
//
// 边界（三条，缺一不可）：
//   1. 私有路径（console/admin/pay）对爬虫**同样拦截**——robots.ts 里 disallow 的
//      路径这里必须不放行，两道边界口径一致；
//   2. 口令页 /preview-gate 自身已在 ALLOWED_PREFIXES（页面模板里加了 noindex，
//      爬虫能到达但不会收录）；
//   3. 上线撤门口，删除本文件的口令检查即可，此段放行逻辑可原样保留。
//
// UA 清单含社交分享抓取器（facebookexternalhit / twitterbot / whatsapp / slackbot /
// telegrambot）：微信/微博/QQ 分享卡片靠它们抓 OG 标签，挡了它们分享出去就是白板。
// ---------------------------------------------------------------------------
const CRAWLER_UA =
  /bot|spider|crawler|slurp|archiver|facebookexternalhit|twitterbot|whatsapp|slackbot|telegrambot|linkedinbot|embedly|skypeuripreview/i;

// 与 app/robots.ts 的 disallow 保持同口径
const PRIVATE_PREFIXES = ["/console", "/admin", "/pay"];

// ---------------------------------------------------------------------------
// 分享免口令放行（2026-10）：朋友圈点开即看。
//
// 内测期全站拦口令，但「一键分享」的承诺是点开即看 —— 两者直接冲突。
// 解法**不是**加个 `?share=1` 就放行（那是全站后门），而是 HMAC 签名令牌
// 绑死到具体路径（见 lib/share.ts）。这里做**三点判据，缺一不可**：
//
//   1. 路径必须在 SHAREABLE 白名单内（三类公开页）；
//   2. 令牌签名必须对该**逐字相同的 pathname** 有效（含 scope）；
//   3. 必须是 GET / HEAD（分享是"看一眼"，不得放行写操作）。
//
// 私有路径（/console /admin /pay）**永远不放行**，即使拿着有效令牌：
// 白名单与 PRIVATE_PREFIXES 在结构上互斥，这里再显式短路一次。
//
// 放行时**顺手种下 preview_auth cookie**：访客从分享链接进来后，站内继续
// 浏览（点进其他公开页）不再被口令页打断 —— 否则点第二下又被挡，体验断裂。
// ---------------------------------------------------------------------------
function shareablePathScope(pathname: string): string | null {
  if (PRIVATE_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  if (/^\/news\/[^/]+$/.test(pathname)) return "news";
  if (/^\/halls\/[^/]+$/.test(pathname)) return "hall";
  if (/^\/clan\/halls\/[^/]+$/.test(pathname)) return "clan";
  if (/^\/obituary\/[^/]+$/.test(pathname)) return "obituary";
  return null;
}

async function allowByShareToken(req: NextRequest, pathname: string): Promise<NextResponse | null> {
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;

  const scope = shareablePathScope(pathname);
  if (!scope) return null;

  const token = req.nextUrl.searchParams.get("share");
  // verifyShareToken 是 async（Web Crypto，运行时无关）——
  // ⚠️ 这里**必须 await**，否则拿到的是 Promise（恒真），等于白名单内一律放行。
  if (!(await verifyShareToken(token, pathname, scope))) return null;

  const res = NextResponse.next();
  res.cookies.set("preview_auth", "1", {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 60,
  });
  return res;
}


export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const res = NextResponse.next();
    // 登录页与找回密码页禁止缓存：避免重新部署后浏览器沿用旧 HTML/JS 缓存，
    // 导致登录/重置提交仍走已失效的逻辑而无限“登录中…”。
    if (pathname === "/login" || pathname === "/forgot-password") {
      res.headers.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, max-age=0"
      );
    }
    return res;
  }

  const authed = req.cookies.get("preview_auth")?.value;
  if (authed === "1") {
    return NextResponse.next();
  }

  // 已登录用户（持有会话令牌）等同已通过内测，
  // 直接放行受保护页，避免「登录成功 → 跳 /console → 被 307 弹回口令页」的断裂体验。
  // 内测门是软性挡访客，不是安全边界；私有页由 auth() 独立校验，伪造令牌进不去。
  const session = req.cookies.get("authjs.session-token")?.value;
  if (session) {
    return NextResponse.next();
  }

  // 分享签名令牌：白名单路径 + 签名有效 + GET/HEAD → 放行并种 cookie
  const shared = await allowByShareToken(req, pathname);
  if (shared) return shared;

  // 爬虫 / 社交抓取器：公开页放行；私有路径照旧挡（口径与 robots.ts 一致）
  const ua = req.headers.get("user-agent") || "";
  if (CRAWLER_UA.test(ua) && !PRIVATE_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 基于请求自身的 Host 构造重定向 URL（隧道下保持公开域名，不会跳内网 localhost）。
  // no-store：避免 307 重定向被浏览器/隧道缓存，导致“后退”时回放到门口页形成死循环。
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const dest = new URL("/preview-gate", `${proto}://${host}`);
  const res = NextResponse.redirect(dest);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export const config = {
  // 全站拦截，但放行静态资源与图标（避免样式/CSS 被挡）
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
