"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const VID_KEY = "zy_visitor_id";
const SID_KEY = "zy_session_id";
const SID_TS = "zy_session_ts";
const SESSION_TTL = 30 * 60 * 1000; // 30 分钟无活动 = 新会话

function uuid(): string {
  return (
    (crypto.randomUUID && crypto.randomUUID()) ||
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}

function getVisitorId(): string {
  let v = localStorage.getItem(VID_KEY);
  if (!v) {
    v = uuid();
    localStorage.setItem(VID_KEY, v);
  }
  return v;
}

/** 返回当前会话 id；若距上次活动超 TTL 或首次，则新建会话并返回 isNew */
function getSession(): { sid: string; isNew: boolean } {
  const now = Date.now();
  const ts = Number(sessionStorage.getItem(SID_TS) || 0);
  const existing = sessionStorage.getItem(SID_KEY);
  if (existing && now - ts <= SESSION_TTL) {
    sessionStorage.setItem(SID_TS, String(now));
    return { sid: existing, isNew: false };
  }
  const sid = uuid();
  sessionStorage.setItem(SID_KEY, sid);
  sessionStorage.setItem(SID_TS, String(now));
  return { sid, isNew: true };
}

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sentRef = useRef<string>("");

  useEffect(() => {
    // 避免 dev 严格模式双挂载重复发送
    const key = `${pathname}|${searchParams.toString()}`;
    if (sentRef.current === key) return;
    sentRef.current = key;

    const visitorId = getVisitorId();
    const { sid, isNew } = getSession();
    const share = searchParams.get("share");
    const events: { type: string; path: string; visitorId: string; sessionId: string }[] = [];

    // 分享链接进入：记一次 share_open（渠道归因由服务端按 ?share= 判定）
    if (share) {
      events.push({ type: "share_open", path: pathname, visitorId, sessionId: sid });
    }
    // 会话首触：visit_start；否则 pageview
    events.push({
      type: isNew ? "visit_start" : "pageview",
      path: pathname,
      visitorId,
      sessionId: sid,
    });

    const t = setTimeout(() => {
      fetch("/api/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(events),
        keepalive: true,
      }).catch(() => {});
    }, 300);

    return () => clearTimeout(t);
    // 仅在路由变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return null;
}
