import Link from "next/link";
import { prisma } from "@/lib/db";

export const metadata = { title: "宗亲文化交流" };

const FEATURES = [
  {
    href: "/clan/genealogy",
    icon: "📜",
    title: "族谱数字化数据库",
    desc: "支持各姓氏族谱上传、数字化存储与检索，并可设计多版式族谱图。",
    action: "进入族谱库",
  },
  {
    href: "/clan/halls",
    icon: "🏛️",
    title: "设立宗祠",
    desc: "为你的姓氏立一座线上宗祠，填写堂号始祖字辈，并按心意装修祠堂空间。",
    action: "设立宗祠",
  },
  {
    href: "/clan/roots",
    icon: "🧭",
    title: "寻根谒祖服务",
    desc: "基于族谱数据按姓氏、祖籍智能匹配与溯源，一键寻根问祖。",
    action: "开始寻根",
  },
  {
    href: "/clan/community",
    icon: "💬",
    title: "宗亲联谊互动",
    desc: "宗亲社区交流、家族事务在线协商，实名认证营造可信氛围。",
    action: "进入社区",
  },
  {
    href: "/clan/activities",
    icon: "⛩️",
    title: "宗族活动组织",
    desc: "线上召集、线下活动联动：祭祖大典、宗亲联谊、修谱研讨。",
    action: "查看活动",
  },
];

export default async function ClanPage() {
  const [genealogyCount, surnameRows, postCount, activities, clanHallCount] = await Promise.all([
    prisma.genealogy.count({ where: { status: "approved", isPublic: true } }),
    prisma.genealogy.groupBy({
      by: ["surname"],
      where: { status: "approved", isPublic: true },
      _count: { surname: true },
      orderBy: { _count: { surname: "desc" } },
      take: 12,
    }),
    prisma.clanPost.count({ where: { status: "approved" } }),
    prisma.clanActivity.findMany({
      where: { status: { in: ["upcoming", "ongoing"] }, reviewStatus: "approved" },
      orderBy: { startAt: "asc" },
      take: 2,
    }),
    prisma.clanHall.count({ where: { status: "active", isPublic: true } }),
  ]);

  return (
    <div className="container-page max-w-5xl py-10">
      <section className="mb-10 rounded-2xl bg-gradient-to-br from-brand-900 to-brand-700 p-10 text-white">
        <h1 className="text-3xl font-semibold tracking-wide">宗亲文化交流</h1>
        <p className="mt-3 max-w-2xl leading-7 text-white/80">
          以数字化族谱为根基，融合寻根谒祖、宗亲联谊互动、宗族活动组织等功能于一体，让游子记得住乡愁、找得到来处。
        </p>
        {surnameRows.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            {surnameRows.map((r) => (
              <Link
                key={r.surname}
                href={`/clan/genealogy?surname=${encodeURIComponent(r.surname)}`}
                className="rounded-full bg-white/10 px-4 py-1.5 hover:bg-white/20"
              >
                {r.surname}氏 · {r._count.surname} 部
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group rounded-xl border border-brand-200 bg-brand-100/70 p-6 transition hover:border-accent-300 hover:shadow-sm"
          >
            <div className="text-3xl">{f.icon}</div>
            <h2 className="mt-3 text-lg font-semibold text-brand-900">{f.title}</h2>
            <p className="mt-2 text-sm leading-6 text-brand-500">{f.desc}</p>
            <span className="mt-3 inline-block text-sm text-accent-600 group-hover:underline">
              {f.action} →
            </span>
          </Link>
        ))}
      </div>

      {activities.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-brand-900">近期宗族活动</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {activities.map((a) => (
              <div key={a.id} className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
                <div className="text-sm font-semibold text-brand-900">{a.title}</div>
                <div className="mt-1 text-xs text-brand-400">
                  {new Date(a.startAt).toLocaleString("zh-CN")} · {a.location}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 grid grid-cols-2 gap-4 rounded-xl border border-brand-200 bg-brand-100/70 p-6 text-center sm:grid-cols-4">
        <div>
          <div className="text-2xl font-semibold text-accent-600">{genealogyCount}</div>
          <div className="text-xs text-brand-400">数字化族谱（部）</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-accent-600">{clanHallCount}</div>
          <div className="text-xs text-brand-400">已立宗祠（座）</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-accent-600">{surnameRows.length}</div>
          <div className="text-xs text-brand-400">已收录姓氏</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-accent-600">{postCount}</div>
          <div className="text-xs text-brand-400">宗亲话题（条）</div>
        </div>
      </div>
    </div>
  );
}
