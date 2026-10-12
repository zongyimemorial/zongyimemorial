import { NextResponse } from "next/server";
import { sendOtp, sendEmailOtp } from "@/lib/sms";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 找回密码 · 发送验证码（不要求登录）。
 * POST body: { channel: "sms" | "email", target: 手机号 | 邮箱 }
 * 返回 { ok, code? }（内测期回显验证码，正式上线删除 code）
 *
 * 安全说明：此处对“账号不存在”返回明确错误，便于内测与用户体验。
 * 正式上线若需防账号枚举，可改为统一返回 { ok:true } 但不再下发真实验证码。
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const channel = String(body.channel || "");
  const target = String(body.target || "").trim();

  if (!["sms", "email"].includes(channel)) {
    return NextResponse.json({ ok: false, error: "通道无效" }, { status: 400 });
  }
  if (!target) {
    return NextResponse.json({ ok: false, error: "请输入手机号或邮箱" }, { status: 400 });
  }

  // 校验账号确实存在（否则无意义地发码）
  const user =
    channel === "sms"
      ? await prisma.user.findUnique({ where: { phone: target } })
      : await prisma.user.findUnique({ where: { email: target } });
  if (!user) {
    return NextResponse.json({ ok: false, error: "该账号未注册" }, { status: 400 });
  }

  const result =
    channel === "sms"
      ? await sendOtp(target, "reset")
      : await sendEmailOtp(target, "reset");
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, code: result.code });
}
