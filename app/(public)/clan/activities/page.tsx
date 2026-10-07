import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import ActivitySignup from "@/components/clan/ActivitySignup";

export const metadata = { title: "宗族活动 · 宗忆堂" };

export default async function ActivitiesPage() {
  const user = await getCurrentUser();

  const [upcoming, finished] = await Promise.all([
    prisma.clanActivity.findMany({
      where: { status: { in: ["upcoming", "ongoing"] } },
      orderBy: { startAt: "asc" },
    }),
    prisma.clanActivity.findMany({
      where: { status: "finished" },
      orderBy: { startAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div className="container-page max-w-4xl py-10">
      <nav className="mb-4 text-sm text-brand-400">
        <Link href="/clan" className="hover:text-brand-700">宗亲文化</Link> / 宗族活动
      </nav>
      <h1 className="text-2xl font-semibold text-brand-900">宗族活动组织</h1>
      <p className="mt-2 text-sm text-brand-500">
        线上召集、线下活动联动：祭祖大典、宗亲联谊会、修谱研讨、家族议事。
      </p>

      <div className="mt-6 space-y-5">
        {upcoming.map((a) => {
          const full = a.signupCount >= a.capacity;
          return (
            <div key={a.id} className="rounded-xl border border-gray-100 bg-white p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accent-100 px-2.5 py-0.5 text-xs text-accent-700">
                  {a.kind}
                </span>
                {a.surname && (
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-brand-600">
                    {a.surname}氏专场
                  </span>
                )}
                <span className={`text-xs ${full ? "text-red-500" : "text-green-600"}`}>
                  {full ? "已满员" : `余 ${a.capacity - a.signupCount} 名额`}
                </span>
              </div>
              <h2 className="mt-2 text-lg font-semibold text-brand-900">{a.title}</h2>
              <div className="mt-1 text-sm text-brand-500">
                🕐 {new Date(a.startAt).toLocaleString("zh-CN")}
                <span className="mx-2">·</span>📍 {a.location}
                {a.onlineLink && (
                  <>
                    <span className="mx-2">·</span>
                    <a href={a.onlineLink} target="_blank" rel="noreferrer" className="text-accent-600 hover:underline">
                      线上参与入口
                    </a>
                  </>
                )}
              </div>
              {a.description && (
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-600">{a.description}</p>
              )}
              <div className="mt-4 flex items-center gap-4">
                <ActivitySignup activityId={a.id} isLoggedIn={!!user} full={full} finished={false} />
                <span className="text-xs text-brand-300">{a.signupCount} 人已报名</span>
              </div>
            </div>
          );
        })}
        {upcoming.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-brand-400">
            近期暂无活动，敬请关注
          </div>
        )}
      </div>

      {finished.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-brand-900">往期活动</h2>
          <ul className="space-y-2">
            {finished.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-lg bg-white p-4 text-sm">
                <span className="text-brand-700">{a.title}</span>
                <span className="text-xs text-brand-300">
                  {new Date(a.startAt).toLocaleDateString("zh-CN")} · {a.signupCount} 人参与
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
