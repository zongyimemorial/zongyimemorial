"use client";

import { useState } from "react";

/*
  CopyField —— 「一键复制」的地址/参数展示块

  直播指引里要塞很多"要你去别处复制、再粘回后台"的字符串：
    · YouTube 嵌入地址 https://www.youtube.com/embed/VIDEO_ID
    · YouTube 频道 ID（UC 开头 24 位）
    · 串流地址 rtmp://... 与串流密钥
    · HLS 播放地址 https://.../index.m3u8

  这些东西手抄极易出错（尤其 24 位的 UC 频道 ID、带签名参数的推流地址），
  而抄错的后果是"直播间一直黑屏"，用户很难自己定位。
  所以每个可复制的值都配一个复制按钮 —— 这是本页最实用的交互。

  为什么不直接用 navigator.clipboard：
  它在**非 HTTPS 或非 localhost** 环境下是 undefined（内测期可能走 http 内网访问）。
  因此保留 document.execCommand("copy") 作为回退，否则会出现"点了没反应"。
*/

type Props = {
  /** 展示用的主文本（会被复制的内容即为此值） */
  value: string;
  /** 左侧说明标签，如「嵌入地址」 */
  label?: string;
  /** 等宽字体展示（地址类用 true，中文说明类用 false） */
  mono?: boolean;
  /** 长文本允许换行显示 */
  wrap?: boolean;
};

export default function CopyField({ value, label, mono = true, wrap = true }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch {
      /* 下面走回退 */
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    setCopied(ok);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex items-stretch gap-2">
      <div className="min-w-0 flex-1">
        {label && <div className="mb-1 text-[11px] font-medium text-brand-500">{label}</div>}
        <code
          className={
            "block rounded-md border border-brand-200 bg-white px-3 py-2 text-[13px] text-brand-800 " +
            (mono ? "font-mono " : "") +
            (wrap ? "break-all" : "truncate")
          }
        >
          {value}
        </code>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`复制${label ?? "内容"}`}
        className={
          "shrink-0 self-end rounded-md border px-3 py-2 text-xs font-medium transition " +
          (copied
            ? "border-green-300 bg-green-50 text-green-700"
            : "border-brand-300 bg-white text-brand-700 hover:bg-brand-50")
        }
      >
        {copied ? "已复制" : "复制"}
      </button>
    </div>
  );
}
