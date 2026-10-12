import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";
import Hall3DStage from "@/components/hall/Hall3DStage";
import HallDecorLayer from "@/components/hall/HallDecorLayer";
import LivingScene from "@/components/site/LivingScene";
import { decorItem, isHallDarkDecor, type HallDecor } from "@/lib/hall-decor";
import { skinOf, withDark, skinCardStyle, skinTitleStyle } from "@/lib/decor-skin";
import PublicWreathOffer from "@/components/memorial/PublicWreathOffer";
import PublicWorshipPanel from "@/components/memorial/PublicWorshipPanel";
import {
  CATEGORY_LABEL,
  lifeSpan,
  giftSuite,
  giftDecor,
  memorialPlaceholderDataUri,
  coupletOf,
  listActivePublicWreaths,
  FREE_PUBLIC_OFFERINGS,
} from "@/lib/memorial";

/** Next 动态路由 params 不会自动解码，中文 slug（如「张国-lbfzwa」）需手动 decode */
function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // 含非法 % 序列时按原样处理
  }
}

/** 竖排挽联（上联 / 下联逐字竖排，参照收费馆 CoupletColumn） */
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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;
  const slug = safeDecode(raw);
  const m = await prisma.publicMemorial.findUnique({
    where: { slug },
    select: { name: true, honorTitle: true, status: true },
  });
  if (!m || m.status !== "APPROVED") return { title: "公益纪念堂" };
  return {
    title: `${m.name}纪念空间 · 公益纪念堂`,
    description: m.honorTitle,
    robots: { index: true, follow: true },
    alternates: { canonical: `/memorial/${slug}` },
  };
}

export default async function MemorialDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: raw } = await params;
  const slug = safeDecode(raw);

  const exist = await prisma.publicMemorial.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  // 未通过审核 / 已下架 / 不存在 → 404
  if (!exist || exist.status !== "APPROVED") notFound();

  const memorial = await prisma.publicMemorial.update({
    where: { slug },
    data: { viewCount: { increment: 1 } },
    include: {
      messages: {
        where: { status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });

  // 当前员工（平台运营）身份：仅员工可见「馆务管理（装修）」入口，公众零可见、零付费
  const user = await getCurrentUser();
  const isStaffUser = isStaff(user?.role);

  // 平台赠礼：顶级装修方案（尊享层）+ 旗舰存储
  const suite = giftSuite(memorial.giftSuiteId);
  const storageGb = memorial.giftStorageGb;
  const decor = giftDecor(memorial.giftSuiteId);

  /*
    整页换肤：与收费馆（/halls/[id]）完全同构 ——
    把赠礼方案翻译成 HallDecor，交给 HallDecorLayer 渲染整页墙纸
    并注入 --skin-* 变量。少了这一层，公益馆详情页就只是
    "暖白底 + 浅米卡"，而收费馆是"织锦墙纸 + 半透明卡"的整页氛围。
  */
  const pageDecor: HallDecor = {
    slots: {
      wall: decor.wallId,
      floor: "floor-none",
      ornament: decor.ornamentIds.length ? decor.ornamentIds : ["orn-none"],
      frame: "frame-line",
      font: "font-modern",
    },
  };
  const skin = skinOf(pageDecor, {
    items: {
      wall: decorItem("wall", pageDecor),
      floor: decorItem("floor", pageDecor),
      ornament: decorItem("ornament", pageDecor),
      frame: decorItem("frame", pageDecor),
      font: decorItem("font", pageDecor),
    },
  });
  // 深色判定与收费馆同口径：skin.dark ∥ 旧硬编码墙纸列表（取并集）
  const dark = skin.dark || isHallDarkDecor(pageDecor);
  const pageSkin = withDark(skin, dark);
  // 卡片/文字底色：深色墙纸档走半透明白玻璃卡 + 浅字（与收费馆逐类同款）
  const cardCls =
    "rounded-xl border p-6 " +
    (dark
      ? "border-white/15 bg-white/8 backdrop-blur-sm"
      : "border-brand-200/80 bg-brand-100/70");
  const subText = dark ? "text-white/60" : "text-brand-400";
  const bodyText = dark ? "text-white/80" : "text-brand-700";
  const headingText = dark ? "text-white/90" : "text-brand-900";
  // 公众已献花圈（同馆最多 2 个，3 天 TTL），既陈列进 3D 厅堂，也在下方横幅列出
  const wreaths = await listActivePublicWreaths(memorial.id);
  const couplet = coupletOf(memorial.couplet);
  const hasCouplet = !!(couplet?.left || couplet?.right);
  const span = lifeSpan(memorial.birthYear, memorial.deathYear);

  // 供案祭品：平台免费祭品目录（与下方祭拜面板同源，3D 厅堂供案陈列）
  const altarItems = FREE_PUBLIC_OFFERINGS.map((d) => ({ id: d.type, glyph: d.icon }));

  // 遗像：平台已配则用，否则展示庄重占位（断网可用，不触发「上传遗像」空白）
  const portrait = memorial.portraitUrl || memorialPlaceholderDataUri(memorial.name);

  return (
    <HallDecorLayer
      decor={pageDecor}
      skin={pageSkin}
      className="min-h-screen"
      suppressFixedOrnaments
    >
      <article className="container-page max-w-3xl py-10">
      {/* 封面：与收费纪念馆（/halls）cover 同款 —— 夜景祠堂 + 粒子动效 */}
      <div className="relative mb-5 aspect-[16/9] w-full overflow-hidden rounded-xl shadow-sm">
        <LivingScene
          image="/assets/scene-hall.jpg"
          alt={`${memorial.name}纪念空间`}
          particles={16}
        />
        <span className="absolute left-4 top-4 rounded-full border border-white/25 bg-black/45 px-3 py-1 text-xs text-amber-50 backdrop-blur">
          {CATEGORY_LABEL[memorial.category]} · 公益纪念堂
        </span>
      </div>

      {/* 信息卡：与收费纪念馆 profile 卡同款（深/浅墙纸自适应半透明卡 + 换肤标题） */}
      <div className={`mb-6 ${cardCls}`} style={skinCardStyle()}>
        <h1 className="text-2xl font-semibold" style={skinTitleStyle()}>{memorial.name}纪念空间</h1>
        <p className={`mt-1 text-sm ${dark ? "text-white/70" : "text-brand-500"}`}>
          逝者：{memorial.name}
          {span ? <span className={`ml-3 ${subText}`}>生卒：{span}</span> : null}
        </p>
        <p className={`mt-3 text-sm leading-7 ${dark ? "text-white/75" : "text-gray-700"}`}>
          {memorial.honorTitle ? `${memorial.honorTitle}。` : ""}
          此处收录其生平与亲友追思。
        </p>
      </div>

      {/* 首屏：3D 精装纪念厅堂（对齐收费馆 Hall3DStage；平台统一赠礼精装，无用户自装修） */}
      <Hall3DStage
        portrait={portrait}
        deceasedName={memorial.name}
        isOwner={false}
        decorated={true}
        wallId={decor.wallId}
        ornamentIds={decor.ornamentIds}
        wreaths={wreaths.map((w) => ({ id: w.id, message: w.message }))}
        altarItems={altarItems}
      />

      {/* 馆务管理入口：仅平台员工可见（对齐收费馆「去装修 →」），公众零可见、零付费 */}
      {isStaffUser && (
        <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50/70 px-4 py-2 text-center text-xs">
          <Link
            href={`/memorial/${memorial.slug}/manage`}
            className="font-medium text-accent-600 hover:underline"
          >
            馆务管理（装修 / 遗像 / 挽联）→
          </Link>
          <span className="ml-2 text-brand-400">平台统一配置，公众不可见</span>
        </div>
      )}

      {/* 平台赠礼横幅：顶级装修方案 + 旗舰存储（公益零付费，由平台统一赠予） */}
      <div className={`mt-6 flex flex-col gap-3 ${cardCls} shadow-sm sm:flex-row sm:items-center sm:justify-between`} style={skinCardStyle()}>
        <div>
          <p className={`flex items-center gap-2 text-sm font-semibold ${headingText}`}>
            <span className="text-lg">{suite.preview.icon}</span>
            本馆由平台免费赠予
          </p>
          <p className={`mt-1 text-sm ${bodyText}`}>
            顶级装修方案「{suite.name}」（尊享层）· 旗舰存储 {storageGb}GB/年
          </p>
          <p className={`mt-0.5 text-xs ${subText}`}>
            公益纪念堂零付费、零商业化，所有祭献由平台免费提供
          </p>
        </div>
        <span className="shrink-0 self-start rounded-full bg-brand-800 px-3 py-1 text-xs text-amber-100 sm:self-auto">
          平台赠礼
        </span>
      </div>

      {/* 生平 / 事迹 */}
      <section className={`mt-8 ${cardCls} shadow-sm`} style={skinCardStyle()}>
        <h2 className="mb-2 text-sm font-medium" style={skinTitleStyle()}>事迹简介</h2>
        <p className={`whitespace-pre-wrap leading-8 ${bodyText}`}>{memorial.summary}</p>
        {memorial.story && (
          <>
            <h2 className="mb-2 mt-6 text-sm font-medium" style={skinTitleStyle()}>详细事迹</h2>
            <p className={`whitespace-pre-wrap leading-8 ${bodyText}`}>{memorial.story}</p>
          </>
        )}
        {memorial.sourceUrl && (
          <div className={`mt-6 rounded-lg p-3 text-sm ${dark ? "bg-white/10" : "bg-brand-100/60"}`}>
            <span className={subText}>权威来源：</span>
            <a
              href={memorial.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent-600 hover:underline"
            >
              {memorial.sourceUrl}
            </a>
          </div>
        )}
      </section>

      {/* 挽联（竖排，与收费馆同结构；平台在馆务管理页统一配置） */}
      {hasCouplet && (
        <section className="mt-8 rounded-xl border border-amber-900/20 bg-gradient-to-b from-[#1c150e] to-[#2b2118] p-6">
          {couplet?.horizontal && (
            <div className="mx-auto mb-4 w-fit rounded border border-amber-900/40 bg-[#161009] px-4 py-1.5 text-sm tracking-[0.3em] text-amber-100">
              {couplet.horizontal}
            </div>
          )}
          <div className="flex items-stretch justify-center gap-6">
            {couplet?.right && <CoupletColumn text={couplet.right} side="right" />}
            <div className="flex w-40 flex-col items-center justify-center text-4xl text-amber-200/80">
              🕯️
            </div>
            {couplet?.left && <CoupletColumn text={couplet.left} side="left" />}
          </div>
        </section>
      )}

      {/* 公众免费敬献大花圈（参照收费馆 WreathOffer 排版；免登录、免付费、3 天陈列） */}
      <PublicWreathOffer
        slug={memorial.slug}
        initialWreaths={wreaths.map((w) => ({
          id: w.id,
          nickname: w.nickname,
          message: w.message,
          createdAt: w.createdAt,
          expiresAt: w.expiresAt,
        }))}
      />

      {/* 祭拜面板（参照收费馆 WorshipPanel 视觉：暗色祭拜舞台 + 供台 + 动效；
          全部平台免费、免登录、无每日上限，与 3D 厅堂供案同源） */}
      <PublicWorshipPanel
        slug={memorial.slug}
        initialLight={memorial.lightCount}
        initialOffering={memorial.offeringCount}
        altarItems={altarItems}
        messages={memorial.messages.map((msg) => ({
          id: msg.id,
          nickname: msg.nickname,
          content: msg.content,
          createdAt: msg.createdAt,
        }))}
      />

      {/* 家属撤下 / 纠错入口 + 返回 */}
      <div className={`mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm ${dark ? "border-white/15" : "border-brand-200"}`}>
        <Link href="/memorial" className={`${dark ? "text-white/60 hover:text-amber-200" : "text-brand-500 hover:text-accent-600"}`}>
          ← 返回公益纪念堂
        </Link>
        <Link
          href="/memorial/apply"
          className={`rounded-md border px-3 py-1.5 ${dark ? "border-white/25 text-white/80 hover:bg-white/10" : "border-brand-300 text-brand-700 hover:bg-brand-50"}`}
        >
          家属申请撤下 / 纠错
        </Link>
      </div>
      </article>
    </HallDecorLayer>
  );
}
