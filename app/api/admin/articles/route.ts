import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// 创建草稿（供程序/接口调用）
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const article = await prisma.article.create({
    data: {
      title,
      slug: "a-" + Date.now().toString(36),
      categoryId: String(body.categoryId || ""),
      summary: String(body.summary || ""),
      body: String(body.body || ""),
      authorId: user.id,
      status: "draft",
      isAiGenerated: Boolean(body.isAiGenerated),
    },
  });
  return NextResponse.json(article, { status: 201 });
}
