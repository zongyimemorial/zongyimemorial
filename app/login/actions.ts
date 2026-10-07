"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { currentOrigin } from "@/lib/origin";
import { prisma } from "@/lib/db";
import { verifyOtp } from "@/lib/sms";
import { createSmsVerifiedTicket } from "@/lib/quick-login";

export interface AuthState {
  error?: string;
  ok?: boolean;
  code?: string; // 内测验证码回显
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const identifier = String(formData.get("identifier") || "").trim();
  const password = String(formData.get("password") || "");
  const from = String(formData.get("from") || "");
  const target = from.startsWith("/") ? from : "/console";

  if (!identifier || !password) {
    return { error: "请输入账号和密码" };
  }

  let signedOk = false;
  try {
    await signIn("credentials", { identifier, password, redirect: false });
    signedOk = true;
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "账号或密码错误" };
    }
    throw error;
  }

  if (signedOk) {
    const origin = await currentOrigin();
    redirect(origin ? `${origin}${target}` : target);
  }
  return { ok: true };
}

/**
 * 手机验证码登录。
 * ① 校验验证码 → ② 查/建 User → ③ signIn
 */
export async function smsLoginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const phone = String(formData.get("phone") || "").trim();
  const code = String(formData.get("code") || "").trim();
  const from = String(formData.get("from") || "");
  const target = from.startsWith("/") ? from : "/console";

  if (!phone || !code) return { error: "请输入手机号和验证码" };

  // 校验验证码
  const verify = await verifyOtp(phone, code, "login");
  if (!verify.ok) return { error: verify.error || "验证码错误" };

  // 查或建用户
  let user = await prisma.user.findFirst({ where: { phone } });
  if (!user) {
    // 新用户：凭手机号直接建号
    user = await prisma.user.create({
      data: {
        phone,
        // email/passwordHash 不设 —— 用户后续可在账号设置里补
      },
    });
  }

  /*
    验证码校验通过后，由**服务端签发一张短时效票据**交给 authorize。
    ⚠️ 绝不再用明文的 smsMode="1" 开关跳过密码 —— 那等于全站免密后门
       （任何人 POST /api/auth/callback/credentials 带上它即可登录任意账号）。
    票据经 HMAC 签名 + 绑定手机号 + 2 分钟过期，客户端无法伪造。
  */
  const smsTicket = await createSmsVerifiedTicket(user.phone ?? phone);
  if (!smsTicket) return { error: "登录服务暂不可用，请稍后重试" };

  // 用 credentials provider 登录（identifier=手机号, 用 phone → user 的映射）
  let signedOk = false;
  try {
    await signIn("credentials", {
      identifier: phone,
      smsTicket,
      redirect: false,
    });
    signedOk = true;
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "登录失败，请重试" };
    }
    throw error;
  }

  if (signedOk) {
    const origin = await currentOrigin();
    redirect(origin ? `${origin}${target}` : target);
  }
  return { ok: true };
}

