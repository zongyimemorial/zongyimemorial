import { headers } from "next/headers";

/**
 * 解析「当前请求真正被访问的源」。
 *
 * Auth.js 依据 AUTH_URL 决定跳转的绝对地址；内测阶段同一套服务可能同时被
 * 公网域名与本地端口访问，若跳转写死 AUTH_URL，就会出现
 * 「cookie 写在 A 域名、人被送到 B 域名」的丢登录问题。
 * 统一取请求自身的 Host，保证跳转回用户真正在用的域名。
 */
export async function currentOrigin(): Promise<string | null> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (!host) return null;
    const isLocal = host.startsWith("localhost") || host.startsWith("127.");
    const proto = h.get("x-forwarded-proto") || (isLocal ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}
