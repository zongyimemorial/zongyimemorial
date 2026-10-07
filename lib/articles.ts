import { prisma } from "@/lib/db";

export async function listPublishedArticles(opts?: { categoryId?: string; take?: number }) {
  return prisma.article.findMany({
    where: {
      status: "published",
      ...(opts?.categoryId ? { categoryId: opts.categoryId } : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: opts?.take ?? 20,
    include: { category: true, author: { select: { realName: true } } },
  });
}

export async function getArticleBySlug(slug: string) {
  return prisma.article.findUnique({
    where: { slug, status: "published" },
    include: { category: true, author: { select: { realName: true } } },
  });
}

export async function listCategories() {
  return prisma.category.findMany({ where: { isActive: true }, orderBy: { sort: "asc" } });
}

export async function searchArticles(q: string) {
  const term = q?.trim();
  if (!term) return [];
  return prisma.article.findMany({
    where: {
      status: "published",
      OR: [
        { title: { contains: term } },
        { summary: { contains: term } },
        { body: { contains: term } },
      ],
    },
    orderBy: { publishedAt: "desc" },
    take: 30,
    include: { category: true },
  });
}
