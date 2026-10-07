"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// 用户投稿（家风故事/文化专栏）：登录用户提交，进入编辑审核队列
export async function contributeArticle(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const summary = String(formData.get("summary") || "").trim();
  if (!title || !body) return;

  const category =
    (await prisma.category.findUnique({ where: { slug: "story" } })) ??
    (await prisma.category.findFirst());

  const baseSlug = `contribution-${Date.now().toString(36)}`;
  await prisma.article.create({
    data: {
      title: title.slice(0, 100),
      slug: baseSlug,
      summary: summary.slice(0, 200) || null,
      body: body.slice(0, 20000),
      categoryId: category!.id,
      authorId: user.id,
      status: "review",
    },
  });

  redirect("/news/contribute?sent=1");
}
