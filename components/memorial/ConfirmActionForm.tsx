"use client";

import type { FormEventHandler } from "react";

/**
 * 破坏性操作的通用表单：提交前弹原生确认框，避免误删。
 * action 可为 server action 引用；token 透传用于免登录鉴权。
 */
export default function ConfirmActionForm({
  action,
  token,
  label,
  confirmText,
  variant = "danger",
  withReason = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  token: string;
  label: string;
  confirmText: string;
  variant?: "danger" | "warn";
  withReason?: boolean;
}) {
  const onSubmit: FormEventHandler<HTMLFormElement> = (e) => {
    if (!window.confirm(confirmText)) e.preventDefault();
  };

  const cls =
    variant === "danger"
      ? "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
      : "rounded-md border border-amber-400 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50";

  return (
    <form action={action} onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      {withReason && (
        <input
          name="reason"
          placeholder="原因（可选，如：信息有误 / 家属意愿）"
          className="w-full rounded border border-brand-200 px-2 py-1.5 text-sm"
        />
      )}
      <button type="submit" className={cls}>
        {label}
      </button>
    </form>
  );
}
