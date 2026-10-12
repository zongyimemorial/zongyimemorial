import { NextResponse } from "next/server";
import { verifyOtp, verifyEmailOtp } from "@/lib/sms";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 找回密码 · 校验验证码并重置（不要求登录）。
 * POST body: { channel: "sms" | "email", target, code, newPassword }
 * 返回 { ok } 或 { ok:false, error }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const channel = String(body.channel || "");
  const target = String(body.target || "").trim();
  const code = String(body.code || "").trim();
  const newPassword = String(body.newPassword || "");

  if (!["sms", "email"].includes(channel)) {
    return NextResponse.json({ ok: false, error: "通道无效" }, { status: 400 });
  }
  if (!target || !code) {
    return NextResponse.json({ ok: false, error: "信息不完整" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ ok: false, error: "新密码至少 6 位" }, { status: 400 });
  }

  // 1) 校验验证码（reset 用途）
  const verified =
    channel === "sms"
      ? await verifyOtp(target, code, "reset")
      : await verifyEmailOtp(target, code, "reset");
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.error }, { status: 400 });
  }

  // 2) 定位用户
  const user =
    channel === "sms"
      ? await prisma.user.findUnique({ where: { phone: target } })
      : await prisma.user.findUnique({ where: { email: target } });
  if (!user) {
    return NextResponse.json({ ok: false, error: "该账号不存在" }, { status: 400 });
  }

  // 3) 更新密码哈希（bcrypt，与注册/改密一致）
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
}
