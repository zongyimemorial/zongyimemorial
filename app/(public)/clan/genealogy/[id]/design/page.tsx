import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isPremium as isPremiumUser } from "@/lib/premium";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import GenealogyDesigner from "@/components/clan/GenealogyDesigner";
import {
  CHART_META,
  parseMembers,
  normalizeChartType,
  type ChartConfig,
  type ChartType,
} from "@/lib/genealogy-chart";

export const metadata = { title: "族谱图设计 · 宗忆堂" };

export default async function GenealogyDesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user?.id) redirect(`/login?from=/clan/genealogy/${id}/design`);

  const g = await prisma.genealogy.findUnique({ where: { id } });
  if (!g) notFound();
  // 非所有者仅可查看（设计仅对谱主开放）
  if (g.ownerId !== user.id) redirect(`/clan/genealogy/${id}`);

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { premiumUntil: true, points: true },
  });
  const isPremium = isPremiumUser(dbUser);
  const unlocked = g.chartUnlocked ?? [];

  const members = parseMembers(g.membersJson);
  const cfg = (g.chartConfig ?? {}) as Partial<ChartConfig>;
  const defaultType = normalizeChartType(g.chartType, { isPremium, unlocked });

  return (
    <div className="container-page max-w-7xl py-10">
      <nav className="mb-4 text-sm text-brand-400">
        <Link href="/clan" className="hover:text-brand-700">
          宗亲文化交流
        </Link>{" "}
        /{" "}
        <Link href="/clan/genealogy" className="hover:text-brand-700">
          族谱数字化数据库
        </Link>{" "}
        /{" "}
        <Link href={`/clan/genealogy/${g.id}`} className="hover:text-brand-700">
          {g.surname}氏族谱
        </Link>{" "}
        / 族谱图设计
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-brand-900">族谱图设计</h1>
        <p className="mt-1.5 text-sm text-brand-500">
          四种最通行的中国传统族谱体例：欧式（横行体）、苏式（垂珠体）、宝塔式（垂丝图）、牒记式。
          基础版式免费使用，精美版式可积分兑换或开通高级订阅。
        </p>
      </div>

      <GenealogyDesigner
        genealogyId={g.id}
        surname={g.surname}
        defaultType={defaultType}
        defaultConfig={{
          title: cfg.title ?? `${g.surname}氏族谱世系图`,
          hallName: cfg.hallName ?? g.hallName ?? "",
          origin: cfg.origin ?? g.origin ?? "",
          showNotes: cfg.showNotes !== false,
          showGenLabels: cfg.showGenLabels !== false,
        }}
        initialMembers={members}
        isPremium={isPremium}
        unlocked={unlocked}
        userPoints={dbUser?.points ?? 0}
      />

      <p className="mt-6 text-xs text-brand-400">
        当前共 {Object.keys(CHART_META).length} 种版式可选 ·{" "}
        <Link href={`/clan/genealogy/${g.id}`} className="text-accent-600 hover:underline">
          查看族谱详情 →
        </Link>
      </p>
    </div>
  );
}
