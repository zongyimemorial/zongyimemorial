/**
 * 邮件发送 · 统一入口。
 *
 * 正式环境：读取 SMTP_* 或 RESEND_API_KEY 等环境变量，用 nodemailer 真实发送。
 * 内测环境：未配置 SMTP 时自动降级为 mock —— 把验证码/正文打印到服务端日志，
 *           并返回 { ok:true, mock:true }（调用方据此决定是否回显验证码）。
 *
 * 调用方（找回密码验证码、通知）无需关心是否真实发送，统一 await sendMail(...)。
 */
import nodemailer from "nodemailer";

export interface SendMailInput {
  to: string;
  subject: string;
  /** 纯文本正文（mock 模式下主要用这个） */
  text?: string;
  /** HTML 正文（正式发送用） */
  html?: string;
  /** 回复地址（可选） */
  replyTo?: string;
}

/** 是否配置了可用的邮件通道（SMTP 或 Resend） */
export function isMailConfigured(): boolean {
  return Boolean(
    (process.env.SMTP_HOST && process.env.SMTP_USER) ||
      process.env.RESEND_API_KEY
  );
}

/** 默认发件人（显示名+地址） */
export function defaultFrom(): string {
  return process.env.SMTP_FROM || process.env.MAIL_FROM || "noreply@zongyimemorial.com";
}

/** 构造 nodemailer transport（SMTP 通用 / Resend 网关二选一） */
export function buildTransport() {
  // Resend 走 SMTP 兼容网关
  if (process.env.RESEND_API_KEY) {
    return nodemailer.createTransport({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: { user: "resend", pass: process.env.RESEND_API_KEY },
    });
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

/**
 * 发送邮件。内测未配置时降级 mock（只打印日志，返回 { ok:true, mock:true }）。
 * 真实配置下发送失败会返回 { ok:false, error }，调用方应据此提示用户。
 */
export async function sendMail(input: SendMailInput): Promise<{ ok: boolean; mock?: boolean; error?: string }> {
  const from = defaultFrom();

  if (!isMailConfigured()) {
    console.log(
      `[内测 mock MAIL] → ${input.to}\n  主题: ${input.subject}\n  正文: ${input.text || input.html || ""}`
    );
    return { ok: true, mock: true };
  }

  try {
    const transport = buildTransport();
    const info = await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
    });
    console.log(`[mail] 已发送 → ${input.to} (messageId=${info.messageId})`);
    return { ok: true };
  } catch (e) {
    console.warn("[mail] 发送失败：", (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * 校验 SMTP 连接与认证是否可用（供上线前自检 / 健康检查）。
 * 仅在配置了真实 SMTP 时有效；mock 模式下返回 { ok:false, mock:true }。
 */
export async function verifySmtpConnection(): Promise<{ ok: boolean; mock?: boolean; error?: string }> {
  if (!isMailConfigured()) return { ok: false, mock: true };
  try {
    const transport = buildTransport();
    await transport.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
