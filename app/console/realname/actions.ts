"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";

type SendResult = { ok: true; code: string } | { ok: false; error: string };

// 内测：不发真实短信，验证码打印于服务端日志并回显（仅内测演示）
export async function sendOtp(phone: string): Promise<SendResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "未登录" };
  if (!/^1\d{10}$/.test(phone)) return { ok: false, error: "手机号格式不正确" };

  const code = String(randomInt(100000, 1000000)); // 6 位
  await prisma.smsOtp.create({
    data: { phone, code, purpose: "realname", expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  console.log(`[内测 mock SMS] realname OTP for ${phone}: ${code}`);
  return { ok: true, code };
}

type SaveState = { error?: string; ok?: boolean };

export async function saveRealName(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const realName = String(formData.get("realName") || "").trim();
  const idCard = String(formData.get("idCard") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const otp = String(formData.get("otp") || "").trim();

  if (!realName || !idCard || !phone) return { error: "请填写姓名、证件号与手机号" };
  if (idCard.length < 6) return { error: "证件号格式不正确（内测请填 ≥6 位）" };

  const rec = await prisma.smsOtp.findFirst({
    where: { phone, purpose: "realname", consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!rec || rec.code !== otp) return { error: "验证码错误（内测验证码见服务端日志/页面提示）" };
  await prisma.smsOtp.update({ where: { id: rec.id }, data: { consumed: true } });

  const idCardEnc = encrypt(idCard);
  await prisma.user.update({
    where: { id: user.id! },
    data: {
      realName,
      idCardEncrypted: idCardEnc,
      idVerified: false,
      phone,
    },
  });
  await prisma.moderationQueue.create({
    data: {
      targetType: "realname",
      targetId: user.id!,
      contentSnapshot: { realName, phone },
      aiResult: { risk: "low", score: 0, labels: [] } as unknown as Prisma.InputJsonValue,
      status: "pending",
    },
  });

  revalidatePath("/console/realname");
  revalidatePath("/admin/review");
  redirect("/console/realname");
}
