import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import ClanComposer from "@/components/clan/ClanComposer";
import ClanReply from "@/components/clan/ClanReply";

export const metadata = { title: "宗亲社区 · 宗忆堂" };

const TOPIC_STYLE: Record<string, string> = {
  寻根问祖: "bg-amber-50 text-amber-700",
  家族事务: "bg-blue-50 text-blue-700",
  联谊交流: "bg-green-50 text-green-700",
  字辈讨论: "bg-purple-50 text-purple-700",
};

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ surname?: string; topic?: string }>;
}) {
  const { surname, topic } = await searchParams;
  const user = await getCurrentUser();

  // 我的馆/祠社区（邀请制的私密社区，与下方公共广场是两回事）
  const myHalls = user?.id
    ? await prisma.memorialHall.findMany({
        where: { ownerUserId: user.id, status: "active" },
        select: { id: true, name: true, deceasedName: true },
        take: 3,
      })
    : [];
  const myClans = user?.id
    ? await prisma.clanHall.findMany({
        where: { ownerUserId: user.id, status: "active" },
        select: { id: true, hallName: true },
        take: 3,
      })
    : [];
  const hasMine = myHalls.length > 0 || myClans.length > 0;

  const posts = await prisma.clanPost.findMany({
    where: {
      status: "approved",
      ...(surname ? { surname } : {}),
      ...(topic ? { topic } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      user: { select: { realName: true, email: true } },
      replies: {
        where: { status: "approved" },
        orderBy: { createdAt: "asc" },
        take: 5,
        include: { user: { select: { realName: true, email: true } } },
      },
    },
  });

  return (
    <div className="container-page max-w-4xl py-10">
      <nav className="mb-4 text-sm text-brand-400">
        <Link href="/clan" className="hover:text-brand-700">宗亲文化</Link> / 宗亲社区
      </nav>
      <h1 className="text-2xl font-semibold text-brand-900">宗亲联谊互动</h1>
      <p className="mt-2 text-sm text-brand-500">
        宗亲社区交流、家族事务在线协商。实名发帖、先审后显，共同维护理性友善的交流氛围。
      </p>

      {/*
        我的社区（邀请制私域）。
        用户反馈：「宗亲社区没看到有邀请功能」—— 因为邀请制社区在各自的馆/祠里
        （/halls/[id]/community 与 /clan/halls/[id]/community），而本页是公共广场。
        这里显式把两者区分开，并给出直达入口，避免用户在广场里找邀请按钮。
      */}
      {user && (
        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
          <h2 className="text-sm font-semibold text-brand-700">
            💬 想和家人私密交流？（邀请制社区在这里）
          </h2>
          <p className="mt-1 text-xs text-brand-500">
            本页是<b>全体宗亲的公共广场</b>。想要只有亲朋好友的私密社区（可发图片视频），请进入你的馆/祠社区：
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {myClans.map((c) => (
              <Link
                key={c.id}
                href={`/clan/halls/${c.id}/community`}
                className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
              >
                🏛️ {c.hallName} · 社区 →
              </Link>
            ))}
            {myHalls.map((h) => (
              <Link
                key={h.id}
                href={`/halls/${h.id}/community`}
                className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800"
              >
                🕯️ {h.name} · 社区 →
              </Link>
            ))}
            {!hasMine && (
              <span className="text-xs text-brand-400">
                你还没有自己的馆/祠 —— 建立后即可开通邀请制社区
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {["寻根问祖", "家族事务", "联谊交流", "字辈讨论"].map((t) => (
          <Link
            key={t}
            href={topic === t ? "/clan/community" : `/clan/community?topic=${encodeURIComponent(t)}`}
            className={`rounded-full border px-3 py-1 text-xs ${topic === t ? "border-accent-400 bg-accent-50 text-accent-700" : "border-brand-200 text-brand-500 hover:border-accent-300"}`}
          >
            {t}
          </Link>
        ))}
      </div>

      <section className="mt-6">
        <ClanComposer isLoggedIn={!!user} idVerified={!!user?.idVerified} />
      </section>

      <div className="mt-8 space-y-5">
        {posts.map((p) => (
          <article key={p.id} className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-brand-400">
              <span className={`rounded-full px-2 py-0.5 ${TOPIC_STYLE[p.topic] ?? "bg-gray-50 text-gray-600"}`}>
                {p.topic}
              </span>
              <span className="font-medium text-brand-600">{p.surname}氏圈子</span>
              <span>
                {p.user?.realName ? `${p.user.realName.slice(0, 1)}宗亲` : (p.user?.email || "宗亲")}
              </span>
              <span>{new Date(p.createdAt).toLocaleDateString("zh-CN")}</span>
            </div>
            <h2 className="mt-2 font-semibold text-brand-900">{p.title}</h2>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-gray-600">{p.body}</p>
            <div className="mt-3 border-t border-gray-50 pt-3">
              <ClanReply postId={p.id} isLoggedIn={!!user} />
              {p.replies.map((r) => (
                <div key={r.id} className="mt-3 rounded-lg bg-brand-50/60 p-3 text-sm">
                  <span className="text-xs font-medium text-brand-600">
                    {r.user?.realName ? `${r.user.realName.slice(0, 1)}宗亲` : "宗亲"}
                  </span>
                  <span className="ml-2 text-gray-600">{r.body}</span>
                </div>
              ))}
              {p.replyCount > 0 && p.replies.length === 0 && (
                <p className="mt-2 text-xs text-brand-300">共 {p.replyCount} 条回帖，审核中…</p>
              )}
            </div>
          </article>
        ))}
        {posts.length === 0 && (
          <div className="rounded-xl border border-dashed border-brand-200 bg-brand-100/70 p-10 text-center text-sm text-brand-400">
            暂无话题，欢迎发布第一个帖子
          </div>
        )}
      </div>
    </div>
  );
}
