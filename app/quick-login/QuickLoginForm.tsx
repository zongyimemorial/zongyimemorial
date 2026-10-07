"use client";

import { useEffect, useRef } from "react";
import { quickLoginAction } from "./actions";

/*
  一键登录的自动提交表单。

  为什么需要客户端组件：Server Action 只能由表单提交（或事件）触发，
  不能在 Server Component 渲染期直接调用。这里用 useEffect 在挂载后
  立刻 submit，用户看到的是"点开链接 → 转一下 → 进入控制台"。
*/
export default function QuickLoginForm({
  identifier,
  target,
}: {
  identifier: string;
  target: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    formRef.current?.requestSubmit();
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="text-4xl">🔓</div>
        <h1 className="mt-4 text-xl font-semibold text-brand-900">正在登录…</h1>
        <p className="mt-2 text-sm leading-6 text-brand-500">
          正在以 {identifier} 登录，请稍候。
        </p>
        <form ref={formRef} action={quickLoginAction} className="mt-6">
          <input type="hidden" name="identifier" value={identifier} />
          <input type="hidden" name="from" value={target} />
          <noscript>
            <button
              type="submit"
              className="rounded-md bg-accent-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-600"
            >
              点此登录
            </button>
          </noscript>
        </form>
      </div>
    </div>
  );
}
