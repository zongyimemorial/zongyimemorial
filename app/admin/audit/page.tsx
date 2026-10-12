import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isSuperAdmin, ROLE_LABELS } from "@/lib/permissions";

export const metadata = { title: "操作审计" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const me = await getCurrentUser();
  if (!me || !isSuperAdmin(me.role)) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-amber-300 bg-amber-50 p-8 text-center shadow">
        <div className="mb-2 text-lg font-semibold text-amber-800">权限不足</div>
        <p className="text-sm text-amber-700">
          「操作审计」为<b>系统级功能</b>，仅<b>超级管理员</b>可访问。
        </p>
        <p className="mt-3 text-xs text-amber-600">
          请使用超级管理员账号 <code className="rounded bg-amber-100 px-1">superadmin@test.com</code> 登录后再操作。
        </p>
        <p className="mt-4 text-xs text-amber-500">
          当前账号：{me?.email ?? "未登录"}（{me?.role ? ROLE_LABELS[me.role] : "—"}）
        </p>
        <div className="mt-5">
          <a
            href="/admin"
            className="inline-block rounded-md bg-brand-700 px-4 py-2 text-sm text-white hover:bg-brand-800"
          >
            返回运营监控
          </a>
        </div>
      </div>
    );
  }

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    where: q ? { action: { contains: q } } : undefined,
  });

  const userIds = Array.from(new Set(logs.map((l) => l.userId).filter(Boolean))) as string[];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, realName: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">操作审计</h1>
        <p className="mt-1 text-sm text-gray-500">
          仅超级管理员可访问。记录全部管理员的关键操作（账号管理、审核决策等），最近 200 条。
        </p>
      </div>

      <form className="flex items-center gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="按动作关键字过滤（如 account_ / clan_hall_）"
          className="w-80 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          过滤
        </button>
        {q && (
          <a href="/admin/audit" className="text-sm text-brand-700 underline hover:text-brand-900">
            清除
          </a>
        )}
      </form>

      <section className="rounded-lg bg-white p-6 shadow">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500">
            <tr>
              <th className="py-2 pr-2">时间</th>
              <th className="py-2 pr-2">操作人</th>
              <th className="py-2 pr-2">动作</th>
              <th className="py-2 pr-2">实体</th>
              <th className="py-2">对象 ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-400">
                  暂无审计记录
                </td>
              </tr>
            )}
            {logs.map((log) => {
              const u = log.userId ? userMap.get(log.userId) : undefined;
              const operator = u ? (u.realName || u.email) : log.userId || "系统";
              return (
                <tr key={log.id} className="align-top">
                  <td className="py-2 pr-2 whitespace-nowrap text-gray-500">
                    {log.createdAt.toLocaleString("zh-CN")}
                  </td>
                  <td className="py-2 pr-2">{operator}</td>
                  <td className="py-2 pr-2 font-mono text-xs text-gray-700">{log.action}</td>
                  <td className="py-2 pr-2 text-gray-500">{log.entity ?? "—"}</td>
                  <td className="py-2 font-mono text-xs text-gray-400">{log.entityId ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
