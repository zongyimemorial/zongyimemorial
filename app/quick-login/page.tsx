import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { verifyQuickLoginToken } from "@/lib/quick-login";
import QuickLoginForm from "./QuickLoginForm";

/*
  一键登录（内测演示用）—— 手机点开链接即登录，免手输账号密码。

  用法：访问 `/quick-login?t=<令牌>`，其中令牌由 `createQuickLoginToken(userId)`
  签发生成（见 scripts/make-quick-login.mts）。

  安全设计（令牌即临时密码）：
    - HMAC-SHA256 签名，密钥 AUTH_SECRET（仅服务端持有）→ 不可伪造；
    - 绑死 userId，篡改即签名失配；
    - 默认 10 分钟有效期；
    - 本页面 **noindex**（不能被搜索引擎收录）。

  ⚠️ 登录走的是**标准密码校验**（见 QuickLoginForm 的 action），
     **不使用 `smsMode=1` 那个免密开关** —— 那是明文参数，
     任何能调到 signIn 的路径带上它即可免密登录，等于全站后门。

  ⚠️ 为什么用客户端表单 + Server Action 而不是在 Server Component 里直接 signIn：
     `signIn()` 需要 Server Action（或 Route Handler）的请求上下文才能写 session cookie。
     在 Server Component 渲染期调用它会卡住/抛错（实测页面停在"加载中"）。

  ⚠️ 内测期专用。上线前应删除本目录 + 中间件白名单里的 "/quick-login"。
*/

export const metadata: Metadata = {
  title: "一键登录 · 宗忆堂",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function InvalidCard({ kind }: { kind: "expired" | "unavailable" }) {
  const isExpired = kind === "expired";
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="text-4xl">{isExpired ? "⌛" : "🚫"}</div>
        <h1 className="mt-4 text-xl font-semibold text-brand-900">
          {isExpired ? "链接已失效" : "账号不可用"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-brand-500">
          {isExpired
            ? "一键登录链接为一次性临时链接，有效期 10 分钟。请重新获取新链接，或前往登录页用账号密码登录。"
            : "该账号不存在或已被停用，无法完成一键登录。"}
        </p>
        <a
          href="/login"
          className="mt-6 inline-block rounded-md bg-accent-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-600"
        >
          前往登录页
        </a>
      </div>
    </div>
  );
}

export default async function QuickLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; to?: string }>;
}) {
  const { t, to } = await searchParams;
  const target = to && to.startsWith("/") ? to : "/console";

  const userId = await verifyQuickLoginToken(t ?? null);
  if (!userId) return <InvalidCard kind="expired" />;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, phone: true, status: true },
  });
  if (!user || user.status !== "active") return <InvalidCard kind="unavailable" />;

  const identifier = user.email || user.phone || "";
  if (!identifier) return <InvalidCard kind="unavailable" />;

  // 交给客户端表单自动提交 Server Action 完成登录
  return <QuickLoginForm identifier={identifier} target={target} />;
}
