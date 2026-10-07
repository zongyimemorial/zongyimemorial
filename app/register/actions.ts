"use server";

import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { grantInitialPointsOnRegister, applyInviteOnRegister, ensureInviteCode } from "@/lib/points";
import { currentOrigin } from "@/lib/origin";
import type { AuthState } from "@/app/login/actions";

export async function registerAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const inviteCode = String(formData.get("inviteCode") || "").trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "请输入有效邮箱" };
  }
  if (password.length < 6) {
    return { error: "密码至少 6 位" };
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return { error: "该邮箱已注册" };
  }

  const hash = await bcrypt.hash(password, 10);
  const newUser = await prisma.user.create({
    data: { email, passwordHash: hash, role: "user" }
  });
  await grantInitialPointsOnRegister(newUser.id);
  // 为自己生成邀请码（供后续邀请他人）
  await ensureInviteCode(newUser.id);
  // 若填写了邀请码，给邀请人 +20 积分
  if (inviteCode) {
    await applyInviteOnRegister({ newUserId: newUser.id, inviteCode });
  }

  let signedOk = false;
  try {
    // provider id 固定为 "credentials"，不能用 "password"
    // redirect:false —— 跳转源由下面按请求 Host 决定，避免 AUTH_URL 跨域名丢 cookie
    await signIn("credentials", { identifier: email, password, redirect: false });
    signedOk = true;
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "注册成功，请前往登录页登录" };
    }
    throw error;
  }

  if (signedOk) {
    const origin = await currentOrigin();
    redirect(origin ? `${origin}/console` : "/console");
  }
  return { ok: true };
}
