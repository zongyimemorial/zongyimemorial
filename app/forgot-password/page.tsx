"use client";

import { useState } from "react";
import Link from "next/link";
import PasswordInput from "@/components/ui/PasswordInput";

export default function ForgotPasswordPage() {
  const [tab, setTab] = useState<"sms" | "email">("sms");
  const [target, setTarget] = useState("");
  const [code, setCode] = useState("");
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");

  const [sent, setSent] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [smsBtn, setSmsBtn] = useState("发送验证码");

  const onSend = async () => {
    setErr(null);
    if (tab === "sms" && !/^1\d{10}$/.test(target)) {
      setErr("请输入正确的手机号");
      return;
    }
    if (tab === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setErr("请输入正确的邮箱");
      return;
    }
    setSmsBtn("发送中…");
    try {
      const r = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: tab, target }),
      });
      const j = await r.json();
      if (j.ok) {
        setSent(true);
        setPreview(j.code || null);
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
        setErr(j.error || "发送失败");
        setSmsBtn("发送验证码");
      }
    } catch {
      setErr("网络异常，请重试");
      setSmsBtn("发送验证码");
    }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    if (pwd.length < 6) {
      setErr("新密码至少 6 位");
      return;
    }
    if (pwd !== confirm) {
      setErr("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: tab, target, code, newPassword: pwd }),
      });
      const j = await r.json();
      if (j.ok) {
        setDone(true);
      } else {
        setErr(j.error || "重置失败，请重试");
      }
    } catch {
      setErr("网络异常，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md rounded-xl border border-brand-200 bg-brand-100/70 p-8 shadow-sm">
        <div className="mb-5 flex items-center justify-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo.png" alt="宗忆堂商标" className="h-12 w-12 rounded-xl object-cover shadow-sm" />
          <div>
            <h1 className="text-2xl font-semibold text-brand-900">找回密码</h1>
            <p className="text-xs text-brand-500">通过手机或邮箱验证码重置</p>
          </div>
        </div>

        {done ? (
          <div className="space-y-4 text-center">
            <p className="rounded-md bg-green-50 px-3 py-3 text-sm text-green-700">
              密码已重置成功，请用新密码登录。
            </p>
            <Link
              href="/login"
              className="block w-full rounded-md bg-brand-700 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
            >
              前往登录
            </Link>
          </div>
        ) : (
          <>
            {/* 通道切换 */}
            <div className="mb-5 flex border-b border-brand-200">
              <button
                type="button"
                onClick={() => {
                  setTab("sms");
                  setErr(null);
                  setSent(false);
                  setPreview(null);
                }}
                className={`flex-1 pb-2 text-sm font-medium transition ${
                  tab === "sms" ? "border-b-2 border-brand-700 text-brand-700" : "text-gray-400"
                }`}
              >
                手机验证码
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("email");
                  setErr(null);
                  setSent(false);
                  setPreview(null);
                }}
                className={`flex-1 pb-2 text-sm font-medium transition ${
                  tab === "email" ? "border-b-2 border-brand-700 text-brand-700" : "text-gray-400"
                }`}
              >
                邮箱验证码
              </button>
            </div>

            {err && (
              <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-brand-700">
                  {tab === "sms" ? "手机号" : "邮箱"}
                </label>
                <input
                  type={tab === "sms" ? "tel" : "email"}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={tab === "sms" ? "请输入注册手机号" : "请输入注册邮箱"}
                  autoComplete="username"
                  className="w-full rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-brand-700">验证码</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={6}
                    placeholder="6 位验证码"
                    className="flex-1 rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                  <button
                    type="button"
                    onClick={onSend}
                    className="shrink-0 rounded-md border border-brand-300 px-3 py-2 text-xs text-brand-700 hover:bg-brand-50"
                  >
                    {smsBtn}
                  </button>
                </div>
                {sent && preview && (
                  <p className="mt-1 rounded-md bg-brand-50 px-2 py-1 text-xs text-brand-700">
                    内测验证码（mock）：<span className="font-semibold tracking-wider">{preview}</span>，请填入上方输入框
                  </p>
                )}
                {sent && !preview && (
                  <p className="mt-1 text-xs text-brand-400">验证码已发送，请查收{tab === "sms" ? "短信" : "邮件"}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm text-brand-700">新密码</label>
                <PasswordInput
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="至少 6 位"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-brand-700">确认新密码</label>
                <PasswordInput
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再次输入新密码"
                  autoComplete="new-password"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-md bg-brand-700 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
              >
                {busy ? "提交中…" : "重置密码"}
              </button>
            </form>
          </>
        )}

        <p className="mt-5 text-center text-sm text-brand-500">
          想起来了？
          <Link href="/login" className="text-accent-600 hover:underline">返回登录</Link>
        </p>
      </div>
    </div>
  );
}
