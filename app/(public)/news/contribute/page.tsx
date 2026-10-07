import { getCurrentUser } from "@/lib/auth";
import { contributeArticle } from "./actions";

export const metadata = { title: "投稿 · 家风故事征集" };

export default async function ContributePage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  const user = await getCurrentUser();
  const field = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

  return (
    <div className="container-page max-w-2xl py-12">
      <h1 className="text-3xl font-semibold text-brand-900">家风故事征集</h1>
      <p className="mt-2 text-sm text-brand-500">
        投稿家风家训、追思故事与节日文化随笔。内容以文明祭扫、厚养薄葬为导向，
        不传播封建迷信内容；来稿经编辑审核后发布于文化专栏。
      </p>

      {sent ? (
        <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-6">
          <p className="text-sm font-medium text-green-700">
            ✅ 投稿成功！已进入编辑审核队列，审核通过后将在文化专栏发布。
          </p>
        </div>
      ) : user ? (
        <form action={contributeArticle} className="mt-8 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">标题 *</label>
            <input name="title" required maxLength={100} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">摘要</label>
            <input name="summary" maxLength={200} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">正文 *</label>
            <textarea name="body" required rows={12} className={field} />
          </div>
          <button
            type="submit"
            className="rounded-md bg-brand-800 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            提交投稿
          </button>
        </form>
      ) : (
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 text-sm text-brand-600">
          请先{" "}
          <a href="/login" className="font-medium text-brand-800 underline">
            登录
          </a>{" "}
          后再投稿。
        </div>
      )}
    </div>
  );
}
