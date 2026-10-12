import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/db";
import { verifyOtp } from "@/lib/sms";
import { createSmsVerifiedTicket } from "@/lib/quick-login";

function targetFrom(from?: string): string {
  return from && from.startsWith("/") ? from : "/console";
}

/**
 * 登录统一入口（密码 / 手机验证码），走普通 API 而非 Server Action。
 * 好处：API 路由地址在每次重新部署后保持不变，不会像 Server Action
 * 那样因构建产物哈希变化导致旧页面缓存提交到一个已不存在的 action 而无限挂起。
 */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 });
  }

  const identifier = String(body.identifier ?? "").trim();
  const password = String(body.password ?? "");
  const phone = String(body.phone ?? "").trim();
  const code = String(body.code ?? "").trim();
  const from = String(body.from ?? "");
  const target = targetFrom(from);

  console.log("[login-api] entry", {
    pwd: !!(identifier && password),
    sms: !!(phone && code),
    from,
  });

  let authed = false;
  try {
    if (phone && code) {
      // 手机验证码登录
      const verify = await verifyOtp(phone, code, "login");
      if (!verify.ok) {
        console.log("[login-api] 验证码校验失败:", verify.error);
        return NextResponse.json({ ok: false, error: verify.error || "验证码错误" });
      }
      let user = await prisma.user.findFirst({ where: { phone } });
      if (!user) {
        user = await prisma.user.create({ data: { phone } });
      }
      const userPhone = user.phone ?? phone;
      const smsTicket = await createSmsVerifiedTicket(userPhone);
      if (!smsTicket) {
        return NextResponse.json({ ok: false, error: "登录服务暂不可用，请稍后重试" });
      }
      try {
        await signIn("credentials", { identifier: userPhone, smsTicket, redirect: false });
      } catch (e) {
        if (e instanceof AuthError) {
          console.log("[login-api] sms signIn AuthError");
          return NextResponse.json({ ok: false, error: "登录失败，请重试" });
        }
        throw e;
      }
    } else if (identifier && password) {
      // 密码登录
      try {
        await signIn("credentials", { identifier, password, redirect: false });
      } catch (e) {
        if (e instanceof AuthError) {
          console.log("[login-api] pwd signIn AuthError");
          return NextResponse.json({ ok: false, error: "账号或密码错误" });
        }
        throw e;
      }
    } else {
      return NextResponse.json({ ok: false, error: "请输入账号密码或手机号验证码" });
    }
    authed = true;
  } catch (e) {
    console.error("[login-api] 异常:", e);
    return NextResponse.json(
      { ok: false, error: "登录服务暂时不可用，请稍后重试" },
      { status: 500 }
    );
  }

  if (!authed) {
    return NextResponse.json({ ok: false, error: "登录失败，请重试" });
  }

  // 授予内测门通行 cookie，避免跳 /console 被中间件弹回口令页
  const res = NextResponse.json({ ok: true, redirect: target });
  res.cookies.set("preview_auth", "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
  console.log("[login-api] ok, 耗时 %d ms, redirect=%s", Date.now() - t0, target);
  return res;
}
