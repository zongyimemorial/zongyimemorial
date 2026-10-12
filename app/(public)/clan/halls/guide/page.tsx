import Link from "next/link";

export const metadata = {
  title: "宗祠设立指引 · 宗忆堂",
  description:
    "从实名认证到设立宗祠、填写源流字辈、装修宗祠与邀请宗亲，一步步教你建起一族之祠。",
};

const TOC = [
  { id: "why", t: "一、为什么要建数字宗祠" },
  { id: "prepare", t: "二、设立前需要准备什么" },
  { id: "steps", t: "三、分步设立流程" },
  { id: "source", t: "四、源流与字辈怎么填" },
  { id: "include", t: "五、宗祠能包含什么" },
  { id: "decor", t: "六、宗祠装修要点" },
  { id: "privacy", t: "七、实名、审核与隐私" },
  { id: "faq", t: "八、常见问题" },
];

const steps = [
  {
    n: "1",
    t: "注册账号",
    d: "访问注册页，用手机号或邮箱创建账户。注册即赠体验积分，可用于后续兑换装修素材。",
    tip: "入口：网页右上角「注册」。",
  },
  {
    n: "2",
    t: "完成实名认证",
    d: "进入控制台完成实名（姓名 + 证件，字段级加密存储）。实名是设立宗祠的必要前提，也是防止冒用他人宗族名义的底线。",
    tip: "入口：登录后点击右上角用户名进入「控制台」→ 实名认证。",
  },
  {
    n: "3",
    t: "填写宗祠资料并提交",
    d: "录入姓氏、宗祠名称、堂号，以及郡望、始祖、始迁地、宗祠简介与字辈诗。设立免费，提交后进入人工审核。",
    tip: "入口：宗亲文化交流 → 设立宗祠。填写越完整，越便于各地宗亲溯源认领。",
  },
  {
    n: "4",
    t: "等待审核通过",
    d: "审核期间宗祠对你可见（标注「待审核（仅你可见）」），通过后即对宗亲公开展示。",
    tip: "审核关注：名号是否与族谱相符、是否存在冒名或不当内容。",
  },
  {
    n: "5",
    t: "装修宗祠",
    d: "进入宗祠装修工坊。系统已赠送「祖德流芳」整套模板，永久免费；可挑选更精美的模板与装饰套件，选好后点「保存并完成装修」。",
    tip: "装修指引见《空间装修指引》。选立体模板可呈现可环视的祠堂正殿。",
  },
  {
    n: "6",
    t: "邀请宗亲与建立族谱",
    d: "把宗祠链接分享给各地宗亲，他们可远程上香、献祭、留言。可在族谱设计器中编排谱系图，支持多种传统版式。",
    tip: "宗亲结构与字辈诗会直接体现在宗祠页，填得准，晚辈才查得清。",
  },
];

const includes = [
  "堂号与郡望：宗族识别标志，按族谱记载呈现。",
  "始祖与始迁地：明源流、辨支系，便于各地宗亲认领。",
  "字辈诗 / 派语：世代排序的依据，宗祠页显著展示。",
  "牌位墙：先祖牌位依序陈设，正中安奉始祖画像。",
  "祭祀记录：每次上香、献祭自动留痕，脱敏展示。",
  "族谱谱系图：多种传统版式（欧式、苏式、宝塔式、牒记式等）。",
];

export default function ClanHallGuidePage() {
  return (
    <div className="container-page max-w-3xl py-12">
      <nav className="mb-6 text-sm text-brand-400">
        <Link href="/clan" className="hover:text-brand-700">
          宗亲文化交流
        </Link>{" "}
        / <span className="text-brand-600">宗祠设立指引</span>
      </nav>

      {/* Hero —— 对齐纪念馆指引的突出头部 */}
      <header className="overflow-hidden rounded-2xl bg-brand-900">
        <div className="relative p-7 sm:p-9">
          {/* 祠堂正殿剪影装饰 */}
          <svg
            className="pointer-events-none absolute right-0 top-0 h-44 w-44 translate-x-1/4 -translate-y-1/4 text-brand-50/10"
            viewBox="0 0 200 120"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 56 Q100 6 182 56" />
            <path d="M18 56 L6 66 M182 56 L194 66" />
            <path d="M40 60 V112 M100 60 V112 M160 60 V112" />
            <path d="M28 60 H172" />
          </svg>
          <h1 className="relative text-3xl font-semibold text-white sm:text-4xl">
            宗祠设立指引
          </h1>
          <p className="relative mt-3 max-w-xl leading-7 text-brand-100">
            宗祠是宗族的精神所系。数字宗祠让分散各地的宗亲能共同祭祖、核对谱系、
            追溯源流 —— 不必等到清明返乡，也能在祠堂里上一炷香。
            <strong className="text-white">设立宗祠免费</strong>，装修按需升级。
          </p>
        </div>
      </header>

      <nav className="mt-8 rounded-xl border border-brand-200 bg-brand-50 p-5">
        <div className="text-xs font-medium text-brand-700">目录</div>
        <ul className="mt-2 grid gap-1.5 text-[13px] sm:grid-cols-2">
          {TOC.map((x) => (
            <li key={x.id}>
              <a href={`#${x.id}`} className="text-brand-600 hover:text-accent-600 hover:underline">
                {x.t}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="why" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">一、为什么要建数字宗祠</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>
            <strong>族人分散，祠堂难聚。</strong>宗亲散居各地，线下祭祖成本高；
            数字宗祠让祭祖不受地域与时间限制。
          </li>
          <li>
            <strong>谱系易断。</strong>字辈、源流若只凭口传，几代之后便含糊。
            数字宗祠把字辈诗与谱系固定下来，晚辈随时可查。
          </li>
          <li>
            <strong>祭祀留痕。</strong>谁在何时上香、献了什么，都有记录（对外脱敏展示），
            既是礼数，也是传承的凭据。
          </li>
        </ul>
      </section>

      <section id="prepare" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">二、设立前需要准备什么</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["族谱或家乘", "用于核对堂号、郡望、始祖与字辈诗。没有族谱也可凭长辈口述整理。"],
            ["宗祠名号", "如「陇西李氏宗祠」＋堂号如「敦本堂」。名号要与族谱记载一致。"],
            ["字辈诗 / 派语", "每行一句，也可整段粘贴。这是宗祠页的核心内容之一。"],
            ["始祖与始迁地", "如始祖李广、祖籍甘肃陇西。可留空，但填了更便于宗亲认领。"],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
              <div className="text-sm font-medium text-brand-900">{t}</div>
              <p className="mt-1.5 text-[13px] leading-6 text-gray-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="steps" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">三、分步设立流程</h2>
        <div className="mt-5 space-y-4">
          {steps.map((s) => (
            <div key={s.n} className="rounded-lg border border-brand-200 bg-brand-100/70 p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-600 text-sm font-bold text-white">
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

      <section id="source" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">四、源流与字辈怎么填</h2>
        <div className="mt-3 space-y-3 text-sm leading-7 text-gray-700">
          <p>
            <strong>堂号</strong>是宗族的分支标志，如「敦本堂」「三槐堂」；
            <strong>郡望</strong>标明发祥地，如「陇西」「太原」。二者常常一起出现
            （"陇西李氏 · 敦本堂"）。
          </p>
          <p>
            <strong>字辈诗（派语）</strong>用于排定世代。填写时建议：
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>每行一句，或整段粘贴 —— 系统会按行整理，不要求严格对仗。</li>
            <li>对照族谱原文录入，不要凭印象改写；错一字可能误导数代。</li>
            <li>若族谱有不同版本，以本族祠堂现存碑刻或最老抄本为准。</li>
          </ul>
          <p className="rounded-lg border border-accent-200 bg-accent-50 p-4 text-[13px] text-accent-800">
            字辈诗与宗祠简介提交后会经人工审核。<strong>请勿填写与宗族无关的内容</strong>，
            也不要录入在世族人的隐私信息。
          </p>
        </div>
      </section>

      <section id="include" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">五、宗祠能包含什么</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {includes.map((t) => (
            <div key={t} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4 text-sm text-brand-700 shadow-sm">
              {t}
            </div>
          ))}
        </div>
      </section>

      <section id="decor" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">六、宗祠装修要点</h2>
        <div className="mt-3 space-y-3 text-sm leading-7 text-gray-700">
          <p>
            宗祠装修与纪念馆共用同一套体系，但构件更建筑化：墙面用青砖、夯土、金丝楠木，
            挂饰含石狮、青铜香炉、牌位墙、幡旗，还有山门、天井、正殿等立体空间。
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>建祠赠品是「祖德流芳」</strong>，含牌位墙与青铜香炉等，永久免费。
            </li>
            <li>
              先祖画像安奉在<strong>牌位墙正中的大龛</strong>里（香案正上方），
              上传画像后自动生效。
            </li>
            <li>选立体模板（如山门气象、天井庭院、高堂大殿、牌位寝堂）可呈现可环视的祠堂空间。</li>
          </ul>
          <p className="text-[13px] text-brand-500">
            完整说明见
            <Link href="/guide/decor" className="ml-1 font-medium text-accent-600 hover:underline">
              《空间装修指引》
            </Link>
            。
          </p>
        </div>
      </section>

      <section id="privacy" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">七、实名、审核与隐私</h2>
        <div className="mt-3 space-y-3 text-sm leading-7 text-gray-700">
          <p>
            <strong>实名</strong>用于确认设立人身份，防止冒用他族名义立祠。
            姓名与证件信息经字段级加密存储，<strong>不会</strong>在宗祠页公开展示。
          </p>
          <p>
            <strong>祭祀记录</strong>采用「实名但脱敏」的口径：访客看到的是脱敏后的称呼
            （如「李*明」），完整实名仅管理台可见，用于必要时的核对。
            记录在写入时即固定下来，后续修改实名不会回溯改写历史记录。
          </p>
          <p>
            <strong>审核</strong>包括内容合规与名号真实性。若名号与族谱明显不符、
            或存在冒名情形，可能被驳回并要求补充材料。
          </p>
        </div>
      </section>

      <section id="faq" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">八、常见问题</h2>
        <div className="mt-4 space-y-4">
          {[
            {
              q: "设立宗祠收费吗？",
              a: "免费。填写资料提交即可，只有装修素材需要积分或付费（建祠赠送的「祖德流芳」永久免费）。",
            },
            {
              q: "同一个姓氏可以建多个宗祠吗？",
              a: "可以。堂号与郡望是区分不同支系的依据，不同支系各自立祠是常见做法。",
            },
            {
              q: "没有族谱、字辈记不清怎么办？",
              a: "字辈可留空后再补；也可先填长辈口述的版本并注明「待考」。名号与堂号务必尽量准确。",
            },
            {
              q: "审核期间我能看到自己的宗祠吗？",
              a: "能。审核期间标注「待审核（仅你可见）」，通过后对宗亲公开。",
            },
            {
              q: "族谱谱系图支持哪些版式？",
              a: "支持欧式、苏式、宝塔式、牒记式等传统版式，另有描金欧式、绢帛苏式、丹青宝塔等进阶样式。",
            },
            {
              q: "上香献祭的记录会公开我的名字吗？",
              a: "不会。对外只显示脱敏称呼，完整实名仅平台管理台在必要时可见。",
            },
          ].map((f) => (
            <details
              key={f.q}
              className="group rounded-xl border border-brand-200 bg-brand-100/70 p-5 shadow-sm [&_summary]:cursor-pointer"
            >
              <summary className="flex items-center justify-between font-semibold text-brand-900">
                <span>{f.q}</span>
                <span className="ml-4 text-accent-600 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-7 text-brand-700">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-brand-200 pt-6">
        <Link
          href="/clan/halls/new"
          className="rounded-lg bg-accent-600 px-5 py-2.5 text-sm text-white hover:bg-accent-700"
        >
          立即设立宗祠
        </Link>
        <Link
          href="/guide/decor"
          className="rounded-lg border border-brand-300 px-5 py-2.5 text-sm text-brand-700 hover:bg-gray-50"
        >
          空间装修指引
        </Link>
        <Link
          href="/halls/guide"
          className="rounded-lg border border-brand-300 px-5 py-2.5 text-sm text-brand-700 hover:bg-gray-50"
        >
          纪念馆创建指引
        </Link>
      </div>
    </div>
  );
}
