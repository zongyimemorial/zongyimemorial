import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import type { LiveStatus } from "@prisma/client";

export const metadata = { title: "云直播 · 重大事件直播" };

const LIVE_CATEGORIES = [
  "公祭仪式",
  "生态安葬仪式",
  "宗祠落成",
  "祭祖大典",
  "追悼会",
] as const;

const statusLabel: Record<LiveStatus, string> = {
  live: "直播中",
  ended: "回放",
  scheduled: "预告",
};

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "live", label: "直播中" },
  { key: "scheduled", label: "预告" },
  { key: "ended", label: "回放档案" },
];

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cat?: string }>;
}) {
  const { status: statusParam, cat } = await searchParams;
  const status = STATUS_TABS.some((t) => t.key === statusParam) && statusParam !== "all"
    ? (statusParam as LiveStatus)
    : undefined;

  const where = {
    isPublic: true,
    ...(status ? { status } : {}),
    ...(cat ? { category: cat } : {}),
  };

  const lives = await prisma.liveSession.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 60,
  });

  const liveCount = lives.filter((l) => l.status === "live").length;

  return (
    <div className="container-page max-w-6xl py-12">
      <header className="mb-8">
        <p className="mb-2 text-xs tracking-[0.3em] text-accent-600">LIVE MEMORIAL</p>
        <h1 className="text-3xl font-semibold text-brand-900">云直播大厅</h1>
        <p className="mt-2 max-w-2xl text-brand-500">
          殡葬祭祀重大事件直播（公祭仪式、生态安葬仪式）、宗亲宗族大型活动直播（宗祠落成、祭祖大典），
          以及直播回放与数字档案。支持接入 YouTube Live、Zoom 等免费直播平台。
        </p>
        {liveCount > 0 && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-1.5 text-sm text-red-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            当前有 {liveCount} 场直播正在进行
          </p>
        )}
      </header>

      {/* 状态筛选 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => {
          const active = (statusParam ?? "all") === t.key;
          return (
            <Link
              key={t.key}
              href={`/live?${new URLSearchParams({ ...(t.key !== "all" ? { status: t.key } : {}), ...(cat ? { cat } : {}) }).toString()}`}
              className={
                active
                  ? "rounded-full bg-brand-800 px-4 py-1.5 text-sm text-white"
                  : "rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm text-brand-600 hover:border-brand-300"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* 类型筛选 */}
      <div className="mb-8 flex flex-wrap gap-2">
        <Link
          href={`/live?${new URLSearchParams({ ...(statusParam && statusParam !== "all" ? { status: statusParam } : {}) }).toString()}`}
          className={
            !cat
              ? "rounded-md bg-accent-500 px-3 py-1 text-xs text-white"
              : "rounded-md border border-gray-200 bg-white px-3 py-1 text-xs text-brand-600 hover:border-accent-300"
          }
        >
          全部类型
        </Link>
        {LIVE_CATEGORIES.map((c) => (
          <Link
            key={c}
            href={`/live?${new URLSearchParams({ ...(statusParam && statusParam !== "all" ? { status: statusParam } : {}), cat: c }).toString()}`}
            className={
              cat === c
                ? "rounded-md bg-accent-500 px-3 py-1 text-xs text-white"
                : "rounded-md border border-gray-200 bg-white px-3 py-1 text-xs text-brand-600 hover:border-accent-300"
            }
          >
            {c}
          </Link>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {lives.map((l) => (
          <Link
            key={l.id}
            href={`/live/${l.id}`}
            className="group overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
          >
            <div className="relative aspect-video w-full overflow-hidden bg-brand-900">
              {l.coverImage ? (
                <Image
                  src={l.coverImage}
                  alt={l.title}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="h-full w-full bg-brand-900" />
              )}
              <span
                className={
                  l.status === "live"
                    ? "absolute left-3 top-3 flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-xs text-white"
                    : "absolute left-3 top-3 rounded bg-black/50 px-2 py-0.5 text-xs text-white"
                }
              >
                {l.status === "live" && (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                )}
                {statusLabel[l.status]}
              </span>
            </div>
            <div className="p-4">
              {l.category && (
                <div className="mb-1 text-xs text-accent-600">{l.category}</div>
              )}
              <h2 className="line-clamp-1 text-base font-semibold text-brand-900">
                {l.title}
              </h2>
              {l.description && (
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">{l.description}</p>
              )}
              <div className="mt-2 text-xs text-brand-400">
                {l.status === "ended" && l.endedAt
                  ? `直播于 ${new Date(l.endedAt).toLocaleDateString("zh-CN")} 结束 · 可观看回放`
                  : l.status === "scheduled" && l.startedAt
                    ? `${new Date(l.startedAt).toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} 开播`
                    : `${l.watchCount} 人观看`}
              </div>
            </div>
          </Link>
        ))}
        {lives.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-brand-500">
            暂无相关直播
          </div>
        )}
      </div>
    </div>
  );
}
