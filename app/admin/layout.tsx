import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { signOutAction } from "@/app/(public)/actions";
import { modulesForUser, ROLE_LABELS, isStaff } from "@/lib/permissions";
import AdminRouteGuard from "./AdminRouteGuard";

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStaff(user.role)) redirect("/console");

  // 按用户有效权限（显式 permissions 覆盖角色默认）过滤导航：
  // 超级管理员可见全部（含账号管理/操作审计），普通管理员按各自被授权的模块，
  // 编辑仅见内容/审核/监控/悄悄话。导航分两组：运营管理 + 系统管理（仅超管）。
  const allNav = modulesForUser(user.role, user.permissions).map((m) => ({
    href: m.href,
    label: m.label,
    system: !!m.superOnly,
  }));
  const opsNav = allNav.filter((n) => !n.system);
  const sysNav = allNav.filter((n) => n.system);
  const roleLabel = user.role ? ROLE_LABELS[user.role] : "游客";

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminRouteGuard role={user.role!} permissions={user.permissions} />

      <aside className="flex w-56 shrink-0 flex-col bg-brand-800 p-4 text-white">
        <div className="mb-6 text-sm font-bold tracking-wide">宗忆堂 · 管理后台</div>
        <nav className="space-y-1 text-sm">
          {opsNav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-brand-100 hover:bg-brand-700"
            >
              {item.label}
            </a>
          ))}

          {sysNav.length > 0 && (
            <>
              <div className="mt-5 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-brand-300">
                系统管理
              </div>
              <div className="space-y-1 border-l-2 border-amber-400/70 pl-1">
                {sysNav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="flex items-center justify-between rounded-md bg-amber-400/10 px-3 py-2 text-amber-200 hover:bg-amber-400/20"
                  >
                    <span>{item.label}</span>
                    <span className="rounded bg-amber-400/20 px-1 text-[10px]">超管</span>
                  </a>
                ))}
              </div>
            </>
          )}
        </nav>

        {/* 底部：当前账号 + 账号设置 + 返回前台 + 退出登录 */}
        <div className="mt-auto space-y-2 border-t border-white/10 pt-4 text-xs">
          <div className="px-1 text-brand-200">
            <div className="truncate" title={user.email ?? ""}>
              {user.name || user.email}
            </div>
            <div className="text-[10px] text-brand-300">{roleLabel}</div>
          </div>
          <Link
            href="/console/account"
            className="block rounded-md px-3 py-2 text-brand-100 hover:bg-brand-700"
          >
            账号设置（手机/邮箱）
          </Link>
          <Link
            href="/"
            className="block rounded-md px-3 py-2 text-brand-100 hover:bg-brand-700"
          >
            ← 返回前台
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full rounded-md border border-white/20 px-3 py-2 text-left text-brand-50 transition hover:bg-red-600/80"
            >
              退出登录
            </button>
          </form>
        </div>
      </aside>
      <div className="flex-1 p-8">{children}</div>
    </div>
  );
}
