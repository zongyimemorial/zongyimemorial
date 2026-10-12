import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProfileByHall, loadSession } from "@/lib/whisper-service";
import { moodSpec, moodLabel } from "@/lib/whisper-mood";
import { AiDisclosureBar } from "@/components/whisper/AiBadge";

export const metadata = { title: "对话详情 · 午夜悄悄话 · 宗忆堂" };

/**
 * 单次会话详情页。
 *
 * 权限：loadSession 内部按 (sessionId, profileId, userId) 三重过滤，
 * 非本人访问直接落到 notFound（不区分"不存在"与"无权限"，避免探测）。
 */
export default async function WhisperSessionPage({
  params,
}: {
  params: Promise<{ hallId: string; sessionId: string }>;
}) {
  const { hallId, sessionId } = await params;

  const profile = await loadProfileByHall(hallId);
  if (!profile) notFound();

  const user = await getCurrentUser();
  if (!user?.id) redirect(`/login?next=/whispers/${hallId}/history/${sessionId}`);

  const session = await loadSession(profile.id, user.id, sessionId);
  if (!session) notFound();

  const spec = moodSpec(session.mood);
  const hasCrisis = session.messages.some((m) => m.flagged && m.role === "assistant");

  return (
    <div className="container-page max-w-3xl py-10">
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm text-brand-400">
        <Link href={`/whispers/${hallId}/history`} className="hover:text-brand-700">
          对话回顾
        </Link>
        <span>/</span>
        <span className="text-brand-600">{fmtDate(session.createdAt)}</span>
        <a
          href="/"
          className="ml-auto rounded-md border border-brand-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
        >
          ← 返回首页
        </a>
      </nav>

      <AiDisclosureBar className="mb-6" />

      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold text-brand-900">
          和 {profile.personaName} 的这次对话
        </h1>
        <span className="text-xs text-brand-400">
          {fmtDate(session.createdAt)} · {session.roundsUsed} 轮 · {session.minutesUsed} 分钟
        </span>
      </div>

      {/* 心情标签 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-brand-400">当时心情：</span>
        {spec ? (
          <span
            className={
              "rounded-full px-2.5 py-0.5 " +
              (spec.concerning ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-700")
            }
          >
            {spec.label}
          </span>
        ) : (
          <span className="rounded-full bg-gray-50 px-2.5 py-0.5 text-brand-400">
            {moodLabel(session.mood)}
          </span>
        )}
        {session.moodNote && <span className="text-brand-400">· {session.moodNote}</span>}
      </div>

      {hasCrisis && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-xs leading-relaxed text-red-800">
          这次对话中平台给出了求助提示。若你此刻仍感到难以承受，请拨打
          <b className="mx-1">全国心理援助热线 12356</b>
          （24 小时，免费），或联系身边的人。
        </div>
      )}

      {/* —— 消息流 —— */}
      <div className="mt-6 space-y-4">
        {session.messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className="max-w-[80%]">
              <div
                className={
                  "inline-block whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed " +
                  (m.role === "user"
                    ? "rounded-br-sm bg-brand-800 text-white"
                    : m.flagReason === "sanitized" || m.flagged
                      ? "rounded-bl-sm border border-red-200 bg-red-50 text-red-800"
                      : "rounded-bl-sm bg-gray-100 text-brand-900")
                }
              >
                {m.text}
              </div>
              {m.role === "assistant" && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-brand-300">
                  {m.audioUrl && (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <audio src={m.audioUrl} controls className="h-7" />
                  )}
                  {m.aiGenerated && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-brand-500">
                      AI 生成{m.aiLabel ? ` · ${m.aiLabel}` : ""}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-4 border-t border-brand-200 pt-6 text-sm">
        <Link href={`/whispers/${hallId}/history`} className="text-brand-500 hover:underline">
          ← 返回回顾列表
        </Link>
        <Link href={`/whispers/${hallId}`} className="text-accent-600 hover:underline">
          继续说话 →
        </Link>
      </div>

      <p className="mt-6 text-center text-[11px] text-brand-300">
        对话内容由 AI 生成。以上文字保留了当时的标识与安全记录，未做删改。
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
