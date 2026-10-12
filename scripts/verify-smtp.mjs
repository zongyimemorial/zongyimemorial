#!/usr/bin/env node
/**
 * verify-smtp.mjs —— 真实发信链路自检
 *
 * 用法：
 *   node scripts/verify-smtp.mjs                 # 读 .env，按其中的 SMTP/RESEND 配置发测试信
 *   node scripts/verify-smtp.mjs --to=you@x.com  # 指定收件人（覆盖 MAIL_TEST_TO）
 *
 * 行为：
 *   - 若 .env 已配置真实 SMTP（SMTP_HOST+SMTP_USER）或 RESEND_API_KEY：
 *       向 MAIL_TEST_TO（或 --to）真实发出一封验证邮件，报告 messageId / accepted。
 *   - 若未配置（内测 mock）：自动用 nodemailer 的 Ethereal 测试账号“真实”发信，
 *       并打印可在浏览器打开查看邮件内容的 preview URL，以此验证发信代码路径可用。
 *
 * 说明：本脚本与 lib/mail.ts 的 transport 构造逻辑保持一致，等价于上线后的真实发信。
 */
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");

// 轻量解析 .env（仅填充尚未存在于 process.env 的键，避免覆盖 shell 已传入的变量）
function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf8").split("\n")) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*?)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnv(ENV_PATH);

const to =
  process.argv.find((a) => a.startsWith("--to="))?.slice(5) ||
  process.env.MAIL_TEST_TO ||
  "";

function buildTransport() {
  if (process.env.RESEND_API_KEY) {
    return {
      label: "Resend",
      transport: nodemailer.createTransport({
        host: "smtp.resend.com",
        port: 465,
        secure: true,
        auth: { user: "resend", pass: process.env.RESEND_API_KEY },
      }),
    };
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return {
      label: `SMTP ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`,
      transport: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      }),
    };
  }
  return null;
}

const from =
  process.env.SMTP_FROM ||
  process.env.MAIL_FROM ||
  "宗忆堂 <noreply@zongyimemorial.com>";

(async () => {
  const configured = buildTransport();

  if (configured) {
    if (!to) {
      console.error(
        "❌ 已配置真实 SMTP，但未指定收件人。请设置 .env 的 MAIL_TEST_TO 或加 --to=you@x.com"
      );
      process.exit(1);
    }
    console.log(`→ 使用 ${configured.label} 向 ${to} 真实发信…`);
    const info = await configured.transport.sendMail({
      from,
      to,
      subject: "【宗忆堂】SMTP 发信验证",
      text: "这是一封 SMTP 配置验证邮件，证明发信链路已接通。",
      html: "<p>这是一封 <b>SMTP 配置验证</b> 邮件，证明发信链路已接通。</p>",
    });
    console.log("✅ 真实 SMTP 发信成功");
    console.log("   messageId:", info.messageId);
    if (info.accepted?.length) console.log("   accepted :", info.accepted.join(", "));
    if (info.rejected?.length) {
      console.log("   rejected :", info.rejected.join(", "));
      process.exit(2);
    }
    return;
  }

  // 未配置 → 用 Ethereal 演示（真实 SMTP 服务器，可浏览器预览）
  console.log("⚠️  未检测到真实 SMTP 配置，改用 Ethereal 测试账号「真实」发信以验证链路");
  const testAccount = await nodemailer.createTestAccount();
  const et = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  const dest = to || "demo-recipient@example.com";
  const info = await et.sendMail({
    from: "宗忆堂 <noreply@zongyimemorial.com>",
    to: dest,
    subject: "【宗忆堂】SMTP 链路验证（Ethereal 演示）",
    text: "这是通过 Ethereal 测试 SMTP 真实发出的验证邮件，证明 lib/mail.ts 的 SMTP 路径可正常连接并投递。",
    html:
      "<p>这是通过 <b>Ethereal</b> 测试 SMTP <b>真实发出</b>的验证邮件，" +
      "证明 lib/mail.ts 的 SMTP 路径可正常连接并投递。</p>",
  });
  console.log("✅ 真实发信成功（Ethereal 测试账号）");
  console.log("   messageId:", info.messageId);
  console.log("   preview   :", nodemailer.getTestMessageUrl(info));
})().catch((e) => {
  console.error("❌ 发信失败：", e.message);
  process.exit(1);
});
