import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import HallProfileForm from "@/components/console/HallProfileForm";
import HallPhotoManager from "@/components/console/HallPhotoManager";
import DecorStudio from "@/components/console/DecorStudio";
import StoragePanel from "@/components/console/StoragePanel";
import {
  DEFAULT_DECOR,
  isHallDarkDecor,
  normalizeDecor,
  normalizeEntitlements,
  type HallDecor,
} from "@/lib/hall-decor";
import { isPremiumForUser } from "@/lib/premium";
import { HALL_DEFAULT_ORDER, resolveSectionOrder } from "@/lib/section-order";
import SectionOrderEditor, { HALL_SECTION_LABELS } from "@/components/SectionOrderEditor";
import {
  activeStoragePlanSlug,
  effectiveStorageQuota,
  HALL_FREE_QUOTA,
  hasHdUpload,
  isStorageActive,
  STORAGE_PLANS,
  storageSubBytesOf,
} from "@/lib/storage";
import { createStorageOrder, saveHallSectionOrder } from "./actions";

export const metadata = { title: "馆务管理 · 宗忆堂" };

export default async function HallManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const hall = await prisma.memorialHall.findUnique({ where: { id } });
  if (!hall) notFound();
  if (hall.ownerUserId !== user.id) redirect("/console");

  const archive = (hall.archive as {
    timeline?: { year: string; event: string }[];
    photos?: string[];
    portrait?: string;
    epitaph?: string;
    hometown?: string;
    career?: string;
    quote?: string;
  } | null) ?? {};
  const couplet = (hall.couplet as {
    left?: string;
    right?: string;
    horizontal?: string;
  } | null) ?? {};

  /*
    ⚠️ 高级订阅 = **馆级 OR 用户级**，与 `./actions.ts` 的 `isPremiumOf()` 同口径。
    与宗祠侧同源（「宗祠装修后无法保存」就是这两处分叉造成的）。
  */
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { points: true, premiumUntil: true },
  });
  const isPremium = isPremiumForUser(dbUser, hall);
  /*
    单张 20MB 高清原片：**容量包有效 或 高级订阅有效**（与上传接口同口径）。
    判据在 lib/storage.ts 的 hasHdUpload()，别在这里手写 premium 判定 ——
    否则会出现"面板说能传 20MB、上传却被按 8MB 拦下"的反差。
  */
  const hdUpload = hasHdUpload(hall) || hasHdUpload(dbUser);

  const cfg = (hall.templateConfig as { decor?: unknown } | null) ?? {};
  const rawDecor = (cfg.decor ?? {}) as Partial<HallDecor>;
  const decor = normalizeDecor(
    { ...rawDecor, slots: { ...DEFAULT_DECOR, ...(rawDecor.slots ?? {}) } },
    {
      isPremium,
      unlocked: Array.isArray(rawDecor.unlocked) ? rawDecor.unlocked.map(String) : [],
      granted: Array.isArray(rawDecor.granted) ? rawDecor.granted.map(String) : [],
      /*
        租期表必须传（2026-10 租期制）：
        不传 → isKeyActive 对所有键恒真 → 工坊里过期素材照样显示"已解锁"，
        与公页（传了、会摘掉）口径分叉 —— "UI 说能用、渲染时却回退"的静默错位。
        与 `./actions.ts` 的 readDecor 同构。
      */
      entitlements: normalizeEntitlements(rawDecor.entitlements),
    },
  );

  const hallOrder = resolveSectionOrder(hall.sectionOrder, HALL_DEFAULT_ORDER);

  /*
    存储空间：与上传接口**同口径**（都调 effectiveStorageQuota / storageSubBytesOf），
    绝不在页面里手写"免费额度 + 订阅"—— 那正是"面板说还有空间、上传却被拦"的成因。
  */
  const storageActive = isStorageActive(hall);
  const storageQuota = effectiveStorageQuota(hall, "hall");
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
        <Link href="/console" className="hover:text-brand-700">控制台</Link>
        <span>/</span>
        <span className="text-brand-600">馆务管理</span>
        <a
          href="/"
          className="ml-auto rounded-md border border-gray-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
        >
          ← 返回首页
        </a>
      </nav>
      <h1 className="text-2xl font-semibold text-brand-900">馆务管理 · {hall.name}</h1>
      <p className="mt-1 text-sm text-brand-500">
        上传逝者照片、装修纪念空间，并配置挽联与故人数字档案。
        {isPremium ? (
          <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">高级订阅生效中</span>
        ) : (
          <Link href="/mall/storage-50g" className="ml-1 text-accent-600 hover:underline">
            容量不够？可扩容至 500GB →
          </Link>
        )}
      </p>

      <div className="mt-6 space-y-6">
        {/* 1. 逝者照片：上传 + 遗像 + 相册管理 */}
        <HallPhotoManager
          hallId={hall.id}
          photos={archive.photos ?? []}
          portrait={archive.portrait}
          /* 与上传接口同口径：容量包有效 或 高级订阅有效 → 20MB（lib/storage.ts hasHdUpload） */
          hdUpload={hdUpload}
        />

        {/* 1.5 存储空间：免费额度 + 按年升级（与上传接口同口径） */}
        <StoragePanel
          used={Number(hall.storageUsedBytes ?? 0n)}
          quota={storageQuota}
          freeQuota={HALL_FREE_QUOTA}
          subBytes={storageSub}
          active={storageActive}
          until={hall.storageUntil ? hall.storageUntil.toISOString() : null}
          activePlanName={storagePlan ? STORAGE_PLANS[storagePlan].name : null}
          freeLabel="建馆即赠 1 GB"
          plans={storagePlans}
          hallId={hall.id}
          /* 直接传 Server Action 引用（传闭包会被 React 拒绝，见 StoragePanel 注释） */
          createOrder={createStorageOrder}
        />

        {/* 2. 空间装修工坊：建馆赠品 / 积分兑换 / 商城付费 / 高级订阅 */}
        <DecorStudio
          hallId={hall.id}
          decor={decor}
          isPremium={isPremium}
          userPoints={dbUser?.points ?? 0}
          hint="建馆赠送「壁龛纪念堂」一套，永久有效；其余模板与装饰套件可用积分兑换，或在商城付费解锁。"
          /* 与公页同口径的深色判定（整页预览要用），别让工坊自己猜 */
          darkDecor={isHallDarkDecor(decor)}
          hallName={hall.deceasedName}
          hallHref={`/halls/${hall.id}`}
        />

        {/* 3. 挽联 + 故人数字档案 */}
        <HallProfileForm
          hallId={hall.id}
          initial={{
            coupletLeft: couplet.left ?? "",
            coupletRight: couplet.right ?? "",
            coupletHorizontal: couplet.horizontal ?? "",
            epitaph: archive.epitaph ?? "",
            hometown: archive.hometown ?? "",
            career: archive.career ?? "",
            quote: archive.quote ?? "",
            timeline: (archive.timeline ?? []).map((t) => `${t.year}|${t.event}`).join("\n"),
          }}
        />

        {/* 4. 页面板块排序：馆主拖拽重排公页板块顺序 */}
        <SectionOrderEditor
          hallId={hall.id}
          initialOrder={hallOrder}
          labels={HALL_SECTION_LABELS}
          action={saveHallSectionOrder}
        />

      </div>

      <div className="mt-8 flex gap-4">
        <a href={`/halls/${hall.id}`} className="text-sm text-accent-600 hover:underline">
          查看馆内装修效果 →
        </a>
        <a href="/mall/storage-50g" className="text-sm text-brand-500 hover:underline">
          存储容量包与扩容方案 →
        </a>
      </div>
    </div>
  );
}
