import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { INITIAL_POINTS, POINTS_PER_YUAN, REDEEM_DAILY_LIMIT, POINTS_VALID_MONTHS, INVITE_REGISTER_POINTS } from "@/lib/points";
import { fubFromFen } from "@/lib/fortune";
import PointsRedeemButton from "@/components/shop/PointsRedeemButton";
import type { ProductType } from "@prisma/client";

export const metadata = { title: "积分兑换" };

const earnRules = [
  { name: "新用户注册", point: `+${INITIAL_POINTS}`, note: "内测期间一次性发放，正式版不保留" },
  { name: "虚拟祭品消费", point: `消费¥1 = ${POINTS_PER_YUAN}积分`, note: "主要积分来源，模拟支付后按实付金额累计" },
  { name: "纪念馆创建", point: "+50", note: "一次性奖励，鼓励用户建馆" },
  { name: "每日登录祭拜", point: "+5 / 天", note: "提升日活，每天首次进入控制台发放" },
  { name: "邀请好友注册", point: `+${INVITE_REGISTER_POINTS} / 人`, note: "社交裂变（公网阶段上线）" },
  { name: "完善逝者档案", point: "+30", note: "丰富平台内容（公网阶段上线）" },
  { name: "发布追思留言", point: "+2 / 条", note: "每日上限 10 条（公网阶段上线）" },
];

const redeemRules = [
  "核心原则：第一阶段积分仅用于兑换虚拟产品，不涉及任何实体商品。",
  "兑换比例：基础祭品 100 积分 = ¥1；进阶祭品 150 积分 = ¥1；纪念馆模板 200 积分 = ¥1。",
  "支持「积分 + 积分」多件商品组合兑换，灵活消耗积分。",
  `每日兑换上限 ${REDEEM_DAILY_LIMIT} 积分；单笔兑换不限（按商品自身积分价扣减）。`,
  `积分有效期 ${POINTS_VALID_MONTHS} 个月，过期自动清零，请及时使用。`,
  "积分不做现金兑付、不对外交易；兑换为不可逆操作，请确认后提交。",
];

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

export default async function PointsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id! },
    select: { points: true },
  });
  const balance = dbUser?.points ?? 0;

  const redeemable = await prisma.product.findMany({
    where: { status: "active", pointsPrice: { not: null }, type: { not: "physical_goods" } },
    orderBy: { pointsPrice: "asc" },
  });

  const logs = await prisma.pointLog.findMany({
    where: { userId: user.id! },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="container-page max-w-4xl py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-brand-900">积分兑换</h1>
        <p className="mt-2 text-brand-500">
          内测期间可用积分兑换虚拟纪念服务。当前余额：
          <span className="font-bold text-amber-600">{balance}</span> 积分。
        </p>
      </header>

      <div className="mb-8 rounded-lg border border-brand-100 bg-brand-50 p-4 text-sm text-brand-700">
        需要更完整的规则说明、获取示例与折算比例？
        <Link
          href="/points/guide"
          className="font-medium text-accent-600 hover:underline"
        >
          查看积分规则详解 →
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 获取规则 */}
        <section className="rounded-lg border border-brand-200 bg-brand-100/70 p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-brand-800">积分获取规则</h2>
          <ul className="space-y-3 text-sm">
            {earnRules.map((r) => (
              <li key={r.name} className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-brand-900">{r.name}</div>
                  <div className="text-brand-400">{r.note}</div>
                </div>
                <span className="shrink-0 rounded bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">
                  {r.point}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* 兑换规则 */}
        <section className="rounded-lg border border-brand-200 bg-brand-100/70 p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-brand-800">积分兑换规则</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">
            {redeemRules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
            <li>
              兑换「电子讣告发布」后，请前往
              <Link href="/console/obituaries" className="mx-1 text-accent-600 hover:underline">
                我的控制台 → 我的讣告
              </Link>
              填写并发布，生成可分享的缅怀页。
            </li>
          </ul>
        </section>
      </div>

      {/* 可兑换商品 */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-brand-800">可用积分兑换的纪念服务</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {redeemable.map((p) => (
            <div key={p.id} className="rounded-lg border border-brand-200 bg-brand-100/70 p-5 shadow-sm">
              <div className="mb-2 text-xs text-brand-500">{typeLabel[p.type]}</div>
              <h3 className="text-lg font-semibold text-brand-900">{p.name}</h3>
              {p.description && (
                <p className="mt-2 line-clamp-2 text-sm text-gray-600">{p.description}</p>
              )}
              <div className="mt-3 text-sm text-amber-700">
                积分价：<span className="font-bold">{p.pointsPrice}</span> 积分
                <span className="text-brand-400">
                  （等价 {fubFromFen(p.price)} 福币）
                </span>
              </div>
              <PointsRedeemButton productId={p.id} pointsPrice={p.pointsPrice!} />
              <Link
                href={`/mall/${p.slug}`}
                className="mt-2 block text-center text-xs text-brand-500 hover:underline"
              >
                查看详情
              </Link>
            </div>
          ))}
          {redeemable.length === 0 && (
            <div className="rounded-lg border border-dashed border-brand-300 bg-brand-100/70 p-10 text-center text-sm text-brand-500">
              暂无可兑换商品
            </div>
          )}
        </div>
      </section>

      {/* 积分流水 */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-brand-800">我的积分明细</h2>
        <div className="overflow-x-auto rounded-lg border border-brand-200 bg-brand-100/70">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 text-left text-brand-700">
              <tr>
                <th className="p-3">时间</th>
                <th className="p-3">说明</th>
                <th className="p-3 text-right">变动</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-gray-50">
                  <td className="p-3 text-brand-400">
                    {new Date(l.createdAt).toLocaleString("zh-CN")}
                  </td>
                  <td className="p-3 text-gray-700">{l.reason}</td>
                  <td
                    className={`p-3 text-right font-semibold ${
                      l.amount >= 0 ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {l.amount >= 0 ? `+${l.amount}` : l.amount}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-brand-400">
                    暂无积分记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
