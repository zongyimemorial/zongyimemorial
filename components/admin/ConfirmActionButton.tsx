"use client";

import type { FormEventHandler } from "react";

/** 后台破坏性操作的确认表单：提交前原生确认，避免误删。 */
export default function ConfirmActionButton({
  action,
  id,
  label,
  confirmText,
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  label: string;
  confirmText: string;
}) {
  const onSubmit: FormEventHandler<HTMLFormElement> = (e) => {
    if (!window.confirm(confirmText)) e.preventDefault();
  };

  return (
    <form action={action} onSubmit={onSubmit}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
      >
        {label}
      </button>
    </form>
  );
}
