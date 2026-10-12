import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateLive } from "@/app/admin/live/actions";
import LiveForm from "@/components/admin/LiveForm";

/**
 * 编辑直播。
 *
 * 此前不存在这个页面 —— 直播创建后无法修改，而公开指引明确要求主办方
 * 「先设预告，当天改直播中，结束改回放」。补齐后指引才算落地。
 *
 * 顺带把开播 / 结束时间显示出来，让「改状态即自动记时间」可见、可验证
 * （否则用户不知道系统到底记没记）。
 */
export default async function EditLivePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin")) redirect("/console");

  const { id } = await params;
  const live = await prisma.liveSession.findUnique({ where: { id } });
  if (!live) notFound();

  const fmt = (d: Date | null) =>
    d ? new Date(d).toLocaleString("zh-CN", { hour12: false }) : "—";

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-2xl font-semibold text-brand-900">编辑直播</h1>
      <p className="mb-4 text-sm text-brand-500">修改后立即对观众生效。</p>

      {/* 时间戳只读展示：它由状态自动维护，故不做成输入框 */}
      <dl className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-brand-200 bg-brand-100/70 px-4 py-3 text-xs">
        <div>
          <dt className="text-brand-400">开播时间</dt>
          <dd className="mt-0.5 font-medium text-brand-900">{fmt(live.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-brand-400">结束时间</dt>
          <dd className="mt-0.5 font-medium text-brand-900">{fmt(live.endedAt)}</dd>
        </div>
        <div className="col-span-2 text-brand-400">
          这两项由状态自动维护：改为「直播中」记开播，改为「回放」记结束，改回「预告」则清空。
        </div>
      </dl>

      <LiveForm
        action={updateLive}
        submitLabel="保存修改"
        values={{
          id: live.id,
          title: live.title,
          status: live.status,
          category: live.category,
          embedType: live.embedType,
          streamUrl: live.streamUrl,
          description: live.description,
        }}
      />

      <p className="mt-4 text-xs text-brand-400">
        公开页：{" "}
        <Link href={`/live/${live.id}`} className="text-accent-600 underline">
          /live/{live.id}
        </Link>
      </p>
    </div>
  );
}
