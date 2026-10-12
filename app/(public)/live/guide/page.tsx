import Link from "next/link";
import CopyField from "@/components/site/CopyField";

export const metadata = {
  title: "云直播大厅操作指引 · 宗忆堂",
  description:
    "怎么看直播，以及主办方如何拿到直播地址、配置软硬件推流、在后台发起一场直播的完整步骤。",
};

const TOC = [
  { id: "what", t: "一、云直播大厅能做什么" },
  { id: "watch", t: "二、观众：如何观看与回放" },
  { id: "status", t: "三、状态与分类怎么看" },
  { id: "overview", t: "四、主办方：直播总体流程" },
  { id: "pick", t: "五、选平台：三种方式怎么选" },
  { id: "address", t: "六、取地址：去哪儿拿直播地址" },
  { id: "youtube", t: "　6.1 YouTube Live 取址" },
  { id: "zoom", t: "　6.2 Zoom 取址" },
  { id: "rtmp", t: "　6.3 自建推流（OBS + 云直播）" },
  { id: "hardware", t: "七、软硬件对接与配置" },
  { id: "network", t: "八、网络与现场保障" },
  { id: "publish", t: "九、在后台发布这场直播" },
  { id: "compliance", t: "十、合规与礼仪底线" },
  { id: "caption", t: "十一、实时字幕（内测）" },
  { id: "trouble", t: "十二、故障排查速查表" },
  { id: "faq", t: "十三、常见问题" },
];

const watchSteps = [
  {
    n: "1",
    t: "进入云直播大厅",
    d: "在导航栏点击「云直播」，即可看到全部正在直播、预告与回放档案。",
    tip: "入口：顶部导航「云直播」。",
  },
  {
    n: "2",
    t: "找到想看的活动",
    d: "用顶部「直播中 / 预告 / 回放档案」三个标签切换；也可用类型筛选（公祭仪式、生态安葬仪式、宗祠落成、祭祖大典、追悼会）快速定位。",
    tip: "标红点的卡片，代表此刻正在直播。",
  },
  {
    n: "3",
    t: "点开卡片进入直播间",
    d: "画面在浏览器内自动播放。如需声音，请点击播放器取消静音——无需安装任何软件。",
    tip: "现场画面通过 YouTube Live、Zoom 等免费平台接入。",
  },
  {
    n: "4",
    t: "查看数字档案",
    d: "直播间下方有「数字档案」：实时观看人数、开播与结束时间，以及回放入口，方便反复回看。",
    tip: "回放不会下架，长期保存。",
  },
];

export default function LiveGuidePage() {
  return (
    <div className="container-page max-w-3xl py-12">
      <nav className="mb-6 text-sm text-brand-400">
        <Link href="/live" className="hover:text-brand-700">
          云直播大厅
        </Link>{" "}
        / <span className="text-brand-600">操作指引</span>
      </nav>

      {/* Hero —— 对齐宗祠/建馆指引的突出头部 */}
      <header className="overflow-hidden rounded-2xl bg-brand-900">
        <div className="relative p-7 sm:p-9">
          {/* 直播信号 / 播放装饰 */}
          <svg
            className="pointer-events-none absolute right-0 top-0 h-44 w-44 translate-x-1/4 -translate-y-1/4 text-brand-50/10"
            viewBox="0 0 200 120"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M68 44 L102 60 L68 76 Z" />
            <path d="M118 44 Q140 60 118 76" />
            <path d="M134 36 Q168 60 134 84" />
          </svg>
          <h1 className="relative text-3xl font-semibold text-white sm:text-4xl">
            云直播大厅操作指引
          </h1>
          <p className="relative mt-3 max-w-xl leading-7 text-brand-100">
            殡葬祭祀重大事件、宗亲宗族大型活动的官方直播，浏览器内直接观看，
            结束后自动转为<strong className="text-white">回放档案</strong>，长期保存、随时回看。
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

      <section id="what" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">一、云直播大厅能做什么</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>
            <strong>重大事件直播。</strong>公祭仪式、生态安葬仪式、追悼会等庄重现场，让无法到场的亲友同步参与、远程送别。
          </li>
          <li>
            <strong>宗族活动直播。</strong>宗祠落成、祭祖大典等大型活动，分散各地的宗亲也能共同见证。
          </li>
          <li>
            <strong>现场画面零门槛接入。</strong>通过 YouTube Live、Zoom 等免费平台推流，观众用浏览器直接观看，无需安装额外软件。
          </li>
          <li>
            <strong>直播即档案。</strong>每场直播结束后自动转为回放，纳入平台数字档案长期保存，不会下架。
          </li>
        </ul>
      </section>

      <section id="watch" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">二、观众：如何观看与回放</h2>
        <div className="mt-5 space-y-4">
          {watchSteps.map((s) => (
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

      <section id="status" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">三、状态与分类怎么看</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["直播中", "红标 + 脉冲圆点，代表此刻正在实时直播，点击即看。"],
            ["预告", "尚未开播，卡片显示计划开播时间，可先收藏等待。"],
            ["回放档案", "已结束的直播，长期保存、随时回看，不会下架。"],
            ["五大分类", "公祭仪式 / 生态安葬仪式 / 宗祠落成 / 祭祖大典 / 追悼会，便于快速筛选。"],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
              <div className="text-sm font-medium text-brand-900">{t}</div>
              <p className="mt-1.5 text-[13px] leading-6 text-gray-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="caption" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">四、实时字幕（内测）</h2>
        <div className="mt-3 space-y-3 text-sm leading-7 text-gray-700">
          <p>
            实时字幕当前为<strong>内测占位</strong>。公开阶段将接入语音转写，为听障亲友与静音观看场景提供字幕。
          </p>
          <p>
            字幕功能上线前需经过<strong>家属授权与数据合规评估</strong>，确保庄重、合规、尊重逝者与家属意愿。敬请期待。
          </p>
        </div>
      </section>

      {/* ============ 主办方：取地址 + 软硬件配置（本次扩充主体） ============ */}

      <section id="overview" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">五、主办方：直播总体流程</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          一场直播从零到上线共 <strong>6 步</strong>。建议提前 <strong>1～2 天</strong>完成前 5 步，
          当天只做「开播」这一个动作，避免现场手忙脚乱。
        </p>
        <ol className="mt-4 space-y-3">
          {/*
            ⚠️ 这里刻意**不写「见第X节」**。
            早先用编号交叉引用，结果增删一节就得回来逐条改编号，
            漏改就成了死链（本次修编号时一次要改 7 处）。
            改成按**节名**引用：章节顺序再怎么调，这句话都还成立。
          */}
          {[
            ["1", "选平台", "决定用 YouTube Live、Zoom 还是自建推流（见「选平台」一节）。", "场地网络差 → 优先 YouTube；需要多方致辞连麦 → 优先 Zoom。"],
            ["2", "建直播", "在所选平台创建一场直播，拿到「直播地址 / 推流地址」（见「取地址」一节）。", "这一步在平台侧完成，不在本平台。"],
            ["3", "配软硬件", "相机或手机取景、麦克风拾音、编码推流（见「软硬件对接与配置」一节）。", "先本地录制测试 5 分钟再上真场。"],
            ["4", "现场保障", "网络备份、供电备份、设备预热（见「网络与现场保障」一节）。", "手机热点必须提前开卡测速。"],
            ["5", "填后台", "把地址粘进「直播管理 → 新建直播」，先设为「预告」（见「在后台发布这场直播」一节）。", "预告期可反复改（点列表里的「编辑」），不影响观众。"],
            ["6", "当天开播", "到时间在「直播管理」点「编辑」把状态改为「直播中」，结束后改为「回放」。", "改状态即自动记入开播 / 结束时间，无需手工填。"],
          ].map(([n, t, d, tip]) => (
            <li key={n} className="rounded-lg border border-brand-200 bg-brand-100/70 p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-600 text-sm font-bold text-white">{n}</div>
                <div className="min-w-0">
                  <div className="font-semibold text-brand-900">{t}</div>
                  <p className="mt-1 text-sm leading-7 text-gray-700">{d}</p>
                  <p className="mt-2 text-xs text-accent-600">{tip}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="pick" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">六、选平台：三种方式怎么选</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          本平台<strong>不自己承接视频流</strong> —— 画面由第三方平台承载，我们只负责把它嵌进直播间页面。
          所以第一步必须先在下面三种里选一种。
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-200 bg-brand-50 text-left">
                <th className="p-3 font-medium text-brand-900">方式</th>
                <th className="p-3 font-medium text-brand-900">适合场景</th>
                <th className="p-3 font-medium text-brand-900">费用</th>
                <th className="p-3 font-medium text-brand-900">后台接入方式</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {[
                ["YouTube Live", "单机位、大场面、观看人数多；网络条件一般", "免费（需能访问 YouTube）", "iframe 嵌入"],
                ["Zoom", "需要多方连麦致辞、异地主持人、参会者发言", "免费版限 40 分钟；付费版不限", "iframe 嵌入"],
                ["自建推流（OBS + 云直播）", "需要多机位切换、字幕包装、专业控台", "云厂商按流量计费，通常几十元起", "视频流（HLS / mp4）"],
              ].map((r) => (
                <tr key={r[0]} className="border-b border-brand-100">
                  {r.map((c, i) => (
                    <td key={i} className={"p-3 align-top " + (i === 0 ? "font-medium text-brand-900" : "")}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 rounded-lg border border-accent-200 bg-accent-50 p-4 text-[13px] leading-6 text-accent-800">
          <strong>选择建议：</strong>多数宗祠落成、祭祖大典场景，用 <strong>YouTube Live 单机位</strong>就够了 ——
          免费、稳定、观看端不装任何软件。只有"需要异地宗亲轮流致辞"时，才上 Zoom。
        </div>
      </section>

      <section id="address" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">七、取地址：去哪儿拿直播地址</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          这是<strong>最容易出错的一步</strong>。下面三种方式各自讲清楚：地址在哪个界面、
          点哪个按钮、拿到长什么样、以及哪些地址<strong>不能用</strong>。
        </p>
      </section>

      <section id="youtube" className="mt-8 scroll-mt-20">
        <h3 className="text-xl font-semibold text-brand-900">7.1 YouTube Live 取址</h3>

        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm font-semibold text-brand-900">第一步：在 YouTube 开一场直播</div>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-6 text-gray-700">
            <li>用电脑浏览器打开 <code className="rounded bg-white px-1 py-0.5 text-[12px]">studio.youtube.com</code>（YouTube 工作室）。</li>
            <li>点右上角<strong>「创建」→「开始直播」</strong>。首次使用需等 YouTube 开通直播权限（最长 24 小时）。</li>
            <li>填写标题（如「李氏宗祠落成典礼」）、可见范围选<strong>「公开」</strong>、<strong>务必勾选「允许嵌入」</strong>（默认是勾选的，别取消）。</li>
            <li>进入推流界面后，左侧切换<strong>「直播控制室」→「嵌入」</strong>标签。</li>
          </ol>
        </div>

        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm font-semibold text-brand-900">第二步：复制「嵌入地址」</div>
          <p className="mt-2 text-[13px] leading-6 text-gray-700">
            在「嵌入」标签里，YouTube 会直接给出带 iframe 的完整代码。你只需要<strong>其中 src 的地址</strong>，
            形如：
          </p>
          <div className="mt-3">
            <CopyField label="YouTube 嵌入地址（粘贴进后台「播放地址」）" value="https://www.youtube.com/embed/VIDEO_ID" />
          </div>
          <p className="mt-3 text-[12px] leading-6 text-brand-500">
            把 <code className="rounded bg-white px-1 text-[11px]">VIDEO_ID</code> 换成你这场直播的 11 位视频 ID
            （就是观看地址 <code className="rounded bg-white px-1 text-[11px]">watch?v=</code> 后面那串）。
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-5">
          <div className="text-sm font-semibold text-red-800">⚠️ 三个常见错误（会导致直播间黑屏）</div>
          <ul className="mt-2 space-y-2 text-[13px] leading-6 text-red-900">
            <li>
              <strong>错：直接填观看页地址。</strong>
              <code className="rounded bg-white px-1 text-[12px]">https://www.youtube.com/watch?v=xxxx</code>{" "}
              是给人看的页面，<strong>不允许被嵌入</strong>，填进后台会显示"拒绝连接"。
              必须改成 <code className="rounded bg-white px-1 text-[12px]">/embed/</code> 形式。
            </li>
            <li>
              <strong>错：填了你自己剪辑用的地址。</strong>要用即可「直播」那场的地址，不是上次活动的回放。
            </li>
            <li>
              <strong>错：主播在 YouTube 侧忘了点「开始直播」。</strong>视频 ID 有了不等于已推流；
              推流端没连上时，嵌入页会一直显示等待。
            </li>
          </ul>
        </div>

        <div className="mt-4 rounded-lg border border-brand-200 bg-white p-5">
          <div className="text-sm font-semibold text-brand-900">进阶：用「频道常驻地址」避免每次换视频 ID</div>
          <p className="mt-2 text-[13px] leading-6 text-gray-700">
            每开一场直播，视频 ID 都会变。<strong>固定场景（如宗祠常设机位）</strong>可用频道地址，
            它会自动指向该频道当前正在直播的那一场：
          </p>
          <div className="mt-3">
            <CopyField
              label="频道常驻直播地址（CHANNEL_ID 换成你的频道 ID）"
              value="https://www.youtube.com/embed/live_stream?channel=CHANNEL_ID"
            />
          </div>
          <p className="mt-3 text-[12px] leading-6 text-brand-500">
            频道 ID 在 <strong>YouTube 工作室 → 设置 → 频道 → 高级设置</strong> 里取，
            以 <code className="rounded bg-white px-1 text-[11px]">UC</code> 开头、共 24 位 ——
            注意它<strong>不是</strong>你的 @昵称，填错会黑屏。
          </p>
        </div>
      </section>

      <section id="zoom" className="mt-8 scroll-mt-20">
        <h3 className="text-xl font-semibold text-brand-900">7.2 Zoom 取址</h3>

        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-5">
          <div className="text-sm font-semibold text-red-800">⚠️ 先记住：Zoom 参会链接不能直接嵌</div>
          <p className="mt-2 text-[13px] leading-6 text-red-900">
            <code className="rounded bg-white px-1 text-[12px]">https://zoom.us/j/123456789</code>{" "}
            这种「参会链接」是<strong>给人点进去开会用的</strong>，Zoom 默认禁止它被放进 iframe，
            嵌进直播间会显示"拒绝连接"。必须走下面的「嵌入直播」流程拿专用地址。
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm font-semibold text-brand-900">正确做法：用 Zoom Events 的「嵌入直播」</div>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-6 text-gray-700">
            <li>登录 <code className="rounded bg-white px-1 py-0.5 text-[12px]">Zoom Events</code>（需 Pro / Business / Enterprise 账号）。</li>
            <li>创建或编辑一场活动（单场：<strong>直播会议 → 嵌入控件</strong>；多场：<strong>活动体验 → 大堂 → 嵌入直播</strong>）。</li>
            <li>
              配置嵌入项：
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li><strong>嵌入大小</strong>：选「响应式」，自适应手机与电脑；</li>
                <li><strong>允许全屏</strong>：开启（观众可放大看仪式细节）；</li>
                <li><strong>可信域</strong>：填本平台域名，限制只能在被批准的站点播放；</li>
                <li><strong>直播前/后画面</strong>：可上传"活动即将开始"的静帧，避免黑屏；</li>
                <li><strong>自动启动 / 手动启动</strong>：正式场合建议选<strong>手动</strong>，避免排练画面外流。</li>
              </ul>
            </li>
            <li>点<strong>「复制 iframe 嵌入代码」</strong>，从代码里取出 src 地址，形如：</li>
          </ol>
          <div className="mt-3">
            <CopyField
              label="Zoom 嵌入地址（从 iframe 代码的 src 里取）"
              value="https://events.zoom.us/embed/xxxxx"
            />
          </div>
          <p className="mt-3 text-[12px] leading-6 text-brand-500">
            注意：Zoom 嵌入直播<strong>按观看人数计量</strong>，许可证达到容量上限后新观众会被拦。
            大型活动请提前确认账号档位。
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-brand-200 bg-white p-5">
          <div className="text-sm font-semibold text-brand-900">替代方案：Zoom 转推到 YouTube</div>
          <p className="mt-2 text-[13px] leading-6 text-gray-700">
            如果你的 Zoom 账号没有「嵌入直播」功能，可以让 Zoom 把画面<strong>转推到 YouTube Live</strong>，
            然后照 6.1 的 YouTube 地址接入。这样既保留了 Zoom 的多方连麦，又用上了 YouTube 的稳定分发。
          </p>
        </div>
      </section>

      <section id="rtmp" className="mt-8 scroll-mt-20">
        <h3 className="text-xl font-semibold text-brand-900">7.3 自建推流（OBS + 云直播）</h3>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          适合"要多机位切换、想加字幕包装"的专业控台。这条路要自己拿两样东西：
          <strong>推流地址</strong>（给 OBS 用）与 <strong>播放地址</strong>（给本平台用）。两者不是同一个。
        </p>

        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm font-semibold text-brand-900">第一步：在云厂商开通直播服务</div>
          <p className="mt-2 text-[13px] leading-6 text-gray-700">
            常见的国内云直播服务：腾讯云「云直播 CSS」、阿里云「视频直播」、华为云「视频直播」。
            开通后在控制台<strong>新建一个推流域名与播放域名</strong>，控制台会生成一对地址：
          </p>
          <div className="mt-3 space-y-3">
            <CopyField label="推流地址（粘进 OBS，不要给观众看）" value="rtmp://push.example.com/live/STREAM_KEY" />
            <CopyField label="播放地址 · HLS（粘进本平台后台「播放地址」）" value="https://play.example.com/live/STREAM_NAME.m3u8" />
          </div>
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-[12px] leading-6 text-red-900">
            <strong>串流密钥（STREAM_KEY）是密码级机密</strong>，等于"谁拿到谁就能往你的直播里推画面"。
            不要发到群里、不要截图外传、不要填进本平台的「播放地址」框 ——
            那边只填<strong>播放</strong>地址（观众看的那个）。
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-100/70 p-5">
          <div className="text-sm font-semibold text-brand-900">第二步：确认播放地址格式</div>
          <p className="mt-2 text-[13px] leading-6 text-gray-700">
            本平台「视频流」方式支持两种：
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-6 text-gray-700">
            <li>
              <strong>HLS（.m3u8）</strong>：直播场景用这个。它会自动切片，观感顺滑，
              延迟约 10～30 秒（属正常，不是卡顿）。
            </li>
            <li>
              <strong>MP4 直链</strong>：适合已录制好的回放文件，不适合实时直播。
            </li>
          </ul>
          <p className="mt-3 text-[12px] leading-6 text-brand-500">
            一个易混点：云控制台里的 <strong>「推流地址」是 rtmp:// 开头，绝不能填进本平台</strong>；
            要填的是 <strong>https:// 开头的播放地址（.m3u8）</strong>。填错的表现是"页面一直转圈"。
          </p>
        </div>
      </section>

      <section id="hardware" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">八、软硬件对接与配置</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          按<strong>三档预算</strong>给配置建议。祭祀场景以庄重、清晰、稳定为先，
          不需要影视级设备，但<strong>收音比画质更重要</strong> —— 观众能接受画面朴素，无法接受听不清祭文。
        </p>

        <div className="mt-5 space-y-4">
          {[
            {
              t: "方案 A：零成本（单手机）",
              cost: "0 元（用现有设备）",
              fit: "小型追悼会、人数不多的宗亲聚会",
              items: [
                "手机 1 台（近三年机型即可），横屏架在三脚架上",
                "三脚架 / 稳定支架（避免手持抖动）",
                "领夹麦克风或手机外接麦（约 50～200 元，强烈建议加）",
                "充电宝 + 长数据线（直播耗电是平时的 3 倍）",
              ],
              steps: [
                "手机开飞行模式后单独开 Wi-Fi，避免来电打断直播",
                "装 YouTube 官方 App → 点「+」→「进行直播」",
                "标题、可见范围填好后点「开始直播」，系统自动取址",
                "把手机固定在仪式正对位置，画面留出上方空间（供遗像/匾额）",
              ],
            },
            {
              t: "方案 B：进阶（相机 + 采集卡）",
              cost: "约 1000～3000 元（不含相机）",
              fit: "中型宗祠典礼、需要画面质感的场合",
              items: [
                "相机或摄像机 1 台（带 HDMI 输出）",
                "HDMI 采集卡（约 200～600 元，把相机画面接入电脑）",
                "笔记本电脑（近五年机型，8GB 内存以上）",
                "指向性麦克风或调音台输出（拾取现场音响）",
              ],
              steps: [
                "相机 HDMI 输出 → 采集卡 → 电脑 USB 口",
                "电脑装 OBS Studio（免费开源），来源里添加「视频采集设备」选到采集卡",
                "音频来源选麦克风，务必在 OBS 里看音量条是否跳动",
                "在 OBS「设置 → 输出」里选「开始推流」，填入平台给的推流地址与串流密钥",
                "先用「录制」测 5 分钟，回放确认画面与声音都正常，再切到直播",
              ],
            },
            {
              t: "方案 C：专业（多机位 + 导播）",
              cost: "1 万元起（或租用导播服务）",
              fit: "大型祭祖大典、有领导致辞的正式场合",
              items: [
                "摄像机 2～3 台（主机位 + 游机 + 特写）",
                "切换台 / 导播台，或电脑装 vMix / OBS 多场景",
                "无线图传或长 HDMI 线缆",
                "独立声卡 + 多路麦克风 + 返听",
                "UPS 不间断电源（防现场断电中断直播）",
              ],
              steps: [
                "提前一天到场布线，标记机位与线缆走向（防绊倒）",
                "多机位分别接到切换台，设好转场效果",
                "字幕/台标在导播软件里预置好，仪式开始前 30 分钟开播预热",
                "安排 1 名专人盯画面、1 名盯声音、1 名盯网络状态",
              ],
            },
          ].map((p) => (
            <div key={p.t} className="rounded-lg border border-brand-200 bg-brand-100/70 p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-base font-semibold text-brand-900">{p.t}</div>
                <span className="rounded-full bg-accent-50 px-2.5 py-0.5 text-xs text-accent-700">{p.cost}</span>
              </div>
              <p className="mt-1 text-[13px] text-brand-500">适合：{p.fit}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-[13px] font-medium text-brand-800">所需设备</div>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-6 text-gray-700">
                    {p.items.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="text-[13px] font-medium text-brand-800">配置步骤</div>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13px] leading-6 text-gray-700">
                    {p.steps.map((x) => <li key={x}>{x}</li>)}
                  </ol>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-accent-200 bg-accent-50 p-5">
          <div className="text-sm font-semibold text-accent-800">收音要点（最容易被忽略）</div>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-6 text-accent-900">
            <li>能拿到<strong>现场调音台的输出</strong>就直接接出来 —— 比任何外置麦都干净。</li>
            <li>拿不到就<strong>把麦架在音响附近</strong>，而不是架在相机上（相机的麦会收到全场回声）。</li>
            <li>户外仪式注意<strong>防风毛套</strong>，风噪会让整场直播听起来像噪音。</li>
            <li>开播前录 30 秒试音，<strong>用耳机回听</strong>确认没有爆音、没有电流声。</li>
          </ul>
        </div>
      </section>

      <section id="network" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">九、网络与现场保障</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          直播事故里<strong>九成是网络问题</strong>。这一节是主办方最该提前一天做完的事。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["上行带宽", "直播吃的是「上行」。要求到 10 Mbps 以上、稳定；家用宽带常见「下行 500M / 上行 30M」，注意看上行那一栏。"],
            ["优先有线", "能用网线就不要用 Wi-Fi；必须用 Wi-Fi 时，路由器靠近设备、避开人群密集处。"],
            ["双路备份", "主用宽带 + 备用 4G/5G 手机热点。活动前实测热点上行速度，别到现场才发现只有 2M。"],
            ["提前预热", "开播前 30 分钟让设备持续推流，暴露发热、掉线、内存不足等隐患。"],
            ["供电备份", "设备插电用，同时备充电宝 / UPS；手机直播不要边冲边用劣质充电器（会引入电流声）。"],
            ["关闭干扰", "直播设备关闭微信、系统更新、自动备份等占用上行与 CPU 的后台程序。"],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4">
              <div className="text-sm font-medium text-brand-900">{t}</div>
              <p className="mt-1.5 text-[13px] leading-6 text-gray-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="publish" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">十、在后台发布这场直播</h2>
        <div className="mt-3 space-y-3 text-sm leading-7 text-gray-700">
          <p>
            <strong>权限：</strong>直播由平台运营或经认证的主办方（管理员 / 编辑角色）在管理后台发起，
            普通观众暂不能自助开播。如需发起，请联系平台运营，或登录有相应权限的账号。
          </p>
          <p>
            <strong>后台路径：</strong>管理后台 → 直播管理 → 新建直播。
          </p>
          <p><strong>各字段怎么填：</strong></p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-200 bg-brand-50 text-left">
                <th className="p-3 font-medium text-brand-900">字段</th>
                <th className="p-3 font-medium text-brand-900">填什么</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {[
                ["标题（必填）", "活动全称，如「李氏宗祠落成典礼」，会显示在直播大厅卡片与直播间大标题上。"],
                ["状态", "先选「预告」 —— 观众能看到时间但看不到画面，正式开始时再改「直播中」。改状态即自动记入开播/结束时间。"],
                ["直播类型", "公祭仪式 / 生态安葬仪式 / 宗祠落成 / 祭祖大典 / 追悼会，或「不分类」，用于大厅筛选。"],
                ["接入方式", "YouTube / Zoom → 选「iframe 嵌入」；自建推流 → 选「视频流（mp4 / HLS / 云直播）」。"],
                ["播放地址", "「取地址」一节拿到的地址：iframe 类填嵌入地址；视频流类填 .m3u8 播放地址。不要填推流地址，不要填串流密钥。"],
                ["描述", "活动背景、议程、参与方式等，会显示在直播间画面下方。"],
              ].map(([a, b]) => (
                <tr key={a} className="border-b border-brand-100">
                  <td className="p-3 align-top font-medium whitespace-nowrap text-brand-900">{a}</td>
                  <td className="p-3 align-top">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 rounded-lg border border-accent-200 bg-accent-50 p-4 text-[13px] leading-6 text-accent-800">
          <strong>发布前自检清单：</strong>
          ① 地址已复制粘贴（不是手打）；② 在别的电脑/手机上打开直播大厅确认能播；
          ③ 声音能出来（点播放器取消静音）；④ 手机竖屏看一遍排版是否正常。
        </div>
      </section>

      <section id="compliance" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">十一、合规与礼仪底线</h2>
        <div className="mt-3 space-y-3 text-sm leading-7 text-gray-700">
          <p>
            祭祀直播面向亲属与宗亲公开，<strong>一旦开播即不可撤回</strong>。开播前请务必确认以下几点：
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>取得家属同意。</strong>涉及逝者形象的直播，须经直系家属明确同意；
              有异议的环节（如遗体告别）应<strong>不拍摄或切走画面</strong>。
            </li>
            <li>
              <strong>尊重逝者与在场者。</strong>避免拍摄哭泣特写、避免将镜头停留在遗像上过久，
              不拍摄不愿入镜的亲友。
            </li>
            <li>
              <strong>不做商业化表达。</strong>直播中不出现商品推广、打赏引导、平台引流等内容。
            </li>
            <li>
              <strong>不公开敏感信息。</strong>不口播身份证号、住址、联系方式等个人信息。
            </li>
            <li>
              <strong>内容合规。</strong>不涉及封建迷信表演、不出现违法违规内容；
              整场直播纳入平台数字档案，长期保存可追溯。
            </li>
          </ul>
          <p className="rounded-lg border border-accent-200 bg-accent-50 p-4 text-[13px] text-accent-800">
            如发现直播内容违规，观众可通过直播间举报入口提交，平台将依规处置。
          </p>
        </div>
      </section>

      <section id="trouble" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">十二、故障排查速查表</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          按「现象」查「原因」，多数问题都能在这里定位。
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-200 bg-brand-50 text-left">
                <th className="p-3 font-medium text-brand-900">现象</th>
                <th className="p-3 font-medium text-brand-900">最可能的原因</th>
                <th className="p-3 font-medium text-brand-900">怎么办</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {[
                ["直播间显示「拒绝连接」", "填了观看页地址（watch?v= 或 zoom.us/j/）", "换成嵌入地址：YouTube 用 /embed/，Zoom 用 Events 嵌入代码"],
                ["画面一直是黑的 / 转圈", "推流端没开播，或播放地址填成了推流地址", "确认主播已点「开始直播」；检查地址是 https 而非 rtmp"],
                ["提示「信号准备中」", "直播尚未开播或刚结束", "属正常等待态；到点后刷新"],
                ["有画面没声音", "浏览器默认静音", "点播放器上的喇叭图标取消静音"],
                ["声音断断续续 / 回声大", "现场收音方式不当（相机麦收了全场回声）", "改用调音台输出或把麦架到音响附近"],
                ["画面卡顿、频繁缓冲", "上行带宽不足或 Wi-Fi 不稳", "换有线；降低推流码率（1080p→720p）"],
                ["直播中途断了几分钟", "网络抖动或设备过热", "平台侧会恢复；断流期间观众看到等待画面"],
                ["手机直播被来电打断", "未开飞行模式", "开飞行模式后单独启用 Wi-Fi"],
                ["iframe 提示第三方 Cookie 被拦截", "浏览器隐私设置拦截了跨站 Cookie", "允许第三方 Cookie，或换 Chrome / Edge"],
                ["手机上看排版错乱", "直播间按桌面比例设计", "可横屏观看；排版问题已列入优化"],
              ].map((r) => (
                <tr key={r[0]} className="border-b border-brand-100">
                  <td className="p-3 align-top font-medium text-brand-900">{r[0]}</td>
                  <td className="p-3 align-top">{r[1]}</td>
                  <td className="p-3 align-top">{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="faq" className="mt-10 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-brand-900">十三、常见问题</h2>
        <div className="mt-4 space-y-4">
          {[
            {
              q: "观看直播收费吗？",
              a: "不收费。浏览器内直接观看，无需付费或注册（内测期需先过访问口令）。",
            },
            {
              q: "直播能回看吗？",
              a: "能。直播结束后自动进入「回放档案」，长期保存、随时回看，不会下架。",
            },
            {
              q: "打开是黑屏 / 显示「信号准备中」怎么办？",
              a: "说明主播尚未开播或正在推流，稍后刷新即可。若 iframe 嵌入被浏览器拦截，请允许第三方 Cookie，或换用 Chrome / Edge 等浏览器。",
            },
            {
              q: "谁可以发起直播？",
              a: "由平台运营或经认证的主办方（管理员 / 编辑角色）在后台发起，普通用户暂不能自助开播。",
            },
            {
              q: "直播地址去哪里拿？",
              a: "看你选哪个平台：YouTube 在「工作室 → 直播控制室 → 嵌入」拿 /embed/ 地址；Zoom 在「Events → 嵌入直播」拿嵌入代码里的 src；自建推流则在云厂商控制台拿 https 开头的 .m3u8 播放地址。详见「取地址」一节。",
            },
            {
              q: "为什么不能直接填 YouTube 的观看链接？",
              a: "观看页（watch?v=…）是给人看的页面，YouTube 不允许它被嵌入到别的网站，填进去会显示「拒绝连接」。必须用 /embed/ 形式的地址。",
            },
            {
              q: "为什么不能直接填 Zoom 的会议链接？",
              a: "zoom.us/j/… 这种参会链接默认禁止 iframe 嵌入。要用 Zoom Events 的「嵌入直播」功能生成专用嵌入地址；或让 Zoom 转推到 YouTube 后接入。",
            },
            {
              q: "推流地址和播放地址有什么区别？",
              a: "推流地址（rtmp:// 开头，含串流密钥）是给 OBS 等推流软件用的，属于机密；播放地址（https 开头、通常以 .m3u8 结尾）才是给观众看的，填进本平台后台的是后者。填反了会一直转圈。",
            },
            {
              q: "没有专业设备能直播吗？",
              a: "能。一部手机 + 三脚架就能开播（方案 A，零成本）。建议加一支领夹麦克风——观众能接受画面朴素，但听不清祭文会严重影响体验。",
            },
            {
              q: "直播需要多快的网？",
              a: "上行带宽稳定在 10 Mbps 以上。注意「上行」和「下行」不是一回事：家用宽带常见下行 500M、上行只有 30M，看上行那一栏。另外务必准备 4G/5G 热点作为备份。",
            },
            {
              q: "需要提前多久准备？",
              a: "建议提前 1～2 天完成「选平台、拿地址、配设备、填后台」四步。当天只做开播动作，并在开播前 30 分钟持续预热推流，暴露发热、掉线等隐患。",
            },
            {
              q: "直播可以只给特定亲友看吗？",
              a: "本平台的直播间页面可通过内测口令控制访问；但第三方平台（YouTube / Zoom）侧的可见范围需你自行设置。涉及隐私的仪式，建议在平台侧同时收紧可见范围。",
            },
            {
              q: "直播中能暂停吗？",
              a: "不能。直播是线性的，推流一停观众端就中断。若有不宜公开的环节（如遗体告别），应提前安排镜头切走或遮挡，而不是中途暂停。",
            },
            {
              q: "直播会被别人录屏传播吗？",
              a: "有可能。公开直播无法阻止观众录屏。若内容涉及强烈隐私诉求，建议改用「不公开直播 + 事后单独分享回放」的方式，或仅邀请制观看。",
            },
            {
              q: "实时字幕什么时候能用？",
              a: "当前为内测占位；公开阶段将经家属授权与数据合规评估后接入语音转写。",
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
          href="/live"
          className="rounded-lg bg-accent-600 px-5 py-2.5 text-sm text-white hover:bg-accent-700"
        >
          进入云直播大厅
        </Link>
        <Link
          href="/halls/guide"
          className="rounded-lg border border-brand-300 px-5 py-2.5 text-sm text-brand-700 hover:bg-gray-50"
        >
          纪念馆创建指引
        </Link>
        <Link
          href="/clan/halls/guide"
          className="rounded-lg border border-brand-300 px-5 py-2.5 text-sm text-brand-700 hover:bg-gray-50"
        >
          宗祠设立指引
        </Link>
      </div>
    </div>
  );
}
