import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CATEGORY_LABEL, lifeSpan } from "@/lib/memorial";
import DecisionButton from "@/components/admin/DecisionButton";
import ConfirmActionButton from "@/components/admin/ConfirmActionButton";
import {
  approveApplication,
  rejectApplication,
  takedownMemorial,
  deleteMemorialAdmin,
  deleteApplicationAdmin,
  approveMessage,
  rejectMessage,
} from "./actions";

export const metadata = { title: "公益纪念审核" };

export default async function MemorialReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "super_admin") redirect("/console");

  const [apps, pendingMsgs, approved, takenDown] = await Promise.all([
    prisma.publicMemorialApplication.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.publicMemorialMessage.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { memorial: { select: { name: true, slug: true } } },
      take: 50,
    }),
    prisma.publicMemorial.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.publicMemorial.findMany({
      where: { status: "TAKEN_DOWN" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold text-brand-900">公益纪念审核</h1>
      <p className="mb-4 text-sm text-brand-500">
        纯公益、零付费引导、与收费纪念馆体系隔离。审核须核验
        <b className="text-accent-600">家属授权</b>与<b className="text-accent-600">权威来源</b>，
        通过即创建最高级别公开纪念堂；留言先审后发。
      </p>

      {/* 申请审核队列 */}
      <h2 className="mb-1 mt-8 text-xl font-semibold text-brand-900">
        家属申请审核{apps.length > 0 ? `（${apps.length}）` : ""}
      </h2>
      <p className="mb-4 text-sm text-brand-500">
        每张申请必须已勾选家属授权、附带权威来源；核验真实性与庄重性后放行。未核验来源一律驳回。
      </p>
      <div className="space-y-4">
        {apps.map((a) => (
          <div key={a.id} className="rounded-lg border border-amber-200 bg-brand-100/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="text-sm font-semibold text-brand-900">
                {a.deceasedName}
                <span className="ml-2 rounded bg-accent-50 px-2 py-0.5 text-xs text-accent-700">
                  {CATEGORY_LABEL[a.category]}
                </span>
                <span className="ml-2 text-xs font-normal text-brand-400">
                  {lifeSpan(a.birthYear, a.deathYear)}
                </span>
              </div>
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                {a.consentConfirmed ? "已同意家属授权书" : "⚠ 缺少授权"}
              </span>
            </div>

            <div className="mt-2 rounded bg-gray-50 p-3 text-xs text-brand-600">
              <div>申请人：{a.applicantName} · 关系：{a.applicantRelation} · 联系：{a.applicantContact}</div>
              <div className="mt-1">称号：{a.honorTitle}</div>
              <div className="mt-1">简介：{a.summary}</div>
              {a.story && <div className="mt-1 line-clamp-3">事迹：{a.story}</div>}
              {a.sourceUrl && (
                <div className="mt-1">
                  来源：
                  <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="text-accent-600 hover:underline">
                    {a.sourceUrl}
                  </a>
                </div>
              )}
              <div className="mt-1 text-brand-400">提交时间：{new Date(a.createdAt).toLocaleString("zh-CN")}</div>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <form action={approveApplication} className="flex items-end gap-2">
                <input type="hidden" name="id" value={a.id} />
                <DecisionButton
                  value="approve"
                  label="通过并上线"
                  className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
                />
              </form>
              <form action={rejectApplication} className="flex items-end gap-2">
                <input type="hidden" name="id" value={a.id} />
                <input
                  name="note"
                  placeholder="驳回理由（可选）"
                  className="flex-1 rounded border border-brand-200 px-2 py-1.5 text-sm"
                />
                <DecisionButton
                  value="reject"
                  label="驳回"
                  className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
                />
              </form>
              <ConfirmActionButton
                action={deleteApplicationAdmin}
                id={a.id}
                label="删除"
                confirmText="确认删除该申请记录？此操作不可恢复。"
              />
            </div>
          </div>
        ))}
        {apps.length === 0 && <p className="text-sm text-brand-400">暂无待审核申请。</p>}
      </div>

      {/* 待审留言 */}
      <h2 className="mb-1 mt-10 text-xl font-semibold text-brand-900">
        待审公众留言{pendingMsgs.length > 0 ? `（${pendingMsgs.length}）` : ""}
      </h2>
      <p className="mb-4 text-sm text-brand-500">公众留言先审后发，通过后在该纪念堂详情页公开。</p>
      <div className="space-y-4">
        {pendingMsgs.map((m) => (
          <div key={m.id} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
            <div className="text-xs text-brand-400">
              {m.nickname || "匿名缅怀者"} · 纪念堂
              {m.memorial ? (
                <Link href={`/memorial/${m.memorial.slug}`} className="text-brand-600 hover:underline">
                  「{m.memorial.name}」
                </Link>
              ) : (
                "（已下架）"
              )}
              · {new Date(m.createdAt).toLocaleString("zh-CN")}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{m.content}</p>
            <div className="mt-3 flex gap-2">
              <form action={approveMessage}>
                <input type="hidden" name="id" value={m.id} />
                <DecisionButton
                  value="approve"
                  label="通过"
                  className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
                />
              </form>
              <form action={rejectMessage}>
                <input type="hidden" name="id" value={m.id} />
                <DecisionButton
                  value="reject"
                  label="驳回"
                  className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
                />
              </form>
            </div>
          </div>
        ))}
        {pendingMsgs.length === 0 && <p className="text-sm text-brand-400">暂无待审留言。</p>}
      </div>

      {/* 已上线纪念堂（可下架） */}
      <h2 className="mb-1 mt-10 text-xl font-semibold text-brand-900">
        已上线纪念堂（可下架）{approved.length > 0 ? `（${approved.length}）` : ""}
      </h2>
      <p className="mb-4 text-sm text-brand-500">
        家属可申请撤下；管理员发现内容不实或违规须及时下架（status=TAKEN_DOWN，详情页 404）。
      </p>
      <div className="space-y-3">
        {approved.map((m) => (
          <div key={m.id} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-brand-900">
                {m.name}
                <span className="ml-2 rounded bg-accent-50 px-2 py-0.5 text-xs text-accent-700">
                  {CATEGORY_LABEL[m.category]}
                </span>
                <span className="ml-2 text-xs font-normal text-brand-400">
                  🕯️ {m.lightCount} · {m.viewCount} 次缅怀
                </span>
              </div>
              <Link
                href={`/memorial/${m.slug}`}
                target="_blank"
                className="text-xs text-accent-600 hover:underline"
              >
                查看详情 →
              </Link>
              <Link
                href={`/memorial/${m.slug}/manage`}
                className="text-xs text-brand-500 hover:text-accent-600"
              >
                去装修 →
              </Link>
            </div>
            <form action={takedownMemorial} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={m.id} />
              <input
                name="reason"
                placeholder="下架原因（家属申请 / 内容不实 / 违规，可选）"
                className="flex-1 min-w-[200px] rounded border border-brand-200 px-2 py-1.5 text-sm"
              />
              <DecisionButton
                value="takedown"
                label="下架"
                className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              />
              <ConfirmActionButton
                action={deleteMemorialAdmin}
                id={m.id}
                label="删除（永久）"
                confirmText="确认永久删除该纪念堂及其全部缅怀数据？此操作不可恢复。"
              />
            </form>
          </div>
        ))}
        {approved.length === 0 && <p className="text-sm text-brand-400">暂无已上线纪念堂。</p>}
      </div>

      {/* 已下架纪念堂（可永久删除） */}
      <h2 className="mb-1 mt-10 text-xl font-semibold text-brand-900">
        已下架纪念堂（可永久删除）{takenDown.length > 0 ? `（${takenDown.length}）` : ""}
      </h2>
      <p className="mb-4 text-sm text-brand-500">
        家属撤回或违规巡查下架的纪念堂。下架后公开页 404、保留记录；如需彻底清除，可在此永久删除。
      </p>
      <div className="space-y-3">
        {takenDown.map((m) => (
          <div key={m.id} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-brand-900">
                {m.name}
                <span className="ml-2 rounded bg-accent-50 px-2 py-0.5 text-xs text-accent-700">
                  {CATEGORY_LABEL[m.category]}
                </span>
                <span className="ml-2 text-xs font-normal text-brand-400">
                  🕯️ {m.lightCount} · {m.viewCount} 次缅怀
                </span>
              </div>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-brand-500">已下架</span>
            </div>
            {m.takedownReason && (
              <div className="mt-1 text-xs text-brand-400">下架原因：{m.takedownReason}</div>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <ConfirmActionButton
                action={deleteMemorialAdmin}
                id={m.id}
                label="删除（永久）"
                confirmText="确认永久删除该已下架纪念堂及其全部缅怀数据？此操作不可恢复。"
              />
            </div>
          </div>
        ))}
        {takenDown.length === 0 && <p className="text-sm text-brand-400">暂无已下架纪念堂。</p>}
      </div>
    </div>
  );
}
