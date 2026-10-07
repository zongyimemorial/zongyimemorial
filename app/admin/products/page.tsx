import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fubFromFen, fubOnly } from "@/lib/fortune";
import type { ProductType } from "@prisma/client";

const typeLabel: Record<ProductType, string> = {
  subscription: "高级订阅",
  whisper_plan: "午夜悄悄话",
  memorial_hall: "数字纪念馆",
  cloud_worship: "云祭扫",
  virtual_flower: "虚拟献花",
  tribute_item: "纪念物品",
  physical_goods: "实体商品",
  memorial_service: "纪念服务",
  decor: "空间装修",
  storage: "存储空间",
  fortune_topup: "福币充值",
};

export default async function AdminProducts() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");

  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: { category: true },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-900">商品管理</h1>
        <Link
          href="/admin/products/new"
          className="rounded-md bg-brand-800 px-4 py-2 text-sm text-white hover:bg-brand-700"
        >
          + 新建商品
        </Link>
      </div>

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-brand-500">
            <th className="p-2">名称</th>
            <th className="p-2">类型</th>
            <th className="p-2">价格</th>
            <th className="p-2">销量</th>
            <th className="p-2">状态</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b hover:bg-gray-50">
              <td className="p-2 font-medium text-brand-900">{p.name}</td>
              <td className="p-2 text-brand-600">{typeLabel[p.type]}</td>
              <td className="p-2">¥{(p.price / 100).toFixed(2)}{" "}<span className="text-brand-400">/ {fubOnly(fubFromFen(p.price))}</span></td>
              <td className="p-2 text-brand-400">{p.salesCount}</td>
              <td className="p-2">
                <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                  {p.status === "active" ? "在售" : "下架"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
