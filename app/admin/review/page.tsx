import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import DecisionButton from "@/components/admin/DecisionButton";
import { currentEngineLabel, isMockMode } from "@/lib/ai/index";
import {
  CHANNEL_META,
  appealPendingSupplement,
  channelMetaFor,
  normalizeProofs,
  supplementDueInDays,
} from "@/lib/hall-review";
import {
  reviewItem,
  reviewHall,
  reviewComment,
  reviewGenealogy,
  reviewClanHall,
  reviewClanContent,
  reviewClanActivity,
  reviewWhisper,
  reviewWhisperEthics,
  handleHallReport,
} from "./actions";

export const metadata = { title: "内容审核" };

const targetLabel: Record<string, string> = {
  article: "文章",
  product: "商品",
  comment: "评论",
  realname: "实名",
};

const statusLabel: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
};

type AiResult = { risk?: string; score?: number; labels?: string[] };
type Snapshot = { title?: string; name?: string; realName?: string };

export default async function ReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "editor" && user.role !== "super_admin") redirect("/console");

  const [items, pendingHalls, pendingComments, pendingGenealogies, pendingClanHalls, pendingClanPosts, pendingClanReplies, pendingWhispers, pendingReports, pendingClanActivities] = await Promise.all([
    prisma.moderationQueue.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.memorialHall.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { realName: true, email: true } } },
      take: 50,
    }),
    prisma.articleComment.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { realName: true, email: true } },
        article: { select: { title: true, slug: true } },
      },
      take: 50,
    }),
    prisma.genealogy.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { realName: true, email: true } } },
      take: 50,
    }),
    prisma.clanHall.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { realName: true, email: true } } },
      take: 50,
    }),
    prisma.clanPost.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { realName: true, email: true } } },
      take: 50,
    }),
    prisma.clanPostReply.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { realName: true, email: true } },
        post: { select: { title: true } },
      },
      take: 50,
    }),
    prisma.whisperProfile.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { realName: true, email: true } },
        hall: { select: { name: true, deceasedName: true } },
        consent: { select: { id: true, applicantName: true, relation: true, revokedAt: true } },
        _count: { select: { voices: true, sessions: true } },
      },
      take: 50,
    }).then((rows) =>
      rows.map((r) => ({
        ...r,
        ethicsApproved: r.ethicsStatus === "approved",
      })),
    ),
    prisma.hallReport.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      include: {
        hall: { select: { name: true, deceasedName: true } },
        clanHall: { select: { hallName: true, surname: true } },
        reporter: { select: { realName: true, email: true } },
      },
      take: 50,
    }),
    prisma.clanActivity.findMany({
      where: { reviewStatus: "pending" },
      orderBy: { createdAt: "desc" },
      include: {
        clanHall: { select: { hallName: true, surname: true } },
        createdBy: { select: { realName: true, email: true } },
      },
      take: 50,
    }),
  ]);

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold text-brand-900">内容审核队列</h1>
      <p className="mb-4 text-sm text-brand-500">
        AI 预过滤后进入人工终审；命中敏感词的文章会被机审标记，编辑发布即自动入队。
      </p>

      {/* 引擎状态可见性：审核员需知道当前是真实引擎还是 Mock，
          避免把演示回复当成线上效果来判断质量 */}
      <div
        className={
          "mb-6 rounded-lg border px-4 py-3 text-xs " +
          (isMockMode()
            ? "border-slate-200 bg-slate-50 text-slate-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-800")
        }
      >
        <p>
          <b>追思对话引擎：</b>
          {isMockMode() ? "演示模式（未配置云 API Key）" : "已接入真实引擎"}
          <span className="mx-1.5 text-brand-300">|</span>
          当前标识：<code className="rounded bg-white/70 px-1.5 py-0.5">{currentEngineLabel()}</code>
        </p>
        <p className="mt-1 opacity-80">
          {isMockMode()
            ? "对话回复由本地模拟逻辑生成，仅用于验证链路完整性，不代表上线效果。审核装置时请以资料库与授权链的合规性为主。"
            : "对话回复由云端模型生成。若发现装置回复出现编造记忆或不当表述，请在意见中注明，必要时驳回。"}
        </p>
      </div>

      <div className="space-y-4">
        {items.map((it) => {
          const ai = (it.aiResult as AiResult) || {};
          const snap = (it.contentSnapshot as Snapshot) || {};
          const title = snap.title || snap.name || snap.realName || it.targetId;
          const statusColor =
            it.status === "pending"
              ? "text-amber-600"
              : it.status === "approved"
                ? "text-green-600"
                : "text-red-600";
          return (
            <div key={it.id} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="rounded bg-brand-50 px-2 py-0.5 text-brand-700">
                    {targetLabel[it.targetType] ?? it.targetType}
                  </span>
                  <span className="ml-2 text-brand-500">{title}</span>
                </div>
                <span className={`text-xs ${statusColor}`}>{statusLabel[it.status]}</span>
              </div>

              <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-brand-500">
                机审风险：{ai.risk === "high" ? "高" : "低"} · 命中数：{ai.score ?? 0}
                {ai.labels && ai.labels.length > 0
                  ? ` · 敏感词：${ai.labels.join("、")}`
                  : " · 未命中敏感词"}
              </div>

              {it.targetType === "article" && (
                <Link
                  href={`/admin/articles/${it.targetId}`}
                  className="mt-2 inline-block text-xs text-brand-700 hover:underline"
                >
                  查看原文 →
                </Link>
              )}

              {it.status === "pending" ? (
                <form action={reviewItem} className="mt-3 flex items-end gap-2">
                  <input type="hidden" name="id" value={it.id} />
                  <input
                    name="reason"
                    placeholder="驳回理由（可选）"
                    className="flex-1 rounded border border-brand-200 px-2 py-1 text-sm"
                  />
                  <DecisionButton
                    value="approved"
                    label="通过"
                    className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
                  />
                  <DecisionButton
                    value="rejected"
                    label="驳回"
                    className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                  />
                </form>
              ) : (
                it.reason && (
                  <div className="mt-2 text-xs text-brand-400">处理意见：{it.reason}</div>
                )
              )}
            </div>
          );
        })}
        {items.length === 0 && <p className="text-sm text-brand-400">暂无审核任务。</p>}
      </div>

      {/* 午夜悄悄话装置审核（合规：家属授权链 + 声音克隆伦理审查，为开启前提） */}
      <h2 className="mb-1 mt-10 text-xl font-semibold text-brand-900">午夜悄悄话装置审核</h2>
      <p className="mb-4 text-sm text-brand-500">
        依据《民法典》994/1019 条与最高法 2026-09-07《关于依法审理涉人工智能纠纷案件的意见》：
        <span className="font-medium text-accent-600">未取得近亲属单独同意的逝者声音复刻构成侵权</span>
        。系统已强制校验——无有效授权时即使点「通过」也会自动驳回。
        <span className="ml-1">
          涉及<b>声音克隆</b>的装置，还须先通过
          <span className="font-medium text-accent-600">伦理审查</span>（人工子审核），
          审查通过前不会开放上线。
        </span>
      </p>
      <div className="space-y-4">
        {pendingWhispers.map((w) => {
          const consentOk = !!w.consent && !w.consent.revokedAt;
          const hasClone = w._count.voices > 0;
          const ethicsOk = !!w.ethicsApproved;
          const ethicsPending = !!w.ethicsReviewedAt;
          const ethicsText = !w.ethicsReviewedAt
            ? "未审查"
            : w.ethicsApproved
              ? "已通过"
              : "未通过";
          const ethicsCls = !w.ethicsReviewedAt
            ? "bg-amber-100 text-amber-700"
            : w.ethicsApproved
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-600";
          return (
            <div key={w.id} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-brand-900">
                    {w.personaName}
                    {w.personTitle ? `（${w.personTitle}）` : ""}
                    <span className="ml-2 text-xs text-brand-400">所属纪念馆：{w.hall.name}</span>
                  </div>
                  <div className="mt-1 text-xs text-brand-400">
                    申请人：{w.owner.realName || w.owner.email} · 逝者：{w.hall.deceasedName}
                  </div>
                  <div className="mt-1 text-xs text-brand-400">
                    资料库：声线 {w._count.voices} 条 · 会话 {w._count.sessions} 次 · 引擎 {w.engineLabel ?? "未标注"}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span
                    className={
                      "rounded px-2 py-0.5 text-xs " +
                      (consentOk ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600")
                    }
                  >
                    {consentOk ? "家属授权已录入" : "⚠ 缺少家属授权"}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs ${ethicsCls}`}>
                    {hasClone ? `伦理审查：${ethicsText}` : "伦理审查：无需（纯语音预设声线）"}
                  </span>
                </div>
              </div>

              {/* 授权链明细 */}
              <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-brand-600">
                {consentOk ? (
                  <>
                    <div>
                      授权人：{w.consent!.applicantName} · 与逝者关系：{w.consent!.relation}
                    </div>
                    <div className="mt-0.5 text-brand-400">
                      身份证号已 AES-256 加密存储，仅审核时可见脱敏值。
                    </div>
                  </>
                ) : (
                  <div className="text-red-600">
                    申请人尚未提交家属授权链。开启前必须补齐：近亲属关系证明、单独同意、其他近亲属无异议确认。
                  </div>
                )}
              </div>

              {/* 伦理审查子块（仅涉及声音克隆时需要） */}
              {hasClone && (
                <div className="mt-2 rounded-md border border-accent-100 bg-accent-50/40 p-3 text-xs text-brand-600">
                  <p className="font-medium text-brand-800">声音克隆伦理审查</p>
                  {w.ethicsReviewedAt ? (
                    <p className="mt-1">
                      结论：<b>{ethicsText}</b>
                      {w.ethicsReviewer ? ` · 审核人 ${w.ethicsReviewer}` : ""}
                      {w.ethicsNote ? ` · 意见：${w.ethicsNote}` : ""}
                    </p>
                  ) : (
                    <p className="mt-1">
                      该装置已提交 {w._count.voices} 条声线（含克隆样本）。请先完成伦理审查：
                      确认样本来源合法、已获近亲属单独同意、逝者生前无明确反对表示。
                    </p>
                  )}
                  <form action={reviewWhisperEthics} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={w.id} />
                    <input
                      name="note"
                      defaultValue={w.ethicsNote ?? ""}
                      placeholder="伦理审查意见（可选）"
                      className="flex-1 min-w-[180px] rounded-md border border-brand-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
                    />
                    <DecisionButton
                      value="approved"
                      label="伦理通过"
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
                    />
                    <DecisionButton
                      value="rejected"
                      label="伦理不通过"
                      className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    />
                  </form>
                </div>
              )}

              <form action={reviewWhisper} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={w.id} />
                <input
                  name="reason"
                  placeholder="处理意见（可选）"
                  className="flex-1 min-w-[200px] rounded-md border border-brand-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
                />
                <DecisionButton
                  value="active"
                  label="通过并开启"
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
                />
                <DecisionButton
                  value="rejected"
                  label="驳回"
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                />
              </form>
            </div>
          );
        })}
        {pendingWhispers.length === 0 && (
          <p className="text-sm text-brand-400">暂无待审核的追思装置。</p>
        )}
      </div>

      {/* 纪念馆建馆审核（专人审核：火化证明/经办人身份/关系证明） */}
      <h2 className="mb-1 mt-10 text-xl font-semibold text-brand-900">纪念馆建馆审核</h2>
      <p className="mb-4 text-sm text-brand-500">
        依据 MZ/T 173—2025：核对火化证明、经办人身份证与逝者关系后开通；严防"活人被祭拜"。
      </p>
      <div className="space-y-4">
        {pendingHalls.map((h) => {
          const proofs = normalizeProofs(h.proofs);
          const channelKey = (h.reviewChannel as keyof typeof CHANNEL_META) || "standard";
          const channel = CHANNEL_META[channelKey];
          const maskedId = proofs?.applicantIdCard
            ? proofs.applicantIdCard.replace(/^(.{6}).+(.{4})$/, "$1**********$2")
            : "—";
          const isAppeal = channelKey === "appeal";
          const appealPending = appealPendingSupplement(h);
          const dueDays = supplementDueInDays(h);
          const materials = proofs?.materials ?? [];
          return (
            <div key={h.id} className="rounded-lg border border-amber-200 bg-brand-100/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-brand-900">
                  {h.name} <span className="font-normal text-brand-400">/ 逝者 {h.deceasedName}</span>
                </div>
                <span className="rounded bg-accent-50 px-2 py-0.5 text-xs text-accent-700">
                  {channel.label}
                </span>
              </div>
              <div className="mt-2 grid gap-1 rounded bg-gray-50 p-3 text-xs text-brand-600 sm:grid-cols-2">
                <span>经办人：{h.owner?.realName || h.owner?.email || "—"}</span>
                <span>与逝者关系：{proofs?.relation || "—"}</span>
                <span>经办人身份证：{maskedId}</span>
                <span>手机号：{proofs?.applicantPhone || "—"}</span>
                <span>申请时间：{new Date(h.createdAt).toLocaleString("zh-CN")}</span>
                {isAppeal && (
                  <span className={appealPending ? "font-medium text-amber-700" : "text-green-700"}>
                    {appealPending
                      ? `补传倒计时：${dueDays != null ? `${dueDays} 天` : "—"}（仅创建者可见）`
                      : "已补传，可转公开"}
                  </span>
                )}
              </div>

              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-brand-700">
                  证明材料（{materials.length} 项）
                </div>
                {materials.length === 0 ? (
                  <div className="text-xs text-brand-400">未提交材料</div>
                ) : (
                  <ul className="space-y-1">
                    {materials.map((m, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2 rounded bg-gray-50 px-2 py-1 text-xs text-brand-600">
                        <span className="font-medium text-brand-900">{m.label}</span>
                        {m.value && <span>{m.value}</span>}
                        {m.url && (
                          <a href={m.url} target="_blank" rel="noreferrer" className="text-accent-600 hover:underline">
                            查看图片
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {isAppeal && proofs?.promiseLetter && (
                  <a
                    href={proofs.promiseLetter}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs text-accent-600 hover:underline"
                  >
                    查看真实性承诺书
                  </a>
                )}
              </div>

              <form action={reviewHall} className="mt-3 flex items-end gap-2">
                <input type="hidden" name="id" value={h.id} />
                <input
                  name="reason"
                  placeholder="驳回理由（可选）"
                  className="flex-1 rounded border border-brand-200 px-2 py-1 text-sm"
                />
                <DecisionButton
                  value="active"
                  label={isAppeal ? "通过（仅创建者可见）" : "通过并开通"}
                  className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
                />
                <DecisionButton
                  value="rejected"
                  label="驳回"
                  className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                />
              </form>
            </div>
          );
        })}
        {pendingHalls.length === 0 && (
          <p className="text-sm text-brand-400">暂无待审核建馆申请。</p>
        )}
      </div>

      {/* 评论审核 */}
      <h2 className="mb-1 mt-10 text-xl font-semibold text-brand-900">评论审核</h2>
      <p className="mb-4 text-sm text-brand-500">用户评论先审后显，通过后在前台文章页展示。</p>
      <div className="space-y-4">
        {pendingComments.map((c) => (
          <div key={c.id} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
            <div className="text-xs text-brand-400">
              {c.user?.realName || c.user?.email || "用户"} · 评论于{" "}
              <Link href={`/news/${c.article.slug}`} className="text-brand-600 hover:underline">
                {c.article.title}
              </Link>{" "}
              · {new Date(c.createdAt).toLocaleString("zh-CN")}
            </div>
            <p className="mt-2 text-sm text-gray-700">{c.body}</p>
            <form action={reviewComment} className="mt-3 flex gap-2">
              <input type="hidden" name="id" value={c.id} />
              <DecisionButton
                value="approved"
                label="通过"
                className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
              />
              <DecisionButton
                value="rejected"
                label="驳回"
                className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
              />
            </form>
          </div>
        ))}
        {pendingComments.length === 0 && (
          <p className="text-sm text-brand-400">暂无待审核评论。</p>
        )}
      </div>

      {/* 宗祠设立审核 */}
      <h2 className="mb-1 mt-10 text-xl font-semibold text-brand-900">宗祠设立审核</h2>
      <p className="mb-4 text-sm text-brand-500">
        用户设立的宗祠先审后显，通过后进入宗祠名录对宗亲公开展示。
      </p>
      <div className="space-y-4">
        {pendingClanHalls.map((h) => {
          const proofs = normalizeProofs(h.proofs);
          const materials = proofs?.materials ?? [];
          const channelMeta = channelMetaFor("clan", h.reviewChannel || "standard");
          const isAppeal = h.reviewChannel === "appeal";
          return (
          <div key={h.id} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
            <div className="text-sm font-semibold text-brand-900">
              {h.hallName}
              <span className="ml-2 text-xs font-normal text-brand-400">
                {h.surname}氏 · 堂号「{h.name}」 · 设立人：{h.owner?.realName || h.owner?.email || "—"}
              </span>
              <span className="ml-2 rounded bg-accent-50 px-2 py-0.5 text-[11px] text-accent-700">
                {channelMeta.label}
              </span>
            </div>
            <div className="mt-2 rounded bg-gray-50 p-3 text-xs text-brand-600">
              {h.ancestorTitle && <div>郡望：{h.ancestorTitle}</div>}
              {h.ancestorName && <div className="mt-1">始祖：{h.ancestorName}</div>}
              {h.origin && <div className="mt-1">始迁地：{h.origin}</div>}
              {h.description && <div className="mt-1 line-clamp-3">简介：{h.description}</div>}
            </div>
            <div className="mt-3">
              <div className="mb-1 text-xs font-medium text-brand-700">
                宗祠佐证材料（{materials.length} 项）
              </div>
              {materials.length === 0 ? (
                <div className="text-xs text-red-600">未提交佐证材料</div>
              ) : (
                <ul className="space-y-1">
                  {materials.map((m, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 rounded bg-gray-50 px-2 py-1 text-xs text-brand-600">
                      <span className="font-medium text-brand-900">{m.label}</span>
                      {m.value && <span>{m.value}</span>}
                      {m.url && (
                        <a href={m.url} target="_blank" rel="noreferrer" className="text-accent-600 hover:underline">
                          查看图片
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <form action={reviewClanHall} className="mt-3 flex gap-2">
              <input type="hidden" name="id" value={h.id} />
              <DecisionButton
                value="active"
                label={isAppeal ? "通过（仅创建者可见）" : "通过并公开"}
                className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
              />
              <DecisionButton
                value="rejected"
                label="驳回"
                className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
              />
            </form>
          </div>
          );
        })}
        {pendingClanHalls.length === 0 && (
          <p className="text-sm text-brand-400">暂无待审核宗祠。</p>
        )}
      </div>

      {/* 族谱审核 */}
      <h2 className="mb-1 mt-10 text-xl font-semibold text-brand-900">族谱上传审核</h2>
      <p className="mb-4 text-sm text-brand-500">用户上传的族谱资料先审后显，通过后进入族谱数据库公开检索。</p>
      <div className="space-y-4">
        {pendingGenealogies.map((g) => (
          <div key={g.id} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
            <div className="text-sm font-semibold text-brand-900">
              {g.surname}氏族谱{g.hallName ? ` · ${g.hallName}` : ""}
              <span className="ml-2 text-xs font-normal text-brand-400">
                上传者：{g.owner?.realName || g.owner?.email || "—"}
              </span>
            </div>
            <div className="mt-2 rounded bg-gray-50 p-3 text-xs text-brand-600">
              {g.origin && <div>祖籍：{g.origin}</div>}
              {g.lineage && <div className="mt-1">字辈：{g.lineage}</div>}
              {g.migration && <div className="mt-1">迁徙源流：{g.migration}</div>}
            </div>
            <form action={reviewGenealogy} className="mt-3 flex gap-2">
              <input type="hidden" name="id" value={g.id} />
              <DecisionButton
                value="approved"
                label="通过并公开"
                className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
              />
              <DecisionButton
                value="rejected"
                label="驳回"
                className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
              />
            </form>
          </div>
        ))}
        {pendingGenealogies.length === 0 && (
          <p className="text-sm text-brand-400">暂无待审核族谱。</p>
        )}
      </div>

      {/* 宗亲社区审核 */}
      <h2 className="mb-1 mt-10 text-xl font-semibold text-brand-900">宗亲社区审核</h2>
      <p className="mb-4 text-sm text-brand-500">社区帖子与回帖先审后显，通过后公开。</p>
      <div className="space-y-4">
        {pendingClanPosts.map((p) => (
          <div key={`p-${p.id}`} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
            <div className="text-xs text-brand-400">
              {p.surname}氏 · {p.topic} · {p.user?.realName || p.user?.email || "用户"} ·{" "}
              {new Date(p.createdAt).toLocaleString("zh-CN")}
            </div>
            <h3 className="mt-1.5 text-sm font-semibold text-brand-900">{p.title}</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{p.body}</p>
            <form action={reviewClanContent} className="mt-3 flex gap-2">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="kind" value="post" />
              <DecisionButton value="approved" label="通过" className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700" />
              <DecisionButton value="rejected" label="驳回" className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700" />
            </form>
          </div>
        ))}
        {pendingClanReplies.map((r) => (
          <div key={`r-${r.id}`} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
            <div className="text-xs text-brand-400">
              回帖 · 主题「{r.post.title}」 · {r.user?.realName || r.user?.email || "用户"} ·{" "}
              {new Date(r.createdAt).toLocaleString("zh-CN")}
            </div>
            <p className="mt-1.5 text-sm text-gray-600">{r.body}</p>
            <form action={reviewClanContent} className="mt-3 flex gap-2">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="kind" value="reply" />
              <DecisionButton value="approved" label="通过" className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700" />
              <DecisionButton value="rejected" label="驳回" className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700" />
            </form>
          </div>
        ))}
        {pendingClanPosts.length === 0 && pendingClanReplies.length === 0 && (
          <p className="text-sm text-brand-400">暂无待审核社区内容。</p>
        )}
      </div>

      {/* 宗族活动审核（祠主发布的本族活动先审后显） */}
      <h2 className="mb-1 mt-10 text-xl font-semibold text-brand-900">宗族活动审核</h2>
      <p className="mb-4 text-sm text-brand-500">
        祠主在宗祠控制台发布的本族活动先审后显；通过后会在「宗族活动」公页公开并开放报名。
      </p>
      <div className="space-y-4">
        {pendingClanActivities.map((a) => (
          <div key={a.id} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
            <div className="text-xs text-brand-400">
              {a.clanHall ? `${a.clanHall.hallName}（${a.clanHall.surname}氏）` : "平台"} · {a.kind} ·{" "}
              {a.createdBy?.realName || a.createdBy?.email || "祠主"} ·{" "}
              {new Date(a.startAt).toLocaleString("zh-CN", { hour12: false })}
            </div>
            <h3 className="mt-1.5 text-sm font-semibold text-brand-900">{a.title}</h3>
            <div className="mt-1 text-xs text-brand-500">
              📍 {a.location}
              {a.onlineLink ? ` · 线上：${a.onlineLink}` : ""} · 名额 {a.capacity}
            </div>
            {a.description && (
              <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{a.description}</p>
            )}
            <form action={reviewClanActivity} className="mt-3 flex gap-2">
              <input type="hidden" name="id" value={a.id} />
              <DecisionButton value="approved" label="通过" className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700" />
              <DecisionButton value="rejected" label="驳回" className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700" />
            </form>
          </div>
        ))}
        {pendingClanActivities.length === 0 && (
          <p className="text-sm text-brand-400">暂无待审核宗族活动。</p>
        )}
      </div>

      {/* 建馆审核举报队列 */}
      <h2 className="mb-1 mt-10 text-xl font-semibold text-brand-900">建馆举报处理</h2>
      <p className="mb-4 text-sm text-brand-500">
        公页「举报」入口提交的工单。举报不直接下架，由人工复核后处置（handled）或驳回误报（dismissed）。
      </p>
      <div className="space-y-4">
        {pendingReports.map((r) => {
          const target =
            r.hall
              ? `纪念馆：${r.hall.name}（逝者 ${r.hall.deceasedName}）`
              : r.clanHall
                ? `宗祠：${r.clanHall.hallName}（${r.clanHall.surname}氏）`
                : "未知对象";
          const kindLabel: Record<string, string> = {
            living: "活人被祭拜",
            fake: "虚假馆",
            other: "其他",
          };
          return (
            <div key={r.id} className="rounded-lg border border-red-200 bg-brand-100/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-brand-900">{target}</div>
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                  {kindLabel[r.kind] ?? r.kind}
                </span>
              </div>
              <div className="mt-1 text-xs text-brand-400">
                举报人：{r.reporter?.realName || r.reporter?.email || "匿名"} · 时间：
                {new Date(r.createdAt).toLocaleString("zh-CN")}
              </div>
              {r.reason && (
                <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-brand-600">举报说明：{r.reason}</div>
              )}
              <form action={handleHallReport} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={r.id} />
                <input
                  name="note"
                  placeholder="处理备注（可选）"
                  className="flex-1 min-w-[200px] rounded border border-brand-200 px-2 py-1 text-sm"
                />
                <DecisionButton
                  value="handled"
                  label="已处置"
                  className="rounded bg-orange-600 px-3 py-1 text-sm text-white hover:bg-orange-700"
                />
                <DecisionButton
                  value="dismissed"
                  label="驳回误报"
                  className="rounded border border-brand-300 px-3 py-1 text-sm text-brand-600 hover:bg-gray-50"
                />
              </form>
            </div>
          );
        })}
        {pendingReports.length === 0 && (
          <p className="text-sm text-brand-400">暂无待处理举报。</p>
        )}
      </div>
    </div>
  );
}
