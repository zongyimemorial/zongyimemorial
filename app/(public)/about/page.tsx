import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "关于平台",
  description: "宗忆堂平台介绍、使命与合规说明",
};

export default function AboutPage() {
  return (
    <div className="container-page max-w-4xl py-14">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div>
          <p className="text-sm tracking-widest text-accent-600">关于宗忆堂</p>
          <h1 className="mt-2 text-3xl font-semibold text-brand-900">
            以数字方式，留存思念，传递敬意
          </h1>
          <p className="mt-5 leading-8 text-brand-700">
            宗忆堂是一个聚焦殡葬祭祀文化与数字纪念的垂类平台。我们相信，缅怀不应受时间与距离阻隔——
            无论身在何处，你都能为至亲点亮一盏灯、献上一束花、写下一句话。
          </p>
        </div>
        <Image
          src="/assets/illus-about.jpg"
          alt="关于宗忆堂"
          width={1280}
          height={853}
          className="mx-auto h-auto w-full max-w-sm rounded-2xl"
        />
      </div>

      <section className="mt-14">
        <h2 className="text-xl font-semibold text-brand-800">我们的使命</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          <ValueCard
            t="克制有温度"
            d="内容庄重、回避封建迷信，把注意力还给思念本身。"
          />
          <ValueCard t="跨越时空" d="云端纪念馆与云祭扫，让异地家属也能随时追思。" />
          <ValueCard t="合规可信" d="内容先审后发，实名与隐私加密守护，长久运行。" />
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-semibold text-brand-800">我们做什么</h2>
        <ul className="mt-4 space-y-3 leading-7 text-brand-700">
          <li>
            <span className="font-semibold text-brand-900">新闻资讯</span>
            ：殡葬政策解读、生命文化科普与行业动态，经人工审核后发布。
          </li>
          <li>
            <span className="font-semibold text-brand-900">数字纪念馆</span>
            ：为逝者建立可永久访问的线上纪念空间，支持生平、照片与亲友留言。
          </li>
          <li>
            <span className="font-semibold text-brand-900">云祭扫与虚拟献花</span>
            ：在线点灯、献花、代客祭扫，环保而庄重。
          </li>
          <li>
            <span className="font-semibold text-brand-900">纪念服务</span>
            ：生平传记代写、线上追思会、纪念视频、电子讣告与扫码云碑。
          </li>
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-semibold text-brand-800">里程碑</h2>
        <div className="mt-4 space-y-4 border-l-2 border-brand-100 pl-5">
          <Milestone time="M1" t="基建与部署" d="Next.js 全栈上线，认证、数据库与预览门就绪。" />
          <Milestone time="M2" t="新闻体系" d="栏目与文章发布，AI 辅助生成草稿并经人工编辑。" />
          <Milestone time="M3" t="虚拟商城" d="数字纪念馆、云祭扫与积分体系完善，模拟支付跑通闭环。" />
          <Milestone time="进行中" t="内容充实" d="由大模型批量生成资讯与商品文案，配图入库，站点不再空白。" />
        </div>
      </section>

      <section className="mt-14" id="compliance">
        <h2 className="text-xl font-semibold text-brand-800">合规说明</h2>
        <ul className="mt-4 list-disc space-y-2 pl-6 text-brand-700">
          <li>本平台为文化传播与数字纪念技术服务，不涉及线下殡葬服务经营。</li>
          <li>所有公开发布内容均经过机器预筛与人工审核，规避封建迷信等违规表述。</li>
          <li>数字纪念馆、虚拟献花等服务需用户实名后使用，证件信息加密存储。</li>
          <li>虚拟商品为数字服务，一经开通不支持退换，购买前请知悉相关条款。</li>
        </ul>
      </section>

      <section className="mt-14 rounded-2xl bg-brand-50 p-8 text-center">
        <h2 className="text-xl font-semibold text-brand-900">机构合作</h2>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-brand-700">
          我们面向殡仪馆、陵园及民政部门提供“殡葬文化数字化技术服务”。
          如有合作意向，欢迎通过客服邮箱联系。
        </p>
        <a
          href="mailto:service@example.com"
          className="mt-5 inline-block rounded-md bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
        >
          service@example.com
        </a>
      </section>

      <div className="mt-10 text-center">
        <Link href="/" className="text-sm text-brand-500 hover:underline">
          ← 返回首页
        </Link>
      </div>
    </div>
  );
}

function ValueCard({ t, d }: { t: string; d: string }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5 shadow-sm">
      <div className="font-semibold text-brand-900">{t}</div>
      <p className="mt-2 text-sm leading-6 text-brand-500">{d}</p>
    </div>
  );
}

function Milestone({ time, t, d }: { time: string; t: string; d: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-bold text-accent-600">{time}</span>
        <span className="font-semibold text-brand-900">{t}</span>
      </div>
      <p className="mt-1 text-sm text-brand-600">{d}</p>
    </div>
  );
}
