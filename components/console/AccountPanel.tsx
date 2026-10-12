"use client";

import { useState, useTransition } from "react";
import PasswordInput from "@/components/ui/PasswordInput";

type Provider = { id: string; name: string; icon: string; configured: boolean; linked: boolean };

export default function AccountPanel({
  userId,
  phone,
  email,
  realName,
  idVerified,
  providers,
  hasPassword,
}: {
  userId: string;
  phone: string | null;
  email: string | null;
  realName: string | null;
  idVerified: boolean;
  providers: Provider[];
  /** 是否已设置过登录密码；false 表示短信注册而来、尚未设密码 */
  hasPassword: boolean;
}) {
  const [bindPhone, setBindPhone] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, startTransition] = useTransition();
  const [smsBtn, setSmsBtn] = useState("发送验证码");

  // 绑定/解绑邮箱
  const [bindEmailAddr, setBindEmailAddr] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailBusy, startEmailTransition] = useTransition();
  const [emailBtn, setEmailBtn] = useState("发送验证码");
  // 解绑联系方式
  const [unbindMsg, setUnbindMsg] = useState("");
  const [unbindBusy, startUnbindTransition] = useTransition();

  // 修改 / 设置密码
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdBusy, startPwdTransition] = useTransition();

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

  // 绑定邮箱：发送邮箱验证码
  const onSendEmailCode = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bindEmailAddr)) { setEmailMsg("请输入正确的邮箱"); return; }
    setEmailBtn("发送中…");
    try {
      const r = await fetch("/api/auth/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: bindEmailAddr, purpose: "bindemail" }),
      });
      const j = await r.json();
      if (j.ok) {
        setEmailMsg(`验证码已发送（内测：${j.code}）`);
        let count = 60;
        setEmailBtn(`${count}s`);
        const t = setInterval(() => { count--; if (count <= 0) { clearInterval(t); setEmailBtn("发送验证码"); } else setEmailBtn(`${count}s`); }, 1000);
      } else { setEmailMsg(j.error || "发送失败"); setEmailBtn("发送验证码"); }
    } catch { setEmailMsg("网络异常"); setEmailBtn("发送验证码"); }
  };

  return (
    <>
      {/* 当前账号信息 */}
      <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
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
      <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
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
            className="flex-1 rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
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
            className="flex-1 rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
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

        {phone && (
          <div className="mt-3 border-t border-brand-200 pt-3">
            <p className="text-xs text-gray-400">如需更换，请在上输入新手机号完成绑定；或解绑当前号码。</p>
            <button
              type="button"
              disabled={unbindBusy}
              onClick={() =>
                startUnbindTransition(async () => {
                  setUnbindMsg("");
                  const { unbindPhone } = await import("@/app/console/account/actions");
                  const r = await unbindPhone();
                  setUnbindMsg(r.message);
                })
              }
              className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {unbindBusy ? "解绑中…" : "解绑当前手机号"}
            </button>
          </div>
        )}
      </section>

      {/* 绑定 / 解绑邮箱 */}
      <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
        <h2 className="text-sm font-semibold text-brand-900">绑定 / 解绑邮箱</h2>
        <p className="mt-1 text-xs text-gray-400">
          {email ? `当前：${email}` : "尚未绑定邮箱"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="email"
            value={bindEmailAddr}
            onChange={(e) => setBindEmailAddr(e.target.value)}
            placeholder="新邮箱"
            className="flex-1 rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={onSendEmailCode}
            className="shrink-0 rounded-md border border-brand-300 px-3 py-2 text-xs text-brand-700 hover:bg-brand-50"
          >
            {emailBtn}
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={emailCode}
            onChange={(e) => setEmailCode(e.target.value)}
            placeholder="验证码"
            maxLength={6}
            className="flex-1 rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="button"
            disabled={emailBusy}
            onClick={() => startEmailTransition(async () => {
              const fd = new FormData();
              fd.set("userId", userId);
              fd.set("email", bindEmailAddr);
              fd.set("code", emailCode);
              const { bindEmail } = await import("@/app/console/account/actions");
              const r = await bindEmail(fd);
              setEmailMsg(r.message || (r.ok ? "绑定成功" : "绑定失败"));
              if (r.ok) { setBindEmailAddr(""); setEmailCode(""); }
            })}
            className="shrink-0 rounded-md bg-brand-700 px-4 py-2 text-sm text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {emailBusy ? "…" : "绑定"}
          </button>
        </div>
        {emailMsg && <p className="mt-2 text-xs text-brand-500">{emailMsg}</p>}

        {email && (
          <div className="mt-3 border-t border-brand-200 pt-3">
            <p className="text-xs text-gray-400">解绑邮箱前需先绑定手机号作为联系方式兜底。</p>
            <button
              type="button"
              disabled={unbindBusy}
              onClick={() =>
                startUnbindTransition(async () => {
                  setUnbindMsg("");
                  const { unbindEmail } = await import("@/app/console/account/actions");
                  const r = await unbindEmail();
                  setUnbindMsg(r.message);
                })
              }
              className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {unbindBusy ? "解绑中…" : "解绑当前邮箱"}
            </button>
          </div>
        )}
      </section>

      {/* 解绑结果提示（手机/邮箱共用） */}
      {unbindMsg && (
        <p
          className={`rounded-md px-3 py-2 text-xs ${
            unbindMsg.includes("已解绑") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {unbindMsg}
        </p>
      )}

      {/* 设置 / 修改密码 */}
      <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
        <h2 className="text-sm font-semibold text-brand-900">
          {hasPassword ? "修改密码" : "设置登录密码"}
        </h2>
        <p className="mt-1 text-xs text-gray-400">
          {hasPassword
            ? "修改后，下次登录请使用新密码"
            : "当前账号通过短信验证码登录，设置密码后即可用「邮箱/手机号 + 密码」登录"}
        </p>
        <div className="mt-3 space-y-2">
          {hasPassword && (
            <PasswordInput
              value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)}
              placeholder="当前密码"
              autoComplete="current-password"
            />
          )}
          <PasswordInput
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder="新密码（≥6 位）"
            autoComplete="new-password"
          />
          <PasswordInput
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            placeholder="确认新密码"
            autoComplete="new-password"
          />
          <button
            type="button"
            disabled={pwdBusy}
            onClick={() =>
              startPwdTransition(async () => {
                setPwdMsg("");
                const fd = new FormData();
                fd.set("oldPassword", oldPwd);
                fd.set("newPassword", newPwd);
                fd.set("confirmPassword", confirmPwd);
                const { changeOwnPassword } = await import("@/app/console/account/actions");
                const r = await changeOwnPassword(fd);
                setPwdMsg(r.message);
                if (r.ok) {
                  setOldPwd("");
                  setNewPwd("");
                  setConfirmPwd("");
                }
              })
            }
            className="w-full rounded-md bg-brand-700 px-4 py-2 text-sm text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {pwdBusy ? "处理中…" : hasPassword ? "确认修改密码" : "设置密码"}
          </button>
          {pwdMsg && (
            <p
              className={`text-xs ${
                pwdMsg.includes("成功") ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {pwdMsg}
            </p>
          )}
        </div>
      </section>

      {/* 第三方账号 */}
      <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
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
