"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { verifyOtp, verifyEmailOtp } from "@/lib/sms";

export async function bindPhone(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const phone = String(formData.get("phone") || "").trim();
  const code = String(formData.get("code") || "").trim();

  if (!phone || !code) return { ok: false, message: "请输入手机号和验证码" };

  // 校验验证码
  const verify = await verifyOtp(phone, code, "bindphone");
  if (!verify.ok) return { ok: false, message: verify.error || "验证码错误" };

  // 检查手机号是否已被其他账号占用
  const existing = await prisma.user.findFirst({ where: { phone } });
  if (existing && existing.id !== user.id) {
    return { ok: false, message: "该手机号已绑定其他账号" };
  }

  await prisma.user.update({ where: { id: user.id }, data: { phone } });
  revalidatePath("/console/account");
  return { ok: true, message: "手机号绑定成功" };
}

/**
 * 用户自助「绑定邮箱」。
 * 与绑定手机号一致：必须邮箱验证码校验通过，且邮箱未被其他账号占用。
 * bindemail 验证码与 reset 验证码相互独立（lib/sms.ts 的 purpose 隔离）。
 */
export async function bindEmail(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const code = String(formData.get("code") || "").trim();

  if (!email || !code) return { ok: false, message: "请输入邮箱和验证码" };

  const verify = await verifyEmailOtp(email, code, "bindemail");
  if (!verify.ok) return { ok: false, message: verify.error || "验证码错误" };

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing && existing.id !== user.id) {
    return { ok: false, message: "该邮箱已绑定其他账号" };
  }

  await prisma.user.update({ where: { id: user.id }, data: { email } });
  revalidatePath("/console/account");
  return { ok: true, message: "邮箱绑定成功" };
}

/** 计算「解绑当前联系方式后是否仍至少保留一种联系方式」。 */
async function canUnbind(remaining: "phone" | "email"): Promise<{ ok: boolean; message?: string }> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { phone: true, email: true },
  });
  if (!dbUser) return { ok: false, message: "账号不存在" };

  // 解绑后「至少保留一种联系方式（手机号或邮箱）」：
  // 解绑手机 → 邮箱必须非空；解绑邮箱 → 手机必须非空。
  if (remaining === "email" && !dbUser.email) {
    return { ok: false, message: "您尚未绑定邮箱" };
  }
  if (remaining === "phone" && !dbUser.phone) {
    return { ok: false, message: "您尚未绑定手机号" };
  }
  if (remaining === "email" && !dbUser.phone) {
    return { ok: false, message: "解绑邮箱会导致无任何联系方式，请先绑定手机号" };
  }
  if (remaining === "phone" && !dbUser.email) {
    return { ok: false, message: "解绑手机会导致无任何联系方式，请先绑定邮箱" };
  }
  return { ok: true };
}

/** 用户自助「解绑手机号」。解绑后必须仍有邮箱作为联系方式兜底。 */
export async function unbindPhone(): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const guard = await canUnbind("phone");
  if (!guard.ok) return { ok: false, message: guard.message! };

  await prisma.user.update({ where: { id: user.id }, data: { phone: null } });
  revalidatePath("/console/account");
  return { ok: true, message: "手机号已解绑" };
}

/** 用户自助「解绑邮箱」。解绑后必须仍有手机号作为联系方式兜底。 */
export async function unbindEmail(): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const guard = await canUnbind("email");
  if (!guard.ok) return { ok: false, message: guard.message! };

  await prisma.user.update({ where: { id: user.id }, data: { email: null } });
  revalidatePath("/console/account");
  return { ok: true, message: "邮箱已解绑" };
}

/**
 * 用户自助「设置 / 修改」登录密码。
 *
 * 两种情况：
 * - 已设过密码（passwordHash 非空）：必须校验当前密码。
 *   这是防止他人借用已登录的会话直接改密、接管账号的关键闸门；
 * - 未设过密码（短信验证码注册而来）：可直接设置首次密码，
 *   设置后即可用「邮箱/手机号 + 密码」登录，不再只能依赖短信。
 */
export async function changeOwnPassword(
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const oldPassword = String(formData.get("oldPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (newPassword.length < 6) return { ok: false, message: "新密码至少 6 位" };
  if (newPassword !== confirmPassword) {
    return { ok: false, message: "两次输入的新密码不一致" };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!dbUser) return { ok: false, message: "账号不存在" };

  const hasPassword = !!dbUser.passwordHash;

  if (hasPassword) {
    if (!oldPassword) return { ok: false, message: "请输入当前密码" };
    const matched = await bcrypt.compare(oldPassword, dbUser.passwordHash as string);
    if (!matched) return { ok: false, message: "当前密码不正确" };
    if (oldPassword === newPassword) {
      return { ok: false, message: "新密码不能与当前密码相同" };
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  revalidatePath("/console/account");

  return {
    ok: true,
    message: hasPassword ? "密码修改成功" : "密码设置成功，下次可用密码登录",
  };
}
