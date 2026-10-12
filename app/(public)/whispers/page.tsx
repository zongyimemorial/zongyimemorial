import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PLAN_SPECS, SINGLE_PACK, CLONE_PASS, WHISPER_POINTS, MEMORIAL_VIDEO } from "@/lib/whisper";
import { fubFromFen } from "@/lib/fortune";
import { isMockMode, currentEngineLabel } from "@/lib/ai/index";
import { AiDisclosureBar } from "@/components/whisper/AiBadge";

export const metadata = {
  title: "午夜悄悄话 · 追思对话 · 宗忆堂",
  description:
    "把逝去亲友的生平资料整理成个人数据库，由 AI 还原他/她的声音与说话方式，在想念的时候说说话。全程带 AI 标识，须经近亲属授权。",
};

export default async function WhispersPage() {
  const user = await getCurrentUser();

  // 已登录用户：列出他可进入的装置
  let available: {
    id: string;
    personaName: string;
    personTitle: string | null;
    hallId: string;
    hallName: string;
    deceasedName: string;
  }[] = [];
  let owned: { id: string; personaName: string; status: string; enabled: boolean }[] = [];

  if (user?.id) {
    const rows = await prisma.whisperProfile.findMany({
      where: { enabled: true, status: "active", isPublic: true },
      include: {
        hall: { select: { id: true, name: true, deceasedName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
    });
    available = rows.map((r) => ({
      id: r.id,
      personaName: r.personaName,
      personTitle: r.personTitle,
      hallId: r.hall.id,
      hallName: r.hall.name,
      deceasedName: r.hall.deceasedName,
    }));

    owned = (
      await prisma.whisperProfile.findMany({
        where: { ownerUserId: user.id },
        select: { id: true, personaName: true, status: true, enabled: true },
        orderBy: { createdAt: "desc" },
      })
    ).map((r) => ({ id: r.id, personaName: r.personaName, status: r.status, enabled: r.enabled }));
  }

  const tiers = [PLAN_SPECS.free, PLAN_SPECS.basic, PLAN_SPECS.premium];

  return (
    <div className="container-page max-w-5xl py-10">
      {/* —— Hero —— */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50 to-accent-50/40 p-8">
        <p className="text-xs font-medium tracking-wide text-accent-600">纪念馆 · 收费板块</p>
        <h1 className="mt-2 text-3xl font-semibold text-brand-900">午夜悄悄话</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-600">
          把逝去亲友的生平、性格、说话方式整理上传，形成他/她的个人综合数据库。
          想他/她的时候，可以用他/她熟悉的声音说说话——那些没来得及说完的，可以慢慢说。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/whispers/guide"
            className="flex items-center gap-2 rounded-md bg-gradient-to-r from-accent-300 to-accent-200 px-5 py-2.5 text-sm font-medium text-brand-900 shadow-sm ring-1 ring-accent-400/60 transition hover:shadow-md"
          >
            <span aria-hidden="true">📖</span>
            使用指引 · 3 分钟学会安全地说说话
          </Link>
          {user?.id ? (
            <Link
              href="/console"
              className="rounded-md bg-brand-800 px-5 py-2.5 text-sm text-white hover:bg-brand-700"
            >
              进入控制台设立装置
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-brand-800 px-5 py-2.5 text-sm text-white hover:bg-brand-700"
            >
              登录后设立装置
            </Link>
          )}
          <Link
            href="/halls"
            className="rounded-md border border-brand-300 bg-brand-100/70 px-5 py-2.5 text-sm text-brand-700 hover:bg-gray-50"
          >
            先建一座纪念馆
          </Link>
        </div>
        {isMockMode() && (
          <p className="mt-4 inline-block rounded bg-white/70 px-3 py-1 text-xs text-slate-600">
            当前运行于演示引擎（未配置云端 API Key），对话能力为本地模拟
          </p>
        )}
      </div>

      {/* —— 合规前置声明（进入即见） —— */}
      <AiDisclosureBar className="mt-6" />

      {/* —— 已设立装置 —— */}
      {user?.id && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-brand-900">我设立的装置</h2>
          {owned.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-brand-200 bg-brand-100/70 p-6 text-center text-sm text-brand-400">
              还没有追思装置。先建一座纪念馆，再在纪念馆下设立「午夜悄悄话」。
            </p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {owned.map((p) => (
                <Link
                  key={p.id}
                  href={`/console/whispers/${p.id}`}
                  className="rounded-xl border border-brand-200 bg-brand-100/70 p-4 transition hover:border-accent-300"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-brand-900">{p.personaName}</p>
                    <span
                      className={
                        "rounded px-2 py-0.5 text-[11px] " +
                        (p.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : p.status === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-600")
                      }
                    >
                      {p.status === "active" ? "已通过" : p.status === "pending" ? "待审核" : "已驳回"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-brand-400">
                    {p.enabled ? "对话已开启" : "对话未开启"} · 点击管理
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* —— 可对话的装置 —— */}
      {available.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-brand-900">悄悄话，从这里开始</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {available.map((p) => (
              <Link
                key={p.id}
                href={`/whispers/${p.hallId}`}
                className="group overflow-hidden rounded-xl border border-brand-200 bg-brand-100/70 shadow-sm transition hover:border-accent-300 hover:shadow-md"
              >
                {/* 夜空封面 */}
                <div className="relative flex aspect-[4/3] flex-col items-center justify-center gap-2.5 overflow-hidden bg-gradient-to-b from-brand-800 via-brand-700 to-brand-600 text-accent-200">
                  {/* 星点 */}
                  <span className="absolute left-5 top-5 h-1 w-1 rounded-full bg-accent-200/70" aria-hidden />
                  <span className="absolute right-8 top-8 h-1.5 w-1.5 rounded-full bg-accent-100/60" aria-hidden />
                  <span className="absolute bottom-8 left-9 h-1 w-1 rounded-full bg-accent-200/50" aria-hidden />
                  <span className="absolute right-6 bottom-14 h-0.5 w-0.5 rounded-full bg-accent-100/70" aria-hidden />
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-10 w-10 text-accent-300 drop-shadow-[0_0_10px_rgba(232,197,109,0.45)] transition group-hover:scale-110 group-hover:text-accent-200"
                    aria-hidden
                  >
                    <path
                      d="M12 3c-1.2 3.4-3.6 5.8-7 7 3.4 1.2 5.8 3.6 7 7 1.2-3.4 3.6-5.8 7-7-3.4-1.2-5.8-3.6-7-7Z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="px-3 text-center text-[11px] tracking-wide text-accent-100/90">
                    纯语音 · 用他/她的声音说说话
                  </span>
                </div>
                {/* 暖色底栏 */}
                <div className="border-t border-accent-100 bg-accent-50 p-3">
                  <p className="text-sm font-medium text-brand-900">{p.personaName}</p>
                  <p className="mt-0.5 text-xs text-brand-400">
                    {p.hallName} · {p.deceasedName}
                  </p>
                  <p className="mt-1.5 inline-flex items-center rounded-full bg-accent-100 px-2.5 py-1 text-[11px] font-medium text-accent-700 transition group-hover:bg-accent-200">
                    纯语音对话 · 去说话 →
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* —— 工作原理 —— */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold text-brand-900">它是怎么运作的</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {[
            { n: "1", t: "整理资料", d: "在纪念馆下上传生平、性格、口头禅、记忆片段与家人关系。" },
            { n: "2", t: "家属授权", d: "由近亲属本人确认，其他权利人无异议。无授权不可开启。" },
            { n: "3", t: "生成人格", d: "平台据资料库构建人格与说话方式，可选克隆他/她的声音。" },
            { n: "4", t: "开始说话", d: "想他/她的时候进来坐坐，用文字或语音聊几句。" },
          ].map((s) => (
            <div key={s.n} className="rounded-xl border border-brand-200 bg-brand-100/70 p-4">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-800 text-xs text-white">
                {s.n}
              </span>
              <p className="mt-2.5 text-sm font-medium text-brand-900">{s.t}</p>
              <p className="mt-1 text-xs leading-relaxed text-brand-500">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* —— 收费方案 —— */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold text-brand-900">收费标准</h2>
        <p className="mt-1 text-xs text-brand-400">
          按「语音分钟数」计费，文字对话不受限；免费档可长期使用文字对话。
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiers.map((t) => {
            const film = t.plan === "premium";
            return (
              <div
                key={t.plan}
                className={
                  "rounded-xl border p-5 " +
                  (film ? "border-accent-300 bg-accent-50/30" : "border-brand-200 bg-brand-100/70")
                }
              >
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold text-brand-900">{t.name}</p>
                  {film && (
                    <span className="rounded bg-accent-600 px-1.5 py-0.5 text-[10px] text-white">
                      推荐
                    </span>
                  )}
                </div>
                <p className="mt-2">
                  <span className="text-2xl font-semibold text-brand-900">
                    {fubFromFen(t.priceFen)} 福币
                  </span>
                  <span className="ml-1 text-xs text-brand-400">
                    {t.priceFen === 0 ? "永久免费" : "/ 月"}
                  </span>
                </p>
                <ul className="mt-3 space-y-1.5 text-xs text-brand-600">
                  <li>
                    · 语音时长：「{t.monthlyMins > 0 ? `${t.monthlyMins} 分钟` : "不含语音"}」
                  </li>
                  <li>· 对话轮次：{t.monthlyRounds >= 99999 ? "不限" : `${t.monthlyRounds} 轮`}</li>
                  <li>· 声音克隆：{t.cloneLimit > 0 ? `${t.cloneLimit} 个` : "不含（可积分兑换）"}</li>
                  <li>· 资料条目：{t.memoryLimit === -1 ? "不限" : `${t.memoryLimit} 条`}</li>
                  <li>· 纪念短片：{t.videoQuota > 0 ? `${t.videoQuota} 段 / 月` : "不含"}</li>
                </ul>
                {t.priceFen > 0 && (
                  <Link
                    href={`/mall/${t.slug}`}
                    className="mt-3 block rounded-md bg-brand-800 px-4 py-2 text-center text-xs text-white hover:bg-brand-700"
                  >
                    开通{t.name}
                  </Link>
                )}
              </div>
            );
          })}

          {/* —— 声音克隆资格 · 独立入口卡（用户要求放回此排） —— */}
          <div className="rounded-xl border border-accent-300 bg-accent-50/30 p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-brand-900">声音克隆资格</p>
              <span className="rounded bg-accent-600 px-1.5 py-0.5 text-[10px] text-white">
                一次性
              </span>
            </div>
            <p className="mt-2">
              <span className="text-2xl font-semibold text-brand-900">
                {fubFromFen(CLONE_PASS.priceFen)} 福币
              </span>
              <span className="ml-1 text-xs text-brand-400">/ 永久</span>
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-brand-600">
              <li>· 解锁克隆入口与声线复刻</li>
              <li>· 真实声线训练由订阅档承载</li>
              <li>· 或用 {WHISPER_POINTS.CLONE_UNLOCK} 积分兑换</li>
            </ul>
            <Link
              href={`/mall/${CLONE_PASS.slug}`}
              className="mt-3 block rounded-md bg-accent-600 px-4 py-2 text-center text-xs text-white hover:bg-accent-500"
            >
              购买资格
            </Link>
            <Link
              href="/points"
              className="mt-2 block rounded-md border border-brand-300 px-4 py-2 text-center text-xs text-brand-700 hover:bg-gray-50"
            >
              {WHISPER_POINTS.CLONE_UNLOCK} 积分兑换
            </Link>
          </div>
        </div>

        {/* 按次与加购 */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
            <p className="text-sm font-semibold text-brand-900">按次购买</p>
            <p className="mt-2 text-lg font-semibold text-brand-900">
              {fubFromFen(SINGLE_PACK.priceFen)} 福币
              <span className="ml-1 text-xs font-normal text-brand-400">
                / {SINGLE_PACK.minutes} 分钟
              </span>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-brand-500">
              不限时不订阅时的选择。买来的分钟数不随月度周期清零，用完为止。
            </p>
            <Link
              href={`/mall/${SINGLE_PACK.slug}`}
              className="mt-3 inline-block rounded-md border border-brand-300 px-4 py-2 text-xs text-brand-700 hover:bg-gray-50"
            >
              购买时长
            </Link>
          </div>

          <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
            <p className="text-sm font-semibold text-brand-900">积分兑换</p>
            <ul className="mt-2 space-y-1.5 text-xs text-brand-600">
              <li>· 声音克隆资格申请：{WHISPER_POINTS.CLONE_UNLOCK} 积分</li>
              <li>· 10 分钟对话时长：{WHISPER_POINTS.MINUTES_10} 积分</li>
            </ul>
            <p className="mt-2 text-xs leading-relaxed text-brand-500">
              积分可通过祭拜、邀请好友、内容贡献等方式免费获取。克隆资格为一次性工本费（¥10 /
              {fubFromFen(CLONE_PASS.priceFen)} 福币），仅解锁克隆入口；真实声线复刻由订阅档承载。
            </p>
            <Link
              href="/points"
              className="mt-3 inline-block rounded-md border border-brand-300 px-4 py-2 text-xs text-brand-700 hover:bg-gray-50"
            >
              查看积分
            </Link>
          </div>
        </div>

        {/* 纪念短片 · 单条加购（高毛利加购项，与订阅解耦） */}
        <div className="mt-4 rounded-xl border border-accent-200 bg-accent-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-brand-900">纪念短片 · 单条加购</p>
            <p className="text-lg font-semibold text-brand-900">
              {fubFromFen(MEMORIAL_VIDEO.priceFen)} 福币
              <span className="ml-1 text-xs font-normal text-brand-400">/ 条</span>
            </p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-brand-500">
            用他/她的声线与人格，异步生成一支追思短片。按需下单、人工精修交付，
            <b className="text-brand-700">不与订阅绑定</b>——长夜版已不含视频，需要时可单独加购。
          </p>
          <Link
            href={`/mall/${MEMORIAL_VIDEO.slug}`}
            className="mt-3 inline-block rounded-md bg-accent-600 px-4 py-2 text-xs text-white hover:bg-accent-500"
          >
            下单定制纪念短片
          </Link>
        </div>
      </section>

      {/* —— 关于「为什么只有声音」的技术与成本说明 —— */}
      <section className="mt-10 rounded-xl border border-brand-200 bg-brand-100/70 p-6">
        <h2 className="text-sm font-semibold text-brand-900">
          为什么「午夜悄悄话」只有声音，没有会说话的形象
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-brand-600">
          这是我们在核算真实成本、并权衡伦理风险后做的取舍，也想把账算给你看：
        </p>
        <div className="mt-4 grid gap-4 text-xs leading-relaxed text-brand-600 sm:grid-cols-2">
          <div className="rounded-lg bg-brand-50/50 p-4">
            <p className="font-medium text-brand-800">实时口型驱动的数字人形象</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>成本是纯语音的 <b>15–120 倍</b>（主流服务约 ¥795–6,030 / 月 / 路）</li>
              <li>口型合成 + 视频编码的延迟，<b>当前技术下无法支撑自然对话节奏</b></li>
              <li>形象越逼真，「把人当成真的」带来的心理风险越高</li>
              <li>在逝者场景下，深度合成形象属于<b>高风险用途</b>，多数平台不提供</li>
            </ul>
          </div>
          <div className="rounded-lg bg-accent-50/50 p-4">
            <p className="font-medium text-brand-800">本平台采用的方案</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li><b>纯语音</b>：用他/她生前的录音克隆音色，这是「像」的核心</li>
              <li><b>文字 + 语音</b>：想念时进来坐坐，说几句话，没有屏幕上的打扰</li>
              <li><b>纪念短片</b>（按需单买）：用他/她的声线与人格异步生成，下单后人工精修交付，不与订阅绑定</li>
            </ul>
          </div>
        </div>
        <p className="mt-4 border-t border-brand-200 pt-4 text-xs leading-relaxed text-brand-500">
          我们不做数字人形象——这是当前技术条件下唯一兼顾成本与体验的方案，
          也是我们认为对追思这件事更负责的做法：声音已经足够让人想起一个人，
          而一张会动、会说话的脸，更容易让你误以为 TA 回来了。
        </p>
      </section>

      {/* —— 边界与承诺 —— */}
      <section className="mt-10 rounded-xl border border-brand-200 bg-brand-100/70 p-6">
        <h2 className="text-sm font-semibold text-brand-900">我们的边界</h2>
        <div className="mt-3 grid gap-4 text-xs leading-relaxed text-brand-600 sm:grid-cols-2">
          <div>
            <p className="font-medium text-brand-800">它会做</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>用他/她习惯的语气回应你，记得你上传的那些事</li>
              <li>在清明、忌日等日子，提醒你可以去坐坐</li>
              <li>察觉到你情绪低落时，提醒你找身边的人说说</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-brand-800">它不会做</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>不会自称是真人，也不会说「我回来了」之类的话</li>
              <li>不会诱导你长时间停留、不鼓励你只依赖它</li>
              <li>不会编造你没上传过的记忆</li>
              <li>不会生成逝者的形象，也不会拿逝者形象做任何商业用途</li>
            </ul>
          </div>
        </div>
        <p className="mt-4 border-t border-brand-200 pt-4 text-xs leading-relaxed text-brand-500">
          若你正经历强烈痛苦或有伤害自己的念头，请拨打
          <b className="mx-1 text-red-600">全国心理援助热线 12356</b>
          或联系身边信任的人。平台也会在对话中主动转介。
        </p>
      </section>

      <p className="mt-8 text-center text-[11px] text-brand-400">
        当前推理引擎：{currentEngineLabel()}
      </p>
    </div>
  );
}
