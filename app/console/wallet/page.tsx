import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TOPUP_TIERS, formatFub, fortuneSummary } from "@/lib/fortune";
import { expirePointsForUser } from "@/lib/points";
import WalletPanel from "@/components/console/WalletPanel";
import { createFortuneTopupOrder } from "./actions";

export const metadata = { title: "我的钱包" };

const KIND_LABEL: Record<string, string> = {
  topup: "充值",
  bonus: "赠送",
  spend: "消费",
  adjust: "调整",
};

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // 顺手结算过期积分，让「福币 / 积分」两栏的余额口径一致（积分有 12 个月有效期，福币没有）
  await expirePointsForUser(user.id!);

  const [summary, dbUser, logs] = await Promise.all([
    fortuneSummary(user.id!),
    prisma.user.findUnique({ where: { id: user.id! }, select: { points: true } }),
    prisma.fortuneLog.findMany({
      where: { userId: user.id! },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="container-page max-w-3xl py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-900">我的钱包</h1>
        <Link href="/console" className="text-sm text-brand-500 hover:text-accent-600">
          ← 返回控制台
        </Link>
      </div>

      {/* 余额卡：福币 / 积分 / 累计充值 三栏并排，一眼看清两条轨 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4" data-wallet-summary>
        <div className="rounded-lg border border-accent-200 bg-accent-50 p-4">
          <div className="text-xs text-brand-500">福币余额</div>
          <div className="mt-1 text-2xl font-bold text-accent-700" data-wallet-balance>
            {summary.balance}
          </div>
          <div className="mt-0.5 text-xs text-brand-400">≈ ¥{summary.balance} · 永久有效</div>
        </div>
        <Link
          href="/points"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300"
        >
          <div className="text-xs text-brand-500">积分余额</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{dbUser?.points ?? 0}</div>
          <div className="mt-0.5 text-xs text-brand-400">12 个月有效 · 去兑换</div>
        </Link>
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <div className="text-xs text-brand-500">累计充值</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{summary.totalTopup}</div>
          <div className="mt-0.5 text-xs text-brand-400">元</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <div className="text-xs text-brand-500">累计赠送</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{summary.totalBonus}</div>
          <div className="mt-0.5 text-xs text-brand-400">福币</div>
        </div>
      </div>

      <WalletPanel
        tiers={TOPUP_TIERS.map((t) => ({ pay: t.pay, bonus: t.bonus }))}
        createOrder={createFortuneTopupOrder}
      />

      {/* 流水 */}
      <div className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-brand-900">福币流水</h2>
        {logs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-brand-500">
            还没有福币记录，充值后这里会显示明细。
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white" data-fortune-logs>
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="text-brand-800">{l.reason}</div>
                  <div className="mt-0.5 text-xs text-brand-400">
                    {KIND_LABEL[l.kind] ?? l.kind} ·{" "}
                    {new Date(l.createdAt).toLocaleString("zh-CN", { hour12: false })}
                  </div>
                </div>
                <div
                  className={`font-semibold ${l.amount >= 0 ? "text-accent-700" : "text-brand-500"}`}
                >
                  {l.amount >= 0 ? "+" : ""}
                  {l.amount}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-6 text-xs text-brand-400">
        福币用于购买平台全部产品（{formatFub(59)} 这类价格即以福币计），
        <strong>永久有效、不清零</strong>；积分赠送与换购政策不变，两者可叠加使用。
      </p>
    </div>
  );
}
