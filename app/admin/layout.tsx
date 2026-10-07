import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { signOutAction } from "@/app/(public)/actions";

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "editor") redirect("/console");

  const nav = [
    { href: "/admin", label: "概览" },
    { href: "/admin/articles", label: "内容管理" },
    { href: "/admin/products", label: "商品管理" },
    { href: "/admin/orders", label: "订单管理" },
    { href: "/admin/live", label: "直播管理" },
    { href: "/admin/review", label: "内容审核" },
    { href: "/admin/points", label: "积分台账" },
    { href: "/admin/services", label: "服务工单" }
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-56 shrink-0 flex-col bg-brand-800 p-4 text-white">
        <div className="mb-6 text-sm font-bold tracking-wide">宗忆堂 · 管理后台</div>
        <nav className="space-y-1 text-sm">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-brand-100 hover:bg-brand-700"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* 底部：当前账号 + 返回前台 + 退出登录 */}
        <div className="mt-auto space-y-2 border-t border-white/10 pt-4 text-xs">
          <div className="px-1 text-brand-200">
            <div className="truncate" title={user.email ?? ""}>
              {user.name || user.email}
            </div>
            <div className="text-[10px] text-brand-300">
              {user.role === "admin" ? "管理员" : "编辑"}
            </div>
          </div>
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
