import Link from "next/link";
import Image from "next/image";
import { listPublishedArticles } from "@/lib/articles";
import { prisma } from "@/lib/db";
import { fubFromFen } from "@/lib/fortune";
import Price from "@/components/shop/Price";
import { nextFestival, festivalCountdownLabel } from "@/lib/festivals";
import {
  IconMemorial,
  IconClan,
  IconLive,
  IconNews,
  IconOffering,
} from "@/components/site/FeatureIcons";
import Reveal from "@/components/site/Reveal";
import LivingScene from "@/components/site/LivingScene";
import { CATEGORY_LABEL } from "@/lib/memorial";

export default async function HomePage() {
  const [articles, products, lives, heroMemorials] = await Promise.all([
    listPublishedArticles({ take: 3 }),
    // 首页「热门数字纪念服务」只展示付费商品：
    // 免费礼器的入口在纪念馆祭拜面板，摆在这里会显示成 ¥0.00。
    prisma.product.findMany({
      where: { status: "active", isFree: false },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.liveSession.findMany({
      where: { isPublic: true, status: { in: ["live", "scheduled"] } },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    // 公益纪念堂 · 民族英雄：首页推荐位直接呈现该类别已上线纪念堂
    prisma.publicMemorial.findMany({
      where: { status: "APPROVED", category: "NATIONAL_HERO" },
      orderBy: [{ lightCount: "desc" }, { createdAt: "desc" }],
      take: 3,
    }),
  ]);

  const festival = nextFestival();
  // 热门服务按价格从低到高展示（选品不变：最新 4 个付费商品，仅调整展示顺序）
  const hotServices = [...products].sort((a, b) => a.price - b.price);

  return (
    <>
      {/* Hero —— 与「午夜悄悄话」同一套星夜墨金语言：
          深墨底 + 香槟金点睛（eyebrow/主按钮）+ 星点呼应夜空封面。 */}
      <section className="relative overflow-hidden bg-brand-800 text-white">
        {/* 真实动态场景：AI 实景（夜空烛光庭院）+ 动态视频 + 浮光粒子/薄雾层 */}
        <LivingScene
          image="/assets/scene-hero.jpg"
          video="/assets/scene-hero.mp4"
          particles={12}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-900/40 to-brand-900/70" />
        {/* 星夜流光：缓慢游移的暖金光晕，呼应「午夜悄悄话」的夜空 */}
        <div aria-hidden className="aurora pointer-events-none absolute inset-0" />
        {/* 星点：呼应悄悄话「夜空封面」的四角星子，加入呼吸闪烁 */}
        <span aria-hidden className="star-twinkle absolute left-[10%] top-[24%] h-1 w-1 rounded-full bg-accent-200/70" style={{ animationDelay: "0s" }} />
        <span aria-hidden className="star-twinkle absolute right-[16%] top-[32%] h-1.5 w-1.5 rounded-full bg-accent-100/60" style={{ animationDelay: "0.6s" }} />
        <span aria-hidden className="star-twinkle absolute left-[20%] bottom-[28%] h-1 w-1 rounded-full bg-accent-200/50" style={{ animationDelay: "1.2s" }} />
        <span aria-hidden className="star-twinkle absolute right-[9%] bottom-[36%] h-0.5 w-0.5 rounded-full bg-accent-100/70" style={{ animationDelay: "1.8s" }} />
        <div className="container-page relative py-24 text-center md:py-32">
          <p className="mb-4 text-sm tracking-[0.3em] text-accent-300">
            数字纪念 · 生命文化传承
          </p>
          <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-tight md:text-5xl">
            以数字方式，留存思念，传递敬意
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-brand-100 md:text-lg">
            宗忆堂提供新闻资讯、数字纪念馆、云祭扫与虚拟献花服务，
            让缅怀跨越时空，让文化得以延续。
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/mall"
              className="rounded-md bg-gradient-to-r from-accent-300 to-accent-200 px-6 py-3 text-sm font-medium text-brand-900 shadow-sm ring-1 ring-accent-400/60 transition hover:shadow-md"
            >
              浏览虚拟祭品
            </Link>
            <Link
              href="/news"
              className="rounded-md border border-white/40 px-6 py-3 text-sm font-medium text-white hover:bg-white/10"
            >
              查看新闻资讯
            </Link>
          </div>
        </div>
      </section>

      {/* 信任徽章条（P0 信任改造：先回答「这里靠谱吗」，再讲功能） */}
      <section className="border-b border-brand-100 bg-brand-50">
        <div className="container-page grid grid-cols-2 gap-4 py-6 text-center md:grid-cols-4">
          <TrustBadge
            icon="✓"
            title="建馆实名审核"
            desc="每座纪念馆经人工核验建馆证明后开通"
          />
          <TrustBadge
            icon="🔒"
            title="隐私加密存储"
            desc="实名与证件信息加密保存，公页一律脱敏展示"
          />
          <TrustBadge
            icon="✎"
            title="内容人工终审"
            desc="公开内容先审后显，机器预筛加人工复核"
          />
          <TrustBadge
            icon="∞"
            title="长期保存承诺"
            desc="纪念馆数据多重备份，随时可导出带走"
          />
        </div>
      </section>

      {/* 数据条（暖米色带：与信任条、馆页卡片同一套墨金暖色语言） */}
      <section className="border-b border-brand-200/70 bg-brand-100/60">
        <div className="container-page grid grid-cols-2 gap-6 py-8 text-center md:grid-cols-4">
          <Stat num="16+" label="篇生命文化资讯" />
          <Stat num="80" label="项数字纪念服务" />
          <Stat num="100%" label="内容人工审核" />
          <Stat num="加密" label="实名信息安全存储" />
        </div>
      </section>

      {/* 临近节日横幅（P0 节日框架：给思念一个「快到了」的提醒入口） */}
      {festival && (
        <section className="border-b border-brand-200/70 bg-brand-100/60">
          <div className="container-page flex flex-wrap items-center justify-center gap-x-4 gap-y-2 py-4 text-center">
            <span className="rounded-full bg-brand-800 px-3 py-1 text-xs font-medium text-accent-200">
              即将到来
            </span>
            <Link
              href="/festivals"
              className="text-sm text-brand-700 hover:underline"
            >
              <strong className="text-brand-900">{festival.spec.name}</strong>
              （{festival.date.getMonth() + 1} 月 {festival.date.getDate()} 日 ·{" "}
              {festivalCountdownLabel(festival.daysUntil)}）——
              了解习俗，为思念安排一段时间
            </Link>
          </div>
        </section>
      )}

      {/* 服务板块 */}
      <section className="container-page py-16">
        <SectionTitle
          title="我们提供的服务"
          sub="围绕“纪念”这一核心，提供从资讯到仪式的完整数字服务"
        />
        {/*
          五个板块：lg 下排成 3 + 2（每行三张，第二行两张居中），
          md 下 2 列，手机单列 —— 4 列网格塞 5 张会在第二行留一个空洞，很难看。
        */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-6">
          <FeatureCard
            className="lg:col-span-2"
            tone="memorial"
            toneColor="#3f4625"
            icon={<IconMemorial />}
            title="数字纪念馆"
            desc="为逝者建立可永久访问的纪念空间，家人朋友可远程追思留言。"
            href="/halls"
          />
          <FeatureCard
            className="lg:col-span-2"
            tone="clan"
            toneColor="#5e352a"
            icon={<IconClan />}
            title="宗亲文化"
            desc="设立宗祠、续修族谱、记载字辈派语，让宗族谱系在数字空间延续。"
            href="/clan"
          />
          <FeatureCard
            className="lg:col-span-2"
            tone="live"
            toneColor="#6b4517"
            icon={<IconLive />}
            title="云直播"
            desc="公祭仪式、生态安葬、宗祠落成、祭祖大典等重大活动的直播与回放。"
            href="/live"
          />
          <FeatureCard
            className="lg:col-span-3"
            tone="news"
            toneColor="#423d33"
            icon={<IconNews />}
            title="新闻资讯"
            desc="殡葬政策解读、传统节日文化、行业动态，理性、克制、有温度的内容。"
            href="/news"
          />
          <FeatureCard
            className="lg:col-span-3"
            tone="offering"
            toneColor="#5f4a10"
            icon={<IconOffering />}
            title="虚拟祭品"
            desc="免费上香献花到专属纪念馆模板，文明祭扫与传统模式自主切换。"
            href="/mall"
          />
        </div>
      </section>

      {/* 云直播板块（独立板块入口） */}
      <section className="container-page py-16">
        <SectionTitle
          title="云直播"
          sub="重大事件直播 · 宗亲宗族活动直播 · 直播回放与数字档案"
        />
        <div className="grid gap-6 md:grid-cols-3">
          {lives.map((l, i) => (
            <Reveal key={l.id} delay={i * 80}>
              <Link
                href={`/live/${l.id}`}
                className="shine block group relative overflow-hidden rounded-xl border border-brand-700 bg-brand-900 shadow-sm transition hover:shadow-md"
              >
              <div className="relative aspect-video w-full overflow-hidden">
                {l.coverImage ? (
                  <Image
                    src={l.coverImage}
                    alt={l.title}
                    fill
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="object-cover opacity-80 transition group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full bg-brand-900" />
                )}
                <span
                  className={
                    l.status === "live"
                      ? "absolute left-3 top-3 flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-xs text-white"
                      : "absolute left-3 top-3 rounded bg-black/50 px-2 py-0.5 text-xs text-white"
                  }
                >
                  {l.status === "live" ? "● 直播中" : "预告"}
                </span>
              </div>
              <div className="p-4">
                {l.category && <div className="text-xs text-accent-300">{l.category}</div>}
                <h3 className="mt-1 line-clamp-1 text-base font-semibold text-white">
                  {l.title}
                </h3>
              </div>
              </Link>
            </Reveal>
          ))}
          {lives.length === 0 && (
            <Link
              href="/live"
              className="col-span-full flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-100/70 p-10 text-center transition hover:border-accent-300"
            >
              <span className="text-base font-semibold text-brand-900">进入云直播大厅</span>
              <span className="text-sm text-brand-500">
                公祭仪式、生态安葬、宗祠落成、祭祖大典等直播与回放
              </span>
            </Link>
          )}
        </div>
        <div className="mt-6 text-center">
          <Link href="/live" className="text-sm font-medium text-brand-700 hover:underline">
            进入云直播大厅 →
          </Link>
        </div>
      </section>

      {/* 公益纪念堂 · 民族英雄：庄重致敬区（深墨底 + 香槟金描金 + 背景图，
          示例纪念堂置顶为视觉主体，契合纪念英烈的肃穆基调） */}
      <section className="relative overflow-hidden bg-brand-900 py-20 text-white">
        {/* 背景图 + 深墨叠层，营造庄重肃穆氛围 */}
        <Image
          src="/assets/scene-hall.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-900/85 via-brand-900/70 to-brand-900/90" />
        {/* 顶部描金细线 */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-400/60 to-transparent"
        />

        <div className="container-page relative z-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 text-xs tracking-[0.4em] text-accent-300">公益纪念堂</p>
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              致敬<span className="text-accent-200">民族英雄</span>
            </h2>
            <span
              aria-hidden
              className="mx-auto mt-4 block h-px w-20 bg-gradient-to-r from-transparent via-accent-400 to-transparent"
            />
            <p className="mt-5 leading-7 text-brand-100">
              平台在征得家属同意后，免费为已故名人、民族英雄、英烈与见义勇为者建立公开纪念空间，
              让他们的名字被长久铭记。
            </p>
          </div>

          {/* 置顶示例纪念堂（视觉主体） */}
          {heroMemorials.length > 0 ? (
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {heroMemorials.map((m, i) => (
                <Reveal key={m.id} delay={i * 80}>
                  <Link
                    href={`/memorial/${m.slug}`}
                    className="shine group block overflow-hidden rounded-xl border border-accent-400/30 bg-brand-800/60 shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-lg"
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-brand-800">
                      <Image
                        src={m.portraitUrl || "/assets/scene-hall.jpg"}
                        alt={`${m.name}纪念空间`}
                        fill
                        sizes="(min-width: 768px) 33vw, 100vw"
                        className="object-cover opacity-90 transition duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-brand-900/80 via-brand-900/10 to-transparent" />
                    </div>
                    <div className="p-5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-accent-400/40 px-2.5 py-0.5 text-xs text-accent-200">
                        {CATEGORY_LABEL[m.category]}
                      </span>
                      <h3 className="mt-3 text-lg font-semibold text-white">{m.name}</h3>
                      {m.honorTitle && (
                        <p className="mt-1 text-sm text-accent-200/90">{m.honorTitle}</p>
                      )}
                      <p className="mt-2 line-clamp-2 text-sm text-brand-100/80">
                        {m.summary || "此处收录其生平与亲友追思。"}
                      </p>
                      <p className="mt-3 text-xs text-brand-100/60">
                        {m.lightCount} 次献灯 · {m.viewCount} 次瞻仰
                      </p>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          ) : (
            <div className="mx-auto mt-12 max-w-2xl rounded-xl border border-accent-400/30 bg-brand-800/50 p-8 text-center backdrop-blur-sm">
              <p className="text-base font-semibold text-white">为值得被永远铭记的人，留一座丰碑</p>
              <p className="mt-2 text-sm text-brand-100/80">
                该类别示例纪念堂正在筹备中。如您是家属，欢迎免费申请为值得铭记的人建一座。
              </p>
            </div>
          )}

          {/* 操作入口（置于示例之后） */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/memorial?cat=NATIONAL_HERO"
              className="rounded-md bg-gradient-to-r from-accent-300 to-accent-200 px-5 py-2.5 text-sm font-medium text-brand-900 shadow-sm ring-1 ring-accent-400/60 transition hover:shadow-md"
            >
              浏览民族英雄纪念堂
            </Link>
            <Link
              href="/memorial/apply"
              className="rounded-md border border-accent-200/50 px-5 py-2.5 text-sm font-medium text-accent-100 transition hover:bg-white/10"
            >
              家属免费申请建堂
            </Link>
          </div>
        </div>
      </section>

      {/* 精选资讯 */}
      <section className="bg-brand-50 py-16">
        <div className="container-page">
          <SectionTitle title="最新资讯" sub="编辑精选 · 经人工审核后发布" />
          <div className="grid gap-6 md:grid-cols-3">
            {articles.map((a, i) => (
              <Reveal key={a.id} delay={i * 80}>
                <Link
                  href={`/news/${a.slug}`}
                  className="shine block group overflow-hidden rounded-xl border border-brand-200/80 bg-brand-100/70 shadow-sm transition hover:shadow-md"
                >
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-brand-100">
                  {a.coverImage ? (
                    <Image
                      src={a.coverImage}
                      alt={a.title}
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-brand-100" />
                  )}
                </div>
                <div className="p-5">
                  <div className="mb-2 text-xs text-brand-400">
                    {a.category?.name ?? "未分类"} ·{" "}
                    {a.publishedAt &&
                      new Date(a.publishedAt).toLocaleDateString("zh-CN")}
                  </div>
                  <h3 className="line-clamp-2 text-base font-semibold text-brand-900 group-hover:text-brand-600">
                    {a.title}
                  </h3>
                  {a.summary && (
                    <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                      {a.summary}
                    </p>
                  )}
                </div>
                </Link>
              </Reveal>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/news"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              查看全部资讯 →
            </Link>
          </div>
        </div>
      </section>

      {/* 精选服务 */}
      <section className="container-page py-16">
        <SectionTitle title="热门数字纪念服务" sub="即买即开通，心意随时可达" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {hotServices.map((p, i) => (
            <Reveal key={p.id} delay={i * 70}>
              <Link
                href={`/mall/${p.slug}`}
                className="shine block group overflow-hidden rounded-xl border border-brand-200/80 bg-brand-100/70 shadow-sm transition hover:shadow-md"
              >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-brand-100">
                {p.coverImage ? (
                  <Image
                    src={p.coverImage}
                    alt={p.name}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-brand-100" />
                )}
              </div>
              <div className="p-4">
                <h3 className="line-clamp-1 text-sm font-semibold text-brand-900">
                  {p.name}
                </h3>
                <div className="mt-2">
                  <Price fub={fubFromFen(p.price)} />
                </div>
              </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        {/* 使用流程 */}
      <section className="bg-brand-50 py-16">
        <div className="container-page">
          <SectionTitle title="三步，为思念安一个家" sub="" />
          <Image
            src="/assets/illus-process.jpg"
            alt="服务流程"
            width={1280}
            height={853}
            className="mx-auto h-auto w-full max-w-2xl"
          />
          <div className="mt-8 grid gap-6 text-center md:grid-cols-3">
            <Step n="1" t="注册并实名" d="注册账号并完成实名，守护真实的缅怀。" />
            <Step n="2" t="创建纪念馆" d="建立专属纪念空间，上传生平与照片。" />
            <Step n="3" t="追思与缅怀" d="献花、点灯、留言，邀亲友共同追忆。" />
          </div>
        </div>
      </section>

      {/* 故事位（P0 信任改造：用真实场景回答「别人怎么用」） */}
      <section className="container-page py-16">
        <SectionTitle
          title="他们正在这样纪念"
          sub="三种最常见的追思方式，都从一炷香的时间开始"
        />
        <div className="grid gap-6 md:grid-cols-3">
          <StoryCard
            quote="父亲走后我在外地工作，清明回不去。那晚在纪念馆给他点了一盏灯，把想说的话都写了进去。"
            scene="异乡人的清明"
          />
          <StoryCard
            quote="奶奶的拿手菜味道我们一直记得。把她的生平整理成时间线，孩子们想她的时候就去翻一翻。"
            scene="一家的记忆档案"
          />
          <StoryCard
            quote="族里修谱找了很久的老家谱。现在宗祠在网上了，字辈诗挂在堂号下面，晚辈随手就能查。"
            scene="宗祠的数字传承"
          />
        </div>
        <p className="mt-6 text-center text-xs text-brand-400">
          以上为典型使用场景的示意改写，已隐去可识别信息。
        </p>
      </section>

      {/* 价值 / 合规 */}
      <section className="container-page py-16">
        <div className="grid items-center gap-10 rounded-2xl bg-brand-50 p-8 md:grid-cols-2 md:p-12">
          <div>
            <h2 className="text-2xl font-semibold text-brand-900">
              克制，是对思念最大的尊重
            </h2>
            <p className="mt-4 leading-7 text-brand-600">
              本平台为文化传播与数字纪念技术服务，不涉及线下殡葬服务经营。
              所有公开内容均经过机器预筛与人工终审，纪念馆与虚拟服务需实名后使用，
              用户隐私与证件信息加密存储。
            </p>
            <Link
              href="/about"
              className="mt-6 inline-block rounded-md bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
            >
              了解平台与合规
            </Link>
          </div>
          <Image
            src="/assets/illus-about.jpg"
            alt="关于宗忆堂"
            width={1280}
            height={853}
            className="mx-auto h-auto w-full max-w-sm"
          />
        </div>
      </section>

      {/* FAQ 引导 */}
      <section className="bg-brand-50 py-16">
        <div className="container-page grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-2xl font-semibold text-brand-900">
              关于纪念服务，你可能想问
            </h2>
            <p className="mt-3 max-w-xl leading-7 text-brand-500">
              虚拟祭品是什么？纪念馆如何创建？内容是否合规？我们整理了最常见的问题。
            </p>
            <Link
              href="/faq"
              className="mt-5 inline-block text-sm font-medium text-accent-600 hover:underline"
            >
              查看常见问题 FAQ →
            </Link>
          </div>
          <Image
            src="/assets/illus-faq.jpg"
            alt="常见问题"
            width={1280}
            height={853}
            className="mx-auto h-auto w-64"
          />
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-800 py-14 text-center text-white">
        <div className="container-page">
          <h2 className="text-2xl font-semibold">为思念，安一个随时可达的家</h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-100">
            注册即可创建你的第一个数字纪念馆，或先浏览我们的数字纪念服务。
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-4">
            <Link
              href="/register"
              className="rounded-md bg-gradient-to-r from-accent-300 to-accent-200 px-6 py-3 text-sm font-medium text-brand-900 shadow-sm ring-1 ring-accent-400/60 transition hover:shadow-md"
            >
              免费注册
            </Link>
            <Link
              href="/halls"
              className="rounded-md border border-white/40 px-6 py-3 text-sm font-medium text-white hover:bg-white/10"
            >
              浏览纪念馆
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function TrustBadge({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-brand-200/80 bg-brand-100/70 px-4 py-4">
      <div className="text-xl text-accent-600">{icon}</div>
      <div className="mt-1.5 text-sm font-semibold text-brand-900">{title}</div>
      <div className="mt-1 text-xs leading-5 text-brand-500">{desc}</div>
    </div>
  );
}

function Stat({ num, label }: { num: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-brand-900 md:text-3xl">{num}</div>
      <div className="mt-1 text-sm text-brand-500">{label}</div>
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-10 text-center">
      <h2 className="text-2xl font-semibold text-brand-900">{title}</h2>
      {/* 描金短横：把标题收进墨金体系。零布局影响（backgroundImage 而非 border-bottom）。 */}
      <span
        aria-hidden
        className="mt-3 inline-block h-px w-16"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent, var(--color-accent-400, #d4af37), transparent)",
        }}
      />
      {sub && <p className="mt-2 text-brand-500">{sub}</p>}
    </div>
  );
}

/**
 * 首页「我们提供的服务」板块卡片。
 *
 * 五张卡共用同一骨架（顶部渐变条 + 图标 + 标题 + 描述 + 进入），
 * 只靠 `toneColor` 一个专属主色区分板块 —— 这样五张放在一起是
 * "一套体系里的五个分支"，而不是五张各画各的卡。
 *
 * 五色**全部收进墨金暖色家族并按「宗忆堂」LOGO（底色 #403010 深墨褐 + 香槟金印）
 * 加深一档**：深橄榄褐 / 深绛红褐 / 深古铜 / 玄墨褐 / 深金褐——
 * 明度整体压进 LOGO 底色的深色域，卡片顶条、图标、标题与 LOGO 同族同重。
 *
 * ⚠️ 主色走**内联 CSS 变量**而不是 5 套 Tailwind class：
 * `feature-tone-memorial` 这类动态拼出来的类名 Tailwind 静态提取不到，
 * 构建后是空样式（本仓库踩过，见 AGENTS.md「色阶双角色」一节）。
 *
 * 五个 toneColor 的 L\* 收在 26.0–32.8（跨度 6.8），色相拉开但明度齐平，
 * 有区分又不刺眼。这些小字用主色着色，压卡片底色（#f2ede4）时最低 6.2:1，
 * 满足 AA —— **调色时别只看"压白底"，卡片底是暖白而非纯白，要求更严**。
 */
function FeatureCard({
  title,
  desc,
  href,
  tone,
  toneColor,
  icon,
  className = "",
}: {
  title: string;
  desc: string;
  href: string;
  /** 板块标识，渲染成 data-feature-tone 供验收脚本断言「五个值两两不同」 */
  tone: string;
  /** 该板块专属主色（hex）。见上方注释的明度约束。 */
  toneColor: string;
  icon: React.ReactNode;
  /** 网格跨列（服务板块用 6 列基线做 2/3 分配） */
  className?: string;
}) {
  return (
    <Link
      href={href}
      data-feature-tone={tone}
      style={
        {
          "--tone": toneColor,
          "--tone-soft": `color-mix(in srgb, ${toneColor} 10%, #ffffff)`,
        } as React.CSSProperties
      }
      className={`shine group relative block overflow-hidden rounded-xl border border-brand-200 bg-gradient-to-b from-brand-50 to-brand-100/70 p-6 transition hover:-translate-y-0.5 hover:border-accent-400 hover:shadow-md ${className}`}
    >
      {/* 顶部 2px 实色条：该卡专属主色的"认色标记"。
          用实色而非渐变 —— 渐变到两端透明会让五张卡的第一眼观感趋同，
          而这条恰恰是"一眼分出五个板块"的主要抓手。 */}
      <span
        aria-hidden
        data-tone-bar
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: "var(--tone)" }}
      />
      <div
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg"
        style={{ background: "var(--tone-soft)", color: "var(--tone)" }}
      >
        {icon}
      </div>
      {/* 标题与"进入"都用该卡专属主色，让色相在卡片里出现三次
          （顶条 / 图标 / 文字），否则五张卡的正文观感会趋同。
          对比度按卡片底色 #f2ede4 校验（≥4.5:1），不是按纯白。 */}
      <h3 className="mb-2 text-lg font-semibold" style={{ color: "var(--tone)" }}>
        {title}
      </h3>
      <p className="text-sm leading-6 text-brand-500">{desc}</p>
      <span
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium opacity-0 transition group-hover:opacity-100"
        style={{ color: "var(--tone)" }}
      >
        进入 <span aria-hidden>→</span>
      </span>
    </Link>
  );
}

function Step({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <div className="rounded-lg border border-brand-200/80 bg-brand-100/70 p-5">
      <div className="mb-2 text-sm font-bold text-accent-600">第 {n} 步</div>
      <div className="font-semibold text-brand-900">{t}</div>
      <p className="mt-1 text-sm text-brand-500">{d}</p>
    </div>
  );
}

function StoryCard({ quote, scene }: { quote: string; scene: string }) {
  return (
    <figure className="rounded-xl border border-brand-200/80 bg-brand-100/70 p-6">
      <blockquote className="text-sm leading-7 text-brand-600">“{quote}”</blockquote>
      <figcaption className="mt-4 text-xs font-medium text-brand-400">
        —— {scene}
      </figcaption>
    </figure>
  );
}
