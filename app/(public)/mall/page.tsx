import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { fubFromFen, fubOnly } from "@/lib/fortune";
import Price from "@/components/shop/Price";
import type { ProductType } from "@prisma/client";

export const metadata = { title: "虚拟祭品商城" };

const typeLabel: Record<ProductType, string> = {
  subscription: "高级订阅",
  whisper_plan: "午夜悄悄话",
  memorial_hall: "数字纪念馆",
  cloud_worship: "云祭扫",
  virtual_flower: "虚拟祭品",
  tribute_item: "虚拟祭品",
  physical_goods: "实体商品",
  memorial_service: "纪念服务",
  decor: "空间装修",
  storage: "存储空间",
  fortune_topup: "福币充值",
};

/**
 * 五档价格体系。`free` 是独立一档（零元礼器），其余四档承接付费商品。
 * 与 prisma/seed-product-tiers.mjs 的 TIER_SPECS 保持同一套 key。
 */
const TIERS = [
  { key: "basic", label: "基础祭品", desc: "鲜花果品茶酒 · 高频" },
  { key: "advanced", label: "进阶供品", desc: "纸扎衣物、冥币、花圈" },
  { key: "ceremony", label: "仪式体验", desc: "烟花、诵经、音乐仪式" },
  { key: "custom", label: "场景定制", desc: "建馆、传记、域名、视频" },
] as const;

const TIER_LABEL: Record<string, string> = {
  free: "免费礼器",
  basic: "基础祭品",
  advanced: "进阶供品",
  ceremony: "仪式体验",
  custom: "场景定制",
};

/**
 * 价格角标文案（**福币口径**）：1 福币 = 1 元人民币。
 *
 * ⚠️ `fen === 0` 必须返回「免费」，**绝不能返回「0 福币」** ——
 * 商城里有 10 个免费祭品（price=0），角标写「0 福币」既难听又自相矛盾
 * （既然免费，为什么要用户掏 0 个币？）。卡片主体走 `<Price free>` 渲染「免费」，
 * 角标也必须同口径 —— 否则同屏出现「免费」与「0 福币」两种说法。
 *
 * 这条是 `verify-fortune-wallet.mjs` §7「商城不出现 0 福币」抓出来的**真 bug**。
 */
function priceTag(fen: number) {
  if (!fen || fen <= 0) return "免费";
  return fubOnly(fubFromFen(fen));
}

export default async function MallPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; mode?: string }>;
}) {
  const { tier: tierParam, mode: modeParam } = await searchParams;
  // 文明祭扫模式（默认）：隐藏纸钱、纸扎等传统祭品，倡导鲜花祭扫、网络祭祀
  const traditional = modeParam === "traditional";
  const showFree = !tierParam || tierParam === "free";

  const products = await prisma.product.findMany({
    where: {
      status: "active",
      ...(traditional ? {} : { ritualMode: { not: "traditional" } }),
      ...(TIERS.some((t) => t.key === tierParam) ? { tier: tierParam } : {}),
    },
    orderBy: [{ price: "asc" }],
    include: { category: true },
  });

  const freeProducts = products.filter((p) => p.isFree);
  const paidProducts = products.filter((p) => !p.isFree);

  // 各档数量（用于导航卡徽标）
  const all = await prisma.product.findMany({
    where: { status: "active", ...(traditional ? {} : { ritualMode: { not: "traditional" } }) },
    select: { tier: true, isFree: true },
  });
  const countOf = (key: string) =>
    key === "free" ? all.filter((p) => p.isFree).length : all.filter((p) => !p.isFree && p.tier === key).length;

  const totalFree = all.filter((p) => p.isFree).length;
  const totalPaid = all.length - totalFree;

  const buildHref = (patch: { tier?: string; mode?: string }) => {
    const params = new URLSearchParams();
    const t = patch.tier ?? tierParam;
    const m = patch.mode ?? modeParam;
    if (t) params.set("tier", t);
    if (m) params.set("mode", m);
    const q = params.toString();
    return q ? `/mall?${q}` : "/mall";
  };

  // 价格阶梯：把在售付费商品的价格去重排序，作为可视化刻度
  const steps = Array.from(new Set(paidProducts.map((p) => p.price))).sort((a, b) => a - b);
  const ladder = steps.slice(0, 9);

  return (
    <div className="container-page max-w-6xl py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-brand-900">虚拟祭品商城</h1>
        <p className="mt-2 max-w-3xl text-brand-500">
          {totalFree} 项免费礼器降低使用门槛，{totalPaid} 项付费祭品支持积分兑换。
          本平台不设"香火排行榜"，不诱导充值。
        </p>
        {/* 体系总览 */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-brand-700">
            <b className="text-green-600">{totalFree}</b> 项免费
          </span>
          <span className="text-brand-700">
            <b>{totalPaid}</b> 项付费
          </span>
          <span className="text-brand-700">
            <b>5</b> 档价格体系
          </span>
          {ladder.length > 0 && (
            <span className="flex flex-wrap items-center gap-1 text-xs text-brand-400">
              价格阶梯：
              <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">免费</span>
              {ladder.map((fen, i) => (
                <span key={fen} className="flex items-center gap-1">
                  <span className="text-brand-300">{i === 0 ? "" : "→"}</span>
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-600">
                    {priceTag(fen)}
                  </span>
                </span>
              ))}
              {steps.length > ladder.length && <span className="text-brand-300">…</span>}
            </span>
          )}
        </div>
      </header>

      {/* 装修方案（三层九档套装）入口 */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-3">
        <Link
          href="/suites"
          className="inline-flex items-center gap-1 rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          🏛️ 装修方案 · 三层九档套装
        </Link>
        <span className="text-xs text-brand-500">
          按免费 / 标准 / 尊享三层，叠加九档价格区间，挑一套纪念馆或宗祠装修。
        </span>
      </div>

      {/* 文明祭扫模式切换 */}
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-brand-900">祭扫模式</div>
          <p className="mt-0.5 text-xs text-brand-400">
            {traditional
              ? "传统祭扫模式：包含纸钱、纸扎等传统祭品，兼顾传统文化。"
              : "文明祭扫模式：仅展示鲜花等现代文明祭品，符合文明祭扫规定。"}
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-brand-200 text-sm">
          <Link
            href={buildHref({ mode: undefined })}
            className={!traditional ? "bg-brand-800 px-5 py-2 text-white" : "px-5 py-2 text-brand-600 hover:bg-brand-50"}
          >
            🌿 文明模式
          </Link>
          <Link
            href={buildHref({ mode: "traditional" })}
            className={traditional ? "bg-accent-600 px-5 py-2 text-white" : "px-5 py-2 text-brand-600 hover:bg-brand-50"}
          >
            🏮 传统模式
          </Link>
        </div>
      </div>

      {/* 五档导航：免费 + 四大类（外加「全部」共 6 张卡，故 lg 用 6 列避免掉行） */}
      <div className="mb-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Link
          href={buildHref({ tier: undefined })}
          className={
            !tierParam
              ? "rounded-xl border border-brand-800 bg-brand-800 p-4 text-white"
              : "rounded-xl border border-gray-100 bg-white p-4 transition hover:border-brand-300"
          }
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">全部</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px]">
              {all.length}
            </span>
          </div>
          <div className={"mt-1 text-xs " + (!tierParam ? "opacity-80" : "text-brand-400")}>
            五档一览
          </div>
        </Link>

        {/* 免费档：绿色，独立成档 */}
        <Link
          href={buildHref({ tier: "free" })}
          className={
            tierParam === "free"
              ? "rounded-xl border border-green-600 bg-green-600 p-4 text-white"
              : "rounded-xl border border-green-200 bg-green-50 p-4 transition hover:border-green-400"
          }
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">免费礼器</span>
            <span
              className={
                "rounded-full px-2 py-0.5 text-[11px] " +
                (tierParam === "free" ? "bg-white/20" : "bg-green-100 text-green-700")
              }
            >
              {countOf("free")}
            </span>
          </div>
          <div className={"mt-1 text-xs " + (tierParam === "free" ? "opacity-80" : "text-green-700")}>
            基础六供 + 行礼寄语
          </div>
        </Link>

        {TIERS.map((t) => {
          const active = tierParam === t.key;
          return (
            <Link
              key={t.key}
              href={buildHref({ tier: t.key })}
              className={
                active
                  ? "rounded-xl border border-brand-800 bg-brand-800 p-4 text-white"
                  : "rounded-xl border border-gray-100 bg-white p-4 transition hover:border-brand-300"
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{t.label}</span>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] " +
                    (active ? "bg-white/20" : "bg-brand-50 text-brand-500")
                  }
                >
                  {countOf(t.key)}
                </span>
              </div>
              <div className={"mt-1 text-xs " + (active ? "opacity-80" : "text-brand-400")}>
                {t.desc}
              </div>
            </Link>
          );
        })}
      </div>

      {/* 免费礼器区 */}
      {showFree && freeProducts.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-brand-900">
            <span className="rounded bg-green-50 px-2 py-0.5 text-sm text-green-700">免费</span>
            免费祭品 · 一键祭拜
            <span className="text-sm font-normal text-brand-400">（共 {freeProducts.length} 项）</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {freeProducts.map((p) => (
              <Link
                key={p.id}
                href={`/mall/${p.slug}`}
                className="group overflow-hidden rounded-lg border border-green-100 bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-brand-50">
                  {p.coverImage ? (
                    <Image
                      src={p.coverImage}
                      alt={p.name}
                      fill
                      sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 100vw"
                      className="object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl">🕊️</div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-1 text-sm font-medium text-brand-900">{p.name}</h3>
                  <div className="mt-1 text-sm font-bold text-green-600">免费</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 付费祭品区 */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-brand-900">
          {tierParam && tierParam !== "free" ? TIER_LABEL[tierParam] ?? "全部付费祭品" : "全部付费祭品"}
          {tierParam !== "free" && (
            <span className="text-sm font-normal text-brand-400">（共 {paidProducts.length} 项）</span>
          )}
        </h2>

        {tierParam === "free" ? (
          <div className="rounded-lg border border-dashed border-green-200 bg-green-50/40 p-8 text-center text-sm text-green-700">
            免费礼器已在上方单独成区 —— 选其他档位查看付费祭品。
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {paidProducts.map((p) => (
              <Link
                key={p.id}
                href={`/mall/${p.slug}`}
                className="group overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-brand-100">
                  {p.coverImage ? (
                    <Image
                      src={p.coverImage}
                      alt={p.name}
                      fill
                      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full bg-brand-100" />
                  )}
                  {/* 价格角标：让梯度一眼可见 */}
                  <div className="absolute right-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-xs font-semibold text-white">
                    {priceTag(p.price)}
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 text-xs text-brand-500">
                    {p.tier && (
                      <span className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">
                        {TIER_LABEL[p.tier] ?? p.tier}
                      </span>
                    )}
                    {p.isRitual && (
                      <span className="rounded bg-accent-50 px-1.5 py-0.5 text-accent-700">可祭拜</span>
                    )}
                    {p.ritualMode === "traditional" && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">传统</span>
                    )}
                  </div>
                  <h2 className="mt-1 line-clamp-1 text-base font-semibold text-brand-900">{p.name}</h2>
                  <div className="mt-2 flex items-baseline gap-2">
                    <Price fub={fubFromFen(p.price)} points={p.pointsPrice} size="lg" />
                  </div>
                </div>
              </Link>
            ))}
            {paidProducts.length === 0 && (
              <div className="col-span-full rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-brand-500">
                该分类下暂无在售商品
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
