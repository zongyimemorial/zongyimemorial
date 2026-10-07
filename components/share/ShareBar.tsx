"use client";

import { useState } from "react";
import { ShareQrDialog } from "./ShareQrDialog";

/**
 * 一键分享横条。挂在文章详情页 / 纪念馆公页 / 宗祠公页。
 *
 * 分渠道策略（国内社交平台的现实约束）：
 *
 *   ┌─────────────┬──────────────────────────────────────────┐
 *   │ 手机端      │ navigator.share() 唤起系统面板 —— 面板里    │
 *   │             │ 天然含微信、头条、QQ、微博等原生 App，      │
 *   │             │ 这是唯一能真正"分享进微信"的 Web 能力。     │
 *   ├─────────────┼──────────────────────────────────────────┤
 *   │ 桌面端      │ 微信/头条没有 Web 分享接口 → 主推**二维码** │
 *   │             │ （手机扫码即在微信里打开）；另配微博/QQ空间  │
 *   │             │ 等有 Web 直链的平台。                      │
 *   └─────────────┴──────────────────────────────────────────┘
 *
 * ⚠️ `navigator.share` 必须来自**用户手势**（click 回调）里调用，
 *    不能在 useEffect 里自动调 —— 浏览器会以 NotAllowedError 拒绝。
 *    且在非安全上下文（http 非 localhost）下压根不存在，所以要 typeof 判断。
 */

type Platform = {
  key: string;
  label: string;
  href: (url: string, title: string) => string;
};

// 仅有 Web 分享接口的平台（微信/头条不在其列 —— 它们只能靠二维码/原生面板）
const WEB_PLATFORMS: Platform[] = [
  {
    key: "weibo",
    label: "微博",
    href: (url, title) =>
      `https://service.weibo.com/share/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  },
  {
    key: "qzone",
    label: "QQ空间",
    href: (url, title) =>
      `https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  },
  {
    key: "douban",
    label: "豆瓣",
    href: (url, title) =>
      `https://www.douban.com/share/service?href=${encodeURIComponent(url)}&name=${encodeURIComponent(title)}`,
  },
];

export function ShareBar({
  url,
  title,
  summary,
  scope,
}: {
  /** 完整可分享 URL（已含 share 令牌，由服务端签发） */
  url: string;
  title: string;
  summary?: string;
  /** 语义标签，仅用于 data 属性便于断言 */
  scope: string;
}) {
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareText = summary ? `${title} — ${summary}` : title;

  async function onShare() {
    // 手机端：唤起系统分享面板（微信/头条都在里面）
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && typeof nav.share === "function") {
      try {
        await nav.share({ title, text: shareText, url });
        return;
      } catch (err) {
        // 用户主动取消（AbortError）不是错误，静默返回；
        // 其他失败（如桌面浏览器不支持目标）则回落到二维码弹窗。
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    setQrOpen(true);
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <div
        data-share-bar={scope}
        className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 p-3"
      >
        <span className="mr-1 text-sm font-medium text-slate-700">分享</span>

        {/* 主按钮：手机唤起系统面板、桌面弹二维码 */}
        <button
          type="button"
          onClick={onShare}
          data-share-primary
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
          分享到微信 / 头条
        </button>

        {/* 二维码：桌面端进微信的唯一路径，故显式暴露而非藏在主按钮里 */}
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          data-share-qr
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm text-slate-700 transition hover:border-brand-400 hover:text-brand-700"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" />
          </svg>
          二维码
        </button>

        <button
          type="button"
          onClick={onCopy}
          data-share-copy-link
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm text-slate-700 transition hover:border-brand-400 hover:text-brand-700"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.5 1.5" />
            <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12 19" />
          </svg>
          {copied ? "已复制" : "复制链接"}
        </button>

        {WEB_PLATFORMS.map((p) => (
          <a
            key={p.key}
            href={p.href(url, title)}
            target="_blank"
            rel="noopener noreferrer"
            data-share-platform={p.key}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-500 transition hover:border-slate-400 hover:text-slate-800"
          >
            {p.label}
          </a>
        ))}
      </div>

      <ShareQrDialog open={qrOpen} url={url} title={title} onClose={() => setQrOpen(false)} />
    </>
  );
}
