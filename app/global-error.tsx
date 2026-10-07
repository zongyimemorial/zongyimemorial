"use client";

import { useEffect } from "react";

// 根级错误边界：路由段抛出异常（含隧道抖动导致的软导航失败）时，
// 展示可重试的友好界面，并提供“返回首页”硬链接，避免白屏/卡死。
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 记录以便诊断
    console.error("[global-error]", error?.message);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
          <div className="w-full max-w-md rounded-2xl border border-brand-100 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-brand-900">页面加载遇到问题</h1>
            <p className="mt-2 text-sm text-brand-500">
              网络似乎出现了短暂波动，请重试或返回首页。
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={() => reset()}
                className="w-full rounded-lg bg-brand-700 py-3 font-medium text-white transition hover:bg-brand-800"
              >
                重试
              </button>
              <a
                href="/"
                className="w-full rounded-lg border border-gray-300 py-3 font-medium text-brand-700 transition hover:bg-gray-50"
              >
                返回首页
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
