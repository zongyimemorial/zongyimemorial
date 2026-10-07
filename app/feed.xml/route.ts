import { prisma } from "@/lib/db";

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    orderBy: { publishedAt: "desc" },
    take: 20,
    include: { category: true },
  });

  const esc = (s: string = "") =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const items = articles
    .map(
      (a) =>
        `<item><title>${esc(a.title)}</title><link>${base}/news/${a.slug}</link>` +
        `<guid>${base}/news/${a.slug}</guid>` +
        `<description>${esc(a.summary || "")}</description>` +
        (a.publishedAt ? `<pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>` : "") +
        `</item>`
    )
    .join("");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0"><channel><title>宗忆堂 · 新闻资讯</title>` +
    `<link>${base}</link><description>殡葬文化科普与平台动态</description>${items}</channel></rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
