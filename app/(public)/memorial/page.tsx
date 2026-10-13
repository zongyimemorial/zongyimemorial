import Link from "next/link";
import { prisma } from "@/lib/db";
import Reveal from "@/components/site/Reveal";
import { CATEGORY_LABEL, type MemorialCategory } from "@/lib/memorial";

export const metadata = { title: "公益纪念堂" };

type CatKey = MemorialCategory | "ALL";

const TABS: { key: CatKey; label: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "NATIONAL_HERO", label: CATEGORY_LABEL.NATIONAL_HERO },
  { key: "HEROIC", label: CATEGORY_LABEL.HEROIC },
  { key: "GOOD_DEED", label: CATEGORY_LABEL.GOOD_DEED },
  { key: "CELEBRITY", label: CATEGORY_LABEL.CELEBRITY },
];

// 创建公益纪念堂的四步指引（显眼展示）
const CREATE_STEPS = [
  {
    title: "确认资格",
    desc: "由逝者近亲属为已故名人、民族英雄、英烈、见义勇为者或好人好事者提出申请。",
  },
  {
    title: "准备材料",
    desc: "权威来源链接（官方通报 / 主流媒体）与亲属关系证明，用于核验真实性。",
  },
  {
    title: "填写申请",
    desc: "提交逝者事迹、纪念类别与申请人信息，并签署《家属授权书》。",
  },
  {
    title: "审核上线",
    desc: "平台核验授权与来源后，数个工作日内免费建堂并公开展示。",
  },
];

export default async function MemorialListPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; q?: string }>;
}) {
  const { cat, q } = await searchParams;

  const where: {
    status: "APPROVED";
    category?: MemorialCategory;
    name?: { contains: string; mode: "insensitive" };
  } = { status: "APPROVED" };
  if (cat === "HEROIC" || cat === "GOOD_DEED" || cat === "CELEBRITY" || cat === "NATIONAL_HERO") {
    where.category = cat;
  }
  if (q && q.trim()) {
    where.name = { contains: q.trim(), mode: "insensitive" };
  }

  const list = await prisma.publicMemorial.findMany({
    where,
    orderBy: [{ lightCount: "desc" }, { createdAt: "desc" }],
    take: 60,
  });

  const activeCat = (cat as CatKey) || "ALL";

  return (
    <div className="container-page max-w-5xl py-12">
      {/* 板块头：与收费纪念馆（/halls）同排版 */}
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-semibold text-brand-900">公益纪念堂</h1>
        <p className="mx-auto mt-3 max-w-2xl text-brand-500">
          致敬平凡微光 · 缅怀时代英模。本堂由平台在征得家属同意后，
          <b className="text-brand-700">免费</b>为已故名人、民族英雄、见义勇为者与好人好事者创建最高级别的纪念馆，
          供公众公开缅怀。纯公益、零付费引导。
        </p>
        <div className="mt-6">
          <Link
            href="/memorial/apply"
            className="rounded-md bg-accent-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-600"
          >
            家属申请建堂
          </Link>
        </div>
      </header>

      {/* 创建指引：显眼的步骤卡，引导家属申请建堂 */}
      <section className="mb-10 overflow-hidden rounded-2xl border border-brand-200 bg-brand-100/70 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-brand-200/70 bg-brand-200/40 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-900">如何创建一座公益纪念堂</h2>
            <p className="mt-1 text-sm text-brand-600">
              四步即可为值得铭记的人建一座永久免费的纪念空间 —— 纯公益、零付费。
            </p>
          </div>
          <Link
            href="/memorial/apply"
            className="shrink-0 rounded-md bg-accent-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-600"
          >
            立即申请建堂
          </Link>
        </div>
        <ol className="grid gap-5 px-6 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {CREATE_STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-500 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-brand-900">{s.title}</p>
                <p className="mt-1 text-xs leading-6 text-brand-600">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 类别筛选 + 搜索（公益堂特有，容器与收费馆暖米卡同源） */}
      <div className="mb-8 flex flex-col gap-3 rounded-2xl bg-brand-100/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const href =
              t.key === "ALL"
                ? "/memorial"
                : `/memorial?cat=${t.key}`;
            const active = activeCat === t.key;
            return (
              <Link
                key={t.key}
                href={href}
                className={
                  "rounded-full px-3 py-1.5 text-sm transition " +
                  (active
                    ? "bg-brand-700 text-white"
                    : "bg-white text-brand-700 hover:bg-brand-50")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <form action="/memorial" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="搜索姓名…"
            className="w-40 rounded-md border border-brand-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            className="rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50"
          >
            搜索
          </button>
        </form>
      </div>

      {/* 已公开的纪念空间：卡片与收费馆列表（/halls）逐类同款 */}
      <section>
        <h2 className="mb-5 text-xl font-semibold text-brand-900">已公开的纪念空间</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m, i) => (
            <Reveal key={m.id} delay={i * 80}>
              <Link
                href={`/memorial/${m.slug}`}
                className="shine block overflow-hidden rounded-lg border border-brand-200 bg-brand-100/70 shadow-sm transition hover:shadow-md"
              >
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-brand-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/assets/scene-hall.jpg"
                    alt={`${m.name}纪念空间`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-brand-900">{m.name}纪念空间</h3>
                  <p className="mt-1 text-sm text-brand-500">逝者：{m.name}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                    {m.honorTitle ? `${m.honorTitle}。` : ""}
                    此处收录其生平与亲友追思。
                  </p>
                </div>
              </Link>
            </Reveal>
          ))}
          {list.length === 0 && (
            <div className="rounded-lg border border-dashed border-brand-300 bg-brand-100/70 p-10 text-center text-sm text-brand-500">
              暂无符合条件的纪念堂。
              <Link href="/memorial/apply" className="ml-1 text-accent-600 hover:underline">
                申请创建 →
              </Link>
            </div>
          )}
        </div>
      </section>

      <p className="mt-12 rounded-lg bg-brand-100/70 p-4 text-center text-xs text-brand-400">
        如发现内容不实或需家属撤下，请通过各纪念堂详情页的「家属申请撤下 / 纠错」入口联系平台。
      </p>
    </div>
  );
}
