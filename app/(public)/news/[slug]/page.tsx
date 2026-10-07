import BackLink from "@/components/site/BackLink";
import { notFound } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { getArticleBySlug } from "@/lib/articles";
import { mdToHtml } from "@/lib/markdown";
import CommentSection from "@/components/news/CommentSection";
import { ShareBar } from "@/components/share/ShareBar";
import { currentOrigin } from "@/lib/origin";
import { withShareToken } from "@/lib/share";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return { title: "文章未找到" };
  const origin = (await currentOrigin()) ?? "";
  const url = `${origin}/news/${slug}`;
  return {
    title: article.seoTitle || article.title,
    description: article.seoDescription || article.summary || undefined,
    keywords: article.seoKeywords || undefined,
    alternates: { canonical: `/news/${slug}` },
    openGraph: {
      type: "article",
      title: article.seoTitle || article.title,
      description: article.seoDescription || article.summary || undefined,
      publishedTime: article.publishedAt?.toISOString?.() ?? undefined,
      images: article.coverImage ? [article.coverImage] : undefined,
      // url 缺失会让分享卡片抓不到规范地址（部分平台直接不渲染卡）
      url,
      siteName: "宗忆堂",
    },
  };
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const html = mdToHtml(article.body);

  const approvedComments = await prisma.articleComment.findMany({
    where: { articleId: article.id, status: "approved" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { realName: true, email: true } } },
  });

  // 分享链接带 HMAC 签名令牌（内测期免口令，见 lib/share.ts）。
  // 密钥缺失时 withShareToken 优雅降级为原路径 —— 分享照常可用，只是访客需过口令页。
  const shareOrigin = (await currentOrigin()) ?? "";
  const shareUrl = `${shareOrigin}${await withShareToken(`/news/${slug}`, "news")}`;

  return (
    <div className="container-page max-w-3xl py-12">
      {/* Article 结构化数据（P0 SEO）：标题/发布时间/封面进富摘要池 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: article.title,
            description: article.summary ?? undefined,
            image: article.coverImage ?? undefined,
            datePublished: article.publishedAt?.toISOString?.() ?? undefined,
            inLanguage: "zh-CN",
          }),
        }}
      />
      <BackLink href="/news">返回新闻列表</BackLink>
      {article.coverImage && (
        <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-xl shadow-sm">
          <Image
            src={article.coverImage}
            alt={article.title}
            fill
            sizes="(min-width: 1280px) 768px, 100vw"
            className="object-cover"
          />
        </div>
      )}
      <header className="mt-5 border-b border-gray-100 pb-5">
        <div className="mb-2 flex items-center gap-2 text-xs text-brand-400">
          <span className="rounded bg-brand-50 px-2 py-0.5 text-brand-700">
            {article.category?.name ?? "未分类"}
          </span>
          {article.publishedAt &&
            new Date(article.publishedAt).toLocaleDateString("zh-CN")}
        </div>
        <h1 className="text-3xl font-semibold text-brand-900">{article.title}</h1>
        {article.summary && (
          <p className="mt-3 text-brand-500">{article.summary}</p>
        )}
      </header>

      <article
        className="mt-6"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* 一键分享：文章是传播主力，分享条紧随正文（读完之后最想转发的时刻） */}
      <ShareBar url={shareUrl} title={article.title} summary={article.summary ?? undefined} scope="news" />

      <footer className="mt-10 border-t border-gray-100 pt-4 text-xs text-brand-400">
        作者 {article.author?.realName ?? "编辑部"} · 阅读 {article.viewCount}
        {article.isAiGenerated && " · AI 辅助生成（经人工编辑）"}
      </footer>

      {/* 用户互动：评论（先审后显） */}
      <CommentSection
        articleId={article.id}
        comments={approvedComments}
      />
    </div>
  );
}
