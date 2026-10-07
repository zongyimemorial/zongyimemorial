import { NextResponse } from "next/server";
import { sendOtp } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 发送手机验证码（不要求登录）。
 * POST body: { phone, purpose?: "login" | "bindphone" }
 * 返回 { ok, code? }（内测期回显验证码，正式上线删除 code）
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = String(body.phone || "").trim();
  const purpose = String(body.purpose || "login");

  if (!phone) return NextResponse.json({ ok: false, error: "请输入手机号" }, { status: 400 });

  const result = await sendOtp(phone, purpose);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, code: result.code });
}
