import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createProduct } from "@/app/admin/products/actions";
import type { ProductType } from "@prisma/client";

const types: ProductType[] = [
  "physical_goods",
  "memorial_hall",
  "cloud_worship",
  "virtual_flower",
  "tribute_item",
];
const typeLabel: Record<ProductType, string> = {
  subscription: "高级订阅",
  whisper_plan: "午夜悄悄话",
  physical_goods: "实体商品",
  memorial_hall: "数字纪念馆",
  cloud_worship: "云祭扫",
  virtual_flower: "虚拟献花",
  tribute_item: "纪念物品",
  memorial_service: "纪念服务",
  decor: "空间装修",
  storage: "存储空间",
  fortune_topup: "福币充值",
};

export default async function NewProductPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");
  const categories = await prisma.category.findMany({ orderBy: { sort: "asc" } });

  const field = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold text-brand-900">新建商品</h1>
      <form action={createProduct} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">名称 *</label>
          <input name="name" required className={field} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">类型</label>
            <select name="type" className={field}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {typeLabel[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">价格（元）</label>
            <input name="price" type="number" step="0.01" className={field} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">栏目</label>
          <select name="categoryId" className={field}>
            <option value="">未选择</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">描述</label>
          <textarea name="description" rows={3} className={field} />
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand-800 px-5 py-2 text-sm text-white hover:bg-brand-700"
        >
          创建
        </button>
      </form>
    </div>
  );
}
