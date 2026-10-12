"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canAccessForUser, isSystemOnlyPath } from "@/lib/permissions";
import type { UserRole } from "@prisma/client";

/**
 * 客户端路由守卫：后台内任何子页若当前用户无权访问，立即退回运营监控页。
 * 权限以「按用户有效权限」判定（显式 permissions 覆盖角色默认）。
 * 但「账号管理 / 操作审计」这类仅超管的系统级页面会自行渲染「权限不足」
 * 提示，守卫不抢先踢回，避免用户看不到说明。
 * 服务端页面另有一道 isStaff / isSuperAdmin 校验作为权威判定。
 */
export default function AdminRouteGuard({
  role,
  permissions,
}: {
  role: UserRole;
  permissions?: string[] | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (canAccessForUser(pathname, role, permissions)) return;
    // 系统级页面自行提示，不踢回
    if (isSystemOnlyPath(pathname)) return;
    router.replace("/admin");
  }, [pathname, role, permissions, router]);

  return null;
}
