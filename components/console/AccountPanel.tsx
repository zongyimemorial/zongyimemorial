"use client";

import { useState, useTransition } from "react";

type Provider = { id: string; name: string; icon: string; configured: boolean; linked: boolean };

export default function AccountPanel({
  userId,
  phone,
  email,
  realName,
  idVerified,
  providers,
}: {
  userId: string;
  phone: string | null;
  email: string | null;
  realName: string | null;
  idVerified: boolean;
  providers: Provider[];
}) {
  const [bindPhone, setBindPhone] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, startTransition] = useTransition();
  const [smsBtn, setSmsBtn] = useState("发送验证码");

  const onSendCode = async () => {
    if (!/^1\d{10}$/.test(bindPhone)) { setMsg("请输入正确的手机号"); return; }
    setSmsBtn("发送中…");
    try {
      const r = await fetch("/api/auth/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: bindPhone, purpose: "bindphone" }),
      });
      const j = await r.json();
      if (j.ok) {
        setMsg(`验证码已发送（内测：${j.code}）`);
        let count = 60;
        setSmsBtn(`${count}s`);
        const t = setInterval(() => { count--; if (count <= 0) { clearInterval(t); setSmsBtn("发送验证码"); } else setSmsBtn(`${count}s`); }, 1000);
      } else { setMsg(j.error || "发送失败"); setSmsBtn("发送验证码"); }
    } catch { setMsg("网络异常"); setSmsBtn("发送验证码"); }
  };

  return (
    <>
      {/* 当前账号信息 */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-brand-900">账号信息</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-400">手机号</dt>
            <dd className={phone ? "text-gray-800" : "text-gray-300"}>{phone || "未绑定"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-400">邮箱</dt>
            <dd className={email ? "text-gray-800" : "text-gray-300"}>{email || "未绑定"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-400">姓名</dt>
            <dd className={realName ? "text-gray-800" : "text-gray-300"}>{realName || "未填"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-400">身份证认证</dt>
            <dd className={idVerified ? "text-emerald-600" : "text-amber-600"}>
              {idVerified ? "已认证" : "未认证"}
            </dd>
          </div>
        </dl>
        {!idVerified && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            建立纪念馆或宗祠需要完成身份证认证。
            <a href="/console/realname" className="font-medium underline">前往认证 →</a>
          </p>
        )}
      </section>

      {/* 绑定/更换手机号 */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-brand-900">绑定 / 更换手机号</h2>
        <p className="mt-1 text-xs text-gray-400">
          {phone ? `当前：${phone.slice(0,3)}****${phone.slice(-4)}` : "尚未绑定手机号"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="tel"
            value={bindPhone}
            onChange={(e) => setBindPhone(e.target.value)}
            placeholder="新手机号"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={onSendCode}
            className="shrink-0 rounded-md border border-brand-300 px-3 py-2 text-xs text-brand-700 hover:bg-brand-50"
          >
            {smsBtn}
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="验证码"
            maxLength={6}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => startTransition(async () => {
              const fd = new FormData();
              fd.set("userId", userId);
              fd.set("phone", bindPhone);
              fd.set("code", code);
              const { bindPhone: bind } = await import("@/app/console/account/actions");
              const r = await bind(fd);
              setMsg(r.message || (r.ok ? "绑定成功" : "绑定失败"));
              if (r.ok) { setBindPhone(""); setCode(""); }
            })}
            className="shrink-0 rounded-md bg-brand-700 px-4 py-2 text-sm text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {busy ? "…" : "绑定"}
          </button>
        </div>
        {msg && <p className="mt-2 text-xs text-brand-500">{msg}</p>}
      </section>

      {/* 第三方账号 */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-brand-900">第三方账号</h2>
        <div className="mt-3 space-y-2">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="text-lg">{p.icon}</span>
                <span className="text-gray-600">{p.name}</span>
              </span>
              {p.linked ? (
                <span className="text-xs text-emerald-600">已绑定</span>
              ) : p.configured ? (
                <a href={`/api/auth/signin/${p.id}`} className="text-xs text-brand-600 hover:underline">绑定</a>
              ) : (
                <span className="text-xs text-gray-300">即将开通</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
