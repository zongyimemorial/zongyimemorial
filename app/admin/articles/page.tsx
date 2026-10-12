import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const statusLabel: Record<string, string> = {
  draft: "草稿",
  review: "待审",
  published: "已发布",
  rejected: "已驳回",
};

export default async function AdminArticles() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  const articles = await prisma.article.findMany({
    orderBy: { createdAt: "desc" },
    include: { category: true },
    take: 100,
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-900">内容管理</h1>
        <Link
          href="/admin/articles/new"
          className="rounded-md bg-brand-800 px-4 py-2 text-sm text-white hover:bg-brand-700"
        >
          + 新建文章
        </Link>
      </div>

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-brand-500">
            <th className="p-2">标题</th>
            <th className="p-2">栏目</th>
            <th className="p-2">状态</th>
            <th className="p-2">更新时间</th>
            <th className="p-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((a) => (
            <tr key={a.id} className="border-b hover:bg-gray-50">
              <td className="p-2 font-medium text-brand-900">{a.title}</td>
              <td className="p-2 text-brand-600">{a.category?.name ?? "-"}</td>
              <td className="p-2">
                <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                  {statusLabel[a.status] ?? a.status}
                </span>
              </td>
              <td className="p-2 text-brand-400">
                {new Date(a.updatedAt).toLocaleDateString("zh-CN")}
              </td>
              <td className="p-2">
                <Link href={`/admin/articles/${a.id}`} className="text-brand-600 hover:underline">
                  编辑
                </Link>
              </td>
            </tr>
          ))}
          {articles.length === 0 && (
            <tr>
              <td colSpan={5} className="p-6 text-center text-brand-400">
                暂无文章，点击右上角“新建文章”
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
