"use client";

import Link from "next/link";
import type { ReactNode } from "react";

// 统一“返回”链接：优先整页硬跳转（隧道抖动时也能可靠返回），
// 而非 Next 软导航（软导航 RSC 拉取失败会表现为“返回键没反应”）。
export default function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={
        className ??
        "inline-flex items-center gap-1 text-sm text-brand-600 transition hover:text-accent-600"
      }
    >
      <span aria-hidden>←</span>
      {children ?? "返回"}
    </a>
  );
}
