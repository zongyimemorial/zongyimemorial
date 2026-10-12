"use client";

/**
 * 二次确认的提交按钮（用于删除等破坏性操作）。
 *
 * 为什么需要它：破坏性操作放在 Server Action 表单里，若只用一个普通 submit 按钮，
 * 点错就没了。这里在提交前拦一道 confirm()。
 *
 * ⚠️ 与 DecisionButton 的区别（别混淆）：
 *   DecisionButton 需要把「点了哪个按钮」传给服务端，所以走隐藏 input 自建字段；
 *   本组件**不依赖按钮的 name/value**（目标 id 由表单里的隐藏 input 携带），
 *   因此只做 confirm + 原生提交即可，链路更短、更不容易出错。
 */
export default function ConfirmSubmitButton({
  message,
  children,
  className,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
