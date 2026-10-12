import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProfileByHall, listSessions, moodTrend } from "@/lib/whisper-service";
import { MOODS, moodLabel, moodSpec, isConcerningMood } from "@/lib/whisper-mood";
import { AiDisclosureBar } from "@/components/whisper/AiBadge";

export const metadata = { title: "对话回顾 · 午夜悄悄话 · 宗忆堂" };

const CRISIS_HOTLINE = "12356";

/**
 * 对话历史回顾页。
 *
 * 定位：不是"聊天记录导出"，而是给来访者一次**回看自己**的机会。
 * 因此设计上突出三件事：
 *   1. 情绪走向（顶部聚合）——让长期低落的情绪被看见
 *   2. 会话按时间倒序，带心情标签
 *   3. 若历史上出现较多关切情绪，给出温和的求助提示（不做诊断、不贴标签）
 *
 * 权限：仅本人（loadProfileByHall + listSessions 双重按 userId 过滤）。
 */
export default async function WhisperHistoryPage({
  params,
}: {
  params: Promise<{ hallId: string }>;
}) {
  const { hallId } = await params;

  const profile = await loadProfileByHall(hallId);
  if (!profile) notFound();

  const user = await getCurrentUser();
  if (!user?.id) redirect(`/login?next=/whispers/${hallId}/history`);

  const [sessions, trend] = await Promise.all([
    listSessions(profile.id, user.id),
    moodTrend(profile.id, user.id),
  ]);

  // 关切情绪占比（仅用于"是否给出求助提示"，不展示给用户任何比率数字）
  const concerningCount = trend.buckets
    .filter((b) => isConcerningMood(b.mood))
    .reduce((a, b) => a + b.count, 0);
  const showGentleHint = concerningCount >= 3;

  const totalMins = sessions.reduce((a, s) => a + s.minutesUsed, 0);

  return (
    <div className="container-page max-w-4xl py-10">
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm text-brand-400">
        <Link href="/whispers" className="hover:text-brand-700">
          午夜悄悄话
        </Link>
        <span>/</span>
        <Link href={`/whispers/${hallId}`} className="hover:text-brand-700">
          与 {profile.personaName} 说话
        </Link>
        <span>/</span>
        <span className="text-brand-600">对话回顾</span>
        <a
          href="/"
          className="ml-auto rounded-md border border-brand-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
        >
          ← 返回首页
        </a>
      </nav>

      <AiDisclosureBar className="mb-6" />

      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold text-brand-900">和 {profile.personaName} 说过的话</h1>
        <span className="text-xs text-brand-400">共 {sessions.length} 次 · 累计 {totalMins} 分钟</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-brand-500">
        这里只有你自己能看到——包括 {profile.personaName} 的家人也看不到你的对话。
        想念一个人不需要向谁交代。
      </p>

      {/* —— 情绪走向 —— */}
      {trend.total > 0 && (
        <section className="mt-6 rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <h2 className="text-sm font-semibold text-brand-900">这段日子的心情</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {MOODS.map((m) => {
              const hit = trend.buckets.find((b) => b.mood === m.key);
              if (!hit) return null;
              return (
                <span
                  key={m.key}
                  className={
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs " +
                    (m.concerning ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-700")
                  }
                >
                  {m.label}
                  <b>{hit.count}</b>
                </span>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-brand-400">
            心情是你每次进入对话前自己选的，可以跳过、也可以随时改。
          </p>

          {showGentleHint && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-relaxed text-amber-800">
              <p>
                最近几次来，你多半带着难过或自责。
                <b>想念一个人有愧疚，是很常见的，但不必一直自己扛着。</b>
              </p>
              <p className="mt-1.5">
                如果想找人说说，可以拨打
                <b className="mx-1 text-red-600">全国心理援助热线 {CRISIS_HOTLINE}</b>
                （24 小时，免费），或约上家里人一起坐坐。
              </p>
            </div>
          )}
        </section>
      )}

      {/* —— 会话列表 —— */}
      <section className="mt-8">
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-brand-200 bg-brand-100/70 p-8 text-center">
            <p className="text-sm text-brand-400">还没有对话记录。</p>
            <Link
              href={`/whispers/${hallId}`}
              className="mt-3 inline-block rounded-md bg-brand-800 px-5 py-2 text-xs text-white hover:bg-brand-700"
            >
              去和 {profile.personaName} 说说话
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => {
              const spec = moodSpec(s.mood);
              return (
                <Link
                  key={s.id}
                  href={`/whispers/${hallId}/history/${s.id}`}
                  className="block rounded-xl border border-brand-200 bg-brand-100/70 p-4 transition hover:border-accent-300"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-brand-900">
                        {fmtDate(s.createdAt)}
                      </span>
                      {spec && (
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-[11px] " +
                            (spec.concerning ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-700")
                          }
                        >
                          {spec.label}
                        </span>
                      )}
                      {!spec && (
                        <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-brand-400">
                          {moodLabel(s.mood)}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-brand-400">
                      {s.messageCount} 条 · {s.minutesUsed} 分钟
                    </span>
                  </div>
                  {s.moodNote && (
                    <p className="mt-1.5 text-[11px] text-brand-400">当时的心情：{s.moodNote}</p>
                  )}
                  {s.preview && (
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-brand-500">
                      {s.preview}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-8 flex flex-wrap gap-4 border-t border-brand-200 pt-6 text-sm">
        <Link href={`/whispers/${hallId}`} className="text-accent-600 hover:underline">
          ← 继续和 {profile.personaName} 说话
        </Link>
        <Link href="/whispers" className="text-brand-500 hover:underline">
          返回板块首页
        </Link>
      </div>

      <p className="mt-6 text-center text-[11px] text-brand-300">
        对话内容由 AI 生成并留存不少于 6 个月，
        你可随时在管理台删除整个装置以清除全部记录。
      </p>
    </div>
  );
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}
