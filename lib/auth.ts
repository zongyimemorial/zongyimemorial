import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { verifySmsVerifiedTicket } from "@/lib/quick-login";
import type { UserRole } from "@prisma/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  // 内测期同一实例可能被公网域名与本地端口同时访问（隧道场景）。
  // 关闭 Secure 前缀与 Secure 标记，使 cookie 不绑定到具体域名/协议，避免跨源丢登录。
  // 正式上线（单一 HTTPS 域名）时应删除此项，恢复 Auth.js 默认的安全 cookie。
  useSecureCookies: false,
  cookies: {
    sessionToken: {
      name: "authjs.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    callbackUrl: {
      name: "authjs.callback-url",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    Credentials({
      name: "password",
      credentials: {
        identifier: { label: "邮箱或手机号", type: "text" },
        password: { label: "密码", type: "password" },
        // 手机验证码登录：验证码校验通过后由服务端签发的**一次性票据**。
        // ⚠️ 绝不能用"明文布尔开关"（历史上的 smsMode="1"）——
        //    那等于任何能 POST /api/auth/callback/credentials 的人
        //    带上它就能免密登录任意账号（含管理员）。见 2026-10 安全修复。
        smsTicket: { label: "短信票据", type: "text" },
      },
      authorize: async (creds) => {
        const identifier = (creds?.identifier as string) || "";
        const password = (creds?.password as string) || "";
        const smsTicket = (creds?.smsTicket as string) || "";

        if (!identifier) return null;

        const user = await prisma.user.findFirst({
          where: { OR: [{ email: identifier }, { phone: identifier }] }
        });
        if (!user) return null;

        /*
          短信登录：只认**服务端签发的票据**。
          票据经 HMAC 签名、绑定手机号、2 分钟过期，客户端无法伪造。
          校验通过还必须确认票据绑定的手机号 == 本次 identifier，
          防止"拿 A 的票据登 B 的账号"。
        */
        let smsVerified = false;
        if (smsTicket) {
          const ticketPhone = await verifySmsVerifiedTicket(smsTicket);
          smsVerified = !!ticketPhone && ticketPhone === identifier && ticketPhone === user.phone;
        }

        if (!smsVerified) {
          // 走密码校验（短信票据无效/缺失时，回落到正常密码登录）
          if (!user.passwordHash) return null;
          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) return null;
        }

        return {
          id: user.id,
          email: user.email ?? undefined,
          name: user.realName ?? user.email ?? user.phone ?? undefined,
          role: user.role,
          idVerified: user.idVerified,
          // 按用户存储的细粒度后台模块权限；空数组=回退角色默认（见 lib/permissions.ts）
          permissions: user.permissions ?? []
        } as {
          id: string;
          email?: string;
          name?: string;
          role: UserRole;
          idVerified: boolean;
          permissions: string[];
        };
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: UserRole }).role;
        token.idVerified = (user as { idVerified?: boolean }).idVerified ?? false;
        token.permissions = (user as { permissions?: string[] }).permissions ?? [];
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub;
        (session.user as { role?: UserRole }).role = token.role as UserRole;
        (session.user as { idVerified?: boolean }).idVerified = (token.idVerified as boolean) ?? false;
        (session.user as { permissions?: string[] }).permissions = (token.permissions as string[]) ?? [];
      }
      return session;
    }
  }
});

/** 服务端获取当前会话用户（含 role、permissions 等） */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  return (session?.user ?? null) as SessionUser | null;
}

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: UserRole;
  idVerified?: boolean;
  // 按用户存储的细粒度后台模块权限；空数组=回退角色默认
  permissions?: string[];
};
