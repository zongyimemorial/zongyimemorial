import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ModerationStatus } from "@prisma/client";
import { deleteActivity } from "./actions";

const reviewLabel: Record<ModerationStatus, string> = {
  pending: "待审",
  approved: "已发布",
  rejected: "已驳回",
};
const reviewCls: Record<ModerationStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

export default async function AdminActivities() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  const activities = await prisma.clanActivity.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      clanHall: { select: { hallName: true, surname: true } },
      createdBy: { select: { realName: true, email: true } },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand-900">宗族活动</h1>
          <p className="mt-1 text-sm text-brand-500">
            平台级活动的发布、编辑与下架。祠主在各自宗祠控制台发布的本族活动会先进入「内容审核」待审队列。
          </p>
        </div>
        <Link
          href="/admin/activities/new"
          className="shrink-0 rounded-md bg-brand-800 px-4 py-2 text-sm text-white hover:bg-brand-700"
        >
          + 新建活动
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-brand-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-brand-100/80 text-xs text-brand-600">
            <tr>
              <th className="px-3 py-3 font-medium">标题</th>
              <th className="px-3 py-3 font-medium">类型</th>
              <th className="px-3 py-3 font-medium">面向</th>
              <th className="px-3 py-3 font-medium">活动时间</th>
              <th className="px-3 py-3 font-medium">地点</th>
              <th className="px-3 py-3 font-medium">主办方</th>
              <th className="px-3 py-3 font-medium">审核</th>
              <th className="px-3 py-3 text-right font-medium">报名</th>
              <th className="px-3 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.id} className="border-t border-brand-100 hover:bg-brand-50/50">
                <td className="px-3 py-3 font-medium text-brand-900">{a.title}</td>
                <td className="px-3 py-3 text-brand-600">{a.kind}</td>
                <td className="px-3 py-3 text-brand-600">{a.surname ? `${a.surname}氏` : "全体"}</td>
                <td className="px-3 py-3 text-brand-600">{new Date(a.startAt).toLocaleString("zh-CN", { hour12: false })}</td>
                <td className="px-3 py-3 text-brand-500">{a.location}</td>
                <td className="px-3 py-3 text-brand-500">
                  {a.clanHall ? `${a.clanHall.hallName}（祠主发布）` : a.createdBy ? "平台发布" : "平台发布"}
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${reviewCls[a.reviewStatus]}`}>
                    {reviewLabel[a.reviewStatus]}
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-brand-600">
                  {a.signupCount}/{a.capacity}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Link href={`/admin/activities/${a.id}`} className="text-accent-600 hover:underline">
                      编辑
                    </Link>
                    <form action={deleteActivity}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="text-red-500 hover:underline">
                        删除
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {activities.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-brand-400">
                  暂无活动，点击右上角「新建活动」发布
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
