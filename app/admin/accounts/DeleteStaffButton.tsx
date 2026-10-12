"use client";

import { deleteStaffAccount } from "./actions";

/** 删除管理员账号按钮：带二次确认，避免误删（约束仍由服务端兜底） */
export function DeleteStaffButton({ id }: { id: string }) {
  return (
    <form action={deleteStaffAccount}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        onClick={(e) => {
          if (!confirm("确认删除该管理员账号？此操作不可恢复，且至少需保留 1 名超级管理员。")) {
            e.preventDefault();
          }
        }}
        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
      >
        删除
      </button>
    </form>
  );
}
