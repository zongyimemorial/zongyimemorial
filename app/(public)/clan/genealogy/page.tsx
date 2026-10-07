import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import GenealogyUploadForm from "@/components/clan/GenealogyUploadForm";
import { CHART_META, type ChartType } from "@/lib/genealogy-chart";

export const metadata = { title: "族谱数字化数据库 · 宗忆堂" };

export default async function GenealogyPage({
  searchParams,
}: {
  searchParams: Promise<{ surname?: string; q?: string }>;
}) {
  const { surname, q } = await searchParams;
  const user = await getCurrentUser();

  const rows = await prisma.genealogy.findMany({
    where: {
      status: "approved",
      isPublic: true,
      ...(surname ? { surname } : {}),
      ...(q
        ? {
            OR: [
              { hallName: { contains: q } },
              { origin: { contains: q } },
              { lineage: { contains: q } },
              { migration: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const surnames = await prisma.genealogy.groupBy({
    by: ["surname"],
    where: { status: "approved", isPublic: true },
    _count: { surname: true },
    orderBy: { _count: { surname: "desc" } },
    take: 20,
  });

  return (
    <div className="container-page max-w-5xl py-10">
      <nav className="mb-4 text-sm text-brand-400">
        <Link href="/clan" className="hover:text-brand-700">宗亲文化</Link> / 族谱数字化数据库
      </nav>
      <h1 className="text-2xl font-semibold text-brand-900">族谱数字化数据库</h1>
      <p className="mt-2 text-sm text-brand-500">
        支持各姓氏族谱上传、数字化存储与检索。上传族谱资料通过审核可获 50 积分。
      </p>

      {/* 姓氏快捷筛选 */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/clan/genealogy"
          className={`rounded-full border px-3 py-1 text-xs ${!surname ? "border-accent-400 bg-accent-50 text-accent-700" : "border-gray-200 text-brand-500"}`}
        >
          全部
        </Link>
        {surnames.map((s) => (
          <Link
            key={s.surname}
            href={`/clan/genealogy?surname=${encodeURIComponent(s.surname)}`}
            className={`rounded-full border px-3 py-1 text-xs ${surname === s.surname ? "border-accent-400 bg-accent-50 text-accent-700" : "border-gray-200 text-brand-500 hover:border-accent-300"}`}
          >
            {s.surname}氏
          </Link>
        ))}
      </div>

      {/* 关键字检索 */}
      <form className="mt-4 flex gap-2" action="/clan/genealogy">
        {surname && <input type="hidden" name="surname" value={surname} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="检索堂号 / 祖籍 / 字辈 / 迁徙源流…"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
        <button className="rounded-md bg-brand-800 px-5 py-2 text-sm text-white hover:bg-brand-700">
          检索
        </button>
      </form>

      <div className="mt-6 space-y-4">
        {rows.map((g) => (
          <div key={g.id} className="rounded-xl border border-gray-100 bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold text-brand-900">
                {g.surname}氏族谱{g.hallName ? ` · ${g.hallName}` : ""}
              </h2>
              <span className="text-xs text-brand-300">{g.viewCount} 次查阅</span>
            </div>
            {g.origin && <div className="mt-1 text-sm text-brand-500">祖籍：{g.origin}</div>}
            {g.lineage && (
              <div className="mt-2 rounded-md bg-brand-50 p-3 text-sm text-brand-700">
                <span className="text-xs text-brand-400">字辈派语：</span>
                {g.lineage}
              </div>
            )}
            {g.migration && (
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-600">{g.migration}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <Link href={`/clan/genealogy/${g.id}`} className="text-accent-600 hover:underline">
                查看族谱世系图 →
              </Link>
              <span className="text-xs text-brand-400">
                {CHART_META[(g.chartType ?? "ou") as ChartType]?.name ?? "欧式"} 版式
              </span>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-brand-400">
            暂无符合条件的族谱，欢迎上传首部数字化族谱
          </div>
        )}
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-brand-900">上传族谱</h2>
        <GenealogyUploadForm isLoggedIn={!!user} idVerified={!!user?.idVerified} />
      </section>
    </div>
  );
}
