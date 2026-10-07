"use client";

import { useRef } from "react";

/**
 * 审核决策按钮（客户端组件）
 *
 * 背景：在 Next.js Server Action 的表单里，直接用
 *   <button name="decision" value="active">
 * 存在兼容性问题——部分环境下浏览器不会把「被点击按钮的 name/value」写入
 * 提交数据（实测 enctype=multipart/form-data 时 `decision` 字段丢失），
 * 导致服务端 `formData.get("decision")` 为空、action 静默提前返回
 * （界面无报错、无状态变化，表现为「点了通过没反应」）。
 *
 * 修复：不使用按钮自带的 name/value，而是点击时把一个隐藏 input 的值写好
 * 再提交表单。这样无论浏览器/编码如何，decision 都必定随表单送达服务端。
 */
export default function DecisionButton({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={btnRef}
      type="submit"
      className={className}
      onClick={(e) => {
        const form = e.currentTarget.form;
        if (!form) return;
        let input = form.querySelector<HTMLInputElement>('input[data-decision-slot="1"]');
        if (!input) {
          input = document.createElement("input");
          input.type = "hidden";
          input.name = "decision";
          input.setAttribute("data-decision-slot", "1");
          form.appendChild(input);
        }
        input.value = value;
      }}
    >
      {label}
    </button>
  );
}
