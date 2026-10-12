/**
 * 验证码发送与校验 —— 手机短信 + 邮箱，覆盖多种用途。
 *
 * 内测期：短信不发真实短信、邮件不发真实邮件，验证码均打印到服务端日志，
 *         且发送接口把验证码回显到响应（正式上线删除回显）。
 * 正式上线：改 sendSms / lib/mail.ts 接真实通道即可（接口不变）。
 *
 * SmsOtp / EmailOtp 表均有 purpose 字段：
 *   "login"（验证码登录）| "realname"（实名）| "reset"（找回/重置密码）
 *
 * 发码统一带 60 秒冷却限流，防止短信/邮件轰炸。
 */
import { prisma } from "@/lib/db";
import { randomInt } from "node:crypto";
import { sendMail, isMailConfigured } from "@/lib/mail";

/** 发码冷却时间（毫秒） */
const RATE_LIMIT_MS = 60_000;

/** 内测 mock 发短信 —— 正式上线替换为阿里云/腾讯云 SMS API */
export async function sendSms(phone: string, code: string): Promise<{ ok: boolean }> {
  console.log(`[内测 mock SMS] ${phone} 验证码: ${code}`);
  return { ok: true };
}

/** 校验发码冷却：同一 phone/email + purpose 在冷却期内已发过则拒绝 */
async function isRateLimited(where: { phone?: string; email?: string; purpose: string }): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_MS);
  if (where.phone) {
    const recent = await prisma.smsOtp.findFirst({
      where: { phone: where.phone, purpose: where.purpose, createdAt: { gt: since } },
      orderBy: { createdAt: "desc" },
    });
    return Boolean(recent);
  }
  const recent = await prisma.emailOtp.findFirst({
    where: { email: where.email!, purpose: where.purpose, createdAt: { gt: since } },
    orderBy: { createdAt: "desc" },
  });
  return Boolean(recent);
}

/** 生成并发送短信验证码（不要求登录）。purpose 默认 "login"。 */
export async function sendOtp(phone: string, purpose: string = "login"): Promise<{ ok: boolean; error?: string; code?: string }> {
  if (!/^1\d{10}$/.test(phone)) return { ok: false, error: "手机号格式不正确" };
  if (await isRateLimited({ phone, purpose })) {
    return { ok: false, error: "操作过于频繁，请 60 秒后再试" };
  }

  const code = String(randomInt(100000, 1000000));
  await prisma.smsOtp.create({
    data: { phone, code, purpose, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  await sendSms(phone, code);

  // 内测：把验证码回显给调用方（正式上线删除 code 字段）
  return { ok: true, code };
}

/** 校验短信验证码（校验后自动标记 consumed） */
export async function verifyOtp(phone: string, code: string, purpose: string = "login"): Promise<{ ok: boolean; error?: string }> {
  const rec = await prisma.smsOtp.findFirst({
    where: { phone, purpose, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!rec) return { ok: false, error: "验证码已过期或不存在，请重新获取" };
  if (rec.code !== code) return { ok: false, error: "验证码错误" };

  await prisma.smsOtp.update({ where: { id: rec.id }, data: { consumed: true } });
  return { ok: true };
}

/** 生成并发送邮箱验证码（不要求登录）。purpose 默认 "reset"。 */
export async function sendEmailOtp(email: string, purpose: string = "reset"): Promise<{ ok: boolean; error?: string; code?: string }> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "邮箱格式不正确" };
  if (await isRateLimited({ email, purpose })) {
    return { ok: false, error: "操作过于频繁，请 60 秒后再试" };
  }

  const code = String(randomInt(100000, 1000000));
  await prisma.emailOtp.create({
    data: { email, code, purpose, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  const mailRes = await sendMail({
    to: email,
    subject: "宗忆堂 · 验证码",
    text: `您的验证码是 ${code}（10 分钟内有效）。如非本人操作请忽略。`,
    html: `<p>您的验证码是 <b>${code}</b>（10 分钟内有效）。如非本人操作请忽略。</p>`,
  });
  // 真实 SMTP 已配置但发送失败：必须如实报错，不能假装已发送
  if (!mailRes.ok) {
    return { ok: false, error: "邮件发送失败，请稍后重试或联系客服" };
  }

  // 仅内测 mock（未接真实 SMTP）才回显验证码；正式上线不回显，防止泄露
  return { ok: true, code: isMailConfigured() ? undefined : code };
}

/** 校验邮箱验证码（校验后自动标记 consumed） */
export async function verifyEmailOtp(email: string, code: string, purpose: string = "reset"): Promise<{ ok: boolean; error?: string }> {
  const rec = await prisma.emailOtp.findFirst({
    where: { email, purpose, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!rec) return { ok: false, error: "验证码已过期或不存在，请重新获取" };
  if (rec.code !== code) return { ok: false, error: "验证码错误" };

  await prisma.emailOtp.update({ where: { id: rec.id }, data: { consumed: true } });
  return { ok: true };
}

/** 哪些 OAuth provider 已配置（env 里有密钥就算已配置） */
export const OAUTH_PROVIDERS = [
  { id: "wechat", name: "微信", icon: "💚", envAppId: "WECHAT_OAUTH_APP_ID", envSecret: "WECHAT_OAUTH_APP_SECRET" },
  { id: "qq", name: "QQ", icon: "🔵", envAppId: "QQ_APP_ID", envSecret: "QQ_APP_SECRET" },
  { id: "douyin", name: "抖音", icon: "🖤", envAppId: "DOUYIN_APP_ID", envSecret: "DOUYIN_APP_SECRET" },
  { id: "kuaishou", name: "快手", icon: "🟠", envAppId: "KUAISHOU_APP_ID", envSecret: "KUAISHOU_APP_SECRET" },
  { id: "toutiao", name: "头条", icon: "🔴", envAppId: "TOUTIAO_APP_ID", envSecret: "TOUTIAO_APP_SECRET" },
] as const;

/** 判断某 OAuth provider 是否已配置（有密钥） */
export function isProviderConfigured(providerId: string): boolean {
  const p = OAUTH_PROVIDERS.find((x) => x.id === providerId);
  if (!p) return false;
  return !!(process.env[p.envAppId] && process.env[p.envSecret]);
}
