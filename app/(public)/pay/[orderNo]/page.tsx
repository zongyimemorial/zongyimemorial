import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatYuan } from "@/lib/utils";
import SimulatePayButton from "@/components/shop/SimulatePayButton";

export default async function PayPage({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { orderNo } = await params;
  const order = await prisma.order.findUnique({
    where: { orderNo },
    include: { items: { include: { product: true } } },
  });
  if (!order || order.userId !== user.id) notFound();

  const paid = order.status === "paid";

  return (
    <div className="container-page max-w-md py-12">
      <h1 className="mb-6 text-2xl font-semibold text-brand-900">订单支付</h1>
      <div className="rounded-lg border border-brand-200 bg-brand-100/70 p-6">
        <div className="mb-4 text-sm text-brand-500">订单号：{order.orderNo}</div>
        <ul className="space-y-2 text-sm">
          {order.items.map((it) => (
            <li key={it.id} className="flex justify-between">
              <span className="text-gray-700">
                {(it.snapshot as { name?: string })?.name || "商品"} × {it.quantity}
              </span>
              <span className="text-gray-700">¥{formatYuan(it.unitPrice * it.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-brand-200 pt-3 text-base font-semibold text-brand-900">
          <span>应付</span>
          <span>¥{formatYuan(order.payAmount)}</span>
        </div>

        <div className="mt-6">
          {paid ? (
            <div className="rounded-md bg-green-50 px-4 py-3 text-center text-sm text-green-700">
              ✅ 已支付
            </div>
          ) : (
            <SimulatePayButton orderNo={order.orderNo} />
          )}
        </div>
        <p className="mt-3 text-xs text-brand-400">
          内测环境使用模拟支付通道（SIMULATE），不发生真实资金流。资质齐全后将接入微信/支付宝。
        </p>
      </div>
    </div>
  );
}
