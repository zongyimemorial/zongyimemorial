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
  unlockClanDecor,
} from "./actions";
import ClanHallProfileForm from "@/components/clan/ClanHallProfileForm";
import { isPremiumForUser } from "@/lib/premium";
import { CLAN_DEFAULT_ORDER, resolveSectionOrder } from "@/lib/section-order";
import SectionOrderEditor, { CLAN_SECTION_LABELS } from "@/components/SectionOrderEditor";
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
  saveClanHallSectionOrder,
} from "./actions";

export const metadata = { title: "宗祠管理 · 宗忆堂" };

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
    select: { points: true, premiumUntil: true },
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
          className="ml-auto rounded-md border border-gray-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
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
        <section className="rounded-xl border border-gray-100 bg-white p-6">
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
                  <tr className="border-b border-gray-100 text-left text-xs text-brand-500">
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
