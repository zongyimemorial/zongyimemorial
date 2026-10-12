import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { OAUTH_PROVIDERS, isProviderConfigured } from "@/lib/sms";
import AccountPanel from "@/components/console/AccountPanel";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return (
      <div className="container-page max-w-2xl py-12 text-center">
        <p className="text-sm text-brand-500">请先登录后查看账号设置</p>
      </div>
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      phone: true,
      email: true,
      realName: true,
      idVerified: true,
      passwordHash: true,
      accounts: { select: { id: true, provider: true, createdAt: true } },
    },
  });
  if (!dbUser) notFound();

  const providers = OAUTH_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    configured: isProviderConfigured(p.id),
    linked: dbUser.accounts.some((a) => a.provider === p.id),
  }));

  return (
    <div className="container-page max-w-2xl py-8">
      <h1 className="text-2xl font-semibold text-brand-900">账号设置</h1>
      <p className="mt-1 text-sm text-brand-500">管理登录方式、手机号与第三方账号</p>

      <div className="mt-6 space-y-6">
        <AccountPanel
          userId={dbUser.id}
          phone={dbUser.phone}
          email={dbUser.email}
          realName={dbUser.realName}
          idVerified={dbUser.idVerified}
          providers={providers}
          hasPassword={!!dbUser.passwordHash}
        />
      </div>
    </div>
  );
}
