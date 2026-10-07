import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { LiveStatus } from "@prisma/client";

const statusLabel: Record<LiveStatus, string> = {
  live: "直播中",
  ended: "回放",
  scheduled: "预告",
};

export default async function AdminLive() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");

  const lives = await prisma.liveSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-900">直播管理</h1>
        <Link
          href="/admin/live/new"
          className="rounded-md bg-brand-800 px-4 py-2 text-sm text-white hover:bg-brand-700"
        >
          + 新建直播
        </Link>
      </div>

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-brand-500">
            <th className="p-2">标题</th>
            <th className="p-2">状态</th>
            <th className="p-2">播放地址</th>
          </tr>
        </thead>
        <tbody>
          {lives.map((l) => (
            <tr key={l.id} className="border-b hover:bg-gray-50">
              <td className="p-2 font-medium text-brand-900">{l.title}</td>
              <td className="p-2 text-brand-600">{statusLabel[l.status]}</td>
              <td className="p-2 text-xs text-brand-400">{l.streamUrl || "—"}</td>
            </tr>
          ))}
          {lives.length === 0 && (
            <tr>
              <td colSpan={3} className="p-6 text-center text-brand-400">
                暂无直播
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
