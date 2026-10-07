"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { verifyOtp } from "@/lib/sms";

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
