import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ArticleStatus } from "@prisma/client";

// 更新 / 发布文章
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  const status = String(body.status || "published") as ArticleStatus;
  const article = await prisma.article.update({
    where: { id },
    data: {
      status,
      publishedAt: status === "published" ? new Date() : null,
    },
  });
  return NextResponse.json(article);
}
