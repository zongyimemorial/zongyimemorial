import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listCategories } from "@/lib/articles";
import ArticleEditor from "@/components/admin/ArticleEditor";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  const { id } = await params;
  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) notFound();

  const categories = await listCategories();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-brand-900">编辑文章</h1>
      <ArticleEditor categories={categories} article={article} />
    </div>
  );
}
