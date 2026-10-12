import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteLive } from "@/app/admin/live/actions";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import type { LiveStatus } from "@prisma/client";

const statusLabel: Record<LiveStatus, string> = {
  live: "直播中",
  ended: "回放",
  scheduled: "预告",
};

/**
 * 直播管理列表。
 *
 * ⚠️ 早先这里只有三列只读（标题/状态/地址），**没有任何操作入口** ——
 * 于是《直播指引》里「当天把状态改为直播中」「预告期可反复改」全落不了地。
 * 现在补上「操作」列（编辑 / 删除），并把开播·结束时间显示出来，
 * 让"改状态自动记时间"这件事在列表上直接可验证。
 */
export default async function AdminLive() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  const lives = await prisma.liveSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const fmt = (d: Date | null) =>
    d ? new Date(d).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand-900">直播管理</h1>
          <p className="mt-1 text-sm text-brand-500">
            不会填？先看{" "}
            <Link href="/live/guide" className="text-accent-600 underline">
              《云直播指引》
            </Link>
            ：从选平台到取地址、软硬件配置、发布前自检都有。
          </p>
        </div>
        <Link
          href="/admin/live/new"
          className="shrink-0 rounded-md bg-brand-800 px-4 py-2 text-sm text-white hover:bg-brand-700"
        >
          + 新建直播
        </Link>
      </div>

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-brand-500">
            <th className="p-2">标题</th>
            <th className="p-2">状态</th>
            <th className="p-2">开播 / 结束</th>
            <th className="p-2">播放地址</th>
            <th className="p-2 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {lives.map((l) => (
            <tr key={l.id} className="border-b hover:bg-gray-50">
              <td className="p-2 font-medium text-brand-900">{l.title}</td>
              <td className="p-2 text-brand-600">{statusLabel[l.status]}</td>
              <td className="whitespace-nowrap p-2 text-xs text-brand-400">
                {fmt(l.startedAt)} / {fmt(l.endedAt)}
              </td>
              <td className="max-w-[220px] truncate p-2 text-xs text-brand-400" title={l.streamUrl ?? ""}>
                {l.streamUrl || "—"}
              </td>
              <td className="whitespace-nowrap p-2 text-right">
                <Link
                  href={`/admin/live/${l.id}/edit`}
                  className="rounded-md border border-brand-300 px-3 py-1 text-xs text-brand-700 hover:border-accent-400"
                >
                  编辑
                </Link>
                <form action={deleteLive} className="ml-2 inline">
                  <input type="hidden" name="id" value={l.id} />
                  <ConfirmSubmitButton
                    message={`确定删除「${l.title}」？删除后不可恢复。`}
                    className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    删除
                  </ConfirmSubmitButton>
                </form>
              </td>
            </tr>
          ))}
          {lives.length === 0 && (
            <tr>
              <td colSpan={5} className="p-6 text-center text-brand-400">
                暂无直播
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
