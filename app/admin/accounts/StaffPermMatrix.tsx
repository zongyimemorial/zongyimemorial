"use client";

import { useState } from "react";
import { ASSIGNABLE_MODULES, effectivePermKeys } from "@/lib/permissions";
import type { UserRole } from "@prisma/client";
import { updateStaffPermissions } from "./actions";

/**
 * 单个普通管理员的「模块权限」开关矩阵。
 * - 复选框反映该账号当前「有效权限」（显式 permissions 覆盖角色默认）；
 * - 保存时仅提交被勾选的 key，调用 updateStaffPermissions 写入该账号的 permissions；
 * - 未勾选任何模块并保存 → permissions=[] → 回退角色默认（全开），属预期行为。
 */
export default function StaffPermMatrix({
  id,
  role,
  permissions,
}: {
  id: string;
  role: UserRole;
  permissions: string[];
}) {
  const initial = effectivePermKeys(role, permissions) as string[];
  const [checked, setChecked] = useState<Set<string>>(new Set(initial));
  const allKeys = ASSIGNABLE_MODULES.map((m) => m.key as string);

  const toggle = (k: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  // 恢复「角色默认」：等于该角色未配置时的有效集合（admin=全 11，editor=4）
  const resetToDefault = () =>
    setChecked(new Set(effectivePermKeys(role, []) as string[]));
  const selectAll = () => setChecked(new Set(allKeys));
  const selectNone = () => setChecked(new Set());

  const isCustom = permissions && permissions.length > 0;

  return (
    <form action={updateStaffPermissions} className="space-y-3">
      <input type="hidden" name="id" value={id} />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={
            isCustom
              ? "rounded-full bg-amber-100 px-2 py-0.5 text-amber-700"
              : "rounded-full bg-gray-100 px-2 py-0.5 text-gray-500"
          }
        >
          {isCustom ? "已自定义" : "角色默认"}
        </span>
        <button
          type="button"
          onClick={selectAll}
          className="text-brand-700 underline hover:text-brand-900"
        >
          全选
        </button>
        <button
          type="button"
          onClick={selectNone}
          className="text-brand-700 underline hover:text-brand-900"
        >
          全不选
        </button>
        <button
          type="button"
          onClick={resetToDefault}
          className="text-brand-700 underline hover:text-brand-900"
        >
          恢复角色默认
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ASSIGNABLE_MODULES.map((m) => (
          <label
            key={m.key}
            className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm hover:border-brand-300"
            title={m.desc}
          >
            <input
              type="checkbox"
              name="perm"
              value={m.key}
              checked={checked.has(m.key)}
              onChange={() => toggle(m.key)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              <span className="font-medium text-gray-800">{m.label}</span>
              <span className="block text-[11px] leading-tight text-gray-400">
                {m.desc}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          保存该账号权限
        </button>
        <span className="text-xs text-gray-400">
          已选 {checked.size} / {allKeys.length} 个模块
        </span>
      </div>
    </form>
  );
}
