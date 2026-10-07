/**
 * Email 通道 · P0 预留实现
 *
 * 当前环境（内测沙箱）没有 Resend API key，本模块只在配置了
 * RESEND_API_KEY 时才真正发信；未配置时直接 return（不抛错）。
 *
 * 触达范围（一期）：忌日/生日/节日提醒、收到留言/献祭。
 * 反垃圾纪律：同一 dedupeKey 事件只发一封（由调用方 lib/notify.ts 保证幂等），
 * 绝不进入营销群发场景。
 */

import type { NotifyInput } from "@/lib/notify";

const FROM = process.env.MAIL_FROM || "宗忆堂 <noreply@zongyimemorial.com>";

export async function notifyByEmail(input: NotifyInput): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false; // 未配置：静默跳过（内测期常态）

  // 收件地址依赖用户表里的邮箱；这里通过回调拿不到，由调用方决定是否传。
  if (!input.link) return false;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [input.title], // 占位：真正接入时由调用方传收件人
        subject: input.title,
        html: `<p>${input.body ?? input.title}</p><p><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${input.link}">查看详情</a></p>`,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
