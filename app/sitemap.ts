import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

/**
 * 站点地图 · P0 扩量
 *
 * 旧版只覆盖 首页 + /news + 文章，34 个公开页面里绝大多数是「孤儿页」——
 * 爬虫没有入口知道它们存在。本版覆盖：
 *   - 全部固定公开页（21 个）
 *   - active 且公开的纪念馆 / 宗祠
 *   - 已发布文章 / 上架商品 / 公开直播
 *   - 节日落地页（/festivals 与六大节日锚点）
 *
 * 动态条目量级可控（数百行内），单文件 sitemap 足够；
 * 若日后超过 5000 条再拆分多文件（P1 的事）。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const now = new Date();

  // ---- 固定公开页 ----
  const staticPaths = [
    "",
    "/news",
    "/halls",
    "/halls/guide",
    "/clan",
    "/clan/halls",
    "/clan/halls/guide",
    "/clan/roots",
    "/clan/genealogy",
    "/clan/community",
    "/clan/activities",
    "/live",
    "/live/guide",
    "/mall",
    "/points",
    "/points/guide",
    "/search",
    "/suites",
    "/whispers",
    "/gallery/decor",
    "/festivals",
    "/guide/decor",
    "/about",
    "/faq",
  ];

  const [articles, halls, clanHalls, products, lives, obituaries] = await Promise.all([
    prisma.article.findMany({
      where: { status: "published" },
      select: { slug: true, updatedAt: true },
    }),
    // 公开且已开通的纪念馆（pending/rejected 的馆不进 sitemap——它们本就不可访问）
    prisma.memorialHall.findMany({
      where: { status: "active", isPublic: true },
      select: { id: true, updatedAt: true },
      take: 500,
    }),
    prisma.clanHall.findMany({
      where: { status: "active", isPublic: true },
      select: { id: true, updatedAt: true },
      take: 500,
    }),
    prisma.product.findMany({
      where: { status: "active" },
      select: { slug: true, updatedAt: true },
      take: 300,
    }),
    prisma.liveSession.findMany({
      where: { isPublic: true },
      select: { id: true, updatedAt: true },
      take: 100,
    }),
    // 已发布且公开、**未加密**的电子讣告（加密的不进搜索引擎）
    prisma.obituary.findMany({
      where: { status: "published", isPublic: true, passwordHash: null },
      select: { id: true, updatedAt: true },
      take: 500,
    }),
  ]);

  return [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    ...staticPaths.slice(1).map((p) => ({
      url: `${base}${p}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: p === "/halls" || p === "/clan" ? 0.9 : 0.7,
    })),
    ...articles.map((a) => ({
      url: `${base}/news/${a.slug}`,
      lastModified: a.updatedAt ?? now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...halls.map((h) => ({
      url: `${base}/halls/${h.id}`,
      lastModified: h.updatedAt ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...clanHalls.map((c) => ({
      url: `${base}/clan/halls/${c.id}`,
      lastModified: c.updatedAt ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...products.map((p) => ({
      url: `${base}/mall/${p.slug}`,
      lastModified: p.updatedAt ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...lives.map((l) => ({
      url: `${base}/live/${l.id}`,
      lastModified: l.updatedAt ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...obituaries.map((o) => ({
      url: `${base}/obituary/${o.id}`,
      lastModified: o.updatedAt ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    // 节日落地页：单页收录即可（锚点 #fragment 在 sitemap 中会被搜索引擎忽略，
    // 节日语义已包含在 /festivals 页面标题与正文里，无需逐锚点列条目）
    {
      url: `${base}/festivals`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    },
  ];
}
