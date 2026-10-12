"use client";

import { useState, useTransition, useActionState } from "react";
import { sendOtp, saveRealName } from "@/app/console/realname/actions";

type SaveState = { error?: string; ok?: boolean };

export default function RealnameForm({
  initialVerified,
  initialRealName,
  initialPhone,
}: {
  initialVerified: boolean;
  initialRealName: string;
  initialPhone: string;
}) {
  const [otpCode, setOtpCode] = useState("");
  const [msg, setMsg] = useState("");
  const [, startSend] = useTransition();
  const [state, formAction, pending] = useActionState<SaveState, FormData>(saveRealName, {});

  function handleSend() {
    const phone = (document.getElementById("phone") as HTMLInputElement | null)?.value;
    if (!phone) {
      setMsg("请先填写手机号");
      return;
    }
    startSend(async () => {
      const res = await sendOtp(phone);
      if (res.ok) {
        setOtpCode(res.code || "");
        setMsg("验证码已生成（内测演示：见下方提示/服务端日志）");
      } else {
        setMsg(res.error || "发送失败");
      }
    });
  }

  if (initialVerified) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-sm text-green-700">
        您已完成实名认证，证件信息已加密存储。
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-brand-200 bg-brand-100/70 p-6">
      <div>
        <label className="block text-sm text-brand-700">真实姓名</label>
        <input
          name="realName"
          defaultValue={initialRealName}
          required
          className="mt-1 w-full rounded border border-brand-200 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm text-brand-700">身份证号</label>
        <input
          name="idCard"
          required
          placeholder="内测测试号码（≥6 位）"
          className="mt-1 w-full rounded border border-brand-200 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm text-brand-700">手机号</label>
        <input
          id="phone"
          name="phone"
          defaultValue={initialPhone}
          required
          className="mt-1 w-full rounded border border-brand-200 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <input
          name="otp"
          placeholder="短信验证码"
          className="mt-1 flex-1 rounded border border-brand-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleSend}
          className="mt-1 rounded bg-brand-700 px-3 py-2 text-sm text-white hover:bg-brand-800"
        >
          发送验证码
        </button>
      </div>

      {otpCode && (
        <p className="text-xs text-amber-600">
          内测演示验证码：{otpCode}（真实环境由短信下发，不回显）
        </p>
      )}
      {msg && <p className="text-xs text-brand-500">{msg}</p>}
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand-800 px-4 py-2 text-sm text-white hover:bg-brand-900 disabled:opacity-50"
      >
        {pending ? "提交中…" : "提交实名（加密入库 + 进审核队列）"}
      </button>
    </form>
  );
}
