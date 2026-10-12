import Link from "next/link";
import { notFound } from "next/navigation";
import { isPremium as isPremiumUser } from "@/lib/premium";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import GenealogyChart from "@/components/clan/GenealogyChart";
import {
  CHART_META,
  chartConfigFromGenealogy,
  chartStats,
  isChartUnlocked,
  parseMembers,
  type ChartType,
} from "@/lib/genealogy-chart";

export default async function GenealogyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const g = await prisma.genealogy.findUnique({
    where: { id },
    include: { owner: { select: { realName: true, email: true } } },
  });
  if (!g) notFound();

  const isOwner = !!user?.id && g.ownerId === user.id;
  if (!isOwner && (g.status !== "approved" || !g.isPublic)) notFound();

  if (!isOwner) {
    prisma.genealogy
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => {});
  }

  const dbUser = user?.id
    ? await prisma.user.findUnique({ where: { id: user.id }, select: { premiumUntil: true } })
    : null;
  const isPremium = isPremiumUser(dbUser);

  const members = parseMembers(g.membersJson);
  const unlocked = g.chartUnlocked ?? [];
  const config = chartConfigFromGenealogy(
    {
      surname: g.surname,
      hallName: g.hallName,
      origin: g.origin,
      chartType: g.chartType,
      chartConfig: g.chartConfig,
    },
    { isPremium, unlocked },
  );
  const stats = chartStats(members);
  const meta = CHART_META[config.type as ChartType] ?? CHART_META.ou;
  const requested = (g.chartType ?? "ou") as ChartType;
  const requestedLocked = !isChartUnlocked(requested, { isPremium, unlocked });

  return (
    <div className="container-page max-w-5xl py-10">
      <nav className="mb-5 text-sm text-brand-400">
        <Link href="/clan" className="hover:text-brand-700">
          宗亲文化交流
        </Link>{" "}
        /{" "}
        <Link href="/clan/genealogy" className="hover:text-brand-700">
          族谱数字化数据库
        </Link>{" "}
        / {g.surname}氏族谱
      </nav>

      {isOwner && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
          <span
            className={
              "rounded px-2 py-1 " +
              (g.status === "approved"
                ? "bg-emerald-100 text-emerald-700"
                : g.status === "pending"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-600")
            }
          >
            {g.status === "approved" ? "已通过审核" : g.status === "pending" ? "待审核（仅你可见）" : "已驳回"}
          </span>
          <Link
            href={`/clan/genealogy/${g.id}/design`}
            className="rounded bg-brand-800 px-3 py-1 text-white hover:bg-brand-700"
          >
            {members.length ? "继续设计族谱图 →" : "开始设计族谱图 →"}
          </Link>
        </div>
      )}

      {/* 谱头 */}
      <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-7">
        <h1 className="text-2xl font-semibold text-brand-900">
          {g.surname}氏族谱{g.hallName ? ` · ${g.hallName}` : ""}
        </h1>
        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm text-brand-500 sm:grid-cols-2">
          {g.origin && (
            <div>
              <dt className="inline">祖籍 / 郡望：</dt>
              <dd className="inline">{g.origin}</dd>
            </div>
          )}
          {g.lineage && (
            <div>
              <dt className="inline">字辈：</dt>
              <dd className="inline">{g.lineage}</dd>
            </div>
          )}
          <div>
            <dt className="inline">世系：</dt>
            <dd className="inline">
              {stats.generations} 世 · {stats.total} 人
            </dd>
          </div>
          <div>
            <dt className="inline">收录者：</dt>
            <dd className="inline">{g.owner?.realName || g.owner?.email || "—"}</dd>
          </div>
        </dl>
        {g.migration && (
          <p className="mt-4 border-t border-brand-200 pt-4 text-sm leading-7 text-brand-500">
            <span className="font-medium text-brand-700">迁徙源流：</span>
            {g.migration}
          </p>
        )}
      </section>

      {/* 族谱图 */}
      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-brand-900">族谱世系图</h2>
          <div className="flex items-center gap-3 text-xs text-brand-400">
            <span>
              当前版式：{meta.name}（{meta.alias}）
            </span>
            {!isOwner && (
              <Link href={`/clan/genealogy/${g.id}/design`} className="text-accent-600 hover:underline">
                我也要设计 →
              </Link>
            )}
          </div>
        </div>

        {requestedLocked && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            该族谱使用了精美收费版式「{CHART_META[requested]?.name}」，当前账号未解锁，已回落到免费版式展示。
            开通高级订阅后即可查看原版式。
          </div>
        )}

        {members.length ? (
          <GenealogyChart members={members} config={config} />
        ) : (
          <div className="rounded-xl border border-dashed border-brand-200 bg-brand-100/70 p-12 text-center">
            <div className="text-4xl">📜</div>
            <p className="mt-3 text-sm text-brand-500">该族谱尚未创建设计族谱图</p>
            <Link
              href={`/clan/genealogy/${g.id}/design`}
              className="mt-4 inline-block rounded-md bg-brand-800 px-6 py-2 text-sm text-white hover:bg-brand-700"
            >
              去设计族谱图
            </Link>
          </div>
        )}
      </section>

      {/* 世系明细 */}
      {members.length > 0 && (
        <section className="mt-6 rounded-xl border border-brand-200 bg-brand-100/70 p-6">
          <h2 className="text-sm font-semibold text-brand-900">世系明细</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-200 text-left text-xs text-brand-400">
                  <th className="py-2 pr-4">世代</th>
                  <th className="py-2 pr-4">姓名</th>
                  <th className="py-2 pr-4">关系</th>
                  <th className="py-2">备注</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={i} className="border-b border-gray-50 text-brand-600">
                    <td className="py-1.5 pr-4">第 {m.gen} 世</td>
                    <td className="py-1.5 pr-4 font-medium text-brand-900">{m.name}</td>
                    <td className="py-1.5 pr-4">{m.relation ?? "—"}</td>
                    <td className="py-1.5 text-brand-400">{m.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-5 text-sm text-brand-500">
        <Link href="/clan/genealogy" className="hover:underline">
          更多族谱 →
        </Link>
        <Link
          href={`/clan/halls?surname=${encodeURIComponent(g.surname)}`}
          className="hover:underline"
        >
          查看{g.surname}氏宗祠 →
        </Link>
      </div>
    </div>
  );
}
