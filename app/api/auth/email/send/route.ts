import { NextResponse } from "next/server";
import { sendEmailOtp } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 发送邮箱验证码（不要求登录）。
 * POST body: { email, purpose?: "reset" | "bindemail" }
 * 返回 { ok, code? }（内测期回显验证码，正式上线删除 code）
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const purpose = String(body.purpose || "reset");

  if (!email) return NextResponse.json({ ok: false, error: "请输入邮箱" }, { status: 400 });

  const result = await sendEmailOtp(email, purpose);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, code: result.code });
}
