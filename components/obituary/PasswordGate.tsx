"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/ui/PasswordInput";

/**
 * 电子讣告密码门。
 *
 * 提交密码到解锁接口；成功则刷新页面（此时 cookie 已种下，服务端将放行正文）。
 * 纯前端组件，不含任何密码校验逻辑 —— 判据全在服务端。
 */
export default function PasswordGate({ obituaryId, deceasedName }: { obituaryId: string; deceasedName: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/obituary/${obituaryId}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        router.refresh();
        return;
      }
      setError(data?.error || "密码不正确");
    } catch {
      setError("网络异常，请重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="container-page flex min-h-[60vh] max-w-md flex-col items-center justify-center py-16">
      <div className="w-full rounded-xl border border-amber-900/20 bg-[#161009] p-8 text-center shadow-lg">
        <div className="mb-2 text-3xl">🕯️</div>
        <h1 className="mb-1 text-lg font-medium text-amber-100">此讣告已加密</h1>
        <p className="mb-6 text-sm text-amber-200/60">
          请输入访问密码以查看「{deceasedName}」的讣告。
        </p>
        <form onSubmit={onSubmit} className="space-y-3" data-password-gate>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="访问密码"
            autoComplete="off"
            /* 暗色主题：保持原样式，补 pr-11 让位给眼睛按钮。
               按钮默认色是 brand-400（浅底用的），在深底上偏暗 —— 由 title/aria 兜底可读性。 */
            className="w-full rounded-md border border-amber-900/30 bg-black/30 px-3 py-2 pr-11 text-center text-amber-50 placeholder:text-amber-200/30 focus:border-amber-500 focus:outline-none"
          />
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-50"
          >
            {pending ? "验证中…" : "查看讣告"}
          </button>
        </form>
      </div>
    </div>
  );
}
