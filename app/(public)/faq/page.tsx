import Link from "next/link";

export const metadata = {
  title: "常见问题 FAQ",
  description: "关于数字纪念馆、云祭扫、虚拟献花、实名与隐私的常见问题",
};

const faqs = [
  {
    q: "宗忆堂是什么平台？",
    a: "宗忆堂是一个聚焦殡葬祭祀文化与数字纪念的垂类平台，提供新闻资讯、数字纪念馆、云祭扫与虚拟献花等服务。我们是文化传播与数字纪念技术服务方，不涉及线下殡葬服务经营。",
  },
  {
    q: "虚拟祭品/数字纪念服务是什么？",
    a: "虚拟祭品指在数字纪念馆中献上的虚拟鲜花、电子长明灯、虚拟挽联等；数字纪念服务包括数字纪念馆创建、云祭扫、生平传记代写、线上追思会、纪念视频、电子讣告与扫码云碑。它们属于数字服务，开通后可在线上随时访问。",
  },
  {
    q: "数字纪念馆是永久保存吗？",
    a: "纪念馆按你购买的有效期（一年/三年）开通与续费。到期前我们会提醒续费；续费后所有资料、留言与献花记录完整保留，不会重新建立。",
  },
  {
    q: "创建纪念馆需要实名吗？",
    a: "需要。建立数字纪念馆与开通虚拟服务前需完成实名（姓名+证件，加密存储），目的是防止冒用他人身份、守护真实的缅怀，并配合内容责任与应急处置。",
  },
  {
    q: "我的隐私和证件信息安全吗？",
    a: "我们遵循最小必要原则收集信息，证件采用字段级加密存放于受控私有存储，不出现在业务日志中；访问与核验操作均留存日志以便追溯。你有权查询与更正授权范围内的个人信息。",
  },
  {
    q: "公开内容会经过审核吗？",
    a: "会。所有公开发布的内容均先经机器预筛，再经人工终审，规避“封建迷信”等合规红线；用户也可一键举报，可疑内容会即时下架并留痕。AI 仅出初稿与预筛，绝不自动发布。",
  },
  {
    q: "虚拟商品可以退换吗？",
    a: "虚拟商品为数字服务，一经开通通常不支持退换。购买前请仔细阅读服务说明；如对已开通服务有疑问，可通过客服邮箱联系处理。",
  },
  {
    q: "积分怎么获得和使用？",
    a: "注册即赠体验积分；购买数字纪念服务按实付金额 1:1 累积积分。积分可在积分兑换页兑换纪念馆续费、电子长明灯年卡、电子讣告、虚拟挽联等。详见积分兑换页。",
  },
  {
    q: "云祭扫和实地祭扫是什么关系？",
    a: "云祭扫是实地祭扫的补充，而非替代。它在你无法亲临现场时提供一份可随时抵达的思念；若条件允许，也请记得给家里打一个电话、敬一杯清茶。",
  },
  {
    q: "如何联系客服或洽谈机构合作？",
    a: "客服与机构合作邮箱：service@example.com。我们面向殡仪馆、陵园及民政部门提供“殡葬文化数字化技术服务”。",
  },
];

export default function FaqPage() {
  return (
    <div className="container-page max-w-3xl py-14">
      <h1 className="text-3xl font-semibold text-brand-900">常见问题 FAQ</h1>
      <p className="mt-2 text-brand-500">
        关于数字纪念服务、实名隐私与合规，我们整理了最受关注的问题。
      </p>

      <div className="mt-8 space-y-4">
        {faqs.map((f, i) => (
          <details
            key={i}
            className="group rounded-xl border border-brand-200 bg-brand-100/70 p-5 shadow-sm [&_summary]:cursor-pointer"
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

      <div className="mt-8 rounded-xl border border-brand-200 bg-brand-100/70 p-6 text-center">
        <h2 className="text-base font-semibold text-brand-900">想更深入地了解？</h2>
        <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          <Link
            href="/points/guide"
            className="font-medium text-accent-600 hover:underline"
          >
            积分规则详解 →
          </Link>
          <Link
            href="/halls/guide"
            className="font-medium text-accent-600 hover:underline"
          >
            纪念馆创建引导 →
          </Link>
        </div>
      </div>

      <div className="mt-10 rounded-2xl bg-brand-50 p-8 text-center">
        <h2 className="text-lg font-semibold text-brand-900">还有其他问题？</h2>
        <p className="mt-2 text-brand-600">欢迎通过客服邮箱联系我们。</p>
        <a
          href="mailto:service@example.com"
          className="mt-4 inline-block rounded-md bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
        >
          service@example.com
        </a>
      </div>

      <div className="mt-8 text-center">
        <Link href="/" className="text-sm text-brand-500 hover:underline">
          ← 返回首页
        </Link>
      </div>
    </div>
  );
}
