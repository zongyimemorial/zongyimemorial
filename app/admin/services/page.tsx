import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SERVICE_STATUS_LABEL } from "@/lib/service";
import { updateServiceFulfillment } from "@/app/admin/services/actions";

export default async function AdminServices() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  const tickets = await prisma.serviceFulfillment.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { realName: true, email: true } } },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-brand-900">服务工单</h1>
      <p className="mb-4 text-xs text-brand-400">
        云祭扫、传记代写、追思视频、扫码云碑等人工服务，用户购买/兑换后自动生成受理单。
        受理后请在此标记「受理中 / 已完成 / 已驳回」并填写备注，状态会同步到用户控制台。
      </p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-brand-500">
            <th className="p-2">服务</th>
            <th className="p-2">买家</th>
            <th className="p-2">来源</th>
            <th className="p-2">需求</th>
            <th className="p-2">状态</th>
            <th className="p-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => {
            const source = t.orderId ? "现金" : t.redemptionId ? "积分" : "—";
            const handled = t.status === "done" || t.status === "rejected";
            return (
              <tr
                key={t.id}
                className="border-b align-top hover:bg-gray-50"
                data-service-id={t.id}
                data-service-status={t.status}
              >
                <td className="p-2 text-brand-900">
                  {t.productName}
                  <div className="text-xs text-brand-400">{t.type}</div>
                </td>
                <td className="p-2 text-brand-600">{t.user?.realName || t.user?.email}</td>
                <td className="p-2 text-brand-400">{source}</td>
                <td className="max-w-xs p-2 text-brand-500">
                  {t.intake ? (
                    t.intake
                  ) : (
                    <span className="text-brand-300">（待用户提交）</span>
                  )}
                  {t.contact && <div className="text-xs text-brand-400">联系：{t.contact}</div>}
                  {t.adminNote && (
                    <div className="mt-1 text-xs text-brand-400">备注：{t.adminNote}</div>
                  )}
                </td>
                <td className="p-2">{SERVICE_STATUS_LABEL[t.status] ?? t.status}</td>
                <td className="p-2">
                  <form action={updateServiceFulfillment} className="space-y-2">
                    <input type="hidden" name="id" value={t.id} />
                    <select
                      name="status"
                      defaultValue={t.status}
                      className="block rounded border border-brand-300 p-1 text-xs"
                    >
                      <option value="pending">待受理</option>
                      <option value="processing">受理中</option>
                      <option value="done">已完成</option>
                      <option value="rejected">已驳回</option>
                    </select>
                    <input
                      name="adminNote"
                      defaultValue={t.adminNote ?? ""}
                      placeholder="处理备注（会展示给用户）"
                      className="block w-40 rounded border border-brand-300 p-1 text-xs"
                    />
                    <button
                      type="submit"
                      className="block rounded bg-brand-800 px-2 py-1 text-xs text-white hover:bg-brand-700"
                    >
                      更新
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
          {tickets.length === 0 && (
            <tr>
              <td colSpan={6} className="p-6 text-center text-brand-400">
                暂无服务工单
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
