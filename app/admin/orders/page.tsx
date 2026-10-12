import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatYuan } from "@/lib/utils";
import { markShipped } from "@/app/admin/orders/actions";

const shipLabel: Record<string, string> = {
  pending: "待发货",
  shipped: "已发货",
  delivered: "已签收",
  returned: "退货",
};

export default async function AdminOrders() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { items: { include: { product: true } }, user: { select: { realName: true, email: true } } },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-brand-900">订单管理</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-brand-500">
            <th className="p-2">订单号</th>
            <th className="p-2">商品</th>
            <th className="p-2">买家</th>
            <th className="p-2">金额</th>
            <th className="p-2">支付</th>
            <th className="p-2">发货</th>
            <th className="p-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const addr = o.shippingAddress as { name?: string; phone?: string } | null;
            return (
              <tr key={o.id} className="border-b hover:bg-gray-50">
                <td className="p-2 text-brand-400">{o.orderNo}</td>
                <td className="p-2 text-brand-900">
                  {(o.items[0]?.snapshot as { name?: string })?.name || "商品"}
                </td>
                <td className="p-2 text-brand-600">{o.user?.realName || o.user?.email}</td>
                <td className="p-2">¥{formatYuan(o.payAmount)}</td>
                <td className="p-2">{o.status === "paid" ? "已付" : o.status}</td>
                <td className="p-2">
                  {addr ? shipLabel[o.shipStatus || "pending"] || "待发货" : "—"}
                </td>
                <td className="p-2">
                  {addr && o.status === "paid" && o.shipStatus !== "shipped" && (
                    <form action={markShipped}>
                      <input type="hidden" name="id" value={o.id} />
                      <button className="rounded bg-brand-800 px-2 py-1 text-xs text-white hover:bg-brand-700">
                        标记发货
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
          {orders.length === 0 && (
            <tr>
              <td colSpan={7} className="p-6 text-center text-brand-400">
                暂无订单
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
