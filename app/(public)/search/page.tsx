import Link from "next/link";
import { searchArticles } from "@/lib/articles";

export const metadata = { title: "站内搜索" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = (q || "").trim();
  const results = term ? await searchArticles(term) : [];

  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="text-3xl font-semibold text-brand-900">站内搜索</h1>
      <form className="mt-4 flex gap-2" action="/search" method="get">
        <input
          name="q"
          defaultValue={term}
          placeholder="输入关键词，如：云祭扫、备案、清明"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <button className="rounded-md bg-brand-800 px-4 py-2 text-sm text-white hover:bg-brand-700">
          搜索
        </button>
      </form>

      {term && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-brand-500">
            找到 {results.length} 条与「{term}」相关的结果
          </p>
          {results.map((a) => (
            <div key={a.id} className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-brand-900">
                <Link href={`/news/${a.slug}`} className="hover:text-brand-600">
                  {a.title}
                </Link>
              </h2>
              {a.summary && <p className="mt-1 text-sm text-gray-600">{a.summary}</p>}
            </div>
          ))}
          {results.length === 0 && (
            <p className="text-sm text-brand-400">暂无匹配内容，换个关键词试试。</p>
          )}
        </div>
      )}
    </div>
  );
}
