/**
 * 短信验证码 —— 手机验证码登录 + 关联手机。
 *
 * 内测期 mock：不发真实短信，验证码打印到服务端日志。
 * 正式上线后改 sendSms 函数接阿里云/腾讯云 SMS API 即可（接口不变）。
 *
 * SmsOtp 表已有 purpose 字段（"login" | "realname" | "bindphone"）。
 */
import { prisma } from "@/lib/db";
import { randomInt } from "node:crypto";

/** 内测 mock 发码 —— 正式上线替换为阿里云/腾讯云 SMS API */
export async function sendSms(phone: string, code: string): Promise<{ ok: boolean }> {
  console.log(`[内测 mock SMS] ${phone} 验证码: ${code}`);
  return { ok: true };
}

/** 生成并发送验证码（不要求登录，用于手机验证码登录） */
export async function sendOtp(phone: string, purpose: string = "login"): Promise<{ ok: boolean; error?: string; code?: string }> {
  if (!/^1\d{10}$/.test(phone)) return { ok: false, error: "手机号格式不正确" };

  const code = String(randomInt(100000, 1000000));
  await prisma.smsOtp.create({
    data: {
      phone,
      code,
      purpose,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 分钟有效
    },
  });

  await sendSms(phone, code);

  // 内测：把验证码回显给调用方（正式上线删除 code 字段）
  return { ok: true, code };
}

/** 校验验证码（校验后自动标记 consumed） */
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
