import type { Metadata } from "next";
import Link from "next/link";
import {
  FESTIVALS,
  festivalsOfYear,
  nextFestival,
  festivalCountdownLabel,
  type FestivalKind,
} from "@/lib/festivals";
import { findSuite, suitePriceYuan } from "@/lib/decor-suites";

export const metadata: Metadata = {
  title: "追思节日历 · 清明 中元 重阳 寒衣 冬至 除夕",
  description:
    "六大传统祭扫节日的公历日期、习俗与在线追思指南：清明节、中元节、重阳节、寒衣节、冬至、除夕。2026-2030 年日历，为思念标定每一个回家的日子。",
  alternates: { canonical: "/festivals" },
};

/** 公历日期短格式：2026-10-18 → 「10 月 18 日」 */
function md(date: Date): string {
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export default function FestivalsPage() {
  const next = nextFestival();
  const currentYear = new Date().getFullYear();

  return (
    <>
      {/* Hero：下一个节日 */}
      <section className="bg-brand-800 py-16 text-white">
        <div className="container-page text-center">
          <p className="text-sm tracking-[0.3em] text-accent-300">追思节日历</p>
          {next ? (
            <>
              <h1 className="mt-4 text-3xl font-bold md:text-4xl">
                下一个节日：{next.spec.name}
              </h1>
              <p className="mt-3 text-brand-100">
                {next.spec.lunarLabel} · 公历 {next.date.getFullYear()} 年 {md(next.date)}
                <span className="ml-3 rounded-full bg-accent-500 px-3 py-0.5 text-sm text-white">
                  {festivalCountdownLabel(next.daysUntil)}
                </span>
              </p>
              <p className="mx-auto mt-4 max-w-2xl text-brand-100/90">{next.spec.tagline}</p>
            </>
          ) : (
            <h1 className="mt-4 text-3xl font-bold md:text-4xl">六大追思节日 · 习俗与日期</h1>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/halls"
              className="rounded-md bg-accent-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-600"
            >
              进入纪念馆追思
            </Link>
            <Link
              href="#calendar"
              className="rounded-md border border-white/40 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10"
            >
              查看全年日历 ↓
            </Link>
          </div>
        </div>
      </section>

      {/* 六大节日 */}
      {FESTIVALS.map((f) => {
        const hallSuite = f.hallSuite ? findSuite(f.hallSuite) : undefined;
        const clanSuite = f.clanSuite ? findSuite(f.clanSuite) : undefined;
        return (
          <section
            key={f.kind}
            id={f.kind}
            className={f.kind === "qingming" ? "container-page py-14" : "container-page border-t border-brand-200 py-14"}
          >
            <div className="grid gap-10 lg:grid-cols-[5fr_4fr]">
              <div>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h2 className="text-2xl font-semibold text-brand-900">{f.name}</h2>
                  <span className="text-sm text-brand-400">{f.lunarLabel}</span>
                </div>
                <p className="mt-1 text-sm text-brand-500">公历日期：{f.gregorianHint}</p>
                {f.intro.map((p, i) => (
                  <p key={i} className="mt-3 leading-7 text-brand-600">
                    {p}
                  </p>
                ))}

                {/* 习俗 */}
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {f.customs.map((c) => (
                    <div key={c.title} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
                      <div className="text-sm font-semibold text-brand-800">{c.title}</div>
                      <p className="mt-1 text-xs leading-5 text-brand-500">{c.desc}</p>
                    </div>
                  ))}
                </div>

                {/* 在线追思入口 */}
                <div className="mt-5 flex flex-wrap gap-3">
                  {f.onlineActions.map((a) => (
                    <Link
                      key={a.label}
                      href={a.href}
                      title={a.desc}
                      className="rounded-md border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 transition hover:border-brand-400"
                    >
                      {a.label} →
                    </Link>
                  ))}
                </div>
              </div>

              {/* 主题套装推荐 */}
              <aside className="space-y-4">
                <div className="text-sm font-semibold text-brand-800">节日主题 · 纪念空间焕新</div>
                {[hallSuite, clanSuite].filter(Boolean).map((s) => (
                  <Link
                    key={s!.id}
                    href={`/suites/${s!.id}`}
                    className="block rounded-xl border border-brand-200 bg-brand-100/70 p-4 transition hover:border-brand-300 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-lg"
                        style={{ background: s!.preview.background, color: s!.preview.accent }}
                      >
                        {s!.preview.icon}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-brand-900">{s!.name}</span>
                          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-500">
                            {s!.target === "hall" ? "纪念馆" : "宗祠"}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-brand-500">{s!.desc}</p>
                      </div>
                      <span className="ml-auto shrink-0 text-sm font-bold text-brand-700">
                        {suitePriceYuan(s!)}
                      </span>
                    </div>
                  </Link>
                ))}
                <p className="text-xs leading-5 text-brand-400">
                  节日前后换一套主题，让纪念空间也跟着时令走。套装内素材可单独购买。
                </p>
              </aside>
            </div>
          </section>
        );
      })}

      {/* 全年日历（五年总表） */}
      <section id="calendar" className="bg-brand-100/70 py-16">
        <div className="container-page">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold text-brand-900">追思节日 · 五年日历</h2>
            <p className="mt-2 text-sm text-brand-500">
              农历节日的公历日期每年不同，收藏本页，为思念标定每一个回家的日子。
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-brand-200">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-brand-50 text-left text-brand-800">
                  <th className="px-4 py-3 font-medium">节日</th>
                  <th className="px-4 py-3 font-medium">农历</th>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <th key={i} className="px-4 py-3 text-center font-medium">
                      {currentYear + i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {FESTIVALS.map((f) => {
                  const dates = [0, 1, 2, 3, 4]
                    .map((i) => festivalsOfYear(currentYear + i).find((o) => o.spec.kind === f.kind))
                    .map((o) => (o ? md(o.date) : "—"));
                  const isNextYearOfChuxi = f.kind === "chuxi";
                  return (
                    <tr key={f.kind} className="text-brand-600">
                      <td className="px-4 py-3 font-medium text-brand-900">
                        <a href={`#${f.kind}`} className="hover:text-brand-600 hover:underline">
                          {f.name}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-xs text-brand-400">{f.lunarLabel}</td>
                      {dates.map((d, i) => (
                        <td key={i} className="px-4 py-3 text-center">
                          {d}
                          {isNextYearOfChuxi && d !== "—" ? null : null}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-center text-xs text-brand-400">
            注：除夕为农历年最后一天（腊月廿九或三十，2026-2030 年恰逢连续无「年三十」）；
            日期经多源日历核验，如与当年官方日历有出入，以官方为准。
          </p>
        </div>
      </section>
    </>
  );
}

// 保留 FestivalKind 类型引用（导出类型给潜在复用方，同时避免 TS6133）
export type { FestivalKind };
