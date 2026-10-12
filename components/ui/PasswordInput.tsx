"use client";

import { useState } from "react";

/*
  PasswordInput —— 带「显示/隐藏」眼睛按钮的密码输入框

  为什么要抽组件而不是各页各写一份：
  全站有 10 处 `type="password"`，分布在登录、注册、找回密码、内测口令门、
  讣告密码档、控制台账号页、讣告表单等 8 个文件里。
  若在每个文件里手写"一个 input + 一个按钮 + 一份 useState"，
  就会出现"改了 6 处忘了 2 处"的经典问题（本项目 2026-10 已因同类原因踩过多次坑，
  见 AGENTS.md「同一真相只写两处」）。抽成组件后，加功能只改这一个文件。

  设计取舍：
  · **受控与非受控都支持**。多数页面走表单默认提交（非受控），
    只传 name/placeholder 即可；控制台账号页用 useState 管值（受控），传 value/onChange 即可。
    判据是 `value !== undefined`，不需要调用方额外声明模式。
  · **按钮不参与表单提交**：显式 `type="button"`。少了它，按钮在 form 里默认是 submit，
    点一下眼睛就把表单提交了 —— 这是极易忽略的真实缺陷。
  · **可访问性**：
      - 按钮有 `aria-label`（切换目标）与 `aria-pressed`（当前是否明文）
      - 输入框的 `aria-describedby` 不必加，但 `title` 给出状态提示
      - 眼睛用内联 SVG 而非 emoji：emoji 在不同系统上字形/基线差异大，
        且在部分安卓机型上会被渲染成彩色图案，与表单气质不符。
  · 眼睛按钮**绝对定位在右侧**，输入框加 `pr-10` 防文字被按钮盖住。
  · 点击后焦点留在按钮上（不主动 focus 回输入框）：用户常连点两次来回比对，
    焦点被抢走会让第二次点击落到别处。
*/

/** 眼睛：睁开（表示"点击可显示"） */
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** 眼睛被划掉（表示"点击可隐藏"） */
function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path d="M2 12s3.6-6.5 10-6.5c1.7 0 3.2.4 4.5 1M22 12s-3.6 6.5-10 6.5c-1.7 0-3.2-.4-4.5-1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" strokeLinecap="round" />
      <path d="M3 3l18 18" strokeLinecap="round" />
    </svg>
  );
}

type Props = {
  /** 表单字段名（非受控模式必填） */
  name?: string;
  /** 受控模式：传入 value 即启用 */
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  /** 供验收脚本/测试定位用（挂在 input 上） */
  "data-testid"?: string;
};

const BASE_INPUT =
  "w-full rounded-md border border-brand-300 px-3 py-2 pr-10 text-sm outline-none focus:border-brand-500";

export default function PasswordInput({
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  className,
  id,
  required,
  disabled,
  "data-testid": testId,
}: Props) {
  const [visible, setVisible] = useState(false);
  const controlled = value !== undefined;

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        {...(controlled ? { value, onChange } : {})}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        data-testid={testId}
        /* 密码框不参与拼写检查/自动纠正 —— 明文态下浏览器可能给密码打波浪线 */
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className={className ?? BASE_INPUT}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? "隐藏密码" : "显示密码"}
        aria-pressed={visible}
        title={visible ? "隐藏密码" : "显示密码"}
        /* 定位在输入框右侧垂直居中；文字色比正文浅，避免与输入内容抢视觉 */
        className="absolute right-0 top-0 flex h-full items-center px-3 text-brand-400 transition-colors hover:text-brand-700 disabled:opacity-40"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
