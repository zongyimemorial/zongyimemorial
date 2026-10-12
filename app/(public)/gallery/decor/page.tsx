import type { Metadata } from "next";
import Link from "next/link";
import { fubFromFen } from "@/lib/fortune";
import { TEMPLATES } from "@/lib/hall-decor";
import { CLAN_TEMPLATES } from "@/lib/clan-decor";
import { suiteItemSlug } from "@/lib/decor-suites";
import type { DecorTemplate } from "@/lib/hall-decor";
import Reveal from "@/components/site/Reveal";

export const metadata: Metadata = {
  title: "装修案例厅 · 纪念馆与宗祠主题模板",
  description:
    "43 套纪念馆与宗祠装修主题：素白、星河、金殿、朱漆祠堂……免费起步，按需升级。看看别人家怎么装，为你的纪念空间找到一束合适的光。",
  alternates: { canonical: "/gallery/decor" },
};

/** 档位中文标签（与 mall 详情页口径一致） */
const TIER_LABEL: Record<string, string> = {
  free: "免费",
  points: "积分兑换",
  buyout: "买断",
  premium: "高级订阅",
};

const TIER_CLS: Record<string, string> = {
  free: "bg-emerald-100 text-emerald-700",
  points: "bg-amber-100 text-amber-700",
  buyout: "bg-brand-100 text-brand-700",
  premium: "bg-purple-100 text-purple-700",
};

/**
 * 空间形态中文标签：与 lib/decor-3d.ts 的 SpaceKind 注释口径一致。
 * 每一套主题都用 `space` 字段引用其中一种 3D 空间形态，这里把「形态名」直接
 * 透出到卡片上，让装修案例厅的 43 套主题与已升级的 3D 空间（纪念馆 Hall3DStage、
 * 宗祠 ClanHall3DTour、底层 8 种 SPACES）形成可视关联。
 */
const SPACE_LABEL: Record<string, string> = {
  classic: "正厅",
  niche: "壁龛纪念墙",
  shrine: "寝堂牌位墙",
  courtyard: "庭院天井",
  gate: "山门",
  hall: "享堂",
  pond: "莲池",
  starfield: "星河",
};

/**
 * 模板售价展示：**积分与福币两种支付方式并列**，免费/订阅另有文案。
 *
 * ⚠️ 早先是 `if (t.points) return 积分` 的**短路写法** —— 而 `buyout` 档模板
 * **同时有 `points` 与 `priceFen`**（"付费是指可以积分兑换也可以用货币支付"），
 * 于是福币那条分支**永远走不到（死代码）**：
 * 6 套 ¥19–99 的买断模板在画廊里只显示"1900 积分"，用户根本不知道能直接花钱买。
 *
 * 这与 AGENTS 记的「工坊兑换按钮对 points 与 buyout 都该亮」是同一个产品原则 ——
 * **两种支付方式对用户都可用，展示时不能只露一条**。
 */
function priceLabel(t: DecorTemplate): string {
  if (t.tier === "free") return "免费应用";
  if (t.tier === "premium") return "高级订阅可用";
  const parts: string[] = [];
  if (t.points) parts.push(`${t.points} 积分`);
  if (t.priceFen) parts.push(`${fubFromFen(t.priceFen)} 福币`);
  return parts.length ? parts.join(" / ") : "—";
}

/**
 * 模板商品深链：**复用权威 slug 生成器** `suiteItemSlug()`（lib/decor-suites.ts），
 * 与 `prisma/seed-decor.mts` 的 `shortId` 同口径。
 *
 * ⚠️ 这里曾经**手写**过一次 slug（`decor-clan-${t.id}`），结果宗祠侧撞成
 *    `decor-clan-clan-tpl-plain`（双 `clan-`）—— 因为 `CLAN_TEMPLATES` 的 id
 *    本身就以 `clan-` 开头（`clan-tpl-plain`）。画廊 18 套宗祠主题全部 404。
 *
 *    根因不是"少改了一处"，而是**同一个事实（商品 slug）有了两个判据**：
 *    seed 用 `shortId` 剥前缀，画廊用字符串拼接，两边各自演化必然分叉。
 *    现在一律走 `suiteItemSlug()`，任何人再改命名规则只会有一处需要动。
 *
 * 免费档（free）：是**建馆/建祠赠品**，商城没有对应商品（设计上不售卖），
 * 因此不生成商城深链（见 `TemplateCard` 的分支）。
 */
function mallHref(t: DecorTemplate, target: "hall" | "clan"): string {
  // suiteItemSlug 从 ref 里剥离 `clan-` 与 `tpl-` 前缀后重组，
  // 对 hall（tpl-plain）与 clan（clan-tpl-plain）都产出正确 slug。
  void target; // 目标侧已编码在 t.id 前缀里（clan- 开头即宗祠）
  return `/mall/${suiteItemSlug(t.id, "template")}`;
}

function TemplateCard({ t, target }: { t: DecorTemplate; target: "hall" | "clan" }) {
  const space = t.space ?? "classic";
  const is3d = space !== "classic";
  const spaceLabel = SPACE_LABEL[space] ?? space;
  // 免费档 = 赠品，无商城商品页 → 渲染为不可点击卡片
  const isFree = t.tier === "free";
  const badge = (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="text-sm font-semibold text-brand-900">{t.name}</h3>
      <span
        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
        title={`空间形态：${spaceLabel}`}
      >
        {spaceLabel}
      </span>
      {is3d && (
        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
          3D 立体
        </span>
      )}
      <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${TIER_CLS[t.tier] ?? ""}`}>
        {TIER_LABEL[t.tier] ?? t.tier}
      </span>
    </div>
  );
  const preview = (
    <div
      className="flex aspect-[16/9] w-full items-center justify-center text-5xl"
      style={{
        background: t.preview.background,
        color: t.preview.color ?? "#1f2937",
      }}
    >
      <span aria-hidden="true">{t.preview.icon ?? "🏛️"}</span>
    </div>
  );

  if (isFree) {
    return (
      <div className="shine block overflow-hidden rounded-xl border border-brand-200 bg-brand-100/70 shadow-sm">
        {preview}
        <div className="p-4">
          {badge}
          <p className="mt-1.5 line-clamp-2 min-h-10 text-xs leading-5 text-brand-500">{t.desc}</p>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-sm font-bold text-emerald-700">
              {target === "clan" ? "建祠赠送" : "建馆赠送"}
            </span>
            <span className="text-xs text-brand-400">免费可用</span>
          </div>
        </div>
      </div>
    );
  }

  return (
      <Link
        href={mallHref(t, target)}
        className="shine group block overflow-hidden rounded-xl border border-brand-200 bg-brand-100/70 shadow-sm transition hover:border-brand-300 hover:shadow-md"
      >
      {/* 静态大预览：纯 CSS 渐变 + icon，零 3D 渲染、零图片加载（43 套一次列出也不卡） */}
      {preview}
      <div className="p-4">
        {badge}
        <p className="mt-1.5 line-clamp-2 min-h-10 text-xs leading-5 text-brand-500">{t.desc}</p>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-sm font-bold text-brand-700">{priceLabel(t)}</span>
          <span className="text-xs text-accent-600 opacity-0 transition group-hover:opacity-100">
            查看详情 →
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function DecorGalleryPage() {
  const tierRank: Record<string, number> = { free: 0, points: 1, buyout: 2, premium: 3 };
  const hallTemplates = [...TEMPLATES].sort(
    (a, b) => (tierRank[a.tier] ?? 9) - (tierRank[b.tier] ?? 9),
  );
  const clanTemplates = [...CLAN_TEMPLATES].sort(
    (a, b) => (tierRank[a.tier] ?? 9) - (tierRank[b.tier] ?? 9),
  );

  return (
    <>
      <section className="bg-brand-800 py-14 text-white">
        <div className="container-page text-center">
          <p className="text-sm tracking-[0.3em] text-accent-300">装修案例厅</p>
          <h1 className="mt-4 text-3xl font-bold md:text-4xl">
            {hallTemplates.length + clanTemplates.length} 套主题，为纪念空间找到一束光
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-brand-100">
            每一座纪念馆与宗祠都可以有自己的样子：素白克制、星河静谧、金殿庄重、朱漆肃穆。
            免费档即可起步，所有付费主题支持积分或买断。
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/halls/guide"
              className="rounded-md bg-accent-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-600"
            >
              新建纪念馆
            </Link>
            <Link
              href="/clan/halls/guide"
              className="rounded-md border border-white/40 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10"
            >
              新建宗祠
            </Link>
          </div>
        </div>
      </section>

      {/* 纪念馆模板 */}
      <section className="container-page py-14">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-semibold text-brand-900">纪念馆主题</h2>
          <p className="mt-2 text-sm text-brand-500">
            共 {hallTemplates.length} 套 · 建馆赠品「壁龛纪念堂」免费可用
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {hallTemplates.map((t, i) => (
            <Reveal key={t.id} delay={(i % 4) * 70}>
              <TemplateCard t={t} target="hall" />
            </Reveal>
          ))}
        </div>
      </section>

      {/* 宗祠模板 */}
      <section className="border-t border-brand-200 bg-brand-50/40 py-14">
        <div className="container-page">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-semibold text-brand-900">宗祠主题</h2>
            <p className="mt-2 text-sm text-brand-500">
              共 {clanTemplates.length} 套 · 建祠赠品「祖德流芳」免费可用
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {clanTemplates.map((t, i) => (
            <Reveal key={t.id} delay={(i % 4) * 70}>
              <TemplateCard t={t} target="clan" />
            </Reveal>
          ))}
          </div>
        </div>
      </section>

      {/* 组合建议 */}
      <section className="container-page py-14">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-semibold text-brand-900">不想一件件挑？</h2>
          <p className="mt-2 text-sm text-brand-500">
            套装把模板与配套素材打包，主题套装与整店套餐一站到位。
          </p>
        </div>
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
          <Link
            href="/suites"
            className="rounded-xl border border-brand-200 bg-brand-100/70 p-6 text-center transition hover:border-brand-300 hover:shadow-sm"
          >
            <div className="text-2xl">🎁</div>
            <div className="mt-2 font-semibold text-brand-900">三层九档套装</div>
            <p className="mt-1 text-xs text-brand-500">免费 / 标准 / 尊享，策展式目录</p>
          </Link>
          <Link
            href="/mall"
            className="rounded-xl border border-brand-200 bg-brand-100/70 p-6 text-center transition hover:border-brand-300 hover:shadow-sm"
          >
            <div className="text-2xl">🛍️</div>
            <div className="mt-2 font-semibold text-brand-900">装修商城</div>
            <p className="mt-1 text-xs text-brand-500">单件素材、套件与典藏礼包</p>
          </Link>
          <Link
            href="/guide/decor"
            className="rounded-xl border border-brand-200 bg-brand-100/70 p-6 text-center transition hover:border-brand-300 hover:shadow-sm"
          >
            <div className="text-2xl">📖</div>
            <div className="mt-2 font-semibold text-brand-900">装修指南</div>
            <p className="mt-1 text-xs text-brand-500">五分钟看懂槽位、草稿与保存</p>
          </Link>
        </div>
      </section>
    </>
  );
}
