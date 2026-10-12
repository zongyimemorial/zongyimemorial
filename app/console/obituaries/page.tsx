import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { obituaryQuotaLeft } from "@/lib/obituary";

export const metadata = { title: "我的讣告" };

const STATUS_LABEL: Record<string, string> = {
  published: "已发布",
  unpublished: "已下架",
};

export default async function ObituariesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [list, quotaLeft] = await Promise.all([
    prisma.obituary.findMany({
      where: { ownerUserId: user.id! },
      orderBy: { createdAt: "desc" },
      include: { hall: { select: { id: true, name: true } } },
    }),
    obituaryQuotaLeft(user.id!),
  ]);

  return (
    <div className="container-page max-w-3xl py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-900">我的讣告</h1>
        <Link href="/console" className="text-sm text-brand-500 hover:text-accent-600">
          ← 返回控制台
        </Link>
      </div>

      {/* 配额概览 + 发布入口 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-200 bg-accent-50 p-4">
        <div>
          <div className="text-xs text-brand-500">剩余可发布份数</div>
          <div className="mt-0.5 text-2xl font-bold text-accent-700" data-obituary-quota>
            {quotaLeft}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {quotaLeft > 0 ? (
            <Link
              href="/console/obituaries/new"
              className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-700"
            >
              发布新讣告
            </Link>
          ) : (
            <>
              <Link
                href="/mall/e-obituary"
                className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-700"
              >
                去商城购买
              </Link>
              <Link
                href="/points"
                className="rounded-md border border-accent-300 px-4 py-2 text-sm font-medium text-accent-700 transition hover:bg-accent-100"
              >
                用积分兑换
              </Link>
            </>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-brand-300 p-10 text-center text-brand-400">
          <p className="mb-1">还没有发布过电子讣告。</p>
          <p className="text-sm">
            购买或用积分兑换「电子讣告发布」后，即可在这里填写并生成可分享的缅怀页。
          </p>
        </div>
      ) : (
        <ul className="space-y-3" data-obituary-list>
          {list.map((o) => (
            <li
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-brand-900">{o.deceasedName}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      o.status === "published"
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                  {o.passwordHash && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                      已加密
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-brand-400">
                  {o.hall ? `关联纪念馆：${o.hall.name}` : "独立讣告"} · 发布于{" "}
                  {o.createdAt.toLocaleDateString("zh-CN")}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Link
                  href={`/obituary/${o.id}`}
                  className="rounded-md border border-brand-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
                >
                  查看
                </Link>
                <Link
                  href={`/console/obituaries/${o.id}`}
                  className="rounded-md border border-brand-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
                >
                  管理
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
