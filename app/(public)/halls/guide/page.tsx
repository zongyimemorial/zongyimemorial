import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "纪念馆创建引导",
  description:
    "从注册实名到开通空间、填写生平、邀请亲友，一步步教你创建一座数字纪念馆。",
};

const TOC = [
  { id: "why", t: "一、为什么要建数字纪念馆" },
  { id: "prepare", t: "二、创建前需要准备什么" },
  { id: "steps", t: "三、分步创建流程" },
  { id: "bio", t: "四、填写生平的小贴士" },
  { id: "include", t: "五、纪念馆能包含什么" },
  { id: "privacy", t: "六、实名与隐私" },
  { id: "faq", t: "七、常见问题" },
];

const steps = [
  {
    n: "1",
    t: "注册账号",
    d: "访问注册页，用手机号或邮箱创建一个账户。注册即赠体验积分，可直接用于后续兑换。",
    tip: "入口：网页右上角「注册」。",
  },
  {
    n: "2",
    t: "完成实名认证",
    d: "进入控制台完成实名（姓名 + 证件，字段级加密存储）。实名是为了防止冒用他人身份、守护真实的缅怀，也是开通纪念空间的必要前提。",
    tip: "入口：登录后点击右上角用户名进入「控制台」→ 实名认证。",
  },
  {
    n: "3",
    t: "提交免费建馆申请",
    d: "填写逝者姓名、火化证明编号、经办人证件与手机号等实名材料，免费提交。人工审核通过后空间开通、对公众展示，免费版永久保存。",
    tip: "入口：纪念馆列表页 →「免费申请建馆」；建馆免费，需先完成实名认证。",
  },
  {
    n: "4",
    t: "填写生平与上传照片",
    d: "录入逝者姓名、生卒年、生平简介，上传老照片与纪念视频。生平可由你亲自撰写，也可委托平台的生平传记代写服务。",
    tip: "录入后随时可修改补充，纪念馆会随资料完善而更丰满。",
  },
  {
    n: "5",
    t: "邀请亲友与设置公开",
    d: "把纪念馆链接分享给亲友，他们可远程献花、点灯、留言。你可设置纪念馆是否对公众可见；若仅亲友可见，可通过专属链接访问。",
    tip: "公开内容会经机器预筛 + 人工终审，确保合规庄重。",
  },
];

const includes = [
  "生平简介：庄重得体的生平记录，可委托专业文案代写。",
  "照片与影像：收录老照片与纪念视频，让音容长留。",
  "亲友留言：亲友可远程追思、写下寄语，共同缅怀。",
  "献花与点灯：虚拟献花、电子长明灯，思念长明。",
  "扫码云碑：二维码铭牌贴于墓碑，扫码即达纪念馆。",
  "家族谱系：家族纪念馆支持多位逝者与谱系并列。",
];

const faqs = [
  {
    q: "创建纪念馆要收费吗？",
    a: "免费建立、免费版永久保存，只需先完成实名认证并通过人工审核。装修素材里精美款可积分兑换或付费解锁（到期需续费，未续费自动回退免费档）；实名、注册与基础浏览均免费。",
  },
  {
    q: "我不是家属也能建馆吗？",
    a: "为避免冒用，建馆需完成实名；纪念馆内容应尊重逝者及家属意愿。如涉及争议，平台将依合规流程处理。",
  },
  {
    q: "资料以后能改吗？",
    a: "可以。生平、照片、视频均可在控制台随时补充与修改，纪念馆会随资料完善而更完整。",
  },
  {
    q: "纪念馆会一直存在吗？",
    a: "会。免费版纪念馆永久保存，不存在到期下线。装修升级（素材/模板/套件）与空间存储订阅到期后如未续费，仅退回免费版外观与容量，生平、照片与留言全部保留，续费即恢复。",
  },
];

export default function HallGuidePage() {
  return (
    <div className="container-page max-w-3xl py-12">
      {/* Hero */}
      <header className="overflow-hidden rounded-2xl bg-brand-900">
        <div className="relative h-44 w-full">
          <Image
            src="/assets/hall-guide.jpg"
            alt="创建数字纪念馆引导"
            fill
            sizes="(min-width: 1280px) 768px, 100vw"
            className="object-cover"
          />
        </div>
        <div className="p-7">
          <h1 className="text-3xl font-semibold text-white">纪念馆创建引导</h1>
          <p className="mt-2 max-w-xl text-brand-100">
            从注册实名到开通空间、填写生平、邀请亲友，五步即可为逝者建起一座
            随时可达的数字纪念空间。
          </p>
        </div>
      </header>

      {/* 目录 */}
      <nav className="mt-8 rounded-xl border border-gray-100 bg-brand-50 p-5">
        <div className="mb-3 text-sm font-semibold text-brand-800">本文目录</div>
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

      {/* 一、为什么要建 */}
      <section id="why" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">
          一、为什么要建数字纪念馆
        </h2>
        <p className="mt-3 leading-7 text-gray-700">
          人生故事的载体，从石碑、相册走到了云端。数字纪念馆不改变实地祭扫，
          而是给思念加了一扇随时可推开的大门：当你无法亲临现场，或想把祖辈的故事
          讲给远方的后人听，它就在那里。它让缅怀从「某个特定的日子」延展成
          「随时可抵达的温柔」。
        </p>
      </section>

      {/* 二、准备 */}
      <section id="prepare" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">
          二、创建前需要准备什么
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
          <li>
            <strong>实名资料</strong>：建馆人的姓名与证件信息（用于实名认证，加密存储）。
          </li>
          <li>
            <strong>逝者基本信息</strong>：姓名、生卒年；如有，准备一段生平简介。
          </li>
          <li>
            <strong>照片与影像</strong>：老照片、纪念视频等，越丰富，纪念馆越有温度。
          </li>
          <li>
            <strong>亲友名单</strong>：想邀请哪些人共同缅怀，准备好分享链接的对象。
          </li>
        </ul>
      </section>

      {/* 三、分步流程 */}
      <section id="steps" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">三、分步创建流程</h2>
        <div className="mt-5 space-y-4">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-700 text-sm font-bold text-white">
                  {s.n}
                </div>
                <div>
                  <div className="font-semibold text-brand-900">{s.t}</div>
                  <p className="mt-1 text-sm leading-7 text-gray-700">{s.d}</p>
                  <p className="mt-2 text-xs text-accent-600">{s.tip}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 四、生平小贴士 */}
      <section id="bio" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">
          四、填写生平的小贴士
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
          <li>时间线清晰：从出生、重要经历到晚年，按时间顺序更易读。</li>
          <li>细节动人：一句口头禅、一件小事，比空泛的赞美更让人记得。</li>
          <li>语气庄重而温暖：追思不是修饰，是真诚地把人讲回来。</li>
          <li>
            不会写也没关系：商城提供<strong>生平传记代写</strong>服务，由专业文案协助完成。
          </li>
        </ul>
      </section>

      {/* 五、包含什么 */}
      <section id="include" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">
          五、纪念馆能包含什么
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {includes.map((t) => (
            <div
              key={t}
              className="rounded-lg border border-gray-100 bg-white p-4 text-sm text-brand-700 shadow-sm"
            >
              {t}
            </div>
          ))}
        </div>
      </section>

      {/* 六、实名与隐私 */}
      <section id="privacy" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">六、实名与隐私</h2>
        <p className="mt-3 leading-7 text-gray-700">
          建馆前需完成实名，目的是防止冒用他人身份、守护真实的缅怀，并配合内容责任与应急处置。
          证件信息采用字段级加密存放于受控私有存储，不出现在业务日志中；访问与核验均留存日志以便追溯。
          你有权查询与更正授权范围内的个人信息。
        </p>
      </section>

      {/* 七、常见问题 */}
      <section id="faq" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">七、常见问题</h2>
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
          href="/register"
          className="rounded-md bg-accent-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-600"
        >
          注册并创建纪念馆
        </Link>
        <Link
          href="/halls/new"
          className="rounded-md border border-brand-700 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          免费申请建馆
        </Link>
        <Link
          href="/guide/decor"
          className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-gray-50"
        >
          空间装修指引
        </Link>
        <Link
          href="/clan/halls/guide"
          className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-gray-50"
        >
          建宗祠指引
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
