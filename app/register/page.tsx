"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { registerAction } from "./actions";
import type { AuthState } from "@/app/login/actions";

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    registerAction,
    {}
  );
  // 支持通过 /register?invite=XXXX 自动带入邀请码
  const sp = useSearchParams();
  const invite = (sp.get("invite") || "").toUpperCase();

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-brand-900">注册</h1>
        <p className="mb-6 text-sm text-brand-500">创建账号以使用数字纪念服务</p>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-brand-700">邮箱</label>
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-brand-700">密码</label>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="至少 6 位"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-brand-700">
              邀请码 <span className="text-brand-400">（选填，填写双方各得积分）</span>
            </label>
            <input
              name="inviteCode"
              type="text"
              defaultValue={invite}
              placeholder="有好友邀请可填写其邀请码"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase outline-none focus:border-brand-500"
            />
          </div>

          {state?.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-brand-700 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {pending ? "注册中…" : "注册并登录"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-brand-500">
          已有账号？
          <Link href="/login" className="text-accent-600 hover:underline">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
