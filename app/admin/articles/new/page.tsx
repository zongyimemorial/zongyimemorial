import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listCategories } from "@/lib/articles";
import ArticleEditor from "@/components/admin/ArticleEditor";

export default async function NewArticlePage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");
  const categories = await listCategories();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-brand-900">新建文章</h1>
      <ArticleEditor categories={categories} />
    </div>
  );
}
