"use server";

import { revalidatePath } from "next/cache";
import { isPremiumUntil } from "@/lib/premium";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { spendPoints } from "@/lib/points";
import {
  ALL_CHART_TYPES,
  CHART_META,
  parseMembers,
  type ChartType,
} from "@/lib/genealogy-chart";

/** 收费版式的积分数（高级订阅用户免费） */
const PRO_CHART_POINTS = 600;

type GenealogyRow = {
  id: string;
  ownerId: string;
  chartUnlocked: string[];
  membersJson: unknown;
  chartType: string;
};

async function loadGenealogy(
  id: string,
): Promise<
  | { error: string }
  | { user: { id?: string }; g: GenealogyRow }
> {
  const user = await getCurrentUser();
  if (!user?.id) return { error: "请先登录" };
  const g = await prisma.genealogy.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      chartUnlocked: true,
      membersJson: true,
      chartType: true,
    },
  });
  if (!g) return { error: "族谱不存在" };
  if (g.ownerId !== user.id) return { error: "只有族谱所有者可以编辑族谱图" };
  return { user, g: g as GenealogyRow };
}

function isUserPremium(premiumUntil: Date | null | undefined) {
  return isPremiumUntil(premiumUntil);
}

function refresh(id: string) {
  revalidatePath(`/clan/genealogy/${id}`);
  revalidatePath(`/clan/genealogy/${id}/design`);
  revalidatePath("/clan/genealogy");
}

/** 保存族谱图（版式 + 世系 + 图面配置） */
export async function saveGenealogyChart(formData: FormData) {
  const id = String(formData.get("genealogyId") || "");
  const ctx = await loadGenealogy(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { g } = ctx;

  const user = await getCurrentUser();
  const dbUser = user?.id
    ? await prisma.user.findUnique({ where: { id: user.id }, select: { premiumUntil: true } })
    : null;
  const isPremium = isUserPremium(dbUser?.premiumUntil);

  const chartType = String(formData.get("chartType") || "ou") as ChartType;
  if (!ALL_CHART_TYPES.includes(chartType)) {
    return { ok: false, message: "版式不存在" };
  }

  const meta = CHART_META[chartType];
  if (meta.tier === "premium" && !isPremium && !g.chartUnlocked.includes(chartType)) {
    return { ok: false, message: "该版式为精美收费版式，请先积分兑换或开通高级订阅" };
  }

  let members: unknown = [];
  const rawJson = formData.get("membersJson");
  if (typeof rawJson === "string" && rawJson) {
    try {
      members = JSON.parse(rawJson);
    } catch {
      return { ok: false, message: "世系数据格式不正确" };
    }
  }
  const parsed = parseMembers(members);

  await prisma.genealogy.update({
    where: { id },
    data: {
      chartType,
      membersJson: parsed as object[],
      chartConfig: {
        title: String(formData.get("title") || "").slice(0, 60) || undefined,
        hallName: String(formData.get("hallName") || "").slice(0, 30) || undefined,
        origin: String(formData.get("origin") || "").slice(0, 60) || undefined,
        showNotes: String(formData.get("showNotes") || "") === "1",
        showGenLabels: String(formData.get("showGenLabels") || "") === "1",
      },
    },
  });

  refresh(id);
  return { ok: true, message: `已保存族谱图（${meta.name} · ${parsed.length} 人）` };
}

/** 用积分兑换精美版式 */
export async function unlockChartType(formData: FormData) {
  const id = String(formData.get("genealogyId") || "");
  const chartType = String(formData.get("chartType") || "") as ChartType;

  const ctx = await loadGenealogy(id);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { user, g } = ctx;

  if (!ALL_CHART_TYPES.includes(chartType)) return { ok: false, message: "版式不存在" };
  const meta = CHART_META[chartType];
  if (meta.tier !== "premium") return { ok: false, message: "该版式无需兑换" };

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id! },
    select: { premiumUntil: true },
  });
  if (isUserPremium(dbUser?.premiumUntil)) {
    return { ok: false, message: "高级订阅期内可直接使用，无需兑换" };
  }

  if (g.chartUnlocked.includes(chartType)) return { ok: true, message: "已解锁，可直接使用" };

  const paid = await spendPoints({
    userId: user.id!,
    amount: PRO_CHART_POINTS,
    reason: `兑换族谱图版式「${meta.name}」`,
    refId: id,
  });
  if (!paid) {
    return { ok: false, message: `积分不足，兑换「${meta.name}」需要 ${PRO_CHART_POINTS} 积分` };
  }

  await prisma.genealogy.update({
    where: { id },
    data: { chartUnlocked: { push: chartType } },
  });
  refresh(id);
  return { ok: true, message: `已用 ${PRO_CHART_POINTS} 积分解锁版式「${meta.name}」` };
}
