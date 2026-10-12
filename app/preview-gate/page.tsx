import type { Metadata } from "next";
import { cookies } from "next/headers";
import GateAuthed from "@/components/site/GateAuthed";
import PreviewGateForm from "@/components/site/PreviewGateForm";

export const metadata: Metadata = {
  title: "内部测试 · 访问口令",
  robots: { index: false, follow: false },
};

export default async function PreviewGatePage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const store = await cookies();
  const authed = store.get("preview_auth")?.value === "1";
  const { err } = await searchParams;

  // 已持合法口令：用客户端路由返回首页（见 GateAuthed），
  // 不使用服务端 redirect，避免与中间件形成重定向环导致“后退键卡死”。
  if (authed) {
    return <GateAuthed />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-brand-100 bg-brand-100/70 p-8 shadow-sm">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-brand-400">
            INTERNAL TEST
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-brand-900">内部测试访问</h1>
          <p className="mt-1 text-sm text-brand-500">
            本平台处于不公开内测阶段，请输入内测口令进入。
          </p>
        </div>
        <PreviewGateForm />
        {err ? (
          <p className="mt-4 text-center text-sm text-red-600">口令不正确，请重试</p>
        ) : null}
        <p className="mt-6 text-center text-xs text-brand-400">
          仅本地内测 · 不对外公开 · 公网阶段将移除本入口
        </p>
      </div>
    </div>
  );
}
