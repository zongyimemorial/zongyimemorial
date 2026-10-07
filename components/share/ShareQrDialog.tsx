"use client";

import { useEffect, useRef, useState } from "react";
import { QrCode } from "./QrCode";

/**
 * 二维码分享弹窗。
 *
 * 产品逻辑：**微信 / 头条没有官方 Web 分享接口**，桌面浏览器点"分享到微信"
 * 只能走"扫码"这一条路。所以对桌面端而言，二维码不是"锦上添花"，
 * 而是**唯一可用的微信分享路径** —— 这是本弹窗存在的根本理由。
 *
 * 三个细节（都踩过）：
 *   1. 打开时锁 body 滚动、关闭时**恢复原值**（不是硬写 ""）——
 *      否则会跟既有的全屏预览组件抢 scroll lock，把页面锁死；
 *   2. Esc 关闭 + 点遮罩关闭，符合用户直觉；
 *   3. 二维码本身用 <QrCode> 自绘 SVG，服务端就能渲染，无水合抖动。
 */
export function ShareQrDialog({
  open,
  url,
  title,
  onClose,
}: {
  open: boolean;
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const prevOverflow = useRef<string>("");

  useEffect(() => {
    if (!open) return;
    prevOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow.current;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  if (!open) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      data-share-qr-dialog
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="扫码分享"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-3 top-3 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <h3 className="text-center text-base font-semibold text-slate-900">扫码分享到微信 / 头条</h3>
        <p className="mt-1 text-center text-xs text-slate-500">用手机相机或微信「扫一扫」即可打开</p>

        <div className="mt-4 flex justify-center">
          <div className="rounded-xl border border-slate-200 p-3">
            <QrCode value={url} size={196} label={`分享「${title}」`} />
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <p className="break-all text-xs leading-relaxed text-slate-600" data-share-url>
            {url}
          </p>
        </div>

        <button
          type="button"
          onClick={copy}
          data-share-copy
          className="mt-3 w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          {copied ? "已复制链接" : "复制链接"}
        </button>
      </div>
    </div>
  );
}
