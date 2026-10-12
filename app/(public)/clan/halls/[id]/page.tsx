import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import ClanDecorLayer from "@/components/clan/ClanDecorLayer";
import ClanWorshipPanel from "@/components/clan/ClanWorshipPanel";
import HallGallery from "@/components/hall/HallGallery";
import ClanHall3DTour from "@/components/clan/ClanHall3DTour";
import { ALTAR_MAX_ITEMS, topUpFreeOfferings } from "@/lib/offerings";
import { iconOf } from "@/lib/ritual";
/*
  ⚠️ 必须 import **宗祠自己的** findClanTemplate。

  这里曾经写成 `import { findTemplate } from "@/lib/hall-decor"`（纪念馆的），
  于是 `findTemplate("clan-tpl-ancestral3d")` 在**纪念馆**模板表里查 —— 永远 undefined。
  后果是 `clanSpaceKind` 恒为 undefined → `has3DSpace` 恒假
  → **宗祠的付费 3D 空间从来不渲染**，用户买了立体模板在祠页上完全看不到。

  这个 bug 的静默性最要命：不报错、不警告，页面照常显示（走回落分支），
  只是"付费升级"这件事在宗祠侧**根本不存在**。两边的模板表是两套，
  `findTemplate` 只认纪念馆那套（商城详情页就正确地用了
  `findTemplate(id) ?? findClanTemplate(id)` 双查 —— 见 AGENTS.md 那条）。
*/
import { findClanTemplate } from "@/lib/clan-decor";
import { isPremiumForUser } from "@/lib/premium";
import { SceneGround } from "@/components/clan/ClanHallScene";
import {
  CLAN_DEFAULT_DECOR,
  clanArchParams,
  clanDecorItem,
  clanDecorStyle,
  isClanDarkDecor,
  normalizeClanDecor,
  CLAN_DECOR_CATEGORIES,
  type HallDecor,
} from "@/lib/clan-decor";
import { normalizeEntitlements } from "@/lib/hall-decor";
import {
  skinButtonStyle,
  skinCardStyle,
  skinDividerStyle,
  skinIsActive,
  skinOf,
  skinTitleStyle,
  withDark,
} from "@/lib/decor-skin";
import { ShareBar } from "@/components/share/ShareBar";
import { currentOrigin } from "@/lib/origin";
import { withShareToken } from "@/lib/share";
import { CLAN_DEFAULT_ORDER, resolveSectionOrder } from "@/lib/section-order";
import { effectivePublic } from "@/lib/hall-review";
import { reportClanHall } from "@/app/(public)/halls/[id]/actions";

/**
 * 祠页 SEO（P0）：祠名 + 堂号 + 姓氏进入 title/description。
 * 公开祠可索引；pending/rejected/私密祠 noindex（与 middleware 爬虫口径一致）。
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hall = await prisma.clanHall.findUnique({
    where: { id },
    select: { surname: true, hallName: true, name: true, origin: true, ancestorName: true, description: true, coverImage: true, isPublic: true, status: true, reviewChannel: true, supplementedAt: true },
  });
  if (!hall || !effectivePublic(hall)) return { title: "宗祠" };
  const title = `${hall.hallName} · ${hall.name}（${hall.surname}氏宗祠）`;
  return {
    title,
    description:
      hall.description?.slice(0, 120) ||
      `${hall.surname}氏宗祠${hall.origin ? `，源于${hall.origin}` : ""}${hall.ancestorName ? `，奉${hall.ancestorName}为始祖` : ""}。上香敬祖、翻阅字辈，宗族谱系在数字空间延续。`,
    robots: effectivePublic(hall) ? undefined : { index: false, follow: false },
    alternates: { canonical: `/clan/halls/${id}` },
    openGraph: {
      title,
      images: hall.coverImage ? [hall.coverImage] : undefined,
    },
  };
}

/**
 * 宗祠详情页 —— 「四段分镜」布局
 *
 * 页面按真实祠堂的**中轴空间序列**展开，让人一眼看出这是一座建筑而不是一块色块：
 *
 *   ① 山门（屋脊/门楼/抱鼓石） → ② 天井（立柱/幡旗/青石地）
 *   → ③ 享堂（斗拱/匾额）      → ④ 寝堂（牌位墙/香案）
 *
 * 硬约束（勿改）：被 scripts/verify-clan*.mjs 断言的文字一律保持 **HTML 节点** ——
 * 堂号、当前陈设、字辈诗、献祭 · 敬奉先祖、祭祀记录、每次 +2 积分、
 * 以及献上上香/献花/点烛三个按钮。SVG 只负责装饰，匾额文字才是 HTML。
 */
export default async function ClanHallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const hall = await prisma.clanHall.findUnique({ where: { id } });
  if (!hall) notFound();

  const isOwner = !!user?.id && hall.ownerUserId === user.id;
  // 未过审 / 私密的宗祠仅馆主可见（owner 始终可见自己的祠）
  if (!isOwner && !effectivePublic(hall)) notFound();

  // 分享：带 HMAC 签名令牌（内测期免口令，见 lib/share.ts）。
  // 能走到这里的都是 active 且（公开 或 馆主本人）——
  // 馆主分享自己的 pending 祠给亲友看，同样属于"降低传播门槛"的正当场景，
  // 且 pending 祠本就 noindex，不会外泄到搜索引擎。
  const shareUrl = `${(await currentOrigin()) ?? ""}${await withShareToken(`/clan/halls/${id}`, "clan")}`;
  const shareTitle = `${hall.hallName} · ${hall.name}（${hall.surname}氏宗祠）`;

  // 浏览量 +1（仅非馆主，静默失败）
  if (!isOwner) {
    prisma.clanHall
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => {});
  }

  const cfg = (hall.templateConfig as { decor?: unknown } | null) ?? {};
  const rawDecor = (cfg.decor ?? {}) as Partial<HallDecor>;
  const dbUser = user?.id
    ? await prisma.user.findUnique({ where: { id: user.id }, select: { premiumUntil: true } })
    : null;
  const userPremium = isPremiumForUser(dbUser, hall);

  const decor = normalizeClanDecor(
    { ...rawDecor, slots: { ...CLAN_DEFAULT_DECOR, ...(rawDecor.slots ?? {}) } },
    {
      isPremium: userPremium,
      unlocked: Array.isArray(rawDecor.unlocked) ? rawDecor.unlocked.map(String) : [],
      granted: Array.isArray(rawDecor.granted) ? rawDecor.granted.map(String) : [],
      /*
        租期表必须传（2026-10 租期制）——「到期后即回退免费版状态」的生效点，
        与纪念馆公页 / 控制台 / actions.readDecor 同构，四处一个口径。
      */
      entitlements: normalizeEntitlements(rawDecor.entitlements),
    },
  );

  const archive =
    (hall.archive as { photos?: string[]; portrait?: string } | null) ?? {};
  const photos = archive.photos ?? [];
  /*
    遗像口径**必须与纪念馆一致**（用户反馈：「这两个地方为什么不一样？不统一呢？」）。

    早先这里是 `archive.portrait ?? hall.coverImage` —— 会把**封面图当遗像用**。
    而纪念馆侧取的是 `archive.portrait`（只认专区上传的那张），不会回落。
    同一个字段两边口径不同，直接导致观感分叉：
    宗祠明明没传遗像，却因为有一张封面建筑照，就在牌位墙正中"供"了一张风景图。

    现在统一为：**遗像只认 `archive.portrait`**。
    封面图是序厅/建筑照（`/coverImage`），它的归宿是页面顶部的封面位，
    不是牌位墙的龛位。要安奉遗像请走「宗祠照片 · 上传遗像」。
  */
  const portrait = archive.portrait;

  // 进祠即补当日免费祭品配额（幂等，当日只真正写库一次）
  if (user?.id) await topUpFreeOfferings(user.id);

  // 共祭动态（P0）：近 30 分钟宗亲在此敬奉的次数。只计数、不点名、无金额、无排行。
  const recentTributeCount = await prisma.clanTribute.count({
    where: { clanHallId: hall.id, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
  });

  // 祭祀记录：**只取脱敏后的 displayName**，绝不 select realNameSnap / contactSnap，
  // 从查询层就杜绝完整实名出现在公网页面。
  const [tributes, freeProducts, paidOfferings, poemProduct, userPoints, holdings, altarRows] =
    await Promise.all([
      prisma.clanTribute.findMany({
        where: { clanHallId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          type: true,
          displayName: true,
          message: true,
          pointsCost: true,
          createdAt: true,
        },
      }),
      // 免费礼器：面板按 slug 硬查找，缺项会自动跳过（用 isRitual 而非 isFree 做准入口径）
      prisma.product.findMany({
        where: { isFree: true, isRitual: true, status: "active" },
        select: { id: true, name: true, slug: true },
      }),
      /*
        收费礼器：**按"我持有的"取，而不是按"最便宜的前 4 个"取**。
        旧写法 `orderBy pointsPrice asc, take: 4` 只保证面板里出现最便宜的 4 件，
        用户花积分/现金买了别的礼器（比如数字烟花 800 分）时，库存明明有、
        面板里却永远看不到它 —— 直接违背「只显示我已购买的可以供奉的供品」这条规则。
        改成由 OfferingHolding 反查商品：买过什么就查什么，件数不受限。
        （Prisma 侧反向关系挂在 User 上，故从持有行 include 出商品。）
      */
      user?.id
        ? prisma.offeringHolding
            .findMany({
              where: {
                userId: user.id,
                // 只要持有过（含已用尽的）就取出来 —— 用尽后要灰显而非消失
                product: { isRitual: true, isFree: false, status: "active" },
              },
              select: {
                product: { select: { id: true, name: true, slug: true, pointsPrice: true } },
              },
              orderBy: { product: { name: "asc" } },
            })
            .then((rows) =>
              rows.map((r) => r.product).filter((p): p is NonNullable<typeof p> => !!p),
            )
        : Promise.resolve(
            [] as { id: string; name: string; slug: string; pointsPrice: number | null }[],
          ),
      // 祭文礼器：free-poem 已转收费（¥5），不再是免费品，
      // 但「写一段祭文」弹窗需要它才能提交，故单独查出来传给面板。
      prisma.product.findFirst({
        where: { slug: "free-poem", isRitual: true, status: "active" },
        select: { id: true, name: true, slug: true, pointsPrice: true },
      }),
      user?.id
        ? prisma.user
            .findUnique({ where: { id: user.id }, select: { points: true } })
            .then((u) => u?.points ?? 0)
        : Promise.resolve(0),
      // 祭品库存（与纪念馆共用同一份）
      user?.id
        ? prisma.offeringHolding.findMany({
            where: { userId: user.id, product: { isRitual: true } },
            select: { productId: true, quantity: true },
          })
        : Promise.resolve([] as { productId: string; quantity: number }[]),
      // 供台陈列：仍在供台上的（clearedAt 为空），只摆最近 12 件
      prisma.offeringOnAltar.findMany({
        where: { clanHallId: id, clearedAt: null },
        orderBy: { createdAt: "desc" },
        take: ALTAR_MAX_ITEMS,
        select: { id: true, product: { select: { slug: true, name: true } } },
      }),
    ]);

  const qtyByProduct = new Map(holdings.map((h) => [h.productId, h.quantity]));
  const qtyOf = (pid: string) => qtyByProduct.get(pid) ?? 0;
  /*
    与纪念馆同口径：`owned` = OfferingHolding 里存在这一行（持有过），不看 quantity。
    用尽 → 灰显；重新获得 → 自动点亮；从未持有 → 面板不渲染。
  */
  const heldIds = new Set(holdings.map((h) => h.productId));

  const freeWithQty = freeProducts.map((p) => ({ ...p, qty: qtyOf(p.id) }));
  const paidWithQty = paidOfferings.map((p) => ({
    ...p,
    qty: qtyOf(p.id),
    owned: heldIds.has(p.id),
  }));
  const poemWithQty = poemProduct
    ? { ...poemProduct, qty: qtyOf(poemProduct.id), owned: heldIds.has(poemProduct.id) }
    : null;

  const altarGlyphs = altarRows.map((a) => ({
    id: a.id,
    slug: a.product.slug,
    name: a.product.name,
    glyph: iconOf(a.product.slug),
  }));

  const wall = clanDecorItem("wall", decor);
  const floor = clanDecorItem("floor", decor);
  const orn = clanDecorItem("ornament", decor);
  const frame = clanDecorItem("frame", decor);
  const font = clanDecorItem("font", decor);

  /*
    全页换肤（阶段 4），与纪念馆**同口径**。

    ⚠️ 模板必须用 `findClanTemplate`（本文件的 import 处记了误用
       `findTemplate` 导致宗祠付费 3D 从来不渲染的那个 bug）。
       同理：这里若用错函数，宗祠模板的 skin 会被静默丢掉 ——
       页面照常、不报错，只是"宗祠侧永远不换肤"。
  */
  const skin = skinOf(decor, {
    items: { wall, floor, ornament: orn, frame, font },
    template: decor.templateId
      ? { id: decor.templateId, skin: findClanTemplate(decor.templateId)?.skin }
      : undefined,
  });

  /*
    深色判定：`skin.dark || isClanDarkDecor(decor)`（**并存灰度**）。
    旧口径 `isClanDarkDecor` 是硬编码 id 列表（CLAN_DARK_WALLS），
    新增暗色壁纸忘了加 → 深底上深字，整段正文看不见。
    取并集而不是直接替换：两套覆盖的素材不重合，直接换会让某些老页面
    突然变浅底（那才是肉眼可见的回归）。宁可多判、不可漏判。
  */
  const dark = skin.dark || isClanDarkDecor(decor);
  /*
    ⚠️ 必须把 `dark` **回写**进 skin（`withDark`）。
       这里是阶段 4 实测抓到的真 bug 现场：`clan-wall-brick` 在旧列表
       `CLAN_DARK_WALLS` 里算深色，但新 mood 规则判它是 `earth`（非深色）——
       若不回写，就会"文字用浅色（判据说深底）+ 卡片用浅米底纹（skin 说浅底）"，
       于是「字辈诗 · 派语」在浅米卡上以浅色渲染，整段几乎不可见。
       详见 lib/decor-skin.ts 的 withDark() 注释与 .shots/stage4-clan.png。

       另注：**`data-page-skin` 也必须用 `pageSkin` 判**，不能用原始 `skin`。
       渲染分支用 `pageSkin`、标记分支用 `skin` 就是又开了一个判据 ——
       深色墙但没买皮肤的用户，界面已被深色皮肤接管，属性却报 `off`
       （同一族的错误在本阶段出现了两次，别再写第三个判据）。
  */
  const pageSkin = withDark(skin, dark);
  const cardCls = dark
    ? "rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm"
    : "rounded-xl border border-stone-200/70 bg-white/80 backdrop-blur-sm";
  const titleCls = dark ? "text-white" : "text-stone-800";
  const subText = dark ? "text-white/70" : "text-stone-500";
  const divider = dark ? "border-white/15" : "border-stone-200";

  // 建筑形制：由墙面素材决定屋面/门楼/台基的等级（纯呈现层，不影响任何 id）
  const arch = clanArchParams(decor.slots.wall, wall);

  const clanTypeIcon: Record<string, string> = {
    incense: "🕯️ 上香",
    flower: "🌸 献花",
    candle: "✨ 点烛",
    offering: "🍊 供奉",
    wine: "🍶 祭酒",
    message: "📜 祭文",
    music: "🎵 乐祭",
  };

  // ===== 板块数组化：祠主可在控制台拖拽重排（见 lib/section-order.ts）=====
  // nav 面包屑、馆主徽章是固定 chrome，不进入可重排列表。
  // 落地 SceneGround 2026-10 起也入列表（key="ground"，默认序仍在最后）。
  // 数组里的 node 保持**原样**的 JSX 与条件渲染；resolveSectionOrder 永不删板块。
  const clanSections: { key: string; node: ReactNode }[] = [
    {
      key: "tour",
      node: (
        <section className="mb-4">
          {/*
            四段 3D 漫游连廊（山门 → 天井 → 享堂 → 寝堂，单屏 Z 轴纵深 + 鼠标环视）。
            取代原先分散的四段 2D 分镜与付费独立 3D 板块；遗像/牌位/供品/匾额
            仍由内部复用的 SceneShrine / SceneMainHall 渲染，断言文字零回归。
          */}
          <ClanHall3DTour
            hallName={hall.hallName}
            surname={hall.surname}
            ancestorTitle={hall.ancestorTitle}
            plaqueText={hall.name}
            ancestorName={hall.ancestorName}
            portrait={portrait}
            altarGlyphs={altarGlyphs}
          />
        </section>
      ),
    },
    {
      key: "info",
      node: (
        <section className={`${cardCls} overflow-hidden p-8`} style={skinCardStyle()} data-section-key="info">
          {/*
            注意：这里**不再展示遗像竖图**。
            遗像已由下方寝堂的牌位墙承载（安奉在牌位墙正中的龛里，即香案正上方），
            若此处再放一张，同一位先祖的照片会在同一页出现两次。
          */}
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
            <div className="min-w-0 flex-1 text-center md:text-left">
              <div className={`inline-block rounded px-2.5 py-0.5 text-xs ${dark ? "bg-white/15 text-white/90" : "bg-amber-100 text-amber-800"}`}>
                {hall.surname}氏宗祠
              </div>
              <h1 className={`mt-3 text-3xl font-semibold tracking-wide ${titleCls}`} style={skinTitleStyle()}>
                {hall.hallName}
              </h1>
              <p className={`mt-2 text-lg ${dark ? "text-white/85" : "text-stone-600"}`}>
                堂号「{hall.name}」
              </p>
              <dl className={`mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 ${subText}`}>
                {hall.ancestorTitle && (
                  <div>
                    <dt className="inline">郡望：</dt>
                    <dd className="inline">{hall.ancestorTitle}</dd>
                  </div>
                )}
                {hall.ancestorName && (
                  <div>
                    <dt className="inline">始祖：</dt>
                    <dd className="inline">{hall.ancestorName}</dd>
                  </div>
                )}
                {hall.origin && (
                  <div>
                    <dt className="inline">始迁地：</dt>
                    <dd className="inline">{hall.origin}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline">瞻仰：</dt>
                  <dd className="inline">{hall.viewCount} 次</dd>
                </div>
              </dl>
            </div>
          </div>

          {hall.description && (
            <p className={`mt-6 border-t pt-5 text-sm leading-7 ${divider} ${dark ? "text-white/85" : "text-stone-600"}`} style={skinDividerStyle()}>
              {hall.description}
            </p>
          )}

          {hall.generationPoem && (
            <div className={`mt-6 border-t pt-5 ${divider}`} style={skinDividerStyle()}>
              <h2 className={`text-sm font-semibold ${titleCls}`} style={skinTitleStyle()}>字辈诗 · 派语</h2>
              <pre className={`mt-3 whitespace-pre-wrap font-serif text-base leading-9 tracking-[0.15em] ${dark ? "text-white/90" : "text-stone-700"}`}>
                {hall.generationPoem}
              </pre>
            </div>
          )}
        </section>
      ),
    },
    {
      key: "worship",
      node: (
        <section className={`mt-6 ${cardCls} p-6`} style={skinCardStyle()}>
          <h2 className={`text-sm font-semibold ${titleCls}`} style={skinTitleStyle()}>献祭 · 敬奉先祖</h2>
          <p className={`mt-1 text-xs ${subText}`}>
            宗亲可在此献上香火供品。祭祀记录会展示献祭者名号（已脱敏保护隐私）。
          </p>
          {/* 共祭动态：近 30 分钟口径，只计数不点名（与纪念馆同口径，绝不排行榜） */}
          {recentTributeCount > 0 && (
            <p className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50/60 px-4 py-2 text-center text-xs text-amber-800">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-600" />
              </span>
              近 30 分钟，{recentTributeCount} 位宗亲在此敬奉 · 香火延续
            </p>
          )}
          <ClanWorshipPanel
            clanHallId={hall.id}
            freeProducts={freeWithQty}
            paidProducts={paidWithQty}
            poemProduct={poemWithQty}
            altarItems={altarGlyphs}
            isLoggedIn={!!user}
            points={userPoints}
            tone={dark ? "dark" : "light"}
          />
        </section>
      ),
    },
    {
      key: "photos",
      node:
        photos.length > 0 ? (
          <section className={`mt-8 ${cardCls} p-6`} style={skinCardStyle()}>
            <h2 className={`text-sm font-semibold ${titleCls}`} style={skinTitleStyle()}>宗祠影像</h2>
            <p className={`mt-1 text-xs ${subText}`}>共 {photos.length} 张 · 点击可放大查看</p>
            <div className="mt-4">
              <HallGallery photos={photos} portrait={portrait} />
            </div>
          </section>
        ) : null,
    },
    {
      key: "tributes",
      node: (
        <section className={`mt-6 ${cardCls} p-6`} style={skinCardStyle()}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className={`text-sm font-semibold ${titleCls}`} style={skinTitleStyle()}>祭祀记录</h2>
            <span className={`text-xs ${subText}`}>
              共 {tributes.length} 条 · 名号经脱敏保护
            </span>
          </div>
          <ul className="mt-4 space-y-3">
            {tributes.map((t) => (
              <li
                key={t.id}
                className={
                  "rounded-lg border p-3 text-sm " +
                  (dark ? "border-white/15 bg-white/5" : "border-stone-200 bg-white/70")
                }
                style={skinCardStyle()}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={dark ? "text-amber-200" : "text-accent-600"}>
                    {clanTypeIcon[t.type] ?? "🕊️ 献祭"}
                  </span>
                  <span className={`font-medium ${dark ? "text-white/90" : "text-stone-700"}`}>
                    {t.displayName}
                  </span>
                  {t.pointsCost > 0 && (
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-[11px] " +
                        (dark ? "bg-white/15 text-white/80" : "bg-amber-100 text-amber-700")
                      }
                    >
                      {t.pointsCost} 积分
                    </span>
                  )}
                  <span className={`ml-auto text-xs ${subText}`}>
                    {new Date(t.createdAt).toLocaleString("zh-CN", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {t.message && (
                  <p className={`mt-1.5 text-xs leading-6 ${dark ? "text-white/75" : "text-stone-500"}`}>
                    {t.message}
                  </p>
                )}
              </li>
            ))}
            {tributes.length === 0 && (
              <li className={`text-sm ${subText}`}>暂无祭祀记录，来献上第一份心意吧</li>
            )}
          </ul>
        </section>
      ),
    },
    {
      key: "community",
      node: (
        <section className={`mt-6 ${cardCls} flex items-center justify-between p-6`} style={skinCardStyle()}>
          <div>
            <h2 className={`text-sm font-semibold ${titleCls}`} style={skinTitleStyle()}>宗亲交流社区</h2>
            <p className={`mt-1 text-xs ${subText}`}>
              馆主可邀请亲朋好友加入社区，大家在私密空间里分享回忆、照片与视频
            </p>
          </div>
          <Link
            href={`/clan/halls/${hall.id}/community`}
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={dark ? undefined : skinButtonStyle()}
          >
            进入社区 →
          </Link>
        </section>
      ),
    },
    {
      key: "decorSummary",
      node: (
        <section className={`mt-6 ${cardCls} p-6`} style={skinCardStyle()}>
          <h2 className={`text-sm font-semibold ${titleCls}`} style={skinTitleStyle()}>当前陈设</h2>
          <div className={`mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs ${subText}`}>
            <span>墙面：{wall?.name ?? "—"}</span>
            <span>地面：{floor?.name ?? "—"}</span>
            <span>挂饰：{orn?.name ?? "—"}</span>
            <span>相框：{frame?.name ?? "—"}</span>
            <span>字体：{font?.name ?? "—"}</span>
          </div>
          {/* 建筑形制：把 arch 参数显性化，让用户知道"这套陈设盖出了什么规格的房子" */}
          <div className={`mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs ${subText}`}>
            <span>
              屋面：
              {{ hard: "硬山", gable: "悬山", hip: "庑殿", double: "重檐庑殿" }[arch.roof]}
            </span>
            <span>
              门楼：
              {{ arch: "随墙门", post: "门屋", paifang: "牌坊" }[arch.gate]}
            </span>
            <span>
              台基：
              {{ none: "无", platform: "台基", moon: "月台" }[arch.terrace]} · {arch.steps} 级
            </span>
            <span>斗拱：{arch.dougong ? "有" : "无"}</span>
          </div>
          {isOwner && (
            <a
              href={`/console/clan-halls/${hall.id}`}
              className={`mt-4 inline-block text-sm ${dark ? "text-amber-200 hover:underline" : "text-accent-600 hover:underline"}`}
            >
              去装修工坊调整陈设 →
            </a>
          )}
        </section>
      ),
    },
    {
      key: "aboutDecor",
      node: (
        <section className={`mt-6 ${cardCls} p-6`} style={skinCardStyle()}>
          <h2 className={`text-sm font-semibold ${titleCls}`} style={skinTitleStyle()}>关于装修素材</h2>
          <p className={`mt-2 text-xs leading-6 ${subText}`}>
            宗祠装修共 {CLAN_DECOR_CATEGORIES.reduce((n, c) => n + c.items.length, 0)} 项素材/模板，
            覆盖墙面、地面、挂饰、相框与字体。每个分类都有免费素材（普通的），
            精美素材可通过积分兑换或高级订阅使用。不同墙面还会决定宗祠的
            <strong className="font-semibold">建筑形制</strong>（屋面、门楼、台基等级）。
          </p>
        </section>
      ),
    },
    {
      key: "links",
      node: (
        <div className={`mt-8 flex flex-wrap gap-5 text-sm ${subText}`}>
          <Link href={`/clan/genealogy?surname=${encodeURIComponent(hall.surname)}`} className="hover:underline">
            查看{hall.surname}氏族谱 →
          </Link>
          <Link href="/clan/halls" className="hover:underline">
            更多宗祠 →
          </Link>
          <Link href="/clan/halls/new" className="hover:underline">
            也来立一座宗祠 →
          </Link>
        </div>
      ),
    },
    {
      key: "ground",
      node: (
        <section className="mt-10" data-section-key="ground">
          {/*
            落地：地砖与阴影，让整座祠堂"站"在页面上。
            2026-10 起加入可重排列表（原为固定 chrome 恒在页尾）——
            馆主可在控制台把它拖到任意位置（如页面顶部做"入场第一眼"）；
            默认序仍在最后，存量数据 null → 渲染逐字节一致（零回归）。
          */}
          <SceneGround />
        </section>
      ),
    },
  ];

  const clanOrder = resolveSectionOrder(hall.sectionOrder, CLAN_DEFAULT_ORDER);
  const clanSectionMap = new Map(clanSections.map((s) => [s.key, s.node]));
  const orderedClanSections = clanOrder
    .map((key) => ({ key, node: clanSectionMap.get(key) }))
    .filter((s): s is { key: string; node: ReactNode } => s.node != null);

  return (
    <ClanDecorLayer decor={decor} className="min-h-screen" bottomAnchor="content" skin={pageSkin}>
      {effectivePublic(hall) && (
        <script
          type="application/ld+json"
          // 结构化数据（P0 SEO）：只含页面公开信息，不含任何身份快照字段
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              name: `${hall.hallName} · ${hall.name}`,
              description: hall.description?.slice(0, 200) ?? undefined,
              inLanguage: "zh-CN",
            }),
          }}
        />
      )}
      <div className="container-page max-w-4xl py-10" data-page-skin={skinIsActive(pageSkin) ? "on" : "off"}>
        <nav className={`mb-5 text-sm ${subText}`}>
          <Link href="/clan" className="hover:underline">
            宗亲文化交流
          </Link>{" "}
          /{" "}
          <Link href="/clan/halls" className="hover:underline">
            设立宗祠
          </Link>{" "}
          / {hall.hallName}
        </nav>

        {isOwner && (
          <div className="mb-5 flex flex-wrap items-center gap-3 text-xs">
            <span
              className={
                "rounded px-2 py-1 " +
                (hall.status === "active"
                  ? "bg-emerald-100 text-emerald-700"
                  : hall.status === "pending"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-600")
              }
            >
              {hall.status === "active" ? "已通过审核" : hall.status === "pending" ? "待审核（仅你可见）" : "已驳回"}
            </span>
            <a
              href={`/console/clan-halls/${hall.id}`}
              className="rounded bg-white/70 px-3 py-1 text-stone-700 hover:bg-brand-100/70"
            >
              进入宗祠管理台 →
            </a>
          </div>
        )}

        {orderedClanSections.map((s) => (
          <Fragment key={s.key}>{s.node}</Fragment>
        ))}

        {/* 一键分享：宗族文化靠亲族网络扩散，分享条降低传播门槛 */}
        <ShareBar
          url={shareUrl}
          title={shareTitle}
          summary={hall.description?.slice(0, 60) ?? undefined}
          scope="clan"
        />

        {/* 合规底线：一键举报入口 */}
        <details className="mt-6 rounded-lg border border-brand-200/80 bg-brand-100/70 p-4">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            发现违规内容？举报此宗祠
          </summary>
          <form action={reportClanHall} className="mt-3 space-y-3">
            <input type="hidden" name="clanHallId" value={id} />
            <input type="hidden" name="from" value={`/clan/halls/${id}`} />
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">举报类型</label>
              <select name="kind" defaultValue="living" className="w-full rounded-md border border-brand-200 px-3 py-2 text-sm">
                <option value="living">活人被祭拜</option>
                <option value="fake">虚假宗祠</option>
                <option value="other">其他违规</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">说明（选填）</label>
              <textarea
                name="reason"
                rows={3}
                maxLength={1000}
                className="w-full rounded-md border border-brand-200 px-3 py-2 text-sm"
                placeholder="请简述违规情况"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">联系方式（选填）</label>
              <input name="contact" maxLength={100} className="w-full rounded-md border border-brand-200 px-3 py-2 text-sm" placeholder="方便我们回访" />
            </div>
            <button type="submit" className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">
              提交举报
            </button>
          </form>
        </details>
      </div>
    </ClanDecorLayer>
  );
}
