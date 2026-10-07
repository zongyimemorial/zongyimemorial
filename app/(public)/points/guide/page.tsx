import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { INITIAL_POINTS, POINTS_PER_YUAN, REDEEM_RATE_BASIC, REDEEM_RATE_ADVANCED, REDEEM_RATE_HALL, REDEEM_DAILY_LIMIT, POINTS_VALID_MONTHS } from "@/lib/points";
import { fubFromFen, fubOnly } from "@/lib/fortune";
import type { ProductType } from "@prisma/client";

export const metadata = {
  title: "积分规则详解",
  description:
    "宗忆堂内测积分的获取方式、兑换规则、折算比例与有效期说明，附可兑换纪念服务一览。",
};

const earnRules = [
  {
    name: "虚拟祭品消费",
    point: `消费¥1 = ${POINTS_PER_YUAN}积分`,
    note: "主要积分来源：模拟支付成功后按实付金额累计。",
  },
  {
    name: "纪念馆创建",
    point: "+50",
    note: "一次性奖励，鼓励用户建馆传承记忆。",
  },
  {
    name: "每日登录祭拜",
    point: "+5 / 天",
    note: "每天首次进入控制台即可获取，提升日活。",
  },
  {
    name: "邀请好友注册",
    point: "+20 / 人",
    note: "社交裂变奖励（公网阶段上线）。",
  },
  {
    name: "完善逝者档案",
    point: "+30",
    note: "丰富平台内容，一次性奖励（公网阶段上线）。",
  },
  {
    name: "发布追思留言",
    point: "+2 / 条",
    note: "每日上限 10 条（公网阶段上线）。",
  },
];

const redeemRules = [
  "核心原则：第一阶段积分仅用于兑换虚拟产品，不涉及任何实体商品。",
  `基础祭品：${REDEEM_RATE_BASIC} 积分 = ¥1 虚拟商品（标准兑换率）。`,
  `进阶祭品：${REDEEM_RATE_ADVANCED} 积分 = ¥1 虚拟商品（高价值商品溢价兑换）。`,
  `纪念馆模板：${REDEEM_RATE_HALL} 积分 = ¥1 虚拟商品（定制化产品）。`,
  "支持「积分 + 积分」多件商品组合兑换，灵活消耗积分。",
  `兑换限制：每日兑换上限 ${REDEEM_DAILY_LIMIT} 积分；单笔兑换不限（按商品自身积分价扣减）。`,
  `积分有效期：${POINTS_VALID_MONTHS} 个月，过期自动清零。`,
];

const TOC = [
  { id: "what", t: "一、什么是积分" },
  { id: "earn", t: "二、如何获取积分" },
  { id: "example", t: "三、积分获取示例" },
  { id: "redeem", t: "四、如何兑换积分" },
  { id: "rate", t: "五、兑换比例与折算" },
  { id: "list", t: "六、可兑换纪念服务" },
  { id: "valid", t: "七、有效期与提示" },
  { id: "faq", t: "八、常见问题" },
];

const faqs = [
  {
    q: "积分可以提现或转卖吗？",
    a: "不可以。内测积分仅用于在本平台兑换虚拟纪念服务，不做现金兑付、不对外交易，也不支持转账。",
  },
  {
    q: "兑换错了可以退回吗？",
    a: "积分兑换为不可逆操作。提交前请确认商品与积分余额；如确有异常，请通过客服邮箱联系处理。",
  },
  {
    q: "消费后积分没到账怎么办？",
    a: "积分在模拟支付成功且订单完成后才计入。若长时间未到账，请确认支付是否成功，或联系客服核实。",
  },
  {
    q: "内测积分会保留到正式版吗？",
    a: "内测积分仅在内测环境有效。内测结束后将统一清零，不结转至正式版本，请尽早体验兑换。",
  },
];

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

export default async function PointsGuidePage() {
  const redeemable = await prisma.product.findMany({
    where: {
      status: "active",
      pointsPrice: { not: null },
      type: { not: "physical_goods" },
    },
    orderBy: { pointsPrice: "asc" },
  });

  return (
    <div className="container-page max-w-3xl py-12">
      {/* Hero */}
      <header className="overflow-hidden rounded-2xl bg-brand-900">
        <div className="relative h-44 w-full">
          <Image
            src="/assets/points-guide.jpg"
            alt="积分累计与兑换"
            fill
            sizes="(min-width: 1280px) 768px, 100vw"
            className="object-cover"
          />
        </div>
        <div className="p-7">
          <h1 className="text-3xl font-semibold text-white">积分规则详解</h1>
          <p className="mt-2 max-w-xl text-brand-100">
            内测期间，积分是我们回馈你的一种方式：注册、消费、开通纪念馆都能攒积分，
            再用积分兑换纪念馆续费、电子长明灯、电子讣告等纪念服务。
          </p>
        </div>
      </header>

      {/* 目录 */}
      <nav className="mt-8 rounded-xl border border-gray-100 bg-brand-50 p-5">
        <div className="mb-3 text-sm font-semibold text-brand-800">
          本文目录
        </div>
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {TOC.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="text-brand-600 hover:text-accent-600">
                {t.t}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* 一、什么是积分 */}
      <section id="what" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">一、什么是积分</h2>
        <p className="mt-3 leading-7 text-gray-700">
          积分是本平台内测环境内的一种<strong>虚拟权益单位</strong>，用来回馈你的参与与消费。
          它和人民币不是一回事：不兑付现金、不对外交易，只能在平台内的「积分兑换」专区，
          换取标注了积分价的虚拟纪念服务。把它理解为「内测体验券」最合适。
        </p>
      </section>

      {/* 二、如何获取积分 */}
      <section id="earn" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">二、如何获取积分</h2>
        <p className="mt-3 leading-7 text-gray-700">
          积分主要来自两类行为：<strong>你加入平台</strong>（注册赠礼）、
          <strong>你在平台产生消费或互动</strong>（消费累计、开通纪念馆、互动等）。
        </p>
        <div className="mt-5 overflow-x-auto rounded-lg border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 text-left text-brand-700">
              <tr>
                <th className="p-3">获取途径</th>
                <th className="p-3">积分</th>
                <th className="p-3">说明</th>
              </tr>
            </thead>
            <tbody>
              {earnRules.map((r) => (
                <tr key={r.name} className="border-t border-gray-50">
                  <td className="p-3 font-medium text-brand-900">{r.name}</td>
                  <td className="p-3 font-semibold text-accent-600">{r.point}</td>
                  <td className="p-3 text-brand-500">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 三、积分获取示例 */}
      <section id="example" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">三、积分获取示例</h2>
        <div className="mt-3 rounded-lg border border-gray-100 bg-white p-5 text-sm leading-7 text-gray-700">
          <p>
            小念刚注册，账户里立刻有了{" "}
            <strong className="text-accent-600">{INITIAL_POINTS} 积分</strong>
            （内测注册赠礼）。
          </p>
          <p className="mt-2">
            她每天登录平台祭拜，每天可得{" "}
            <strong className="text-accent-600">+5 积分</strong>
            （每日登录祭拜）。
          </p>
          <p className="mt-2">
            她为祖父开通了一座数字纪念馆：支付 ¥98 获得{" "}
            <strong className="text-accent-600">294 积分</strong>
            （消费 ¥1 = {POINTS_PER_YUAN} 积分），建馆行为再奖励{" "}
            <strong className="text-accent-600">50 积分</strong>，
            叠加后共新增 344 积分。
          </p>
          <p className="mt-2">
            此时账户合计约 {INITIAL_POINTS + 344} 积分，已足够在兑换专区换一份基础祭品。
          </p>
        </div>
      </section>

      {/* 四、如何兑换积分 */}
      <section id="redeem" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">四、如何兑换积分</h2>
        <p className="mt-3 leading-7 text-gray-700">
          进入「积分兑换」页（需登录），在标注积分价的商品上点击「用 N 积分兑换」即可。
          兑换遵循以下规则：
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-700">
          {redeemRules.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>

      {/* 五、兑换比例与折算 */}
      <section id="rate" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">五、兑换比例与折算</h2>
        <p className="mt-3 leading-7 text-gray-700">
          按商品类别采用不同兑换率：
          <strong className="text-accent-600"> 基础祭品 {REDEEM_RATE_BASIC} 积分 = ¥1</strong>、
          <strong className="text-accent-600"> 进阶祭品 {REDEEM_RATE_ADVANCED} 积分 = ¥1</strong>、
          <strong className="text-accent-600"> 纪念馆模板 {REDEEM_RATE_HALL} 积分 = ¥1</strong>。
          例如一份虚拟鲜花·白菊（基础祭品）标价 200 积分，约等于 ¥2 的等值祭品。
          该比例仅用于内部折算展示，<strong>积分本身不可反向兑换为人民币</strong>。
        </p>
      </section>

      {/* 六、可兑换纪念服务 */}
      <section id="list" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">六、可兑换纪念服务</h2>
        <p className="mt-3 text-sm text-brand-500">
          以下为当前积分兑换专区的在售服务（价格以专区实时为准）：
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {redeemable.map((p) => (
            <Link
              key={p.id}
              href={`/mall/${p.slug}`}
              className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="text-xs text-brand-500">{typeLabel[p.type]}</div>
              <div className="mt-1 font-semibold text-brand-900">{p.name}</div>
              <div className="mt-2 text-sm font-bold text-accent-600">
                {p.pointsPrice} 积分
                <span className="ml-2 text-xs font-normal text-brand-400">
                  {fubOnly(fubFromFen(p.price))}
                </span>
              </div>
            </Link>
          ))}
          {redeemable.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-brand-500">
              暂无可兑换商品
            </div>
          )}
        </div>
      </section>

      {/* 七、有效期与提示 */}
      <section id="valid" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">七、有效期与提示</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
          <li>积分有效期 {POINTS_VALID_MONTHS} 个月，自获得之日起计算，过期自动清零。</li>
          <li>每日兑换上限 {REDEEM_DAILY_LIMIT} 积分，单笔兑换不限（按商品自身积分价扣减）。</li>
          <li>内测积分仅在内测环境有效，内测结束后将统一清零，不结转正式版本。</li>
          <li>请尽早把积分用于兑换你需要的纪念服务，避免到期清零。</li>
          <li>积分余额与明细可在「积分兑换」页登录后查看。</li>
        </ul>
      </section>

      {/* 八、常见问题 */}
      <section id="faq" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">八、常见问题</h2>
        <div className="mt-4 space-y-4">
          {faqs.map((f, i) => (
            <details
              key={i}
              className="group rounded-xl border border-gray-100 bg-white p-5 shadow-sm [&_summary]:cursor-pointer"
            >
              <summary className="flex items-center justify-between font-semibold text-brand-900">
                <span>{f.q}</span>
                <span className="ml-4 text-accent-600 transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 leading-7 text-brand-700">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/points"
          className="rounded-md bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
        >
          前往积分兑换
        </Link>
        <Link
          href="/mall"
          className="rounded-md border border-brand-700 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          浏览虚拟祭品商城
        </Link>
        <Link
          href="/faq"
          className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-gray-50"
        >
          更多常见问题
        </Link>
      </div>

      <div className="mt-8 text-center">
        <Link href="/" className="text-sm text-brand-500 hover:underline">
          ← 返回首页
        </Link>
      </div>
    </div>
  );
}
