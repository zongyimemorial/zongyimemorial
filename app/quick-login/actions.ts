"use server";

import { cookies } from "next/headers";
import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { currentOrigin } from "@/lib/origin";

/*
  一键登录的 Server Action。

  ⚠️ 必须由 Server Action（而非 Server Component 渲染期）调用 signIn ——
     只有前者能写 session cookie。放在 action 里也顺带拿到了 CSRF 保护
     （Next.js Server Action 自带同源校验）。
*/

function demoPassword(): string {
  return process.env.DEMO_ACCOUNT_PASSWORD || "admin123456";
}

export async function quickLoginAction(formData: FormData): Promise<void> {
  const identifier = String(formData.get("identifier") || "").trim();
  const from = String(formData.get("from") || "");
  const target = from.startsWith("/") ? from : "/console";

  if (!identifier) redirect("/login");

  /*
    顺手种下内测口令 cookie。
    为什么必须：手机端从一键登录链接进来时**没有** `preview_auth` cookie，
    登录后跳 /console 会被中间件拦回 /preview-gate —— 用户看到"登录成功却又回到门口"。
    （与 middleware.ts 里分享令牌放行时种 cookie 是同一个道理。）
  */
  const jar = await cookies();
  jar.set("preview_auth", "1", {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 60,
  });

  try {
    // 走**标准密码校验**：令牌已证明请求合法，密码由服务端提供。
    // 不使用 smsMode 免密开关（那是全站后门）。
    await signIn("credentials", {
      identifier,
      password: demoPassword(),
      redirect: false,
    });
  } catch {
    // signIn 失败时不以异常中断；下方 redirect 后若未登录，
    // /console 的鉴权会把用户送回登录页（不会静默放行）。
  }

  const origin = await currentOrigin();
  redirect(origin ? `${origin}${target}` : target);
}
