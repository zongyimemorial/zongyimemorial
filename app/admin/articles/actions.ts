"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Prisma, type ArticleStatus } from "@prisma/client";
import { checkContent } from "@/lib/moderation";

function makeSlug(fallback: string, title: string): string {
  const base = (fallback || title || "").trim();
  if (/^[a-z0-9-]+$/.test(base)) return base.toLowerCase();
  return "a-" + randomBytes(4).toString("hex");
}

export async function saveArticle(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("标题不能为空");

  const status = ((formData.get("status") as string) === "published"
    ? "published"
    : "draft") as ArticleStatus;
  const data = {
    title,
    slug: makeSlug(String(formData.get("slug") || ""), title),
    categoryId: String(formData.get("categoryId") || ""),
    summary: String(formData.get("summary") || ""),
    body: String(formData.get("body") || ""),
    seoTitle: String(formData.get("seoTitle") || ""),
    seoKeywords: String(formData.get("seoKeywords") || ""),
    seoDescription: String(formData.get("seoDescription") || ""),
    authorId: user.id,
    status,
    publishedAt: status === "published" ? new Date() : null,
    isAiGenerated: (formData.get("isAiGenerated") as string) === "true",
  };

  const saved =
    id
      ? await prisma.article.update({ where: { id }, data })
      : await prisma.article.create({ data });

  // 发布即进入内容审核队列（AI 预过滤 + 人工终审）
  if (status === "published") {
    await prisma.moderationQueue.create({
      data: {
        targetType: "article",
        targetId: saved.id,
        contentSnapshot: { title, summary: data.summary, body: data.body },
        aiResult: (await checkContent(`${title} ${data.summary} ${data.body}`)) as unknown as Prisma.InputJsonValue,
        status: "pending",
      },
    });
  }

  revalidatePath("/admin/articles");
  revalidatePath("/news");
  redirect("/admin/articles");
}
