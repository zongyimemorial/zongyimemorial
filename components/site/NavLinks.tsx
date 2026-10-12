"use client";

import { usePathname } from "next/navigation";

/**
 * 顶部导航（第二行）
 * - 高亮跟随真实路径：当前板块用墨色胶囊底 + 白字，其余为普通文字链接；
 *   「午夜悄悄话」不再永久高亮（此前误导用户以为它始终是当前页）。
 * - 仍统一用整页硬跳转（<a>）：隧道抖动时软导航会静默失败，
 *   硬跳转由浏览器原生负责，可重试、前进后退天然可靠。
 * - usePathname 在硬跳转后同样拿到新路径，高亮状态始终正确。
 */
const ITEMS: { href: string; label: string; exact?: boolean; moon?: boolean }[] = [
  { href: "/", label: "首页", exact: true },
  { href: "/halls", label: "数字纪念馆" },
  { href: "/whispers", label: "午夜悄悄话", moon: true },
  { href: "/clan", label: "宗亲文化" },
  { href: "/memorial", label: "公益纪念" },
  { href: "/mall", label: "虚拟祭品" },
  { href: "/festivals", label: "追思节日" },
  { href: "/live", label: "云直播" },
  { href: "/news", label: "新闻资讯" },
  { href: "/gallery/decor", label: "装修案例" },
  { href: "/points", label: "积分兑换" },
  { href: "/faq", label: "常见问题" },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavLinks() {
  const pathname = usePathname() || "/";

  return (
    <nav className="flex items-center justify-between gap-1 overflow-x-auto py-2 text-[14px]">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href, item.exact);
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-brand-900 px-3 py-1.5 font-semibold text-white shadow-sm transition"
                : "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 font-medium text-brand-900 transition hover:bg-brand-200/60 hover:text-accent-700"
            }
          >
            {item.moon && <span aria-hidden="true">🌙</span>}
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
