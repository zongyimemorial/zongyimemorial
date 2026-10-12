import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import HallPhotoManager from "@/components/console/HallPhotoManager";
import DecorStudio from "@/components/clan/ClanDecorStudio";
import StoragePanel from "@/components/console/StoragePanel";
import {
  CLAN_DECOR_CATEGORIES,
  CLAN_DEFAULT_DECOR,
  isClanDarkDecor,
  normalizeClanDecor,
  type HallDecor,
} from "@/lib/clan-decor";
import { normalizeEntitlements } from "@/lib/hall-decor";
import {
  addClanHallPhoto,
  moveClanHallPhoto,
  removeClanHallPhoto,
  resetClanDecor,
  saveClanDecor,
  setClanHallPortrait,
  supplementClanHallMaterials,
  unlockClanDecor,
} from "./actions";
import ClanHallProfileForm from "@/components/clan/ClanHallProfileForm";
import { isPremiumForUser } from "@/lib/premium";
import { CLAN_DEFAULT_ORDER, resolveSectionOrder } from "@/lib/section-order";
import SectionOrderEditor, { CLAN_SECTION_LABELS } from "@/components/SectionOrderEditor";
import ClanActivityForm from "@/components/console/ClanActivityForm";
import {
  activeStoragePlanSlug,
  CLAN_FREE_QUOTA,
  effectiveStorageQuota,
  hasHdUpload,
  isStorageActive,
  STORAGE_PLANS,
  storageSubBytesOf,
} from "@/lib/storage";
import {
  createClanStorageOrder,
  deleteClanHall,
  saveClanHallSectionOrder,
  setClanHallPublic,
} from "./actions";
import HallDangerZone from "@/components/console/HallDangerZone";
import HallVisibilityZone from "@/components/console/HallVisibilityZone";
import {
  appealPendingSupplement,
  channelMetaFor,
  MATERIAL_TYPES,
  normalizeProofs,
  supplementDeadlinePassed,
  supplementDueInDays,
} from "@/lib/hall-review";

export const metadata = { title: "宗祠管理 · 宗忆堂" };

const REVIEW_LABEL: Record<string, string> = { pending: "待审", approved: "已发布", rejected: "已驳回" };
const REVIEW_CLS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

export default async function ClanHallManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const hall = await prisma.clanHall.findUnique({ where: { id } });
  if (!hall) notFound();
  if (hall.ownerUserId !== user.id) redirect("/console");

  const archive =
    (hall.archive as { photos?: string[]; portrait?: string } | null) ?? {};

  /*
    ⚠️ 高级订阅 = **馆级 OR 用户级** —— 必须与 `./actions.ts` 的 `isPremiumOf()`
    同口径。两处曾经分叉（页面认并集、action 只认馆级），造成
    "UI 显示全部素材已解锁，点保存却被静默驳回"（「宗祠装修后无法保存」）。
    现在双方都走 `@/lib/premium`，结构上不可能再各写一份。
  */
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { points: true, premiumUntil: true, idVerified: true },
  });
  const premiumActive = isPremiumForUser(dbUser, hall);
  /*
    单张 20MB 高清原片：**容量包有效 或 高级订阅有效**（与上传接口同口径）。
    判据在 lib/storage.ts 的 hasHdUpload()，别在这里手写 premium 判定。
  */
  const hdUpload = hasHdUpload(hall) || hasHdUpload(dbUser);

  const cfg = (hall.templateConfig as { decor?: unknown } | null) ?? {};
  const rawDecor = (cfg.decor ?? {}) as Partial<HallDecor>;
  const decor = normalizeClanDecor(
    { ...rawDecor, slots: { ...CLAN_DEFAULT_DECOR, ...(rawDecor.slots ?? {}) } },
    {
      isPremium: premiumActive,
      unlocked: Array.isArray(rawDecor.unlocked) ? rawDecor.unlocked.map(String) : [],
      granted: Array.isArray(rawDecor.granted) ? rawDecor.granted.map(String) : [],
      /*
        租期表必须传（2026-10 租期制），与公页/`./actions.ts` 的 readDecor 同构 ——
        不传 = isKeyActive 恒真 = 工坊显示"已解锁"而公页已回退，口径分叉。
      */
      entitlements: normalizeEntitlements(rawDecor.entitlements),
    },
  );

  // 祭祀/消费记录：馆主可见「完整实名 + 联系方式」（前台只展示脱敏名号）
  const clanTributes = await prisma.clanTribute.findMany({
    where: { clanHallId: hall.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const pointsTotal = clanTributes.reduce((s, t) => s + t.pointsCost, 0);
  const cashTotal = clanTributes.reduce((s, t) => s + t.amountFen, 0);

  // 本祠主办的宗族活动（含审核状态）
  const clanActivities = await prisma.clanActivity.findMany({
    where: { clanHallId: hall.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const clanTypeLabel: Record<string, string> = {
    incense: "上香",
    flower: "献花",
    candle: "点烛",
    offering: "供奉",
    wine: "祭酒",
    message: "祭文",
    music: "乐祭",
  };

  const clanOrder = resolveSectionOrder(hall.sectionOrder, CLAN_DEFAULT_ORDER);

  /* 存储空间：与上传接口同口径（都调 lib/storage 的单一判据） */
  const storageActive = isStorageActive(hall);
  const storageQuota = effectiveStorageQuota(hall, "clan");
  const storageSub = storageSubBytesOf(hall);
  const storagePlan = activeStoragePlanSlug(hall);
  const storagePlans = Object.entries(STORAGE_PLANS).map(([slug, p]) => ({
    slug,
    name: p.name,
    gb: p.gb,
    priceFen: p.priceFen,
  }));

  return (
    <div className="container-page max-w-4xl py-10">
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm text-brand-400">
        <Link href="/console" className="hover:text-brand-700">
          控制台
        </Link>
        <span>/</span>
        <Link href="/clan/halls" className="hover:text-brand-700">
          设立宗祠
        </Link>
        <span>/</span>
        <span className="text-brand-600">宗祠管理</span>
        <a
          href="/"
          className="ml-auto rounded-md border border-brand-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
        >
          ← 返回首页
        </a>
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand-900">
          宗祠管理 · {hall.hallName}（{hall.name}）
        </h1>
        <span
          className={
            "rounded px-2 py-0.5 text-xs " +
            (hall.status === "active"
              ? "bg-emerald-100 text-emerald-700"
              : hall.status === "pending"
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-600")
          }
        >
          {hall.status === "active" ? "已通过审核" : hall.status === "pending" ? "待审核" : "已驳回"}
        </span>
      </div>
      <p className="mt-1 text-sm text-brand-500">
        上传宗祠照片、装修宗祠空间，并维护堂号、始祖与字辈。
        {premiumActive ? (
          <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
            高级订阅生效中 · 全部装修素材可用
          </span>
        ) : (
          <Link href="/mall/storage-50g" className="ml-1 text-accent-600 hover:underline">
            容量不够？可扩容至 500GB →
          </Link>
        )}
      </p>

      <div className="mt-6 space-y-6">
        {/* 审核状态横幅（通道感知：标准 / 替代 / 特殊申述） */}
        <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-brand-900">审核状态：</span>
            <span
              className={
                "rounded px-2 py-0.5 text-xs " +
                (hall.status === "active"
                  ? "bg-green-100 text-green-700"
                  : hall.status === "rejected"
                    ? "bg-red-100 text-red-600"
                    : "bg-amber-100 text-amber-700")
              }
            >
              {hall.status === "active" ? "已通过" : hall.status === "rejected" ? "已驳回" : "待审核"}
            </span>
            <span className="rounded bg-accent-50 px-2 py-0.5 text-xs text-accent-700">
              通道：{channelMetaFor("clan", hall.reviewChannel || "standard").label}
            </span>
            <span className="text-xs text-brand-400">
              公开状态：{hall.isPublic ? "已公开" : "仅你可见"}
            </span>
          </div>
          {hall.status === "pending" && (
            <p className="mt-3 text-xs text-brand-400">
              宗祠先审后显，审核通过后将自动对宗亲公开。已提交佐证材料 {normalizeProofs(hall.proofs)?.materials?.length ?? 0} 项。
            </p>
          )}

          {/* 特殊申述通道：已通过但待补传（仅创建者可见，60 天内补传转公开） */}
          {appealPendingSupplement(hall) && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  待补传
                </span>
                {(() => {
                  const due = supplementDueInDays(hall);
                  const passed = supplementDeadlinePassed(hall);
                  if (passed) {
                    return (
                      <span className="text-xs text-red-600">
                        补传期限已过，未补传材料，本宗祠维持仅你可见。
                      </span>
                    );
                  }
                  return (
                    <span className="text-xs text-amber-700">
                      距补传截止还有 {due ?? "—"} 天，补传正式材料后宗祠将自动转公开。
                    </span>
                  );
                })()}
              </div>

              {!supplementDeadlinePassed(hall) && (
                <details className="mt-3 group">
                  <summary className="cursor-pointer text-xs font-medium text-accent-600 hover:underline">
                    补传正式佐证材料（转公开）
                  </summary>
                  <form action={supplementClanHallMaterials} className="mt-3 space-y-3">
                    <input type="hidden" name="id" value={hall.id} />
                    {(["clan_obituary", "clan_old_photo", "clan_history_doc", "clan_family_record"] as const).map(
                      (type) => (
                        <div key={type} className="flex flex-wrap items-center gap-2">
                          <label className="text-xs font-medium text-brand-700">
                            {MATERIAL_TYPES[type].label}
                          </label>
                          <input
                            name={`sup_${type}`}
                            maxLength={200}
                            className="w-64 rounded-md border border-brand-200 px-2 py-1.5 text-xs"
                            placeholder="编号或文字说明"
                          />
                          <input
                            type="file"
                            name={`supfile_${type}`}
                            accept="image/*"
                            className="text-xs text-brand-500"
                          />
                        </div>
                      ),
                    )}
                    <button
                      type="submit"
                      className="rounded bg-brand-800 px-4 py-1.5 text-xs text-white hover:bg-brand-700"
                    >
                      提交补传材料
                    </button>
                  </form>
                </details>
              )}
            </div>
          )}
        </div>

        {/* 1. 宗祠照片：上传 + 主图 + 相册管理 */}
        <HallPhotoManager
          hallId={hall.id}
          photos={archive.photos ?? []}
          portrait={archive.portrait}
          /* 与上传接口同口径：容量包有效 或 高级订阅有效 → 20MB（lib/storage.ts hasHdUpload） */
          hdUpload={hdUpload}
          uploadUrl={`/api/clan-halls/${hall.id}/upload`}
          idField="clanHallId"
          title="宗祠照片 · 主图与相册"
          hint="上传宗祠外观、正堂、祖宗画像等照片。点「设为主图」会在宗祠显著位置展示；相册按顺序陈列。"
          portraitLabel="主图"
          emptyHint="还没有照片，先上传一张宗祠正堂照作为主图吧。"
          actions={{
            addHallPhoto: addClanHallPhoto,
            removeHallPhoto: removeClanHallPhoto,
            setHallPortrait: setClanHallPortrait,
            moveHallPhoto: moveClanHallPhoto,
          }}
        />

        {/* 1.5 存储空间：免费额度 + 按年升级（与上传接口同口径） */}
        <StoragePanel
          used={Number(hall.storageUsedBytes ?? 0n)}
          quota={storageQuota}
          freeQuota={CLAN_FREE_QUOTA}
          subBytes={storageSub}
          active={storageActive}
          until={hall.storageUntil ? hall.storageUntil.toISOString() : null}
          activePlanName={storagePlan ? STORAGE_PLANS[storagePlan].name : null}
          freeLabel="建祠即赠 2 GB"
          plans={storagePlans}
          hallId={hall.id}
          /* 直接传 Server Action 引用（传闭包会被 React 拒绝，见 StoragePanel 注释） */
          createOrder={createClanStorageOrder}
        />

        {/* 2. 宗祠装修工坊：祠堂专属素材 + 共用素材，建馆赠品 / 积分兑换 / 商城付费 / 高级订阅 */}
        <DecorStudio
          hallId={hall.id}
          decor={decor}
          isPremium={premiumActive}
          userPoints={dbUser?.points ?? 0}
          categories={CLAN_DECOR_CATEGORIES}
          defaultSlots={CLAN_DEFAULT_DECOR}
          idField="clanHallId"
          title="宗祠装修工坊"
          hint="建馆赠送「祖德流芳」一套，永久有效；其余模板与装饰套件可用积分兑换，或在商城付费解锁。祠堂专属素材含石狮、香炉、牌位墙与幡旗。"
          /* 与公页同口径的深色判定（整页预览要用），别让工坊自己猜 */
          darkDecor={isClanDarkDecor(decor)}
          hallName={hall.hallName}
          actions={{
            saveDecor: saveClanDecor,
            unlockDecor: unlockClanDecor,
            resetDecor: resetClanDecor,
          }}
          hallHref={`/clan/halls/${hall.id}`}
          guideHref="/clan/guide/decor"
        />

        {/* 3. 宗祠基本信息 */}
        <ClanHallProfileForm
          clanHallId={hall.id}
          initial={{
            surname: hall.surname,
            hallName: hall.hallName,
            name: hall.name,
            origin: hall.origin ?? "",
            ancestorName: hall.ancestorName ?? "",
            ancestorTitle: hall.ancestorTitle ?? "",
            description: hall.description ?? "",
            generationPoem: hall.generationPoem ?? "",
          }}
        />

        {/* 4. 祭祀/消费记录（馆主可见完整实名与联系方式） */}
        <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-6">
          <h2 className="text-sm font-semibold text-brand-900">祭祀 / 消费记录</h2>
          <p className="mt-1 text-xs text-brand-400">
            共 {clanTributes.length} 条 · 累计积分供奉 {pointsTotal}
            {cashTotal > 0 && ` · 累计现金 ¥${(cashTotal / 100).toFixed(2)}`}
            。原始实名与联系方式仅馆主可见，前台只展示脱敏名号。
          </p>

          {clanTributes.length === 0 ? (
            <p className="mt-4 text-sm text-brand-400">暂无祭祀记录。</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-brand-200 text-left text-xs text-brand-500">
                    <th className="py-2 pr-4 font-medium">时间</th>
                    <th className="py-2 pr-4 font-medium">名号（脱敏）</th>
                    <th className="py-2 pr-4 font-medium">实名 / 联系方式</th>
                    <th className="py-2 pr-4 font-medium">祭品</th>
                    <th className="py-2 pr-4 font-medium">消费</th>
                    <th className="py-2 font-medium">祭文</th>
                  </tr>
                </thead>
                <tbody>
                  {clanTributes.map((t) => (
                    <tr key={t.id} className="border-b border-gray-50">
                      <td className="py-2 pr-4 text-xs text-brand-500">
                        {new Date(t.createdAt).toLocaleString("zh-CN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2 pr-4 text-brand-700">{t.displayName}</td>
                      <td className="py-2 pr-4 text-xs">
                        {t.realNameSnap || <span className="text-brand-300">未实名</span>}
                        {t.contactSnap && (
                          <span className="ml-2 text-brand-400">{t.contactSnap}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-xs text-brand-600">
                        {clanTypeLabel[t.type] ?? t.type}
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {t.pointsCost > 0 ? (
                          <span className="text-amber-700">{t.pointsCost} 积分</span>
                        ) : (
                          <span className="text-brand-400">免费</span>
                        )}
                      </td>
                      <td className="py-2 text-xs text-brand-500">{t.message || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 5. 页面板块排序：祠主拖拽重排公页板块顺序 */}
        <SectionOrderEditor
          hallId={hall.id}
          initialOrder={clanOrder}
          labels={CLAN_SECTION_LABELS}
          action={saveClanHallSectionOrder}
        />

        {/* 6. 宗族活动：祠主发布本族活动（先审后显） */}
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-brand-900">⑥ 宗族活动</h2>
          <p className="mb-4 text-sm text-brand-500">
            发布本祠活动（家族议事、宗亲联谊、修谱研讨等）。提交后需平台审核通过，才会在「宗族活动」公页公开。
          </p>
          <ClanActivityForm
            clanHallId={hall.id}
            idVerified={!!dbUser?.idVerified}
            surname={hall.surname}
          />

          {clanActivities.length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-xl border border-brand-200">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-brand-100/80 text-xs text-brand-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">活动</th>
                    <th className="px-3 py-2 font-medium">时间</th>
                    <th className="px-3 py-2 text-right font-medium">报名</th>
                    <th className="px-3 py-2 font-medium">审核状态</th>
                  </tr>
                </thead>
                <tbody>
                  {clanActivities.map((a) => (
                    <tr key={a.id} className="border-t border-brand-100">
                      <td className="px-3 py-2 font-medium text-brand-900">{a.title}</td>
                      <td className="px-3 py-2 text-xs text-brand-500">
                        {new Date(a.startAt).toLocaleString("zh-CN", { hour12: false })}
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-brand-500">
                        {a.signupCount}/{a.capacity}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${REVIEW_CLS[a.reviewStatus]}`}>
                          {REVIEW_LABEL[a.reviewStatus] ?? a.reviewStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 下架 / 撤回为私密草稿（可逆，置于删除之前） */}
        <HallVisibilityZone
          hallId={hall.id}
          kindLabel="宗祠"
          idField="clanHallId"
          isPublic={hall.isPublic}
          status={hall.status}
          action={setClanHallPublic}
        />

        {/* 删除宗祠（危险操作，置于最后） */}
        <HallDangerZone
          hallId={hall.id}
          hallName={hall.hallName}
          kindLabel="宗祠"
          idField="clanHallId"
          action={deleteClanHall}
        />

      </div>

      <div className="mt-8 flex flex-wrap gap-4">
        <a href={`/clan/halls/${hall.id}`} className="text-sm text-accent-600 hover:underline">
          查看宗祠装修效果 →
        </a>
        <Link href="/mall/storage-50g" className="text-sm text-brand-500 hover:underline">
          存储容量包与扩容方案 →
        </Link>
      </div>
    </div>
  );
}
