import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { fubFromFen } from "@/lib/fortune";
import Price from "@/components/shop/Price";
import type { ProductType } from "@prisma/client";
import BuyButton from "@/components/shop/BuyButton";
import PhysicalBuyButton from "@/components/shop/PhysicalBuyButton";
import HallBuyButton from "@/components/shop/HallBuyButton";
import BackLink from "@/components/site/BackLink";
import LottieIcon from "@/components/shop/LottieIcon";
import DecorSpacePreview, { SPACE_LABEL } from "@/components/decor/DecorSpacePreview";
import DecorCover from "@/components/decor/DecorCover";
import { resolveDecorEntitlement } from "@/lib/decor-products";
import { BUNDLES, DEFAULT_DECOR, findTemplate, KITS } from "@/lib/hall-decor";
import { CLAN_KITS, findClanTemplate } from "@/lib/clan-decor";
import { isServiceProduct } from "@/lib/service";

const typeLabel: Record<ProductType, string> = {
  subscription: "高级订阅",
  whisper_plan: "午夜悄悄话",
  memorial_hall: "数字纪念馆",
  cloud_worship: "云祭扫",
  virtual_flower: "虚拟献花",
  tribute_item: "纪念物品",
  physical_goods: "实体商品",
  memorial_service: "纪念服务",
  decor: "空间装修",
  storage: "存储空间",
  fortune_topup: "福币充值",
};

/**
 * 商品页 SEO（P0）：商品名/描述/价格进入 metadata；
 * Product JSON-LD（见页面内）让搜索引擎拿到结构化价格，可参与富摘要。
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await prisma.product.findUnique({
    where: { slug },
    select: { name: true, description: true, coverImage: true, status: true, category: { select: { name: true } } },
  });
  if (!product || product.status !== "active") return { title: "商品详情" };
  return {
    title: `${product.name} · ${product.category?.name ?? "商城"}`,
    description: product.description?.replace(/<[^>]*>/g, "").slice(0, 120) || `${product.name}，宗忆堂数字纪念服务。`,
    alternates: { canonical: `/mall/${slug}` },
    openGraph: {
      title: product.name,
      images: product.coverImage ? [product.coverImage] : undefined,
    },
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await prisma.product.findUnique({
    where: { slug },
    include: { category: true },
  });
  if (!product || product.status !== "active") notFound();

  /*
    装修商品：**买之前得看得见**。

    模板类商品的核心卖点是"空间会变成什么样"，只给一段文字描述、
    让用户凭标题想象，成交全靠赌。所以这里把 3D 空间预览直接放在商品页首屏。

    三件事必须做对：
      ① 只有**模板**类才有独立空间形态；壁纸/挂饰/相框/字体是零件，
         换了也不改骨架，硬套一个 3D 场景反而误导（用户以为单买壁纸就能换空间）。
      ② 模板既可能在纪念馆侧（hall-decor）也可能在宗祠侧（clan-decor），
         要**两边都查**——早先只查 hall-decor，宗祠模板商品页就没有预览。
      ③ 预览里**不放遗像/牌位影像**：商品页是公共页面，此处不该出现任何
         具体逝者的照片（哪怕只是示意图），也没有用户数据可用。
         DefaultAltar 已按此约定不渲染遗像。
  */
  const ent = product.type === "decor" ? resolveDecorEntitlement(product.slug) : null;
  const decorTpl =
    ent?.kind === "template"
      ? (findTemplate(ent.id) ?? findClanTemplate(ent.id))
      : undefined;
  const decorSpace = decorTpl?.space;
  const showSpace = !!decorSpace && decorSpace !== "classic";

  /*
    典藏礼包：**必须把包内清单摊开给顾客看**。
    礼包卖的是"原价 ¥350 → ¥199"，若只给一句描述、不列出里面是哪几套，
    用户既无法判断值不值、也无法确认自己没买过其中某一套 ——
    这类"盲盒式"礼包在退货率上历来最难看。
    清单在**服务端**由 BUNDLES 现算：不读任何用户数据，是纯静态内容。
  */
  const bundle =
    ent?.kind === "bundle" ? BUNDLES.find((b) => b.id === ent.id) : undefined;
  const bundleItems = (bundle?.includes ?? []).map((id) => {
    const tpl = findTemplate(id) ?? findClanTemplate(id);
    if (tpl) {
      return {
        id,
        label: tpl.name,
        kindLabel: "空间模板",
        priceFen: tpl.priceFen ?? tpl.points ?? 0,
        icon: tpl.preview.icon,
        background: tpl.preview.background,
        color: tpl.preview.color,
      };
    }
    const kit = KITS.find((k) => k.id === id) ?? CLAN_KITS.find((k) => k.id === id);
    return {
      id,
      label: kit?.name ?? id,
      kindLabel: "装饰套件",
      priceFen: kit?.priceFen ?? kit?.points ?? 0,
      icon: kit?.preview.icon ?? "🎁",
      background: kit?.preview.background ?? "#eee",
      color: kit?.preview.color ?? "#333",
    };
  });
  const bundleListFen = bundleItems.reduce((s, x) => s + x.priceFen, 0);
  const bundleSaveFen = bundleListFen - (product.price ?? 0);

  return (
    <div className="container-page max-w-3xl py-12">
      {/*
        Product 结构化数据（P0 SEO）：价格以 CNY 上报，免费品 price=0。
        只含商品公开信息，有利于富摘要展示。
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            description: product.description?.replace(/<[^>]*>/g, "").slice(0, 300) ?? undefined,
            image: product.coverImage ?? undefined,
            category: product.category?.name,
            offers: {
              "@type": "Offer",
              priceCurrency: "CNY",
              price: ((product.isFree ? 0 : product.price) / 100).toFixed(2),
              availability: "https://schema.org/InStock",
            },
          }),
        }}
      />
      <BackLink href="/mall">返回纪念商城</BackLink>
      {decorTpl ? (
        // 装修模板：用主题化 SVG 封面，与各自描述匹配（替代共用 prod-decor-tpl.svg）
        <DecorCover t={decorTpl} className="mt-4 rounded-xl shadow-sm" />
      ) : product.coverImage ? (
        <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-xl bg-brand-50 shadow-sm">
          <LottieIcon
            cover={product.coverImage}
            alt={product.name}
            className="absolute inset-0 h-full w-full"
            fallback={
              <Image
                src={product.coverImage}
                alt={product.name}
                fill
                sizes="(min-width: 1280px) 768px, 100vw"
                className="object-cover"
              />
            }
          />
        </div>
      ) : null}
      <div className="mb-2 mt-5 text-xs text-brand-500">{typeLabel[product.type]}</div>
      <h1 className="text-3xl font-semibold text-brand-900">{product.name}</h1>
      {/* 价格与购买入口置于首屏（标题正下方）：用户第一眼即见价格与按钮，
          解决此前「封面+预览占满首屏、价格区需滚动才出现」的体验问题。 */}
      {product.isFree ? (
        <div className="mt-5 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-5">
          <div>
            <div className="text-2xl font-bold text-green-700">免费</div>
            <p className="mt-1 text-xs text-green-700">
              基础礼器，无需付费 · 前往任一纪念馆即可一键祭拜
            </p>
          </div>
          <Link
            href="/halls"
            className="rounded-lg bg-green-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-800"
          >
            去纪念馆祭拜
          </Link>
        </div>
      ) : (
        <div className="mt-5 flex items-center justify-between rounded-lg bg-brand-50 p-5">
          <Price fub={fubFromFen(product.price)} size="lg" className="text-2xl" />
          {product.type === "physical_goods" ? (
            <PhysicalBuyButton productId={product.id} label="立即购买" />
          ) : product.type === "memorial_hall" ? (
            <HallBuyButton productId={product.id} />
          ) : (
            <BuyButton productId={product.id} label="立即购买" />
          )}
        </div>
      )}
      {/*
        装修模板的空间预览：标题下方即价格，预览紧随其后——用户先见价格与按钮，
        再向下看"买到后的空间效果"。与工坊里那处用的是**同一个组件**，
        保证商品页看到的和买到后得到的一致
        （两处各画一套迟早会漂移）。

        `decor` 直接由模板自己的 slots 合成：这样顾客看到的就是"买下并应用后"
        的那套墙面/地面/挂饰，而不是随便一套默认搭配。没有真实用户数据参与，
        商品页是公共页面，不能也不需要读任何人的馆。
      */}
      {showSpace && (
        <div className="mt-6">
          <DecorSpacePreview
            decor={{
              templateId: decorTpl!.id,
              slots: { ...DEFAULT_DECOR, ...decorTpl!.slots },
              unlocked: [],
              granted: [],
            }}
            spaceKind={decorSpace}
            engine="v2"
            className="h-[300px]"
          />
          <p className="mt-2 text-center text-xs text-brand-400">
            当前空间形态：{SPACE_LABEL[decorSpace] ?? "常规厅堂"} · 拖拽画面可环视
          </p>
        </div>
      )}

      {/*
        礼包清单：逐件列出包内方案 + 单买价，让"省多少"可被顾客自己核对。
        划线原价用**现算**的 bundleListFen（不读 BUNDLES.listPriceFen 那个字段），
        保证与清单里逐项相加的结果永远一致 —— 两处各算一遍迟早对不上。
      */}
      {bundle && bundleItems.length > 0 && (
        <div className="mt-6 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-brand-900">
              礼包内含 {bundleItems.length} 套方案
            </h2>
            <span className="text-xs text-brand-500">
              {/*
                礼包「单买合计 / 省多少」以**福币**计（1 福币 = 1 元）。
                输入仍是分（bundleListFen），经 fubFromFen 收敛 ——
                与商城卡片同一口径，避免"卡片写福币、详情页写人民币"的分叉。
              */}
              单买合计 {fubFromFen(bundleListFen)} 福币
              {bundleSaveFen > 0 && (
                <span className="ml-1 font-medium text-red-600">
                  省 {fubFromFen(bundleSaveFen)} 福币
                </span>
              )}
            </span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {bundleItems.map((x) => (
              <li
                key={x.id}
                className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-base"
                  style={{ background: x.background, color: x.color }}
                  aria-hidden
                >
                  {x.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-brand-900">{x.label}</span>
                  <span className="block text-xs text-brand-400">{x.kindLabel}</span>
                </span>
                <span className="shrink-0 text-xs text-brand-500">
                  {fubFromFen(x.priceFen)} 福币
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {product.description && (
        <div className="mt-4 space-y-4 leading-7 text-gray-700">
          {product.description.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}

      {/* 收费礼器：说明购买后如何使用，避免"买了不知道怎么用" */}
      {!product.isFree && product.isRitual && (
        <div className="mt-4 rounded-lg border border-accent-200 bg-accent-50 p-4 text-xs leading-6 text-accent-700">
          <b>购买后如何使用：</b>敬献成功后，回到该逝者的纪念馆，在「祭品 · 一键祭拜」面板中点击对应图标，
          即可触发专属动效与音效，并在馆内留下祭拜记录。
        </div>
      )}
      {product.type === "memorial_hall" && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-800">
          <b>建馆合规提示：</b>依据《网络祭祀要求》（MZ/T 173—2025）与《殡葬管理条例》，
          创建网络纪念馆须完成实名认证，并提供火化证明、经办人身份证、手机号码及与逝者关系证明，
          经专人审核后方可开通。平台严防"活人被祭拜""随意立网碑建网墓"。
        </div>
      )}
      {product.type === "memorial_service" && product.slug === "e-obituary" && (
        <div className="mt-4 rounded-lg border border-accent-200 bg-accent-50 p-4 text-xs leading-6 text-accent-700">
          <b>购买后如何发布：</b>购买即获得 <b>1 份电子讣告发布配额</b>。
          请前往「我的控制台 → 我的讣告」，填写逝者信息后一键发布，
          系统将生成一个可分享的缅怀页链接（可设访问密码），直接发给亲友即可。
          <Link href="/console/obituaries" className="mt-2 inline-block font-medium text-accent-700 hover:underline">
            前往发布 →
          </Link>
        </div>
      )}
      {isServiceProduct(product) && (
        <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4 text-xs leading-6 text-orange-800">
          <b>本服务为人工受理项目。</b>购买 / 兑换后，请前往「我的控制台 → 我的服务」提交需求与资料，
          工作人员将与你联系并交付。我们不会自动开通任何权益，需在受理单中确认需求后由专人对接。
          <Link href="/console" className="mt-2 inline-block font-medium text-orange-700 hover:underline">
            前往我的控制台 →
          </Link>
        </div>
      )}
      {product.pointsPrice != null && !product.isFree && product.type !== "physical_goods" && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm text-amber-800">
            本商品支持<span className="font-bold">积分兑换</span>：
            <span className="font-bold">{product.pointsPrice}</span> 积分（
            {/*
              ⚠️ pointsPrice 的单位是**积分个数**，不是分。
              旧写法 `formatYuan(product.pointsPrice)` 是拿积分当分用 ——
              只因平台 1:1 的兑换率（100 积分 = ¥1）才碰巧算对。
              改为按商品人民币价折算福币，口径与积分页一致。
            */}
            等价 {fubFromFen(product.price)} 福币），无需再付款。
          </div>
          <Link
            href="/points"
            className="mt-2 inline-block text-xs font-medium text-amber-700 hover:underline"
          >
            前往积分兑换页 →
          </Link>
        </div>
      )}
      <p className="mt-3 text-xs text-brand-400">
        购买即代表你理解这是数字纪念服务，一经开通不支持退换（内测说明）。
      </p>
    </div>
  );
}
