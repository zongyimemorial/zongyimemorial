"use client";

import { useEffect } from "react";

// 全局导航自愈：
// localhost.run 隧道偶发瞬断时，Next 软导航（含浏览器前进/后退触发的
// RSC 拉取）会以 net::ERR_FAILED / ERR_CONNECTION_CLOSED / ERR_TIMED_OUT
// 静默失败，表现为“点了没反应 / 按返回键回不去”。
// 这里监听 Chromium 的 Navigation API（navigateerror）与 window 的
// unhandledrejection，在失败后自动整页重载一次，用户无感恢复。
export default function NavResilience() {
  useEffect(() => {
    let last = 0;
    const recover = (reason: string) => {
      const now = Date.now();
      if (now - last < 3000) return; // 防抖，避免连续失败反复刷新
      last = now;
      // 稍作延迟，给浏览器/隧道一次自愈机会
      setTimeout(() => {
        // 用 replace 避免污染历史，重载当前 URL 即可让浏览器原生重试
        window.location.reload();
      }, 250);
    };

    const nav = (window as unknown as { navigation?: EventTarget }).navigation;
    const onNavErr = () => recover("navigateerror");
    if (nav && typeof nav.addEventListener === "function") {
      nav.addEventListener("navigateerror", onNavErr);
    }

    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String((e?.reason && (e.reason.message || e.reason)) || "");
      if (/Failed to fetch|RSC|NetworkError|ERR_/i.test(msg)) recover("unhandledrejection:" + msg.slice(0, 60));
    };
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      if (nav && typeof nav.removeEventListener === "function") nav.removeEventListener("navigateerror", onNavErr);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
