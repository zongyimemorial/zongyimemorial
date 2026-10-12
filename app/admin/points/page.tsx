import Link from "next/link";
import { prisma } from "@/lib/db";

export const metadata = { title: "积分台账" };

const kindLabel: Record<string, string> = {
  earn: "发放",
  redeem: "兑换",
  expire: "过期作废",
  adjust: "后台调整",
};

export default async function AdminPointsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  const { kind, q } = await searchParams;

  const where: Record<string, unknown> = {};
  if (kind && kindLabel[kind]) where.kind = kind;
  if (q) {
    where.OR = [
      { reason: { contains: q, mode: "insensitive" } },
      { user: { email: { contains: q, mode: "insensitive" } } },
      { user: { phone: { contains: q } } },
    ];
  }

  const [logs, summary] = await Promise.all([
    prisma.pointLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { email: true, phone: true, realName: true } } },
    }),
    prisma.pointLog.groupBy({
      by: ["kind"],
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const totalEarn = summary.find((s) => s.kind === "earn")?._sum.amount ?? 0;
  const totalRedeem = Math.abs(summary.find((s) => s.kind === "redeem")?._sum.amount ?? 0);
  const totalExpire = Math.abs(summary.find((s) => s.kind === "expire")?._sum.amount ?? 0);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-brand-900">积分台账</h1>
      <p className="mb-6 text-sm text-brand-500">
        完整记录积分发放、兑换、过期作废明细，满足税务核查与递延收益核算要求。
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="累计发放" value={totalEarn} tone="earn" />
        <Stat label="累计兑换" value={totalRedeem} tone="redeem" />
        <Stat label="过期作废" value={totalExpire} tone="expire" />
        <Stat label="净存量（发放-兑换-作废）" value={totalEarn - totalRedeem - totalExpire} tone="net" />
      </div>

      <form className="mb-5 flex flex-wrap items-end gap-3" action="/admin/points">
        <div>
          <label className="mb-1 block text-xs text-brand-500">类型</label>
          <select
            name="kind"
            defaultValue={kind ?? ""}
            className="rounded-md border border-brand-300 px-3 py-2 text-sm"
          >
            <option value="">全部</option>
            <option value="earn">发放</option>
            <option value="redeem">兑换</option>
            <option value="expire">过期作废</option>
            <option value="adjust">后台调整</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-brand-500">用户/原因</label>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="邮箱、手机号或原因"
            className="rounded-md border border-brand-300 px-3 py-2 text-sm"
          />
        </div>
        <button className="rounded-md bg-brand-700 px-4 py-2 text-sm text-white hover:bg-brand-800">
          筛选
        </button>
        <Link href="/admin/points" className="text-sm text-brand-500 hover:underline">
          重置
        </Link>
      </form>

      <div className="overflow-x-auto rounded-xl border border-brand-200 bg-brand-100/70">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-brand-500">
            <tr>
              <th className="px-4 py-3">时间</th>
              <th className="px-4 py-3">用户</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3 text-right">积分变动</th>
              <th className="px-4 py-3">原因</th>
              <th className="px-4 py-3">有效期</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3 text-xs text-brand-500">
                  {new Date(l.createdAt).toLocaleString("zh-CN")}
                </td>
                <td className="px-4 py-3 text-xs text-brand-700">
                  {l.user?.realName || l.user?.email || l.user?.phone || l.userId}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                    {kindLabel[l.kind] ?? l.kind}
                  </span>
                </td>
                <td
                  className={
                    "px-4 py-3 text-right font-medium " +
                    (l.amount >= 0 ? "text-red-600" : "text-green-600")
                  }
                >
                  {l.amount >= 0 ? "+" : ""}
                  {l.amount}
                </td>
                <td className="px-4 py-3 text-xs text-brand-600">{l.reason}</td>
                <td className="px-4 py-3 text-xs text-brand-400">
                  {l.expireAt ? new Date(l.expireAt).toLocaleDateString("zh-CN") : "—"}
                  {l.expired ? "（已作废）" : ""}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-brand-400">
                  暂无积分流水
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-brand-400">最多展示最近 200 条。</p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "earn" | "redeem" | "expire" | "net";
}) {
  const color =
    tone === "earn"
      ? "text-red-600"
      : tone === "redeem"
        ? "text-blue-600"
        : tone === "expire"
          ? "text-gray-500"
          : "text-brand-900";
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-4">
      <div className="text-xs text-brand-500">{label}</div>
      <div className={"mt-1 text-xl font-semibold " + color}>{value}</div>
    </div>
  );
}
