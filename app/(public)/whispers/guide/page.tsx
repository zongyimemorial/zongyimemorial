import Link from "next/link";

export const metadata = {
  title: "午夜悄悄话 · 使用指引 · 宗忆堂",
  description:
    "三分钟学会安全地使用「午夜悄悄话」：馆主如何布置装置、来访者如何开始对话，以及授权、隐私、情绪关照等安全须知。",
};

const OWNER_STEPS = [
  {
    n: "1",
    title: "创建追思装置",
    body: "登录后进入 控制台 → 午夜悄悄话 → 新建装置。选择要挂载的纪念馆，为逝者起一个称呼（如「爸爸」「李老先生」）。",
  },
  {
    n: "2",
    title: "填写生平资料",
    body: "称呼、身份、性格特征、生平概述、语气方言、口头禅……写得越像，AI 越接近他/她。这些资料仅用于对话中的性格还原，不会对外展示。",
  },
  {
    n: "3",
    title: "上传声音样本（可选）",
    body: "上传逝者生前的录音，可克隆出熟悉的声线。不上传也可以——平台提供多款预设声线。声音克隆必须先完成家属授权与伦理审查。",
  },
  {
    n: "4",
    title: "提交审核与授权",
    body: "提交后由平台人工审核。需要：近亲属单独同意的授权书（可在线填写、身份证号加密保存）、其他近亲属无异议确认；涉声音克隆另需伦理审查。",
  },
  {
    n: "5",
    title: "开启对话",
    body: "审核通过后打开「对话开启」开关，装置即出现在午夜悄悄话列表，来访者可进入对话。家属可随时关闭或删除装置。",
  },
];

const VISITOR_STEPS = [
  {
    n: "1",
    title: "选择一个 TA",
    body: "在午夜悄悄话列表页，点开想说话的装置卡片（如「示例·李老先生」），进入对话窗口。",
  },
  {
    n: "2",
    title: "告诉 TA 你的心情",
    body: "进对话前可以先选此刻的心情：平静、想念、难过、自责、有喜事、说不上来——也可以跳过。TA 会根据心情调整说话的方式。",
  },
  {
    n: "3",
    title: "说说话",
    body: "可以打字，也可以按住麦克风说话，TA 会用熟悉的声音回应。想念不必一次说完，随时可以再来。",
  },
  {
    n: "4",
    title: "回顾说过的话",
    body: "对话页右上角「回顾说过的话」可查看历史会话与心情轨迹。这里只有你自己能看到。",
  },
];

const SAFETY = [
  {
    icon: "🤖",
    title: "始终知道这是 AI",
    body: "每次对话页面都有醒目的「AI 生成」标识，每条回复都带不可篡改的 AI 元数据标签。TA 是由数据库与算法还原的思念载体，不是逝者本人。",
  },
  {
    icon: "📜",
    title: "授权与伦理双闸门",
    body: "声音与生前的表达方式受法律保护。装置上线必须凭逝者生前的意愿与近亲属的单独同意；涉声音克隆的还须通过平台伦理审查，不通过立即下线。",
  },
  {
    icon: "💛",
    title: "你的心情被认真对待",
    body: "如果你连续多次处在难过或自责里，页面会出现一条温和的提示，附上全国心理援助热线 12356。这不是冷冰冰的拦截，而是想陪你想得更远。",
  },
  {
    icon: "⏳",
    title: "45 分钟温柔上限",
    body: "单次对话约 45 分钟时，TA 会轻轻提醒你休息。深夜思念很真实，但睡眠和吃饭也很重要。",
  },
  {
    icon: "🔒",
    title: "对话只有你能看见",
    body: "对话记录仅会话本人可见——连装置的创建者、平台管理员都看不到原文。馆主能看到的只有会话数、条数等汇总统计。",
  },
  {
    icon: "🗑️",
    title: "随时可以删除",
    body: "装置创建者可在控制台一键删除装置：对话记录、声音样本、授权资料（含加密身份证号）全部永久删除，符合《个人信息保护法》第 47 条的删除权。",
  },
];

const FAQ = [
  {
    q: "TA 真的是「他/她」在说话吗？",
    a: "不是。TA 是根据生平资料与声音样本，由 AI 还原的追思空间——说得再像，也只是算法对思念的承接。请把它当作一个可以安放想念的地方，而不是逝者的复活。",
  },
  {
    q: "为什么有的装置没有声音？",
    a: "声音来自声音克隆（需上传样本并通过伦理审查）或平台预设声线。若装置尚未完成克隆流程，将使用通用声线或纯文字回复。当前演示模式下回复为文字演示。",
  },
  {
    q: "其他家人能看到我的对话吗？",
    a: "不能。对话记录仅会话本人可见。若你希望分享某段话，请自行截图——这也是你自己的权利。",
  },
  {
    q: "我想彻底删除所有数据，怎么办？",
    a: "装置创建者：控制台 → 对应装置 → 页面底部「删除追思装置」，输入装置名称确认后，全部数据（含对话、声音、授权）立即永久删除。来访者：平台保留 12 个月对话日志用于合规留痕，到期自动清理；你也可以联系客服申请提前删除本人对话。",
  },
  {
    q: "使用中情绪很不好，能找谁？",
    a: "全国心理援助热线 12356（24 小时）。思念不是病，但如果它压得你喘不过气，请一定让专业的人陪你一会儿。",
  },
];

export default function WhisperGuidePage() {
  return (
    <div className="container-page max-w-4xl py-10">
      {/* —— Hero —— */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-900 p-8 text-white shadow-md">
        <p className="text-xs tracking-wide text-accent-300">纪念馆 · 追思对话 · 操作指引</p>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold">
          <span aria-hidden="true">🌙</span> 午夜悄悄话 · 使用指引
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-100">
          想念一个人的时候，来说说话。这份指引告诉你如何安全、安心地使用这个板块——
          从布置一个装置，到说出第一句话，再到随时可以转身离开。
        </p>
      </div>

      {/* —— 它是什么 / 不是什么 —— */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-brand-900">先说清楚：它是什么，不是什么</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-5">
            <h3 className="font-medium text-brand-800">它是 ✓</h3>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-brand-700">
              <li>· 一个用 AI 还原逝者声音与说话方式的追思空间</li>
              <li>· 一个可以慢慢说完「没来得及说的话」的地方</li>
              <li>· 全程标注 AI 生成、可随时退出、可彻底删除</li>
            </ul>
          </div>
          <div className="rounded-xl border border-brand-100 bg-brand-100/70 p-5">
            <h3 className="font-medium text-brand-700">它不是 ✗</h3>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-brand-600">
              <li>· 不是逝者本人，也不是「数字复活」</li>
              <li>· 没有会动的数字人形象——只有声音与文字</li>
              <li>· 不做商业营销，不会借逝者推销任何商品</li>
            </ul>
          </div>
        </div>
      </section>

      {/* —— 馆主五步 —— */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-brand-900">如果你是馆主：五步布置一个装置</h2>
        <div className="mt-4 space-y-3">
          {OWNER_STEPS.map((s) => (
            <div
              key={s.n}
              className="flex gap-4 rounded-xl border border-brand-100 bg-brand-100/70 p-5 shadow-sm"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-800 text-sm font-semibold text-white">
                {s.n}
              </span>
              <div>
                <h3 className="font-medium text-brand-900">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-brand-600">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-brand-500">
          入口：登录后 → 顶部导航「控制台」→ 左侧「午夜悄悄话」。
        </p>
      </section>

      {/* —— 来访者四步 —— */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-brand-900">如果你想说话：四步开始对话</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {VISITOR_STEPS.map((s) => (
            <div
              key={s.n}
              className="rounded-xl border border-brand-100 bg-brand-100/70 p-5 shadow-sm"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-300 text-xs font-semibold text-brand-900">
                {s.n}
              </span>
              <h3 className="mt-2 font-medium text-brand-900">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-brand-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* —— 安全须知 —— */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-brand-900">安全须知：请花一分钟读完</h2>
        <p className="mt-1 text-sm text-brand-500">
          这一条不是走形式——「午夜悄悄话」所有功能设计都围绕下面六条展开。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SAFETY.map((s) => (
            <div
              key={s.title}
              className="rounded-xl border border-brand-100 bg-brand-50/40 p-5"
            >
              <span className="text-2xl" aria-hidden="true">
                {s.icon}
              </span>
              <h3 className="mt-2 font-medium text-brand-900">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-brand-600">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-accent-300/70 bg-accent-50/50 p-5">
          <h3 className="font-medium text-brand-900">需要帮助的时候</h3>
          <p className="mt-1 text-sm leading-relaxed text-brand-700">
            全国心理援助热线{" "}
            <span className="font-semibold text-brand-900">12356</span>
            （24 小时）。如果思念让你难以承受，或对话让你感到不适，请随时停下并寻求支持——
            平台的危机干预机制也会在检测到相关信号时，提供同样的热线信息。
          </p>
        </div>
      </section>

      {/* —— FAQ —— */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-brand-900">常见问题</h2>
        <div className="mt-4 space-y-3">
          {FAQ.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl border border-brand-100 bg-brand-100/70 p-5 shadow-sm"
            >
              <summary className="cursor-pointer list-none font-medium text-brand-900 marker:hidden">
                <span className="mr-2 text-accent-600 group-open:hidden">＋</span>
                <span className="mr-2 hidden text-accent-600 group-open:inline">－</span>
                {f.q}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-brand-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* —— 底部 CTA —— */}
      <div className="mt-10 rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50 to-accent-50/40 p-8 text-center">
        <p className="text-sm text-brand-600">准备好的时候，随时可以开始。</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link
            href="/whispers"
            className="rounded-md bg-brand-800 px-5 py-2.5 text-sm text-white hover:bg-brand-700"
          >
            去看看可以说话的装置
          </Link>
          <Link
            href="/console"
            className="rounded-md border border-brand-200 bg-brand-100/70 px-5 py-2.5 text-sm text-brand-700 hover:bg-brand-50"
          >
            我是馆主，去设立装置
          </Link>
        </div>
      </div>
    </div>
  );
}
