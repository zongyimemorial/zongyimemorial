import BackLink from "@/components/site/BackLink";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { LiveStatus } from "@prisma/client";
import { generateLiveSubtitle } from "@/lib/live";

const statusLabel: Record<LiveStatus, string> = {
  live: "直播中",
  ended: "回放",
  scheduled: "预告",
};

export default async function LiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const live = await prisma.liveSession.findUnique({ where: { id } });
  if (!live || !live.isPublic) notFound();

  const subs = live.embedType === "video" ? await generateLiveSubtitle(live.streamUrl || "") : [];

  return (
    <div className="container-page max-w-4xl py-12">
      <div className="mb-4">
        <BackLink href="/live">返回云直播大厅</BackLink>
      </div>
      <div className="mb-2 flex items-center gap-3 text-xs">
        <span
          className={
            live.status === "live"
              ? "flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-white"
              : "rounded bg-brand-50 px-2 py-0.5 text-brand-700"
          }
        >
          {live.status === "live" && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-100/70" />
          )}
          {statusLabel[live.status]}
        </span>
        {live.category && <span className="text-accent-600">{live.category}</span>}
      </div>
      <h1 className="text-3xl font-semibold text-brand-900">{live.title}</h1>
      {live.description && (
        <p className="mt-3 leading-7 text-gray-700">{live.description}</p>
      )}

      <div className="mt-6 aspect-video w-full overflow-hidden rounded-lg bg-black">
        {live.embedType === "iframe" && live.streamUrl ? (
          <iframe
            src={live.streamUrl}
            className="h-full w-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title={live.title}
          />
        ) : live.streamUrl ? (
          <video className="h-full w-full" controls src={live.streamUrl} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-white/70">
            <span>{live.status === "scheduled" ? "开播前请稍候" : "信号准备中"}</span>
            <span className="text-xs text-white/40">
              支持接入 YouTube Live、Zoom 等免费直播平台（iframe 嵌入）
            </span>
          </div>
        )}
      </div>

      <section className="mt-8 rounded-lg border border-brand-200 bg-brand-100/70 p-5 text-sm text-gray-600">
        <h2 className="mb-2 text-base font-semibold text-brand-900">数字档案</h2>
        <ul className="space-y-1 text-brand-500">
          <li>· 本场直播纳入平台数字档案，回放长期保存、随时回看。</li>
          <li>· 观看人数：{live.watchCount + 1}</li>
          {live.startedAt && (
            <li>· 开播时间：{new Date(live.startedAt).toLocaleString("zh-CN")}</li>
          )}
          {live.endedAt && (
            <li>· 结束时间：{new Date(live.endedAt).toLocaleString("zh-CN")}</li>
          )}
        </ul>
      </section>

      {subs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold text-brand-900">实时字幕</h2>
          <p className="mb-3 text-xs text-brand-400">
            内测占位；公开阶段接入语音转写（需家属授权与数据合规评估）。
          </p>
          <ul className="space-y-1 text-sm text-gray-600">
            {subs.map((s, i) => (
              <li key={i}>
                <span className="mr-2 text-brand-400">[{s.time}]</span>
                {s.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
