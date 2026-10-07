import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatYuan } from "@/lib/utils";

export const metadata = { title: "后台概览" };

export default async function AdminDashboard() {
  const [
    articleCount,
    productCount,
    orderCount,
    pendingReview,
    paidOrders,
    hallCount,
    pendingHalls,
    userCount,
    pointLogs,
  ] = await Promise.all([
    prisma.article.count(),
    prisma.product.count({ where: { status: "active" } }),
    prisma.order.count(),
    prisma.moderationQueue.count({ where: { status: "pending" } }),
    prisma.order.aggregate({
      where: { status: "paid" },
      _sum: { payAmount: true },
    }),
    prisma.memorialHall.count(),
    prisma.memorialHall.count({ where: { status: "pending" } }),
    prisma.user.count(),
    prisma.pointLog.aggregate({
      where: { kind: "earn" },
      _sum: { amount: true },
    }),
  ]);

  const cards = [
    { label: "订单总数", value: String(orderCount), note: `成交额 ¥${formatYuan(paidOrders._sum.payAmount ?? 0)}` },
    { label: "在售商品", value: String(productCount), note: "虚拟产品线上架数" },
    { label: "注册用户", value: String(userCount), note: "含内测账号" },
    { label: "待审核", value: String(pendingReview), note: `含待审建馆 ${pendingHalls} 座` },
    { label: "文章", value: String(articleCount), note: "新闻/文化专栏" },
    { label: "数字纪念馆", value: String(hallCount), note: `其中审核中 ${pendingHalls} 座` },
    { label: "累计发放积分", value: String(pointLogs._sum.amount ?? 0), note: "积分台账（收入侧）" },
  ];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-brand-900">后台概览</h1>
      <p className="mb-6 text-sm text-brand-500">
        平台实时经营数据一览（依据第一阶段方案：仅虚拟产品，不涉及实体供应链）。
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="text-sm text-brand-500">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">{c.value}</div>
            <div className="mt-2 text-xs text-brand-500">{c.note}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link
          href="/admin/review"
          className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-brand-500"
        >
          <div className="text-sm font-semibold text-brand-900">内容审核队列</div>
          <div className="mt-1 text-xs text-brand-500">
            实名/建馆/评论/族谱/社区统一审核
          </div>
        </Link>
        <Link
          href="/admin/points"
          className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-brand-500"
        >
          <div className="text-sm font-semibold text-brand-900">积分台账</div>
          <div className="mt-1 text-xs text-brand-500">
            发放/兑换/过期明细，满足税务核查
          </div>
        </Link>
        <Link
          href="/admin/orders"
          className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-brand-500"
        >
          <div className="text-sm font-semibold text-brand-900">订单管理</div>
          <div className="mt-1 text-xs text-brand-500">交易与发货状态</div>
        </Link>
      </div>
    </div>
  );
}
