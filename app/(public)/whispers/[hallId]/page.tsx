import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { loadProfileByHall, gateProfile, greetingFor, festivalBadge } from "@/lib/whisper-service";
import { getQuota, PLAN_SPECS } from "@/lib/whisper";
import { isMockMode, currentEngineLabel } from "@/lib/ai/index";
import { AiDisclosureBar } from "@/components/whisper/AiBadge";
import WhisperChat from "@/components/whisper/WhisperChat";

export async function generateMetadata({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  const p = await prisma.whisperProfile.findUnique({
    where: { hallId },
    select: { personaName: true, hall: { select: { name: true, deceasedName: true } } },
  });
  if (!p) return { title: "午夜悄悄话 · 宗忆堂" };
  return {
    title: `与 ${p.personaName} 说话 · 午夜悄悄话 · 宗忆堂`,
    description: `${p.hall.name} · ${p.hall.deceasedName} 的追思对话装置。内容由 AI 生成，非真人回复。`,
  };
}

export default async function WhisperHallPage({
  params,
}: {
  params: Promise<{ hallId: string }>;
}) {
  const { hallId } = await params;

  const profile = await loadProfileByHall(hallId);
  if (!profile) notFound();

  const user = await getCurrentUser();
  if (!user?.id) redirect(`/login?next=/whispers/${hallId}`);

  const gate = gateProfile(profile);

  // 装置未就绪：给出明确说明，而不是 404
  if (!gate.ok) {
    return (
      <div className="container-page max-w-2xl py-16">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="text-3xl">🕯️</p>
          <h1 className="mt-3 text-lg font-semibold text-brand-900">这盏灯暂时还亮不起来</h1>
          <p className="mt-2 text-sm leading-relaxed text-brand-600">{gate.message}</p>
          <p className="mt-1 text-xs text-brand-400">
            追思对话需要经近亲属授权、并通过平台审核后才能开启。
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/whispers"
              className="rounded-md bg-brand-800 px-5 py-2 text-sm text-white hover:bg-brand-700"
            >
              了解「午夜悄悄话」
            </Link>
            <Link
              href={`/halls/${hallId}`}
              className="rounded-md border border-gray-300 bg-white px-5 py-2 text-sm text-brand-700 hover:bg-gray-50"
            >
              返回纪念馆
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [quota, avatars] = await Promise.all([
    getQuota(user.id),
    prisma.whisperAvatar.findMany({
      where: { profileId: profile.id, isSelected: true },
      take: 1,
    }),
  ]);

  const spec = PLAN_SPECS[quota.plan] ?? PLAN_SPECS.free;
  const voiceEnabled = quota.remainingMins > 0 && spec.monthlyMins > 0;

  // 取最近一个会话，把对话串起来
  const lastSession = await prisma.whisperSession.findFirst({
    where: { profileId: profile.id, userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const avatarUrl = avatars[0]?.imageUrl ?? null;

  return (
    <div className="container-page max-w-3xl py-8">
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm text-brand-400">
        <Link href="/whispers" className="hover:text-brand-700">
          午夜悄悄话
        </Link>
        <span>/</span>
        <Link href={`/halls/${hallId}`} className="hover:text-brand-700">
          {profile.hall.name}
        </Link>
        <span>/</span>
        <span className="text-brand-600">与 {profile.personaName} 说话</span>
        <a
          href="/"
          className="ml-auto rounded-md border border-gray-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
        >
          ← 返回首页
        </a>
      </nav>

      <AiDisclosureBar className="mb-4" />

      {/* 节日语境徽章（P0 节日包）：与 systemPrompt 的【今日节气】注入同源同窗口 */}
      {(() => {
        const f = festivalBadge();
        if (!f) return null;
        return (
          <p className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-2 text-xs text-amber-800">
            <span className="rounded-full bg-amber-200/70 px-2 py-0.5 font-medium">{f.badge}</span>
            {f.name}前后，TA 的话里也许会多一分时令的牵挂。
            <Link href="/festivals" className="text-amber-700 underline hover:no-underline">
              了解这个节日
            </Link>
          </p>
        );
      })()}

      {isMockMode() && (
        <p className="mb-4 rounded-lg bg-slate-50 px-4 py-2 text-xs text-slate-600">
          当前为演示引擎（未配置云端 API Key），回复由本地模拟逻辑生成，用于验证完整链路。
        </p>
      )}

      <WhisperChat
        profileId={profile.id}
        personaName={profile.personaName}
        personTitle={profile.personTitle ?? ""}
        avatarUrl={avatarUrl}
        mode={profile.mode}
        greeting={greetingFor(profile)}
        voiceEnabled={voiceEnabled}
        remainingMins={quota.remainingMins}
        softLimitMins={45}
        initialSessionId={lastSession?.id}
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-brand-400">
        <span>
          {voiceEnabled
            ? `本周期剩余语音 ${quota.remainingMins} 分钟 · 当前套餐「${spec.name}」`
            : quota.remainingMins <= 0
              ? "语音时长已用完，仍可继续用文字交流。"
              : "当前套餐不含语音，仅支持文字交流。"}
        </span>
        <span className="flex flex-wrap gap-3">
          <Link href="/whispers" className="text-accent-600 hover:underline">
            购买时长 / 升级套餐 →
          </Link>
          <Link href={`/halls/${hallId}`} className="text-brand-500 hover:underline">
            回纪念馆献花 →
          </Link>
        </span>
      </div>

      <p className="mt-4 text-center text-[11px] text-brand-300">
        引擎：{currentEngineLabel()} · 对话内容带 AI 生成标识并留存不少于 6 个月
      </p>
    </div>
  );
}
