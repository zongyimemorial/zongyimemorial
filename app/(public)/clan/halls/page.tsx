import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import Reveal from "@/components/site/Reveal";

export const metadata = { title: "设立宗祠" };

const TRIALS = [
  { icon: "🆓", title: "设立免费", desc: "宗祠建档不收费，实名认证后即可设立，永久有效。" },
  { icon: "🎨", title: "自由装修", desc: "墙面、地面、挂饰、相框、字体全可自选；祠堂专属素材含石狮、香炉、牌位墙。" },
  { icon: "🎁", title: "免费素材充足", desc: "每个分类都有足量免费素材，普通的完全够用，精美的可积分兑换或开通高级订阅。" },
  { icon: "🛡️", title: "先审后显", desc: "宗祠信息公开展示前经人工审核，营造可信的宗亲氛围。" },
];

export default async function ClanHallsPage({
  searchParams,
}: {
  searchParams: Promise<{ surname?: string; q?: string }>;
}) {
  const { surname, q } = await searchParams;
  const user = await getCurrentUser();

  const where = {
    status: "active" as const,
    isPublic: true,
    ...(surname ? { surname } : {}),
    ...(q
      ? {
          OR: [
            { hallName: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { ancestorName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [halls, surnameRows] = await Promise.all([
    prisma.clanHall.findMany({
      where,
      orderBy: [{ viewCount: "desc" }, { createdAt: "desc" }],
      take: 60,
      select: {
        id: true,
        surname: true,
        hallName: true,
        name: true,
        origin: true,
        ancestorName: true,
        coverImage: true,
        viewCount: true,
        archive: true,
      },
    }),
    prisma.clanHall.groupBy({
      by: ["surname"],
      where: { status: "active", isPublic: true },
      _count: { surname: true },
      orderBy: { _count: { surname: "desc" } },
      take: 16,
    }),
  ]);

  return (
    <div className="container-page max-w-5xl py-10">
      <nav className="mb-4 text-sm text-brand-400">
        <Link href="/clan" className="hover:text-brand-700">
          宗亲文化交流
        </Link>{" "}
        / 设立宗祠
      </nav>

      <section className="mb-8 rounded-2xl bg-gradient-to-br from-[#6b4a24] via-[#8a6234] to-[#4d3418] p-9 text-white">
        <h1 className="text-3xl font-semibold tracking-wide">设立宗祠</h1>
        <p className="mt-3 max-w-2xl leading-7 text-white/85">
          族谱记血脉，宗祠立家风。为你的姓氏设立一座线上宗祠：填写堂号、始祖与字辈，
          再按心意装修祠堂空间——香炉、石狮、匾额、幡旗皆可陈设，让散居四方的宗亲有处可归。
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/clan/halls/new"
            className="rounded-lg bg-brand-100/70 px-6 py-2.5 text-sm font-medium text-[#6b4a24] transition hover:bg-white/90"
          >
            免费设立宗祠 →
          </Link>
          {halls.length > 0 && (
            <span className="text-sm text-white/70">已有 {surnameRows.length} 个姓氏在此立祠</span>
          )}
        </div>
        <Link
          href="/clan/halls/guide"
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:border-white/50 hover:bg-white/20"
        >
          <span aria-hidden>📖</span>
          第一次设立？先看《宗祠设立指引》，堂号、字辈一次填对 →
        </Link>
      </section>

      {/* 权益说明 */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TRIALS.map((t) => (
          <div key={t.title} className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
            <div className="text-2xl">{t.icon}</div>
            <h3 className="mt-2 text-sm font-semibold text-brand-900">{t.title}</h3>
            <p className="mt-1.5 text-xs leading-6 text-brand-500">{t.desc}</p>
          </div>
        ))}
      </div>

      {/* 搜索 */}
      <form className="mb-6 flex flex-wrap gap-2" action="/clan/halls">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="搜索宗祠名称、堂号或始祖"
          className="min-w-56 flex-1 rounded-md border border-brand-200 px-3 py-2 text-sm"
        />
        <button className="rounded-md bg-brand-800 px-5 py-2 text-sm text-white hover:bg-brand-700">
          搜索
        </button>
      </form>

      {/* 姓氏快捷 */}
      {surnameRows.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2 text-sm">
          {surnameRows.map((r) => (
            <Link
              key={r.surname}
              href={`/clan/halls?surname=${encodeURIComponent(r.surname)}`}
              className={
                "rounded-full px-4 py-1.5 transition " +
                (surname === r.surname
                  ? "bg-brand-800 text-white"
                  : "border border-brand-200 text-brand-600 hover:border-accent-400")
              }
            >
              {r.surname}氏 · {r._count.surname} 祠
            </Link>
          ))}
          {(surname || q) && (
            <Link href="/clan/halls" className="rounded-full px-4 py-1.5 text-brand-400 hover:text-brand-700">
              清除筛选
            </Link>
          )}
        </div>
      )}

      {/* 列表 */}
      {halls.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-200 bg-brand-100/70 p-12 text-center">
          <div className="text-4xl">🏛️</div>
          <p className="mt-3 text-sm text-brand-500">
            {surname || q ? "没有匹配的宗祠" : "还没有宗祠在此设立，成为第一个立祠的人吧"}
          </p>
          <Link
            href="/clan/halls/new"
            className="mt-4 inline-block rounded-md bg-brand-800 px-6 py-2 text-sm text-white hover:bg-brand-700"
          >
            免费设立宗祠
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {halls.map((h, i) => {
            const archive = (h.archive as { photos?: string[]; portrait?: string } | null) ?? {};
            const cover = h.coverImage ?? archive.portrait ?? archive.photos?.[0];
            return (
              <Reveal key={h.id} delay={i * 80}>
                <Link
                  href={`/clan/halls/${h.id}`}
                  className="shine block group overflow-hidden rounded-xl border border-brand-200 bg-brand-100/70 transition hover:border-accent-300 hover:shadow-sm"
                >
                <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-[#8a6234] to-[#4d3418]">
                  {cover ? (
                    <Image
                      src={cover}
                      alt={h.hallName}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <span className="text-4xl">🏛️</span>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-accent-500/15 px-2 py-0.5 text-xs text-accent-600">
                      {h.surname}氏
                    </span>
                    <h2 className="text-base font-semibold text-brand-900">{h.hallName}</h2>
                  </div>
                  <p className="mt-1.5 text-sm text-brand-500">
                    堂号「{h.name}」{h.origin ? ` · ${h.origin}` : ""}
                  </p>
                  {h.ancestorName && (
                    <p className="mt-1 text-xs text-brand-400">始祖：{h.ancestorName}</p>
                  )}
                  <div className="mt-3 flex items-center justify-between text-xs text-brand-400">
                    <span>{h.viewCount} 次瞻仰</span>
                    <span className="text-accent-600 group-hover:underline">入祠参观 →</span>
                  </div>
                </div>
              </Link>
              </Reveal>
            );
          })}
        </div>
      )}

      {user && (
        <div className="mt-10 rounded-xl border border-brand-200 bg-brand-100/70 p-6 text-center">
          <p className="text-sm text-brand-500">
            已登录：{user.name ?? user.email}
            {!user.idVerified && (
              <span className="ml-2 text-xs text-amber-600">（需先完成实名认证才能设立宗祠）</span>
            )}
          </p>
          <Link
            href="/clan/halls/new"
            className="mt-3 inline-block rounded-md bg-brand-800 px-6 py-2 text-sm text-white hover:bg-brand-700"
          >
            设立我的宗祠
          </Link>
        </div>
      )}
    </div>
  );
}
