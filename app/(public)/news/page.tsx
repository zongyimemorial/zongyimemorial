import Link from "next/link";
import Image from "next/image";
import { listPublishedArticles, listCategories } from "@/lib/articles";
import Reveal from "@/components/site/Reveal";

export const metadata = { title: "新闻资讯" };

export default async function NewsListPage() {
  const [articles, categories] = await Promise.all([
    listPublishedArticles({ take: 30 }),
    listCategories(),
  ]);

  return (
    <div className="container-page max-w-5xl py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-brand-900">新闻资讯</h1>
        <p className="mt-2 text-brand-500">
          殡葬政策解读、生命文化科普与平台动态。内容经人工审核后发布。
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-[1fr_240px]">
        <div className="space-y-4">
          {articles.length === 0 && (
            <div className="rounded-lg border border-dashed border-brand-300 bg-brand-100/70 p-10 text-center text-sm text-brand-500">
              暂无已发布文章
            </div>
          )}
          {articles.map((a, i) => (
            <Reveal key={a.id} delay={i * 60}>
              <article
                className="shine flex gap-4 rounded-lg border border-brand-200 bg-brand-100/70 p-4 shadow-sm transition hover:shadow-md"
              >
              <Link
                href={`/news/${a.slug}`}
                className="relative block h-24 w-36 shrink-0 overflow-hidden rounded-md bg-brand-100"
              >
                {a.coverImage ? (
                  <Image
                    src={a.coverImage}
                    alt={a.title}
                    fill
                    sizes="144px"
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-brand-100" />
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2 text-xs text-brand-400">
                  <span className="rounded bg-brand-50 px-2 py-0.5 text-brand-700">
                    {a.category?.name ?? "未分类"}
                  </span>
                  {a.publishedAt &&
                    new Date(a.publishedAt).toLocaleDateString("zh-CN")}
                </div>
                <h2 className="text-lg font-semibold text-brand-900">
                  <Link href={`/news/${a.slug}`} className="hover:text-brand-600">
                    {a.title}
                  </Link>
                </h2>
                {a.summary && (
                  <p className="mt-1 line-clamp-2 text-sm text-gray-600">{a.summary}</p>
                )}
                <div className="mt-2 text-xs text-brand-400">
                  阅读 {a.viewCount} · 作者 {a.author?.realName ?? "编辑部"}
                </div>
              </div>
              </article>
              </Reveal>
            ))}
          </div>

          <aside>
          <div className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
            <div className="mb-3 text-sm font-semibold text-brand-900">栏目</div>
            <ul className="space-y-1 text-sm">
              {categories.map((c) => (
                <li key={c.id}>
                  <Link href={`/news?cat=${c.slug}`} className="text-brand-600 hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/search"
              className="mt-4 block rounded-md bg-brand-800 px-3 py-2 text-center text-sm text-white hover:bg-brand-700"
            >
              站内搜索
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
