import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatYuan } from "@/lib/utils";
import { getClanConsumption, HALL_STATUS_LABEL } from "@/lib/admin-ledger";

export const metadata = { title: "宗祠消费明细" };

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("zh-CN", { hour12: false });
}

export default async function ClanLedgerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clan = await prisma.clanHall.findUnique({
    where: { id },
    select: { surname: true, hallName: true, name: true, status: true, owner: { select: { realName: true, email: true } } },
  });
  const data = await getClanConsumption(id);

  if (!clan) {
    return (
      <div>
        <Link href="/admin/ledger/clans" className="text-sm text-brand-500 hover:underline">← 返回台帐</Link>
        <p className="mt-6 text-sm text-brand-400">宗祠不存在或已删除。</p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/admin/ledger/clans" className="text-sm text-brand-500 hover:underline">← 宗祠消费台帐</Link>
      <div className="mb-1 mt-3 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold text-brand-900">{clan.surname}氏{clan.hallName}</h1>
        <span className="text-sm text-brand-500">堂号：{clan.name || "—"}</span>
        <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">{HALL_STATUS_LABEL[clan.status] ?? clan.status}</span>
      </div>
      <p className="mb-6 text-sm text-brand-500">归属人：{clan.owner?.realName || clan.owner?.email || "—"}</p>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">累计消费</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">¥{formatYuan(data.totalFen)}</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">消费笔数</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{data.count}</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">供奉次数</div>
          <div className="mt-1 text-2xl font-semibold text-brand-900">{data.tributeCount}</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm text-brand-500">最近消费</div>
          <div className="mt-1 text-sm font-semibold text-brand-900">{fmtDate(data.lastAt)}</div>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-brand-700">按品类拆分</h2>
      <div className="overflow-x-auto rounded-xl border border-brand-200 bg-brand-100/70">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-brand-500">
            <tr>
              <th className="px-4 py-3">品类</th>
              <th className="px-4 py-3 text-right">消费金额</th>
              <th className="px-4 py-3 text-right">占比</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.byCategory.map((c) => (
              <tr key={c.type}>
                <td className="px-4 py-3 text-brand-900">{c.label}</td>
                <td className="px-4 py-3 text-right font-medium text-brand-900">¥{formatYuan(c.fen)}</td>
                <td className="px-4 py-3 text-right text-brand-500">
                  {data.totalFen > 0 ? ((c.fen / data.totalFen) * 100).toFixed(1) : "0.0"}%
                </td>
              </tr>
            ))}
            {data.byCategory.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-brand-400">该祠暂无已绑定消费</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-brand-700">近期订单</h2>
      <div className="overflow-x-auto rounded-xl border border-brand-200 bg-brand-100/70">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-brand-500">
            <tr>
              <th className="px-4 py-3">订单号</th>
              <th className="px-4 py-3">商品</th>
              <th className="px-4 py-3">买家</th>
              <th className="px-4 py-3 text-right">金额</th>
              <th className="px-4 py-3">时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.orders.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-3 text-brand-400">{o.orderNo}</td>
                <td className="px-4 py-3 text-brand-900">{o.items.map((i) => i.name).join("、") || "商品"}</td>
                <td className="px-4 py-3 text-brand-600">{o.buyer}</td>
                <td className="px-4 py-3 text-right font-medium text-brand-900">¥{formatYuan(o.payAmount)}</td>
                <td className="px-4 py-3 text-xs text-brand-400">{fmtDate(o.createdAt)}</td>
              </tr>
            ))}
            {data.orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-brand-400">暂无已付订单</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-brand-400">
        说明：祭品 / 云祭扫以「消耗式库存」在祠内供奉，购买时不绑定具体祠，故金额不计入本祠汇总，仅以「供奉次数」反映活跃度。
      </p>
    </div>
  );
}
