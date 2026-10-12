"use client";

import { useEffect, useRef, useState } from "react";

/*
  路由段错误边界。

  ⚠️ 为什么要**自动重试**：
  本站跑在 localhost.run 免费隧道上，边缘节点约 30–60% 的请求会
  直接坏在 TLS 握手上（curl 报 `exit=35`），表现为页面白屏「页面加载遇到问题」。
  这不是应用出错 —— 同一个 URL 再请求一次大概率就 200 了。

  所以：先自动重试几次（间隔递增），失败到上限才让用户看到按钮。
  让用户为基础设施抖动去手点「重试」是说不通的。

  上限设 3 次、总等待约 5.4s —— 够覆盖边缘节点的抖动窗口，
  又不至于让用户干等太久（超过这个数说明多半不是抖动，是真的出问题了）。
*/
const MAX_AUTO_RETRY = 3;
const DELAYS = [800, 1600, 3000];

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const retryRef = useRef(0);
  const [autoTrying, setAutoTrying] = useState(true);

  useEffect(() => {
    console.error("[route-error]", error?.message);
  }, [error]);

  useEffect(() => {
    if (retryRef.current >= MAX_AUTO_RETRY) {
      setAutoTrying(false);
      return;
    }
    const n = retryRef.current;
    const t = setTimeout(() => {
      retryRef.current += 1;
      // reset() 会重新渲染路由段；若仍失败，本组件会再次挂载，
      // retryRef 归零 → 会无限重试。用 sessionStorage 记一把，
      // 保证"这一轮抖动"总共只自动重试 MAX_AUTO_RETRY 次。
      try {
        const k = "route-auto-retry";
        const cur = Number(sessionStorage.getItem(k) || "0");
        if (cur >= MAX_AUTO_RETRY) {
          setAutoTrying(false);
          return;
        }
        sessionStorage.setItem(k, String(cur + 1));
      } catch {
        // 隐私模式下 sessionStorage 可能不可用 —— 不影响主流程
      }
      reset();
    }, DELAYS[n] ?? 3000);
    return () => clearTimeout(t);
  }, [reset]);

  // 一旦成功渲染（本组件被卸载），清掉计数，让下次新错误仍能自动重试
  useEffect(() => {
    return () => {
      try {
        sessionStorage.removeItem("route-auto-retry");
      } catch {
        // ignore
      }
    };
  }, []);

  return (
    <div className="container-page flex min-h-[60vh] max-w-xl flex-col items-center justify-center py-12 text-center">
      <div className="w-full rounded-2xl border border-brand-100 bg-brand-100/70 p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-brand-900">页面加载遇到问题</h1>
        <p className="mt-2 text-sm text-brand-500">
          {autoTrying
            ? "正在自动重连…（网络出现了短暂波动）"
            : "网络似乎出现了短暂波动，请重试或返回上一页。"}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={() => {
              try {
                sessionStorage.removeItem("route-auto-retry");
              } catch {
                // ignore
              }
              reset();
            }}
            className="w-full rounded-lg bg-brand-700 py-3 font-medium text-white transition hover:bg-brand-800"
          >
            重试
          </button>
          <a
            href="/"
            className="w-full rounded-lg border border-brand-300 py-3 font-medium text-brand-700 transition hover:bg-gray-50"
          >
            返回首页
          </a>
        </div>
      </div>
    </div>
  );
}
