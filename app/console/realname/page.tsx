import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import RealnameForm from "@/components/console/RealnameForm";

export const metadata = { title: "实名认证" };

export default async function RealnamePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id! } });
  const queue = await prisma.moderationQueue.findFirst({
    where: { targetType: "realname", targetId: user.id! },
    orderBy: { createdAt: "desc" },
  });

  let statusText = "未提交";
  if (dbUser?.idVerified) statusText = "已认证";
  else if (queue)
    statusText =
      queue.status === "pending"
        ? "审核中"
        : queue.status === "rejected"
          ? "已驳回"
          : "审核中";

  return (
    <div className="container-page max-w-2xl py-12">
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm text-brand-400">
        <Link href="/console" className="hover:text-brand-700">控制台</Link>
        <span>/</span>
        <span className="text-brand-600">实名认证</span>
        <a
          href="/"
          className="ml-auto rounded-md border border-brand-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
        >
          ← 返回首页
        </a>
      </nav>
      <h1 className="mb-1 text-3xl font-semibold text-brand-900">实名认证</h1>
      <p className="mb-4 text-sm text-brand-500">
        当前状态：<span className="font-medium text-brand-700">{statusText}</span>
      </p>
      <p className="mb-6 text-xs text-brand-400">
        内测阶段仅收集测试数据；证件号以 AES-256 加密存储，公网阶段再补 PIPL 告知授权与云密钥管理。
      </p>
      <RealnameForm
        initialVerified={dbUser?.idVerified ?? false}
        initialRealName={dbUser?.realName || ""}
        initialPhone={dbUser?.phone || ""}
      />
    </div>
  );
}
