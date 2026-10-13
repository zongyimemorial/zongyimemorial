import Link from "next/link";
import {
  findAppByToken,
  CATEGORY_LABEL,
  STATUS_LABEL,
  lifeSpan,
} from "@/lib/memorial";
import {
  applicantWithdrawApplication,
  applicantTakedownMemorial,
  applicantDeleteMemorial,
} from "../actions";
import ConfirmActionForm from "@/components/memorial/ConfirmActionForm";

export const metadata = { title: "我的公益纪念堂管理 · 宗忆堂" };

export default async function ApplicantManagePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const app = await findAppByToken(token);

  // 凭证无效 / 记录已删除
  if (!app || !app.manageToken) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="text-4xl">🔗</div>
        <h1 className="mt-3 text-xl font-semibold text-brand-900">管理凭证无效或已失效</h1>
        <p className="mt-2 text-sm text-brand-500">
          链接可能已过期、记录已被删除，或凭证不完整。若您曾通过此链接撤回/删除了记录，
          则凭证不再有效。如需协助，请联系平台客服。
        </p>
        <Link
          href="/memorial"
          className="mt-6 inline-block rounded-md border border-brand-300 px-4 py-2 text-sm text-brand-700 hover:bg-brand-50"
        >
          返回公益纪念堂 →
        </Link>
      </div>
    );
  }

  const t = app.manageToken;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-brand-900">我的公益纪念堂管理</h1>
        <p className="mt-1 text-sm text-brand-500">
          您正以「管理凭证」身份操作，无需登录。请妥善保管此链接。
        </p>
      </header>

      {/* 申请摘要卡 */}
      <section className="rounded-xl border border-brand-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-lg font-semibold text-brand-900">
            {app.deceasedName}
            <span className="ml-2 rounded bg-accent-50 px-2 py-0.5 text-xs text-accent-700">
              {CATEGORY_LABEL[app.category]}
            </span>
            <span className="ml-2 text-xs font-normal text-brand-400">
              {lifeSpan(app.birthYear, app.deathYear)}
            </span>
          </div>
          <span className="rounded bg-brand-100 px-2 py-0.5 text-xs text-brand-700">
            申请状态：{STATUS_LABEL[app.status]}
          </span>
        </div>
        <dl className="mt-3 grid gap-1 text-xs text-brand-600">
          <div>申请人：{app.applicantName} · 关系：{app.applicantRelation} · 联系：{app.applicantContact}</div>
          <div>称号：{app.honorTitle}</div>
          {app.sourceUrl && <div>来源：{app.sourceUrl}</div>}
          <div className="text-brand-400">提交时间：{new Date(app.createdAt).toLocaleString("zh-CN")}</div>
        </dl>
      </section>

      {/* 各状态对应的操作区 */}
      <section className="mt-6 space-y-4">
        {app.status === "PENDING" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
            <h2 className="text-sm font-semibold text-amber-800">申请审核中</h2>
            <p className="mt-1 text-xs text-brand-600">
              尚未上线，您可随时撤回本申请（从审核队列移除）。通过后此处将出现「撤下/删除纪念堂」入口。
            </p>
            <div className="mt-3">
              <ConfirmActionForm
                action={applicantWithdrawApplication}
                token={t}
                label="撤回申请（移出审核队列）"
                confirmText="确认撤回该申请？撤回后将从审核队列移除，可重新提交。"
                variant="warn"
              />
            </div>
          </div>
        )}

        {app.status === "APPROVED" && app.memorial && (
          <div className="space-y-4">
            <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-4">
              <h2 className="text-sm font-semibold text-brand-900">纪念堂已上线</h2>
              <p className="mt-1 text-xs text-brand-600">
                「{app.memorial.name}」已对公众开放缅怀。
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <Link
                  href={`/memorial/${app.memorial.slug}`}
                  target="_blank"
                  className="text-accent-600 hover:underline"
                >
                  查看公开页 →
                </Link>
                <span className="text-brand-400">🕯️ {app.memorial.lightCount} · {app.memorial.viewCount} 次缅怀</span>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
              <h2 className="text-sm font-semibold text-amber-800">撤下纪念堂（软撤回）</h2>
              <p className="mt-1 text-xs text-brand-600">
                将纪念堂设为「已下架」，公开页变为 404，但保留记录、可日后恢复。适用于临时不想公开展示。
              </p>
              <div className="mt-3">
                <ConfirmActionForm
                  action={applicantTakedownMemorial}
                  token={t}
                  label="撤下纪念堂"
                  confirmText="确认撤下该纪念堂？公开页将下架（保留记录）。"
                  variant="warn"
                  withReason
                />
              </div>
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50/70 p-4">
              <h2 className="text-sm font-semibold text-red-800">删除纪念堂（永久）</h2>
              <p className="mt-1 text-xs text-brand-600">
                永久删除纪念堂及其全部留言、花圈与公众祭品，并删除本申请记录，<b>不可恢复</b>。
                请谨慎操作。
              </p>
              <div className="mt-3">
                <ConfirmActionForm
                  action={applicantDeleteMemorial}
                  token={t}
                  label="永久删除纪念堂与申请"
                  confirmText="确认永久删除？此操作不可恢复，将清除全部缅怀数据。"
                  variant="danger"
                />
              </div>
            </div>
          </div>
        )}

        {(app.status === "REJECTED" || app.status === "TAKEN_DOWN") && (
          <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-4">
            <h2 className="text-sm font-semibold text-brand-900">
              {app.status === "REJECTED" ? "申请未通过" : "纪念堂已下架"}
            </h2>
            <p className="mt-1 text-xs text-brand-600">
              {app.status === "REJECTED"
                ? "申请已被驳回。如信息有误，您可删除本申请记录后重新提交。"
                : "纪念堂当前为「已下架」状态。您可彻底删除本记录（含申请）。"}
              {app.reviewNote && `（原因：${app.reviewNote}）`}
            </p>
            <div className="mt-3">
              <ConfirmActionForm
                action={applicantDeleteMemorial}
                token={t}
                label="彻底删除本申请记录"
                confirmText="确认永久删除该记录？此操作不可恢复。"
                variant="danger"
              />
            </div>
          </div>
        )}
      </section>

      <div className="mt-8 border-t border-brand-200 pt-4 text-center">
        <Link href="/memorial" className="text-sm text-brand-500 hover:text-accent-600">
          ← 返回公益纪念堂
        </Link>
      </div>
    </div>
  );
}
