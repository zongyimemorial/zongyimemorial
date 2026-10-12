import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PLAN_SPECS, SINGLE_PACK, WHISPER_POINTS, MEMORIAL_VIDEO, type WhisperPlan } from "@/lib/whisper";
import { fubFromFen } from "@/lib/fortune";
import { currentEngineLabel, isMockMode } from "@/lib/ai/index";
import PersonaLibrary, { type MemoryItem, type RelationItem } from "@/components/whisper/PersonaLibrary";
import VoiceCloner, { type VoiceRow } from "@/components/whisper/VoiceCloner";
import ConsentForm, { type ConsentState } from "@/components/whisper/ConsentForm";
import SubmitForReview from "@/components/whisper/SubmitForReview";
import DangerZone from "@/components/whisper/DangerZone";

export const metadata = { title: "追思装置管理 · 宗忆堂" };

const STATUS_TEXT: Record<string, { text: string; cls: string }> = {
  active: { text: "已通过审核", cls: "bg-emerald-100 text-emerald-700" },
  pending: { text: "待审核", cls: "bg-amber-100 text-amber-700" },
  rejected: { text: "已驳回", cls: "bg-red-100 text-red-600" },
};

export default async function WhisperManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const profile = await prisma.whisperProfile.findUnique({
    where: { id },
    include: {
      consent: true,
      voices: { orderBy: [{ isPreset: "desc" }, { createdAt: "asc" }] },
      hall: { select: { id: true, name: true, deceasedName: true, status: true } },
    },
  });
  if (!profile) notFound();
  if (profile.ownerUserId !== user.id) redirect("/console");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { points: true, premiumUntil: true },
  });
  const quotaRow = await prisma.whisperQuota.findUnique({ where: { userId: user.id } });
  const plan = ((quotaRow?.plan as WhisperPlan) ?? "free") as WhisperPlan;
  const spec = PLAN_SPECS[plan] ?? PLAN_SPECS.free;

  const remainingMins = Math.max(0, (quotaRow?.monthlyMins ?? 0) - (quotaRow?.usedMins ?? 0)) + (quotaRow?.extraMins ?? 0);
  const remainingRounds = Math.max(0, (quotaRow?.monthlyRounds ?? spec.monthlyRounds) - (quotaRow?.usedRounds ?? 0));

  const tr = (profile.traits ?? []) as unknown;
  const traits = Array.isArray(tr) ? tr.map(String) : [];
  const ss = (profile.speechStyle ?? {}) as {
    tone?: string;
    dialect?: string;
    addressForm?: string;
    catchphrases?: string[];
  };
  const memories = (Array.isArray(profile.memories) ? profile.memories : []) as MemoryItem[];
  const relationships = (Array.isArray(profile.relationships) ? profile.relationships : []) as RelationItem[];

  const consentState: ConsentState = profile.consent
    ? {
        applicantName: profile.consent.applicantName,
        relation: profile.consent.relation,
        deceasedWill: profile.consent.deceasedWill ?? "",
        otherHeirsAck: profile.consent.otherHeirsAck,
        hasIdNo: !!profile.consent.applicantIdNo,
        revokedAt: profile.consent.revokedAt ? profile.consent.revokedAt.toISOString() : null,
        createdAt: profile.consent.agreedAt.toISOString(),
      }
    : null;
  const consentValid = !!consentState && !consentState.revokedAt;

  // 「已解锁克隆资格」= 订阅档自带额度 OR 已用积分兑换 OR 已支付 ¥10 资格申请（cloneApplied）
  const clones = profile.voices.filter((v) => !v.isPreset);
  const cloneUnlocked = spec.cloneLimit > 0 || clones.length > 0 || profile.cloneApplied;

  const statusInfo = STATUS_TEXT[profile.status] ?? STATUS_TEXT.pending;

  return (
    <div className="container-page max-w-4xl py-10">
      {/* 面包屑 + 返回首页 */}
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm text-brand-400">
        <Link href="/console" className="hover:text-brand-700">
          控制台
        </Link>
        <span>/</span>
        <Link href="/whispers" className="hover:text-brand-700">
          午夜悄悄话
        </Link>
        <span>/</span>
        <span className="text-brand-600">追思装置管理</span>
        <a
          href="/"
          className="ml-auto rounded-md border border-brand-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
        >
          ← 返回首页
        </a>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand-900">
          追思装置 · {profile.personaName}
        </h1>
        <span className={`rounded px-2 py-0.5 text-xs ${statusInfo.cls}`}>{statusInfo.text}</span>
        <span
          className={
            "rounded px-2 py-0.5 text-xs " +
            (profile.enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600")
          }
        >
          {profile.enabled ? "对话已开启" : "对话未开启"}
        </span>
        {isMockMode() && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            演示引擎（未配置 API Key）
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-brand-500">
        所属纪念馆：
        <Link href={`/halls/${profile.hall.id}`} className="text-accent-600 hover:underline">
          {profile.hall.name} · {profile.hall.deceasedName}
        </Link>
        <span className="mx-1.5">|</span>
        引擎：{profile.engineLabel ?? currentEngineLabel()}
      </p>

      {/* 配额概览 */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="当前套餐" value={spec.name} sub={plan === "free" ? "仅支持文字对话" : `${fubFromFen(spec.priceFen)} 福币 / 月`} />
        <Stat label="剩余语音时长" value={`${remainingMins} 分钟`} sub={`本周期已用 ${quotaRow?.usedMins ?? 0} 分钟`} />
        <Stat label="剩余对话轮次" value={remainingRounds >= 99999 ? "不限" : `${remainingRounds} 轮`} sub={`本周期已用 ${quotaRow?.usedRounds ?? 0} 轮`} />
        <Stat
          label="积分余额"
          value={`${dbUser?.points ?? 0}`}
          sub={`克隆 ${WHISPER_POINTS.CLONE_UNLOCK} 积分`}
        />
      </div>

      {plan === "free" && (
        <div className="mt-4 rounded-xl border border-accent-200 bg-accent-50/50 p-5">
          <p className="text-sm font-medium text-brand-900">
            当前为「体验版」，仅支持文字对话，无法克隆声音
          </p>
          <p className="mt-1 text-xs leading-relaxed text-brand-600">
            「思念版」{fubFromFen(PLAN_SPECS.basic.priceFen)} 福币/月：{PLAN_SPECS.basic.monthlyMins} 分钟语音 + {PLAN_SPECS.basic.cloneLimit} 个声音克隆 + {PLAN_SPECS.basic.memoryLimit} 条记忆；
            「长夜版」{fubFromFen(PLAN_SPECS.premium.priceFen)} 福币/月：{PLAN_SPECS.premium.monthlyMins} 分钟语音 + {PLAN_SPECS.premium.cloneLimit} 个声音克隆 + 无限记忆；纪念短片可单条加购（{fubFromFen(MEMORIAL_VIDEO.priceFen)} 福币/条）。
            也可按次购买（{fubFromFen(SINGLE_PACK.priceFen)} 福币 / {SINGLE_PACK.minutes} 分钟）。
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/whispers"
              className="rounded-md bg-accent-600 px-4 py-2 text-xs text-white hover:bg-accent-700"
            >
              查看套餐并开通
            </Link>
            <Link
              href="/points"
              className="rounded-md border border-brand-300 px-4 py-2 text-xs text-brand-700 hover:bg-brand-100/70"
            >
              用积分兑换额度
            </Link>
          </div>
        </div>
      )}

      {/* 状态提示 */}
      {!consentValid && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-xs leading-relaxed text-amber-800">
          <b>装置尚未就绪：</b>缺少有效的家属授权。授权完成后方可克隆声音、提交审核。
        </div>
      )}
      {consentValid && !profile.systemPrompt && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-xs leading-relaxed text-amber-800">
          <b>还差一步：</b>请先在「生平资料库」中保存资料并生成人格提示词，然后提交审核。
        </div>
      )}
      {profile.status === "rejected" && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-xs leading-relaxed text-red-700">
          <b>审核未通过。</b>请检查资料与授权信息是否完整，修改后重新提交。如有疑问可联系客服。
        </div>
      )}
      {profile.status === "active" && !profile.enabled && (
        <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 px-5 py-4 text-xs leading-relaxed text-brand-700">
          审核已通过。在页面底部点击「开启追思对话」后，家人即可进入对话。
        </div>
      )}

      <div className="mt-6 space-y-6">
        {/* 1. 生平资料库 */}
        <PersonaLibrary
          profileId={profile.id}
          personaName={profile.personaName}
          personTitle={profile.personTitle ?? ""}
          bio={profile.bio ?? ""}
          traits={traits}
          speechStyle={ss}
          memories={memories}
          relationships={relationships}
          systemPrompt={profile.systemPrompt ?? ""}
          promptVersion={profile.promptVersion}
          memoryLimit={spec.memoryLimit}
          planName={spec.name}
        />

        {/* 2. 声音克隆 */}
        <VoiceCloner
          profileId={profile.id}
          voices={profile.voices as unknown as VoiceRow[]}
          selectedVoiceId={profile.voiceId}
          hasConsent={consentValid}
          cloneLimit={spec.cloneLimit}
          cloneApplied={profile.cloneApplied}
          planName={spec.name}
          userPoints={dbUser?.points ?? 0}
          cloneUnlockPoints={WHISPER_POINTS.CLONE_UNLOCK}
        />

        {/* 3. 家属授权 */}
        <ConsentForm profileId={profile.id} consent={consentState} />

        {/* 4. 提交审核 / 开关 */}
        <SubmitForReview
          profileId={profile.id}
          status={profile.status}
          enabled={profile.enabled}
          hasConsent={consentValid}
          hasPrompt={!!profile.systemPrompt}
          banner={cloneUnlocked ? undefined : "尚未解锁声音克隆资格"}
        />

        {/* 5. 数据删除权（危险操作，置于最后） */}
        <DangerZone profileId={profile.id} personaName={profile.personaName} />
      </div>

      <div className="mt-10 flex flex-wrap gap-4 border-t border-brand-200 pt-6 text-sm">
        <Link href="/console" className="text-brand-500 hover:underline">
          ← 返回控制台
        </Link>
        <Link href={`/whispers/${profile.hall.id}/history`} className="text-accent-600 hover:underline">
          查看我的对话记录 →
        </Link>
        <Link href="/whispers" className="text-accent-600 hover:underline">
          查看板块说明与套餐 →
        </Link>
        <Link href="/points/guide" className="text-brand-500 hover:underline">
          积分规则 →
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-4">
      <p className="text-xs text-brand-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-brand-900">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-brand-400">{sub}</p>}
    </div>
  );
}
