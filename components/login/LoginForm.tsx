"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { loginAction, smsLoginAction, type AuthState } from "@/app/login/actions";

type Provider = { id: string; name: string; icon: string; configured: boolean };

export default function LoginForm({
  providers,
  from,
}: {
  providers: Provider[];
  from?: string;
}) {
  const [tab, setTab] = useState<"password" | "sms">("password");
  const [state, formAction, pending] = useActionState<AuthState, FormData>(loginAction, {});
  const [smsState, smsFormAction, smsPending] = useActionState<AuthState, FormData>(smsLoginAction, {});
  const [smsSent, setSmsSent] = useState(false);
  const [smsBtn, setSmsBtn] = useState("发送验证码");

  const onSendSms = async (phone: string) => {
    if (!/^1\d{10}$/.test(phone)) {
      alert("请输入正确的手机号");
      return;
    }
    setSmsBtn("发送中…");
    try {
      const r = await fetch("/api/auth/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose: "login" }),
      });
      const j = await r.json();
      if (j.ok) {
        setSmsSent(true);
        let count = 60;
        setSmsBtn(`${count}s 后重发`);
        const timer = setInterval(() => {
          count--;
          if (count <= 0) {
            clearInterval(timer);
            setSmsBtn("发送验证码");
          } else {
            setSmsBtn(`${count}s 后重发`);
          }
        }, 1000);
      } else {
        alert(j.error || "发送失败");
        setSmsBtn("发送验证码");
      }
    } catch {
      alert("网络异常，请重试");
      setSmsBtn("发送验证码");
    }
  };

  const configuredProviders = providers.filter((p) => p.configured);
  const unconfiguredProviders = providers.filter((p) => !p.configured);

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        {/* Logo */}
        <div className="mb-5 flex items-center justify-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo.png" alt="宗忆堂商标" className="h-12 w-12 rounded-xl object-cover shadow-sm" />
          <div>
            <h1 className="text-2xl font-semibold text-brand-900">登录宗忆堂</h1>
            <p className="text-xs text-brand-500">传承记忆 · 数字纪念</p>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="mb-5 flex border-b border-gray-200">
          <button
            type="button"
            onClick={() => setTab("password")}
            className={`flex-1 pb-2 text-sm font-medium transition ${
              tab === "password" ? "border-b-2 border-brand-700 text-brand-700" : "text-gray-400"
            }`}
          >
            密码登录
          </button>
          <button
            type="button"
            onClick={() => setTab("sms")}
            className={`flex-1 pb-2 text-sm font-medium transition ${
              tab === "sms" ? "border-b-2 border-brand-700 text-brand-700" : "text-gray-400"
            }`}
          >
            手机验证码登录
          </button>
        </div>

        {/* 密码登录 */}
        {tab === "password" && (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="from" value={from || ""} />
            <div>
              <label className="mb-1 block text-sm text-brand-700">账号</label>
              <input
                name="identifier"
                type="text"
                autoComplete="username"
                placeholder="邮箱或手机号"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-brand-700">密码</label>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="请输入密码"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            {state?.error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-brand-700 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {pending ? "登录中…" : "登录"}
            </button>
          </form>
        )}

        {/* 手机验证码登录 */}
        {tab === "sms" && (
          <form action={smsFormAction} className="space-y-4">
            <input type="hidden" name="from" value={from || ""} />
            <div>
              <label className="mb-1 block text-sm text-brand-700">手机号</label>
              <input
                name="phone"
                type="tel"
                placeholder="请输入手机号"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-brand-700">验证码</label>
              <div className="flex gap-2">
                <input
                  name="code"
                  type="text"
                  maxLength={6}
                  placeholder="6 位验证码"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    const form = (e.target as HTMLElement).closest("form");
                    const phone = form?.querySelector('input[name="phone"]') as HTMLInputElement;
                    if (phone) onSendSms(phone.value);
                  }}
                  className="shrink-0 rounded-md border border-brand-300 px-3 py-2 text-xs text-brand-700 hover:bg-brand-50"
                >
                  {smsBtn}
                </button>
              </div>
              {smsSent && smsState?.code && (
                <p className="mt-1 text-xs text-brand-400">内测验证码：{smsState.code}</p>
              )}
            </div>
            {smsState?.error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{smsState.error}</p>
            )}
            <button
              type="submit"
              disabled={smsPending}
              className="w-full rounded-md bg-brand-700 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {smsPending ? "登录中…" : "登录"}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-brand-500">
          还没有账号？
          <Link href="/register" className="text-accent-600 hover:underline">立即注册</Link>
        </p>

        {/* 第三方登录 */}
        {(configuredProviders.length > 0 || unconfiguredProviders.length > 0) && (
          <div className="mt-6 border-t border-gray-100 pt-4">
            <p className="mb-3 text-center text-xs text-gray-400">第三方账号登录</p>
            <div className="flex flex-wrap justify-center gap-3">
              {configuredProviders.map((p) => (
                <a
                  key={p.id}
                  href={`/api/auth/signin/${p.id}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-xl hover:border-brand-300 hover:bg-brand-50"
                  title={`用${p.name}登录`}
                >
                  {p.icon}
                </a>
              ))}
              {unconfiguredProviders.map((p) => (
                <span
                  key={p.id}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-100 text-xl opacity-40"
                  title={`${p.name}即将开通`}
                >
                  {p.icon}
                </span>
              ))}
            </div>
            {unconfiguredProviders.length > 0 && configuredProviders.length === 0 && (
              <p className="mt-2 text-center text-xs text-gray-300">第三方登录即将开通</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
