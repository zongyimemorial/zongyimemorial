import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  track,
  classifyChannel,
  deviceFromUA,
  regionFromIp,
  type TrackInput,
} from "@/lib/analytics";

const VALID_TYPES = new Set([
  "pageview",
  "visit_start",
  "share_open",
  "share_click",
]);

/**
 * 分析采集入口（公开 POST，无鉴权）。
 * 客户端只发最小字段（type/path/visitorId/sessionId）；
 * 渠道 / 省份 / 设备 / 登录用户 全部由服务端统一 enrich，保证口径一致、不可伪造。
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const incoming = Array.isArray(body) ? body : [body];
  if (!Array.isArray(incoming) || incoming.length === 0 || incoming.length > 50) {
    return NextResponse.json({ ok: false, error: "bad payload" }, { status: 400 });
  }

  const user = await getCurrentUser();
  const ua = req.headers.get("user-agent") || "";
  const referer = req.headers.get("referer");
  const ip =
    req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
  const device = deviceFromUA(ua);
  const region = regionFromIp(ip);
  const share = req.nextUrl.searchParams.get("share");
  const utmSource = req.nextUrl.searchParams.get("utm_source");
  const utmMedium = req.nextUrl.searchParams.get("utm_medium");
  const chan = classifyChannel({ referer, utmSource, utmMedium, share });

  const events: TrackInput[] = [];
  for (const item of incoming) {
    const e = item as Record<string, unknown>;
    const type = String(e.type || "");
    if (!VALID_TYPES.has(type)) continue;
    events.push({
      type,
      channel: chan.channel,
      source: chan.source,
      medium: chan.medium,
      region,
      device,
      path: typeof e.path === "string" ? e.path.slice(0, 200) : null,
      visitorId: typeof e.visitorId === "string" ? e.visitorId.slice(0, 64) : null,
      sessionId: typeof e.sessionId === "string" ? e.sessionId.slice(0, 64) : null,
      userId: user?.id ?? null,
    });
  }

  if (events.length) {
    try {
      await track(events);
    } catch (err) {
      return NextResponse.json({ ok: false, error: "write failed" }, { status: 500 });
    }
  }
  // 首访归因：未持 acq_channel 则写入（后续注册/建馆/首单据此归因）
  const res = NextResponse.json({ ok: true, count: events.length });
  if (!req.cookies.get("acq_channel")) {
    res.cookies.set("acq_channel", chan.channel, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 180,
    });
  }
  return res;
}
