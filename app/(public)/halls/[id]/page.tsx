import { Fragment, type ReactNode } from "react";
import BackLink from "@/components/site/BackLink";
import LivingScene from "@/components/site/LivingScene";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import WorshipPanel from "@/components/hall/WorshipPanel";
import PanoramaView from "@/components/hall/PanoramaView";
import HallDecorLayer from "@/components/hall/HallDecorLayer";
import HallGallery from "@/components/hall/HallGallery";
import Hall3DStage from "@/components/hall/Hall3DStage";
import WreathOffer from "@/components/hall/WreathOffer";
import { listActiveWreaths, getWreathProduct } from "@/lib/wreaths";
import DecorSpacePreview, { SPACE_LABEL } from "@/components/decor/DecorSpacePreview";
import SceneLayoutEditor from "@/components/decor/SceneLayoutEditor";
import PortraitNiche from "@/components/decor/PortraitNiche";
import BuyButton from "@/components/shop/BuyButton";
import { ALTAR_MAX_ITEMS, topUpFreeOfferings } from "@/lib/offerings";
import { iconOf } from "@/lib/ritual";
import { isPremiumForUser } from "@/lib/premium";
import {
  DEFAULT_DECOR,
  decorItem,
  decorStyle,
  findTemplate,
  isHallDarkDecor,
  normalizeDecor,
  normalizeEntitlements,
  type HallDecor,
} from "@/lib/hall-decor";
import {
  skinButtonStyle,
  skinCardStyle,
  skinIsActive,
  skinOf,
  skinTitleStyle,
  withDark,
} from "@/lib/decor-skin";
import { ShareBar } from "@/components/share/ShareBar";
import { currentOrigin } from "@/lib/origin";
import { withShareToken } from "@/lib/share";
import { HALL_DEFAULT_ORDER, resolveSectionOrder } from "@/lib/section-order";
import { effectivePublic } from "@/lib/hall-review";
import { reportHall } from "./actions";

const typeIcon: Record<string, string> = {
  flower: "🌸 献花",
  candle: "🕯️ 敬香",
  lamp: "🪔 点灯",
  message: "💬 留言",
  offering: "🍊 供奉",
  music: "🎵 音乐",
};

/**
 * 馆页 SEO（P0）：馆名 + 逝者 + 生卒进入 title/description；
 * 公开馆可索引，私密馆 noindex（页面可访问但不对搜索引擎开放——
 * 与 middleware 的爬虫放行口径一致：公开内容才放爬虫进来）。
 * OG 图用馆封面（若有），否则回落全站品牌图。
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hall = await prisma.memorialHall.findUnique({
    where: { id },
    select: { name: true, deceasedName: true, birthDate: true, deathDate: true, description: true, coverImage: true, isPublic: true, status: true, reviewChannel: true, supplementedAt: true },
  });
  if (!hall || !effectivePublic(hall)) return { title: "纪念馆" };
  const years = hall.birthDate || hall.deathDate
    ? `（${hall.birthDate ? hall.birthDate.getFullYear() : "?"} - ${hall.deathDate ? hall.deathDate.getFullYear() : "?"}）`
    : "";
  return {
    title: `${hall.name} · 纪念${hall.deceasedName}`,
    description: hall.description?.slice(0, 120) || `缅怀 ${hall.deceasedName}${years}。献一束花、点一盏灯，把想说的话留在这里。`,
    robots: effectivePublic(hall) ? undefined : { index: false, follow: false },
    alternates: { canonical: `/halls/${id}` },
    openGraph: {
      title: `${hall.name} · 纪念${hall.deceasedName}`,
      images: hall.coverImage ? [hall.coverImage] : undefined,
    },
  };
}

// 竖排挽联
function CoupletColumn({ text, side }: { text: string; side: "left" | "right" }) {
  return (
    <div
      className="flex flex-col items-center rounded-md border border-amber-900/30 bg-[#161009] px-1.5 py-3 shadow-inner"
      aria-label={side === "left" ? "上联" : "下联"}
    >
      {text.split("").map((ch, i) => (
        <span key={i} className="text-sm leading-7 text-amber-100/90">
          {ch}
        </span>
      ))}
    </div>
  );
}

export default async function HallDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reported?: string }>;
}) {
  const { id } = await params;
  const { reported } = await searchParams;
  const hall = await prisma.memorialHall.findUnique({ where: { id } });
  const user = await getCurrentUser();
  const isOwner = user?.id === hall?.ownerUserId;

  // 可见性：馆主始终可见自己的馆（满足 appeal 仅创建者可见）；
  // 非馆主仅当 effectivePublic 为真（active 且按通道规则公开）。
  if (!hall || (!isOwner && !effectivePublic(hall))) notFound();

  // 有效公开状态（供分享元数据 / 分享栏判定）
  const pub = effectivePublic(hall);

  // 分享：带 HMAC 签名令牌（内测期免口令，见 lib/share.ts）。
  // ⚠️ 隐私口径（与全站一致）：分享卡**只带馆名**，私密馆不进 title 里的逝者名。
  //    公开馆沿用既有口径（分享是传播，馆主本就把逝者名公开挂在页面上）；
  //    私密馆仍可分享（供馆主发给亲友），但卡片不主动外泄逝者姓名。
  const shareUrl = `${(await currentOrigin()) ?? ""}${await withShareToken(`/halls/${id}`, "hall")}`;
  const shareTitle = pub ? `${hall.name} · 纪念${hall.deceasedName}` : hall.name;

  // 进馆即补当日免费祭品配额（幂等，当日只真正写库一次）
  if (user?.id) await topUpFreeOfferings(user.id);

  // 共祭动态（P0）：近 30 分钟在本馆追思的人数（次数口径，含留言）。
  // 脱敏红线：只计数、绝不渲染任何身份字段；金额永不出现；不做任何排行榜。
  const recentTributeCount = await prisma.memorialTribute.count({
    where: { hallId: id, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
  });

  const [ritualProducts, paidTributes, tributes, holdings, altarRows] = await Promise.all([
    // 礼器全量（免费 + 收费），由面板按「有货 / 已用尽 / 未购」分级展示
    prisma.product.findMany({
      where: { isRitual: true, status: "active" },
      select: { id: true, name: true, slug: true, price: true, isFree: true },
    }),
    prisma.product.findMany({
      where: {
        status: "active",
        isFree: false,
        type: { in: ["virtual_flower", "tribute_item"] },
        tier: { in: ["basic", "ceremony"] },
      },
      orderBy: { price: "asc" },
      take: 8,
    }),
    // 追思记录：**只取脱敏后的 displayName**，绝不 select realNameSnap / contactSnap，
    // 也绝不 include 活用户表去读 realName —— 从查询层就杜绝完整实名出现在公网页面。
    // （宗祠侧同口径，见 app/(public)/clan/halls/[id]/page.tsx）
    prisma.memorialTribute.findMany({
      where: { hallId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, type: true, displayName: true, message: true, createdAt: true },
    }),
    // 当前用户的祭品库存（跨馆通用：在哪边买的，两边都能用）
    user?.id
      ? prisma.offeringHolding.findMany({
          where: { userId: user.id, product: { isRitual: true } },
          select: { productId: true, quantity: true },
        })
      : Promise.resolve([] as { productId: string; quantity: number }[]),
    // 供台陈列：仍在供台上的（clearedAt 为空），只摆最近 12 件
    prisma.offeringOnAltar.findMany({
      where: { hallId: id, clearedAt: null },
      orderBy: { createdAt: "desc" },
      take: ALTAR_MAX_ITEMS,
      select: { id: true, product: { select: { slug: true, name: true } } },
    }),
  ]);

  const qtyByProduct = new Map(holdings.map((h) => [h.productId, h.quantity]));
  const qtyOf = (pid: string) => qtyByProduct.get(pid) ?? 0;
  /*
    「持有过」的口径 = OfferingHolding 里**存在这一行**，而不是 quantity > 0。
    购买走 lib/pay.ts 的 upsert：买过就建行；用尽后 quantity 归 0 但**行仍在**。
    所以：
      有行 + qty>0 → 点亮（×N）
      有行 + qty=0 → 灰显「已用尽」，用户知道东西还在，重新购买立刻回到点亮
      无行         → 从未持有，面板不展示（去商城逛）
    早先写成 `qtyOf(p.id) > 0` 会把"用尽"误判成"未购"，于是价格牌又冒出来。
  */
  const heldIds = new Set(holdings.map((h) => h.productId));

  const freeProducts = ritualProducts
    .filter((p) => p.isFree)
    .map((p) => ({ id: p.id, name: p.name, slug: p.slug, qty: qtyOf(p.id) }));

  const ritualItems = ritualProducts
    .filter((p) => !p.isFree)
    .map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      qty: qtyOf(p.id),
      owned: heldIds.has(p.id),
    }));

  const altarItems = altarRows.map((a) => ({
    id: a.id,
    slug: a.product.slug,
    name: a.product.name,
    glyph: iconOf(a.product.slug),
  }));

  const couplet = (hall.couplet as { left?: string; right?: string; horizontal?: string } | null) ?? {};
  const archive = (hall.archive as {
    timeline?: { year: string; event: string }[];
    photos?: string[];
    portrait?: string;
    epitaph?: string;
    hometown?: string;
    career?: string;
    quote?: string;
  } | null) ?? {};
  /*
    ⚠️ 高级订阅 = **馆级 OR 用户级**（产品口径）。
    公页与工坊必须同口径，否则会出现"公页显示华丽装修、工坊里却提示未解锁"
    这种最让用户困惑的反差（与「宗祠装修后无法保存」同源）。
    `getCurrentUser()` 不含 premiumUntil，故这里单独查一次（仅登录访客需要）。
  */
  const dbUser = user?.id
    ? await prisma.user.findUnique({ where: { id: user.id }, select: { premiumUntil: true } })
    : null;
  const isPremium = isPremiumForUser(dbUser, hall);
  const hasCouplet = !!(couplet.left || couplet.right);

  // ===== 空间装修方案（免费/积分兑换/高级订阅，服务端已归一化兜底）=====
  const cfg = (hall.templateConfig as { decor?: unknown } | null) ?? {};
  const rawDecor = (cfg.decor ?? {}) as Partial<HallDecor>;
  const decor = normalizeDecor(
    { ...rawDecor, slots: { ...DEFAULT_DECOR, ...(rawDecor.slots ?? {}) } },
    {
      isPremium,
      unlocked: Array.isArray(rawDecor.unlocked) ? rawDecor.unlocked.map(String) : [],
      granted: Array.isArray(rawDecor.granted) ? rawDecor.granted.map(String) : [],
      /*
        租期表必须传（2026-10 租期制）—— 这是「到期后即回退免费版状态」的**生效点**：
        normalize 里 isUnlocked → isKeyActive 据此把过期素材/模板摘掉、回退默认。
        不传 = isKeyActive 恒真 = 过期素材照常渲染，租期制在公页形同虚设。
        （与控制台工坊、actions.readDecor 同构，三处一个口径。）
      */
      entitlements: normalizeEntitlements(rawDecor.entitlements),
    },
  );
  const wallItem = decorItem("wall", decor);
  const frameItem = decorItem("frame", decor);
  const fontItem = decorItem("font", decor);
  const ornItem = decorItem("ornament", decor);
  const floorItem = decorItem("floor", decor);
  const portraitUrl = archive.portrait;
  /*
    遗像要安奉进壁龛格，所以必须在 isNicheWall 之前就取出来（否则踩 TDZ）。
    但**只 select 展示名相关的字段** —— 公网馆页不读馆主实名（脱敏口径见 AGENTS.md）。
  */
  const isNicheWall = !!portraitUrl || ornItem?.style.ornament?.kind === "niche-wall";

  /*
    装修差异化判定：任一槽位偏离默认值（wall-plain / floor-none / orn-none /
    frame-line / font-modern）或购买了空间模板 = 装修过。
    Hall3DStage 据此切换两套完全不同的材质/灯光/陈设，让"装没装修"一眼可辨。
  */
  const ornIds = (decor.slots.ornament ?? []).filter((o) => o && o !== "orn-none");
  const isDecorated =
    !!decor.templateId ||
    (wallItem && wallItem.id !== "wall-plain") ||
    (floorItem && floorItem.id !== "floor-none") ||
    (frameItem && frameItem.id !== "frame-line") ||
    (fontItem && fontItem.id !== "font-modern") ||
    ornIds.length > 0;

  // 有效花圈（未过期，最多 2）+ 花圈商品（价格在商品表维护，前端绝不传金额）
  const [wreaths, wreathProduct] = await Promise.all([
    listActiveWreaths(hall.id),
    getWreathProduct(),
  ]);

  /*
    壁龛纪念墙模式判定。
    只要馆主**上传了遗像**，就该把遗像安奉进壁龛墙（这是"遗像存放在这里"的默认归宿），
    不再要求额外去装修工坊把挂饰选成 orn-niche-wall。
    没遗像时回退到挂饰条件 —— 老页面零回归（选过壁龛墙素材的仍然生效）。
  */
  const spaceKind = decor.templateId ? findTemplate(decor.templateId)?.space : undefined;
  /*
    是否用 3D 空间场景作为首屏。

    **判定优先级：付费模板 > 壁龛墙模式**（这条顺序很关键，别反转）。
    壁龛墙是「默认归宿」，付费模板是「用户主动买的空间骨架」——
    用户花积分/钱买了星河/莲池，结果因为自己传过一张遗像就被降级回壁龛墙，
    那就是"钱花了没效果"，比不买还糟。
    早先把 `!isNicheWall` 放在最前面，于是**所有上传过遗像的馆都永远看不到 3D**。

    赠品模板 tpl-niche 的 space 是 niche（≠ classic），
    所以这里额外排除它 —— 否则默认那套会把既有的壁龛墙首屏顶掉，老页面观感回归。
    space==="classic" 的模板只换材质不换骨架，没有独立 3D 场景。
  */
  const isPaidSpace =
    !!decor.templateId &&
    decor.templateId !== "tpl-niche" &&
    !!spaceKind &&
    spaceKind !== "classic" &&
    spaceKind !== "niche";
  const use3DScene = isPaidSpace;
  /*
    全页换肤（阶段 4）。

    直接算一遍 skin：它只依赖装修数据，**不依赖 window**，
    所以服务端与客户端算出的是同一份值，没有水合 mismatch。
    这里算出来主要为了两件事：
      ① 深色判定（见下）；
      ② `data-page-skin` 的可读性 —— 让排查时一眼看出"这页装修了没"。

    注意：具体颜色**不从这里往子组件传**颜色走祖先节点注入的
    `--skin-*` 变量（HallDecorLayer 已注入），子孙用 `skinCardStyle()`
    之类的 helper 引用即可 —— 这样就不用把 skin 穿过 5~6 层。
  */
  const skin = skinOf(decor, {
    items: {
      wall: wallItem,
      floor: decorItem("floor", decor),
      ornament: ornItem,
      frame: frameItem,
      font: fontItem,
    },
    template: decor.templateId
      ? { id: decor.templateId, skin: findTemplate(decor.templateId)?.skin }
      : undefined,
  });

  /*
    深色判定：`skin.dark || onDarkWall`（**并存**，不是直接替换）。
    旧口径 `onDarkWall` 是硬编码 id 列表，新增暗色壁纸时忘了加 →
    深底上仍是深字，整段正文看不见（且几乎没人回归测）。新口径
    `skin.dark` 由素材自己声明，但**灰度期不能直接切**：
    两套判据覆盖的素材不完全重合，直接换会让某些老页面突然变浅底。
    所以取并集 —— 宁可多判几个（多一层浅字），
    也不要漏判（漏判是"字看不见"）。确认无回归后再撤旧列表。
  */
  const onDarkWall = isHallDarkDecor(decor);
  const dark = skin.dark || onDarkWall;
  /*
    ⚠️ 必须把 `dark` **回写**进 skin（`withDark`），否则会出现
       "文字判据说深底、卡片底色来自 skin 说是浅底"的分叉 ——
       浅色字压在浅米卡上，整段看不见（阶段 4 实测抓到的真 bug，见 withDark 注释）。
       回写之后字色与底色来自同一个判据。

       ⚠️ 同理，下面的 `data-page-skin` 一律用 `pageSkin` 判（不是 `skin`）：
       标记要跟**实际渲染**同口径，否则深色墙但未换肤的页面会报 `off`。
  */
  const pageSkin = withDark(skin, dark);
  const cardCls =
    "rounded-xl border p-6 " +
    /*
      浅色档底色：品牌暖米（brand-100/70 = #f2ede4 的 70% 透明度），
      与 WorshipPanel / 商城 / 首页的墨金暖色语言一致 ——
      馆页整体压在暖褐墙纸上，纯白卡（旧 bg-brand-100/70）在深暖底上像"补丁"。
      半透明 + 暖米既保留纸面感，又让墙纸纹理隐约透出来。
    */
    (dark
      ? "border-white/15 bg-white/8 backdrop-blur-sm"
      : "border-brand-200/80 bg-brand-100/70");
  const subText = dark ? "text-white/60" : "text-brand-400";

  // ===== 板块数组化：馆主可在控制台拖拽重排（见 lib/section-order.ts）=====
  // 数组里的 node 保持**原样**的 JSX 与条件渲染；resolveSectionOrder 永不删板块。
  // 每个 node 自带上下的 margin（mb-6 / mt-8 等），默认序下输出与改造前逐字节一致。
  const heroNode = (
    <>
      {/*
        默认厅堂 3D 舞台：取代原平面壁龛墙（NicheWallHero）。
        CSS 3D 透视 + 鼠标视差，装修/未装修两套材质；遗像安奉于正墙壁龛，
        敬献的花圈陈列在遗像正下方（3 天后自动消失）。
      */}
      {isNicheWall && !use3DScene && (
        <div className="mb-3">
          <Hall3DStage
            portrait={portraitUrl}
            deceasedName={hall.deceasedName}
            isOwner={isOwner}
            manageHref={`/console/halls/${hall.id}`}
            frameStyle={decorStyle("frame", decor)}
            altarItems={altarItems}
            decorated={!!isDecorated}
            wallId={wallItem?.id}
            floorId={floorItem?.id}
            ornamentIds={ornIds}
            wreaths={wreaths.map((w) => ({ id: w.id, message: w.message }))}
          />
          {wreathProduct && wreathProduct.status === "active" && (
            <WreathOffer
              hallId={hall.id}
              productId={wreathProduct.id}
              priceLabel={`¥${(wreathProduct.price / 100).toFixed(wreathProduct.price % 100 === 0 ? 0 : 2)}`}
              activeCount={wreaths.length}
              isLoggedIn={!!user}
              earliestExpiry={wreaths.length ? wreaths[wreaths.length - 1].expiresAt.toISOString() : null}
            />
          )}
        </div>
      )}

      {/*
        收费模板的 3D 空间场景：这是"付费升级"的观感回报。
        遗像以真实 <img> 叠在场景里（绝不画进 SVG —— 见 AGENTS.md 硬约束），
        文字仍是 HTML 节点，既有断言（遗像 alt、堂号…）继续成立。
      */}
      {use3DScene && (
        <div className="mb-6">
          {/*
            ⚠️ **不传 height** —— 高度由 `aspect-[1000/703]` 按宽度推导。
            早先写死 `height={340}`，问题不是"小"，而是**比例会与宽度脱钩**：
            `unitToPx` 只按容器宽度换算几何（正面墙 62u + 地面投影 40u·cos78°，
            合计 ≈ 0.703 × 宽度）。写死高度后，宽度一变，画面比例就错，
            台基会被切掉一条（AGENTS.md 记过"差 1px 切掉整块台基"）。
            改成 aspect 后高度与宽度**同源**，结构上不可能再错位。
            顺带也把画面放大了 —— 公页整行宽度下高度自然超过 400px。
          */}
          {/*
            ⚠️ `engine="v2"` 必须**显式传**，不要改成 DecorSpacePreview 的默认值 ——
            默认保持 v1 是"切换的回退开关"：三处公页各自写死，出问题改一处
            就能单独回退某一页。`verify-decor-scene-engine.mjs` 有一条断言扫描本行，
            确认公页确实显式启用（防"以为切了其实没传"）。
          */}
          <SceneLayoutEditor
            hallId={hall.id}
            isOwner={isOwner}
            initialLayout={decor.layout}
            decor={decor}
            spaceKind={spaceKind}
            engine="v2"
            className="shadow-lg"
          >
            {portraitUrl && (
              <PortraitNiche
                src={portraitUrl}
                alt={`${hall.deceasedName}遗像`}
                caption={`${hall.deceasedName}`}
              />
            )}
          </SceneLayoutEditor>
          <p className={`mt-2 text-center text-xs ${subText}`}>
            当前空间：{SPACE_LABEL[spaceKind ?? "classic"] ?? "常规厅堂"} · 拖拽画面可环视
            {isOwner && (
              <a href={`/console/halls/${hall.id}`} className="ml-2 text-accent-600 hover:underline">
                去装修 →
              </a>
            )}
          </p>
        </div>
      )}
    </>
  );

  const hallSections: { key: string; node: ReactNode }[] = [
    { key: "hero", node: heroNode },
    {
      key: "worship",
      node: (
        <div className="mb-6">
          {/*
            祭拜面板紧跟场景 —— 供台就在上一屏的场景里，二者必须相邻。
            这是"场景优先"布局的核心：先看到遗像与供台，再看到怎么祭拜。
            无遗像（非壁龛模式）时本面板同样在此处，页面顶部仍是封面图，
            由于封面图与面板之间没有别的板块，祭拜依然是首屏动作。
          */}
          {/* 共祭动态：不缺席的存在感——「此刻有人和你一样在想念」（近 30 分钟口径，
              只计数不点名，绝不排行榜） */}
          {recentTributeCount > 0 && (
            <p className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50/60 px-4 py-2 text-center text-xs text-amber-800">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-600" />
              </span>
              近 30 分钟，{recentTributeCount} 位亲友在此追思 · 你的心意也在其中
            </p>
          )}
          <WorshipPanel
            hallId={hall.id}
            freeProducts={freeProducts}
            lockedRituals={ritualItems}
            altarItems={altarItems}
            isLoggedIn={!!user}
          />
        </div>
      ),
    },
    {
      key: "cover",
      node: !isNicheWall ? (
          <div className="relative mb-5 aspect-[16/9] w-full overflow-hidden rounded-xl shadow-sm">
            <LivingScene
              image={hall.coverImage || "/assets/scene-hall.jpg"}
              alt={hall.name}
              particles={16}
            />
          </div>
        ) : null,
    },
    {
      key: "profile",
      node: (
        <div className={`mb-6 ${cardCls}`} style={skinCardStyle()}>
          <div className="flex flex-col gap-6 sm:flex-row">
            {/* 壁龛模式下遗像已嵌进场景，这里不再重复展示竖图 */}
            {!isNicheWall &&
              (portraitUrl ? (
                <div className="mx-auto shrink-0 sm:mx-0">
                  <div
                    className="relative overflow-hidden rounded-md border-[6px] border-solid bg-brand-100 shadow-lg"
                    style={decorStyle("frame", decor)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={portraitUrl}
                      alt={`${hall.deceasedName}遗像`}
                      className="h-44 w-36 object-cover sm:h-52 sm:w-44"
                    />
                  </div>
                  <p className={`mt-2 text-center text-xs ${subText}`}>遗像</p>
                </div>
              ) : (
                isOwner && (
                  <div className="mx-auto shrink-0 text-center sm:mx-0">
                    <div className="flex h-44 w-36 items-center justify-center rounded-md border border-dashed border-brand-300 bg-brand-50 text-4xl text-brand-300 sm:h-52 sm:w-44">
                      🖼️
                    </div>
                    <a
                      href={`/console/halls/${hall.id}`}
                      className="mt-2 inline-block text-xs text-accent-600 hover:underline"
                    >
                      上传逝者遗像 →
                    </a>
                  </div>
                )
              ))}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold" style={skinTitleStyle()}>
                  {hall.name}
                </h1>
                {isPremium && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">高级纪念空间</span>
                )}
              </div>
              <p className={`mt-1 text-sm ${dark ? "text-white/70" : "text-brand-500"}`}>
                逝者：{hall.deceasedName}
                {archive.hometown && <span className={`ml-3 ${subText}`}>籍贯：{archive.hometown}</span>}
              </p>
              {archive.career && (
                <p className={`mt-0.5 text-sm ${subText}`}>{archive.career}</p>
              )}
              {hall.birthDate && hall.deathDate && (
                <p className={`mt-1 text-xs ${subText}`}>
                  {new Date(hall.birthDate).toLocaleDateString("zh-CN")} —{" "}
                  {new Date(hall.deathDate).toLocaleDateString("zh-CN")}
                </p>
              )}
              {hall.description && (
                <p className={`mt-3 text-sm leading-7 ${dark ? "text-white/75" : "text-gray-700"}`}>
                  {hall.description}
                </p>
              )}
              {archive.quote && (
                <p className={`mt-2 text-sm italic ${dark ? "text-amber-200/80" : "text-accent-600"}`}>
                  「{archive.quote}」
                </p>
              )}
              {archive.epitaph && (
                <p
                  className={
                    "mt-3 rounded-md px-4 py-2 text-sm italic " +
                    (dark ? "bg-white/10 text-white/80" : "bg-brand-50 text-brand-600")
                  }
                >
                  「{archive.epitaph}」
                </p>
              )}
              {isOwner && (
                <a
                  href={`/console/halls/${hall.id}`}
                  className="mt-3 inline-block text-xs text-accent-600 hover:underline"
                >
                  馆务管理（照片 / 装修 / 档案）→
                </a>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "couplet",
      node: hasCouplet ? (
        <section className="mb-6 rounded-xl border border-amber-900/20 bg-gradient-to-b from-[#1c150e] to-[#2b2118] p-6">
          {couplet.horizontal && (
            <div className="mx-auto mb-4 w-fit rounded border border-amber-900/40 bg-[#161009] px-4 py-1.5 text-sm tracking-[0.3em] text-amber-100">
              {couplet.horizontal}
            </div>
          )}
          <div className="flex items-stretch justify-center gap-6">
            {couplet.right && <CoupletColumn text={couplet.right} side="right" />}
            <div className="flex w-40 flex-col items-center justify-center text-4xl text-amber-200/80">
              🕯️
            </div>
            {couplet.left && <CoupletColumn text={couplet.left} side="left" />}
          </div>
        </section>
      ) : null,
    },
    {
      key: "paidTributes",
      node:
        paidTributes.length > 0 ? (
          <section className="mb-6">
            <h2 className="mb-3 text-lg font-semibold" style={skinTitleStyle()}>
              敬献祭品
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {paidTributes.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col items-center gap-2 rounded-lg border border-brand-200/80 bg-brand-100/70 p-3 text-center transition hover:border-accent-300 hover:bg-accent-50/60"
                  style={skinCardStyle()}
                >
                  <div className="text-2xl">
                    {p.type === "virtual_flower" ? "🌸" : p.tier === "ceremony" ? "🎆" : "🥮"}
                  </div>
                  <div className="line-clamp-1 text-xs text-brand-800">{p.name}</div>
                  <BuyButton productId={p.id} label="敬献" quantity={1} />
                </div>
              ))}
            </div>
          </section>
        ) : null,
    },
    {
      key: "archive",
      node:
        (archive.timeline && archive.timeline.length > 0) ||
        (archive.photos && archive.photos.length > 0) ? (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold" style={skinTitleStyle()}>
              故人数字档案
            </h2>
            {archive.timeline && archive.timeline.length > 0 && (
              <div className="relative rounded-xl border border-brand-200/80 bg-brand-100/70 p-6" style={skinCardStyle()}>
                <div className="absolute bottom-6 left-[52px] top-8 w-px bg-brand-200" />
                <ul className="space-y-4">
                  {archive.timeline.map((t, i) => (
                    <li key={i} className="relative flex gap-4">
                      <span className="z-10 mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent-500 ring-4 ring-brand-100" />
                      <div className="flex-1">
                        <span className="mr-3 text-sm font-semibold text-brand-800">{t.year}</span>
                        <span className="text-sm text-gray-600">{t.event}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {archive.photos && archive.photos.length > 0 && (
              <div className="mt-4">
                <HallGallery photos={archive.photos} portrait={archive.portrait} />
              </div>
            )}
          </section>
        ) : null,
    },
    {
      key: "tributes",
      node: (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold" style={skinTitleStyle()}>
            追思记录
          </h2>
          <ul className="space-y-3">
            {tributes.map((t) => (
              <li key={t.id} className="rounded-lg border border-brand-200/80 bg-brand-100/70 p-4 text-sm" style={skinCardStyle()}>
                <div className="text-brand-700">
                  {typeIcon[t.type] ?? "🕊️ 祭拜"}
                  {/* displayName 是写入时冻结的**脱敏**快照，可安全公开渲染 */}
                  {t.displayName ? ` · ${t.displayName}` : ""}
                  <span className="ml-2 text-xs text-brand-300">
                    {new Date(t.createdAt).toLocaleString("zh-CN", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {t.message && <p className="mt-1 text-gray-600">{t.message}</p>}
              </li>
            ))}
            {tributes.length === 0 && (
              <li className={`text-sm ${subText}`}>暂无追思记录，来献上第一份心意吧</li>
            )}
          </ul>
        </section>
      ),
    },
    {
      key: "community",
      node: (
        <section className={`mt-8 ${cardCls} flex items-center justify-between p-6`} style={skinCardStyle()}>
          <div>
            <h2 className={`text-sm font-semibold ${dark ? "text-white/90" : "text-brand-900"}`} style={skinTitleStyle()}>
              亲友交流社区
            </h2>
            <p className={`mt-1 text-xs ${subText}`}>
              馆主可邀请亲朋好友加入社区，大家在私密空间里分享回忆、照片与视频
            </p>
          </div>
          {/*
            入口按钮：颜色改走 `--skin-button-*`。
            深色底那一支仍是 Tailwind class（半透明白），因为它要的是"融进深底"
            而不是"一个实心强调色" —— 皮肤变量在深色档给的是深金实心按钮，
            压在深底上反而突兀。两者共存：深色优先，浅色走皮肤。
          */}
          <Link
            href={`/halls/${hall.id}/community`}
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={dark ? undefined : skinButtonStyle()}
          >
            进入社区 →
          </Link>
        </section>
      ),
    },
    {
      key: "panorama",
      node:
        !isNicheWall || hall.coverImage ? (
          <section className="mt-8">
            {/*
              3D 全景（轻量 VR：拖拽环视）—— 降为次要内容，排在追思记录之后。
              场景优先的布局里，首屏已经给了遗像与供台，这里只作"再看一眼整个空间"的补充。

              注意：壁龛模式下**必须**用馆主上传的真实封面图。
              默认兜底图 hall-cover.jpg 本身就是"一面壁龛纪念墙"的照片，
              与顶部的绘制场景几乎同款 —— 上下并列会出现"同一面墙放两遍"的荒唐感。
              因此壁龛模式下只有馆主真的传了 coverImage 才显示全景。
            */}
            <PanoramaView
              src={hall.coverImage || "/assets/scene-hall.jpg"}
              title={hall.deceasedName}
            />
          </section>
        ) : null,
    },
    {
      key: "decorInfo",
      node: fontItem ? (
        <p className={`mt-6 text-[11px] ${subText}`}>
          当前装修：{wallItem?.name ?? "素白"} · {decorItem("floor", decor)?.name ?? "无地纹"} ·{" "}
          {decorItem("ornament", decor)?.name ?? "无挂饰"} · {frameItem?.name ?? "无框"} · {fontItem.name}
          {isOwner && (
            <>
              {" "}
              <a href={`/console/halls/${hall.id}`} className="text-accent-600 hover:underline">
                去装修 →
              </a>
            </>
          )}
        </p>
      ) : null,
    },
  ];

  const hallOrder = resolveSectionOrder(hall.sectionOrder, HALL_DEFAULT_ORDER);
  const hallSectionMap = new Map(hallSections.map((s) => [s.key, s.node]));
  const orderedHallSections = hallOrder
    .map((key) => ({ key, node: hallSectionMap.get(key) }))
    .filter((s): s is { key: string; node: ReactNode } => s.node != null);

  return (
    <HallDecorLayer
      decor={decor}
      className="min-h-screen"
      skin={pageSkin}
      suppressFixedOrnaments={isNicheWall && !use3DScene}
    >
      {pub && (
        <script
          type="application/ld+json"
          // 结构化数据（P0 SEO）：页面公开展示的信息（馆名/逝者/生卒年）以 WebPage 形式
          // 交给搜索引擎；不包含任何身份快照字段。
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              name: `${hall.name} · 纪念${hall.deceasedName}`,
              description: hall.description?.slice(0, 200) ?? undefined,
              inLanguage: "zh-CN",
            }),
          }}
        />
      )}
      <div className="container-page max-w-3xl py-10" data-page-skin={skinIsActive(pageSkin) ? "on" : "off"}>
        {orderedHallSections.map((s) => (
          <Fragment key={s.key}>{s.node}</Fragment>
        ))}

        {/* 一键分享：让家族纪念空间能被亲友转发出去，是"降低传播门槛"的落点 */}
        <ShareBar
          url={shareUrl}
          title={shareTitle}
          summary={pub ? hall.description?.slice(0, 60) ?? undefined : undefined}
          scope="hall"
        />

        {reported && (
          <div className="mt-6 rounded-md border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">
            举报已提交，平台将进行人工复核。感谢您共同维护纪念环境的真实与安全。
          </div>
        )}

        {/* 合规底线：一键举报入口（活人被祭拜 / 虚假馆 / 其他） */}
        <details className="mt-6 rounded-lg border border-brand-200/80 bg-brand-100/70 p-4">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            发现违规内容？举报此纪念馆
          </summary>
          <form action={reportHall} className="mt-3 space-y-3">
            <input type="hidden" name="hallId" value={id} />
            <input type="hidden" name="from" value={`/halls/${id}`} />
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">举报类型</label>
              <select name="kind" defaultValue="living" className="w-full rounded-md border border-brand-200 px-3 py-2 text-sm bg-brand-50/70">
                <option value="living">活人被祭拜</option>
                <option value="fake">虚假纪念馆</option>
                <option value="other">其他违规</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">说明（选填）</label>
              <textarea
                name="reason"
                rows={3}
                maxLength={1000}
                className="w-full rounded-md border border-brand-200 px-3 py-2 text-sm bg-brand-50/70"
                placeholder="请简述违规情况"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">联系方式（选填）</label>
              <input name="contact" maxLength={100} className="w-full rounded-md border border-brand-200 px-3 py-2 text-sm bg-brand-50/70" placeholder="方便我们回访" />
            </div>
            <button type="submit" className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">
              提交举报
            </button>
          </form>
        </details>

        <div className="mt-10">
          <BackLink href="/halls">返回纪念馆列表</BackLink>
        </div>
      </div>
    </HallDecorLayer>
  );
}
