"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// 文章评论：先审后显（status=pending，管理员审核通过后展示）
export async function submitComment(
  articleId: string,
  body: string
): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "请先登录后评论" };

  const text = body.trim().slice(0, 500);
  if (!text) return { ok: false, message: "评论内容不能为空" };

  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) return { ok: false, message: "文章不存在" };

  // 防刷：同一用户 60 秒内只允许一条评论
  const recent = await prisma.articleComment.findFirst({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.now() - 60 * 1000) },
    },
  });
  if (recent) return { ok: false, message: "评论太频繁，稍后再试" };

  await prisma.articleComment.create({
    data: { articleId, userId: user.id!, body: text },
  });

  return { ok: true, message: "评论已提交，审核通过后展示" };
}
