import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatYuan } from "@/lib/utils";
import { listHallLedger, HALL_STATUS_LABEL } from "@/lib/admin-ledger";

export const metadata = { title: "纪念馆消费台帐" };

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("zh-CN", { hour12: false });
}

export default async function HallLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const rows = await listHallLedger();

  const filtered = rows.filter((r) => {
    if (status && status !== "all" && r.status !== status) return false;
    if (q) {
      const needle = q.toLowerCase();
      const hay = `${r.name} ${r.sub} ${r.owner}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const grandFen = filtered.reduce((s, r) => s + r.totalFen, 0);
  const grandCount = filtered.reduce((s, r) => s + r.count, 0);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-brand-900">纪念馆消费台帐</h1>
      <p className="mb-6 text-sm text-brand-500">
        聚合级汇总：每座纪念馆的累计消费、笔数与供奉活跃度（按绑定本馆的订单 + 建馆订单统计，不暴露逐人明细）。
      </p>

      <form className="mb-5 flex flex-wrap items-end gap-3" action="/admin/ledger/halls">
        <div>
          <label className="mb-1 block text-xs text-brand-500">搜索</label>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="馆名 / 故人 / 归属人"
            className="rounded-md border border-brand-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-brand-500">状态</label>
          <select name="status" defaultValue={status ?? "all"} className="rounded-md border border-brand-300 px-3 py-2 text-sm">
            <option value="all">全部</option>
            <option value="active">已开通</option>
            <option value="pending">待审核</option>
            <option value="rejected">已驳回</option>
          </select>
        </div>
        <button className="rounded-md bg-brand-700 px-4 py-2 text-sm text-white hover:bg-brand-800">筛选</button>
        <Link href="/admin/ledger/halls" className="text-sm text-brand-500 hover:underline">重置</Link>
      </form>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-4">
          <div className="text-xs text-brand-500">筛选范围内纪念馆</div>
          <div className="mt-1 text-xl font-semibold text-brand-900">{filtered.length} 座</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-4">
          <div className="text-xs text-brand-500">累计消费合计</div>
          <div className="mt-1 text-xl font-semibold text-brand-900">¥{formatYuan(grandFen)}</div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-4">
          <div className="text-xs text-brand-500">消费笔数合计</div>
          <div className="mt-1 text-xl font-semibold text-brand-900">{grandCount} 笔</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-brand-200 bg-brand-100/70">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-brand-500">
            <tr>
              <th className="px-4 py-3">纪念馆</th>
              <th className="px-4 py-3">故人</th>
              <th className="px-4 py-3">归属人</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3 text-right">累计消费</th>
              <th className="px-4 py-3 text-right">笔数</th>
              <th className="px-4 py-3 text-right">供奉次数</th>
              <th className="px-4 py-3">最近消费</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-brand-50">
                <td className="px-4 py-3 font-medium text-brand-900">{r.name}</td>
                <td className="px-4 py-3 text-brand-600">{r.sub || "—"}</td>
                <td className="px-4 py-3 text-brand-600">{r.owner}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">{HALL_STATUS_LABEL[r.status] ?? r.status}</span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-brand-900">¥{formatYuan(r.totalFen)}</td>
                <td className="px-4 py-3 text-right text-brand-600">{r.count}</td>
                <td className="px-4 py-3 text-right text-brand-600">{r.tributeCount}</td>
                <td className="px-4 py-3 text-xs text-brand-400">{fmtDate(r.lastAt)}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/ledger/halls/${r.id}`} className="text-brand-700 hover:underline">查看明细 →</Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-brand-400">暂无符合条件的纪念馆</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
