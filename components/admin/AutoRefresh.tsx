"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const INTERVAL = 60; // 秒

/**
 * 后台运营监控用的轻量自动刷新组件。
 * 每 60 秒调用 router.refresh() 让 server component 重读数据库，
 * 实现「实时」体感；同时展示最后更新时间与倒计时。
 */
export default function AutoRefresh() {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [left, setLeft] = useState(INTERVAL);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setUpdatedAt(new Date());
    const tick = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          router.refresh();
          setUpdatedAt(new Date());
          return INTERVAL;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [router]);

  const hh = updatedAt ? updatedAt.getHours().toString().padStart(2, "0") : "--";
  const mm = updatedAt ? updatedAt.getMinutes().toString().padStart(2, "0") : "--";
  const ss = updatedAt ? updatedAt.getSeconds().toString().padStart(2, "0") : "--";

  return (
    <div
      data-autorefresh="true"
      className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-100/70 px-3 py-1 text-xs text-brand-600"
      title="页面每 60 秒自动刷新一次，数据始终为数据库最新值"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      {mounted
        ? `实时刷新 · 每 ${INTERVAL} 秒 · 最后更新 ${hh}:${mm}:${ss} · ${left}s`
        : "实时刷新 · 每 60 秒"}
    </div>
  );
}
