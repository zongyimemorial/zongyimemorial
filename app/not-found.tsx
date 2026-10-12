import Link from "next/link";

/*
  全局 404 页（页面/路由不存在时由 Next.js 渲染）。
  沿用 error.tsx 的墨金暖米语言，避免 default 白屏与全站配色脱节。
*/
export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] max-w-xl flex-col items-center justify-center py-12 text-center">
      <div className="w-full rounded-2xl border border-brand-100 bg-brand-100/70 p-8 shadow-sm">
        <div className="mb-2 text-4xl">🕯️</div>
        <h1 className="text-xl font-semibold text-brand-900">未找到该页面</h1>
        <p className="mt-2 text-sm text-brand-500">
          您访问的链接可能已失效，或页面尚未公开。
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/"
            className="w-full rounded-lg bg-brand-700 py-3 font-medium text-white transition hover:bg-brand-800"
          >
            返回首页
          </Link>
          <Link
            href="/halls"
            className="w-full rounded-lg border border-brand-300 py-3 font-medium text-brand-700 transition hover:bg-brand-50"
          >
            浏览纪念馆
          </Link>
        </div>
      </div>
    </div>
  );
}
