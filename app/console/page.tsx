import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatYuan } from "@/lib/utils";
import { ensureDailyLoginPoints, ensureInviteCode, expirePointsForUser, INVITE_REGISTER_POINTS } from "@/lib/points";
import { topUpFreeOfferings } from "@/lib/offerings";
import { iconOf } from "@/lib/ritual";
import { syncUpcomingReminders, unreadCount, listNotifications } from "@/lib/notify";
import { upcomingFestivals, festivalCountdownLabel, type FestivalOccurrence } from "@/lib/festivals";
import { signOutAction } from "@/app/(public)/actions";
import { markAllNotificationsReadAction, submitServiceIntake } from "@/app/console/actions";
import { obituaryQuotaLeft } from "@/lib/obituary";
import { SERVICE_STATUS_LABEL } from "@/lib/service";

export const metadata = { title: "我的控制台" };

const orderStatusLabel: Record<string, string> = {
  pending: "待支付",
  paid: "已支付",
  closed: "已关闭",
  refunded: "已退款",
};

/** 宗祠建档审核状态文案（与纪念馆同一套 HallStatus 枚举） */
const clanStatusLabel: Record<string, string> = {
  pending: "建档审核中",
  active: "已开通",
  rejected: "未通过",
};

export default async function ConsolePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // 每日登录祭拜：每天首次进入控制台 +5 积分
  await ensureDailyLoginPoints(user.id!);
  // 处理已过期积分（懒执行，满足 12 个月有效期的记账要求）
  await expirePointsForUser(user.id!);
  // 确保用户拥有专属邀请码（社交裂变）
  const inviteCode = await ensureInviteCode(user.id!);
  const inviteCount = await prisma.user.count({ where: { invitedById: user.id! } });

  /*
    供品库存补货：控制台是用户的"总入口"，从这里路过也算活跃。
    免费礼器每日配额在这里补，省得用户先跑一趟纪念馆才发现没货。
    幂等，同一天重复进入不会叠加。
  */
  await topUpFreeOfferings(user.id!);

  /*
    提醒扫描（P0 增长基建）：无 cron 环境的惰性触发——
    用户路过控制台时幂等补生成「未来 7 天内」的忌日/生日/节日提醒站内信。
    dedupeKey 保证同一事件只生成一条，重复进入不刷屏。
  */
  await syncUpcomingReminders(user.id!);

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id! },
    select: { points: true, fortuneCoins: true },
  });
  // 福币条：与积分条并排展示（两条资产轨道口径不同：福币永久有效、积分 12 个月）
  const fortune = { fortuneCoins: dbUser?.fortuneCoins ?? 0 };

  const [orders, halls, whispers, clanHalls, holdings, obituaries, obituaryLeft, services] = await Promise.all([
    prisma.order.findMany({
      where: { userId: user.id! },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { items: { include: { product: true } } },
    }),
    prisma.memorialHall.findMany({
      where: { ownerUserId: user.id! },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.whisperProfile.findMany({
      where: { ownerUserId: user.id! },
      orderBy: { createdAt: "desc" },
      include: { hall: { select: { name: true, deceasedName: true } } },
    }),
    // 宗祠：此前控制台完全漏了这一块，导致用户建完宗祠后在自己面板里找不到入口
    prisma.clanHall.findMany({
      where: { ownerUserId: user.id! },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        surname: true,
        hallName: true,
        name: true,
        origin: true,
        ancestorName: true,
        status: true,
        isPublic: true,
        viewCount: true,
      },
    }),
    // 供品库存：消耗制下 quantity 才是用户真正"手上还有几份"的事实来源
    prisma.offeringHolding.findMany({
      where: { userId: user.id!, quantity: { gt: 0 } },
      orderBy: { updatedAt: "desc" },
      include: {
        product: { select: { slug: true, name: true, isFree: true } },
      },
    }),
    // 电子讣告：用户发布的讣告 + 剩余发布配额
    prisma.obituary.findMany({
      where: { ownerUserId: user.id! },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, deceasedName: true, status: true, passwordHash: true, createdAt: true },
    }),
    obituaryQuotaLeft(user.id!),
    // 服务受理单：云祭扫 / 非讣告纪念服务 支付/兑换后自动建单
    prisma.serviceFulfillment.findMany({
      where: { userId: user.id! },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, productName: true, status: true, intake: true, contact: true, adminNote: true, createdAt: true },
    }),
  ]);

  const whisperByHall = new Map(whispers.map((w) => [w.hallId, w]));

  // ---- 追思日历（P0）----
  // 未读通知 + 未来 60 天内的忌日/生日/节日，合并成一张「为思念标定的日历」。
  const [unread, notifications] = await Promise.all([
    unreadCount(user.id!),
    listNotifications(user.id!, 6),
  ]);

  const CAL_WINDOW_DAYS = 60;
  const today = new Date();
  const dayMs = 86400000;

  interface CalendarEvent {
    kind: "memorial" | "birthday" | "festival";
    label: string;
    sub: string;
    date: Date;
    daysUntil: number;
    href: string;
  }

  const calendarEvents: CalendarEvent[] = [];

  // 忌日 / 生日（名下 active 的馆）
  for (const h of halls) {
    if (h.status !== "active") continue;
    const events: { d: Date | null; kind: "memorial" | "birthday"; label: string }[] = [
      { d: h.deathDate, kind: "memorial", label: "忌日" },
      { d: h.birthDate, kind: "birthday", label: "生日" },
    ];
    for (const ev of events) {
      if (!ev.d) continue;
      const thisYear = new Date(today.getFullYear(), ev.d.getMonth(), ev.d.getDate());
      const nextYear = new Date(today.getFullYear() + 1, ev.d.getMonth(), ev.d.getDate());
      const target = thisYear.getTime() >= new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
        ? thisYear
        : nextYear;
      const days = Math.round((target.getTime() - today.getTime()) / dayMs);
      if (days < 0 || days > CAL_WINDOW_DAYS) continue;
      calendarEvents.push({
        kind: ev.kind,
        label: `${h.deceasedName}的${ev.label}`,
        sub: h.name,
        date: target,
        daysUntil: days,
        href: `/halls/${h.id}`,
      });
    }
  }

  // 节日
  for (const f of upcomingFestivals(today)) {
    if (f.daysUntil > CAL_WINDOW_DAYS) break;
    calendarEvents.push({
      kind: "festival",
      label: f.spec.name,
      sub: f.spec.lunarLabel,
      date: f.date,
      daysUntil: f.daysUntil,
      href: "/festivals",
    });
  }

  calendarEvents.sort((a, b) => a.daysUntil - b.daysUntil);
  const nextFestivalOccurrence: FestivalOccurrence | null = upcomingFestivals(today, 1)[0] ?? null;

  const kindBadge: Record<CalendarEvent["kind"], { text: string; cls: string }> = {
    memorial: { text: "忌日", cls: "bg-brand-800 text-accent-100" },
    birthday: { text: "生日", cls: "bg-emerald-100 text-emerald-700" },
    festival: { text: "节日", cls: "bg-amber-100 text-amber-700" },
  };

  const notifKindIcon: Record<string, string> = {
    tribute: "🕯️",
    festival: "📅",
    memorial: "🕊️",
    review: "✓",
    system: "📣",
  };

  // 概览计数：只数"已开通"的资产，避免把审核中的算成可用
  const stat = [
    { label: "我的订单", value: orders.length, href: "#orders", unit: "笔" },
    { label: "我的纪念馆", value: halls.filter((h) => h.status === "active").length, href: "#halls", unit: "座" },
    { label: "我的宗祠", value: clanHalls.filter((c) => c.status === "active").length, href: "#clan", unit: "座" },
    { label: "追思装置", value: whispers.filter((w) => w.status === "active").length, href: "#whispers", unit: "台" },
    { label: "电子讣告", value: obituaries.length, href: "#obituaries", unit: "份" },
    { label: "我的服务", value: services.length, href: "#services", unit: "单" },
  ];

  const NAV = [
    { href: "/console/wallet", label: "我的钱包" },
    { href: "/console/account", label: "账号设置" },
    { href: "#calendar", label: "追思日历" },
    { href: "#orders", label: "我的订单" },
    { href: "#halls", label: "我的纪念馆" },
    { href: "#clan", label: "我的宗祠" },
    { href: "#offerings", label: "我的供品" },
    { href: "#whispers", label: "追思装置" },
    { href: "#obituaries", label: "我的讣告" },
    { href: "#services", label: "我的服务" },
  ];

  return (
    <div className="container-page max-w-3xl py-12">
      <Link
        href="/"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-brand-500 hover:text-accent-600"
      >
        ← 返回首页
      </Link>
      <h1 className="mb-1 text-3xl font-semibold text-brand-900">我的控制台</h1>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-brand-500">欢迎，{user.name || user.email}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <a
            href="/"
            className="rounded-md border border-brand-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
          >
            返回首页
          </a>
          {(user.role === "admin" || user.role === "editor" || user.role === "super_admin") && (
            <a
              href="/admin"
              className="rounded-md border border-brand-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
            >
              进入管理后台
            </a>
          )}
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md border border-brand-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
            >
              退出登录
            </button>
          </form>
        </div>
      </div>
      {/*
        资产双轨：福币（充值资产，永久有效）+ 积分（行为激励，12 个月有效）。
        **与「邀请好友」同款版式**（section + h2 大标题 + 圆角浅底卡片），
        而不是两枚小胶囊按钮 —— 钱包是控制台的核心资产入口，
        视觉权重必须与「邀请好友」这类独立板块齐平，否则用户扫视时会跳过它。

        ⚠️ 保留 `data-asset-strip` 标记：钱包套件的断言按它定位，
        改成 section 后若顺手删掉标记，`verify-fortune-wallet` 会静默找不到这块。
      */}
      <section className="mb-10" data-asset-strip>
        <h2 className="mb-3 text-lg font-semibold text-brand-900">我的钱包</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/console/wallet"
            className="flex items-center justify-between rounded-lg border border-accent-200 bg-accent-50/60 p-4 transition hover:border-accent-400"
          >
            <div>
              <div className="text-sm text-brand-700">
                我的福币：<span className="text-lg font-bold text-accent-700">{fortune?.fortuneCoins ?? 0}</span>
                <span className="ml-1 text-sm text-brand-700">福币</span>
              </div>
              <p className="mt-1 text-xs text-brand-500">充值资产 · 永久有效 · 可用于全平台消费</p>
            </div>
            <span className="shrink-0 text-sm font-bold text-accent-700">去充值 →</span>
          </Link>
          <Link
            href="/points"
            className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/60 p-4 transition hover:border-amber-300"
          >
            <div>
              <div className="text-sm text-brand-700">
                我的积分：<span className="text-lg font-bold text-amber-600">{dbUser?.points ?? 0}</span>
                <span className="ml-1 text-sm text-brand-700">分</span>
              </div>
              <p className="mt-1 text-xs text-brand-500">行为激励 · 12 个月有效 · 可兑换祭品</p>
            </div>
            <span className="shrink-0 text-sm font-bold text-amber-700">去兑换 →</span>
          </Link>
        </div>
      </section>

      {/* 资产概览：一眼看清自己名下都有什么，而不是往下滚着找 */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat.map((s) => (
          <a
            key={s.label}
            href={s.href}
            className="rounded-lg border border-brand-200 bg-brand-100/70 p-4 transition hover:border-accent-400"
          >
            <div className="text-xs text-brand-400">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold text-brand-900">
              {s.value}
              <span className="ml-0.5 text-xs font-normal text-brand-400">{s.unit}</span>
            </div>
          </a>
        ))}
      </div>

      {/*
        锚点导航：控制台板块变多了，给一条固定的跳转条。
        「我的钱包」是**跨页跳转**（不是页内锚点），且是核心资产入口 ——
        给它描金实底样式与其它锚点区分开，否则混在一排里会被当成普通锚点忽略。
      */}
      <nav className="mb-8 flex flex-wrap items-center gap-2 text-sm">
        {NAV.map((n) => {
          const isWallet = n.href === "/console/wallet";
          return (
            <a
              key={n.href}
              href={n.href}
              className={
                isWallet
                  ? "rounded-full border border-accent-400 bg-accent-50 px-3 py-1 font-semibold text-accent-700 hover:bg-accent-100"
                  : "rounded-full border border-brand-200 px-3 py-1 text-brand-600 hover:border-accent-400 hover:text-accent-600"
              }
            >
              {n.label}
            </a>
          );
        })}
      </nav>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-brand-900">邀请好友</h2>
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4">
          <p className="text-sm text-brand-700">
            把专属邀请码或链接分享给亲友，好友注册后
            <span className="font-semibold text-accent-600"> 你 +{INVITE_REGISTER_POINTS} 积分</span>。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="rounded-md border border-amber-200 bg-brand-100/70 px-4 py-2 text-sm">
              <span className="text-brand-400">我的邀请码：</span>
              <span className="font-mono text-base font-bold tracking-widest text-brand-900">
                {inviteCode}
              </span>
            </div>
            <div className="flex-1 truncate rounded-md border border-brand-200 bg-brand-100/70 px-3 py-2 text-xs text-brand-500">
              注册链接：/register?invite={inviteCode}
            </div>
          </div>
          <p className="mt-2 text-xs text-brand-400">
            已成功邀请 <span className="font-semibold text-brand-700">{inviteCount}</span> 位好友
          </p>
        </div>
      </section>

      {/* 追思日历（P0 增长基建）：忌日/生日/节日 + 站内通知。
          ForeverMissed 等海外平台的数据证明：忌日/生日提醒是口碑第一的功能——
          祭扫是低频行为，提醒是把用户「带回来」的那只手。 */}
      <section id="calendar" className="mb-10 scroll-mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-brand-900">追思日历</h2>
          {unread > 0 && (
            <form action={markAllNotificationsReadAction}>
              <button
                type="submit"
                className="rounded-full border border-brand-200 px-3 py-1 text-xs text-brand-600 hover:bg-brand-50"
              >
                全部标为已读（{unread} 条未读）
              </button>
            </form>
          )}
        </div>

        {/* 未来 60 天日历 */}
        <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-4">
          {nextFestivalOccurrence && (
            <p className="mb-3 text-sm text-brand-700">
              下一个节日：
              <Link href="/festivals" className="font-semibold text-brand-900 hover:underline">
                {nextFestivalOccurrence.spec.name}
              </Link>
              （{nextFestivalOccurrence.date.getMonth() + 1} 月{" "}
              {nextFestivalOccurrence.date.getDate()} 日 ·{" "}
              {festivalCountdownLabel(nextFestivalOccurrence.daysUntil)}）
              <span className="ml-2 text-xs text-brand-400">点按可了解习俗</span>
            </p>
          )}
          {calendarEvents.length === 0 ? (
            <p className="text-sm text-brand-400">
              近 60 天暂无需要记挂的日子。为纪念馆补全生卒日期后，忌日与生日提醒会自动出现在这里。
            </p>
          ) : (
            <ul className="space-y-2">
              {calendarEvents.slice(0, 8).map((ev, i) => (
                <li key={`${ev.kind}-${ev.label}-${i}`}>
                  <Link
                    href={ev.href}
                    className="flex items-center gap-3 rounded-md bg-brand-100/70 px-3 py-2 text-sm transition hover:border-accent-300"
                  >
                    <span
                      className={
                        "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium " +
                        kindBadge[ev.kind].cls
                      }
                    >
                      {kindBadge[ev.kind].text}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-brand-900">
                      {ev.label}
                      <span className="ml-2 text-xs text-brand-400">{ev.sub}</span>
                    </span>
                    <span className="shrink-0 text-xs text-brand-500">
                      {ev.date.getMonth() + 1} 月 {ev.date.getDate()} 日 ·{" "}
                      {festivalCountdownLabel(ev.daysUntil)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 站内通知 */}
        {notifications.length > 0 && (
          <div className="mt-3 space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={
                  "flex items-start gap-3 rounded-lg border p-3 " +
                  (n.readAt ? "border-brand-200 bg-brand-100/70" : "border-accent-200 bg-accent-50/40")
                }
              >
                <span className="text-base" aria-hidden="true">
                  {notifKindIcon[n.kind] ?? "🔔"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-brand-900">
                    {n.link ? (
                      <Link href={n.link} className="hover:text-accent-600 hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </div>
                  {n.body && <p className="mt-0.5 text-xs text-brand-500">{n.body}</p>}
                  <div className="mt-0.5 text-[11px] text-brand-300">
                    {n.createdAt.toLocaleDateString("zh-CN")}
                  </div>
                </div>
                {!n.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent-500" />}
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="orders" className="mb-10 scroll-mt-6">
        <h2 className="mb-3 text-lg font-semibold text-brand-900">我的订单</h2>
        <div className="space-y-3">
          {orders.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-100/70 p-4"
            >
              <div>
                <div className="text-sm font-medium text-brand-900">
                  {(o.items[0]?.snapshot as { name?: string })?.name || "商品"}
                  {o.items.length > 1 ? ` 等 ${o.items.length} 件` : ""}
                </div>
                <div className="text-xs text-brand-400">{o.orderNo}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-brand-700">
                  ¥{formatYuan(o.payAmount)}
                </div>
                <div className="text-xs text-brand-500">
                  {orderStatusLabel[o.status] ?? o.status}
                </div>
                {(() => {
                  const addr = o.shippingAddress as {
                    name?: string;
                    phone?: string;
                    address?: string;
                  } | null;
                  if (!addr) return null;
                  const ship = o.shipStatus || "pending";
                  const shipText =
                    ship === "pending"
                      ? "待发货"
                      : ship === "shipped"
                        ? "已发货"
                        : ship === "delivered"
                          ? "已签收"
                          : ship;
                  return (
                    <div className="mt-1 text-xs text-brand-400">
                      收货：{addr.name} · {shipText}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <p className="text-sm text-brand-400">暂无订单，去商城看看吧。</p>
          )}
        </div>
      </section>

      <section id="whispers" className="mb-10 scroll-mt-6">
        <h2 className="mb-3 text-lg font-semibold text-brand-900">我的追思装置（午夜悄悄话）</h2>
        <div className="space-y-3">
          {whispers.map((w) => (
            <Link
              key={w.id}
              href={`/console/whispers/${w.id}`}
              className="block rounded-lg border border-brand-200 bg-brand-100/70 p-4 hover:border-accent-400"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-brand-900">{w.personaName}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      "rounded px-2 py-0.5 text-[11px] " +
                      (w.status === "active"
                        ? "bg-emerald-100 text-emerald-700"
                        : w.status === "pending"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-600")
                    }
                  >
                    {w.status === "active" ? "已通过" : w.status === "pending" ? "待审核" : "已驳回"}
                  </span>
                  <span
                    className={
                      "rounded px-2 py-0.5 text-[11px] " +
                      (w.enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600")
                    }
                  >
                    {w.enabled ? "对话已开启" : "对话未开启"}
                  </span>
                </div>
              </div>
              <div className="mt-1 text-xs text-brand-400">
                纪念馆：{w.hall.name} · 逝者：{w.hall.deceasedName}
              </div>
              <div className="mt-2 text-xs text-accent-600">管理资料 / 声音 / 授权 →</div>
            </Link>
          ))}
          {whispers.length === 0 && (
            <p className="text-sm text-brand-400">
              还没有追思装置。在已开通的纪念馆下方点「设立午夜悄悄话」即可开设，
              <Link href="/whispers" className="ml-1 text-accent-600 hover:underline">
                了解这个板块 →
              </Link>
            </p>
          )}
        </div>
      </section>

      <section id="obituaries" className="mb-10 scroll-mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-900">我的电子讣告</h2>
          <Link href="/console/obituaries" className="text-sm text-accent-600 hover:underline">
            全部 / 发布新讣告 →
          </Link>
        </div>
        <div className="space-y-3">
          {obituaries.map((o) => (
            <Link
              key={o.id}
              href={`/console/obituaries/${o.id}`}
              className="block rounded-lg border border-brand-200 bg-brand-100/70 p-4 hover:border-accent-400"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-brand-900">{o.deceasedName}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      "rounded px-2 py-0.5 text-[11px] " +
                      (o.status === "published"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-600")
                    }
                  >
                    {o.status === "published" ? "已发布" : "已下架"}
                  </span>
                  {o.passwordHash && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                      已加密
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 text-xs text-accent-600">查看公开页 / 管理 →</div>
            </Link>
          ))}
          {obituaries.length === 0 && (
            <p className="text-sm text-brand-400" data-obituary-empty>
              还没有发布电子讣告。
              {obituaryLeft > 0 ? (
                <>
                  你有 {obituaryLeft} 份发布配额，
                  <Link href="/console/obituaries/new" className="ml-1 text-accent-600 hover:underline">
                    立即发布 →
                  </Link>
                </>
              ) : (
                <>
                  购买或用积分兑换「电子讣告发布」后即可发布，
                  <Link href="/mall/e-obituary" className="ml-1 text-accent-600 hover:underline">
                    去商城 →
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
      </section>

      <section id="services" className="mb-10 scroll-mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-900">我的服务</h2>
        </div>
        <p className="mb-3 text-xs text-brand-400">
          云祭扫、传记代写、追思视频、扫码云碑等人工服务，购买/兑换后会在此生成受理单。
          请提交需求与资料，工作人员将与你联系；受理进展与交付说明会实时显示在此处。
        </p>
        <div className="space-y-3">
          {services.map((s) => {
            const needInput = s.status === "pending" || s.status === "processing";
            return (
              <div
                key={s.id}
                className="rounded-lg border border-brand-200 bg-brand-100/70 p-4"
                data-service-id={s.id}
                data-service-status={s.status}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-brand-900">{s.productName}</div>
                  <span
                    className={
                      "rounded px-2 py-0.5 text-[11px] " +
                      (s.status === "done"
                        ? "bg-emerald-100 text-emerald-700"
                        : s.status === "processing"
                          ? "bg-blue-100 text-blue-700"
                          : s.status === "rejected"
                            ? "bg-red-100 text-red-600"
                            : "bg-gray-100 text-gray-600")
                    }
                  >
                    {SERVICE_STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </div>
                {s.adminNote && (
                  <div
                    className={
                      "mt-2 rounded-md px-3 py-2 text-xs " +
                      (s.status === "done"
                        ? "bg-emerald-50 text-emerald-700"
                        : s.status === "rejected"
                          ? "bg-red-50 text-red-600"
                          : "bg-blue-50 text-blue-700")
                    }
                  >
                    <span className="font-medium">
                      {s.status === "done"
                        ? "交付说明："
                        : s.status === "rejected"
                          ? "驳回说明："
                          : "处理进展："}
                    </span>
                    {s.adminNote}
                  </div>
                )}
                {s.intake && (
                  <div className="mt-2 text-xs text-brand-500">
                    <span className="font-medium text-brand-700">已提交需求：</span>
                    {s.intake}
                  </div>
                )}
                {needInput && (
                  <form action={submitServiceIntake} className="mt-3 space-y-2">
                    <input type="hidden" name="id" value={s.id} />
                    <textarea
                      name="intake"
                      defaultValue={s.intake ?? ""}
                      rows={3}
                      placeholder="请描述你的需求（如逝者信息、视频风格、云碑内容等）"
                      className="w-full rounded-md border border-brand-300 p-2 text-sm"
                    />
                    <input
                      name="contact"
                      defaultValue={s.contact ?? ""}
                      placeholder="可选联系电话"
                      className="w-full rounded-md border border-brand-300 p-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-accent-600 px-3 py-1.5 text-sm text-white hover:bg-accent-700"
                    >
                      {s.intake ? "更新需求" : "提交需求"}
                    </button>
                  </form>
                )}
              </div>
            );
          })}
          {services.length === 0 && (
            <p className="text-sm text-brand-400">
              暂无服务受理单。购买或兑换云祭扫、传记代写、追思视频、扫码云碑等服务后将在此出现。
            </p>
          )}
        </div>
      </section>

      <section id="halls" className="mb-10 scroll-mt-6">
        <h2 className="mb-3 text-lg font-semibold text-brand-900">我的纪念馆</h2>
        <div className="space-y-3">
          {halls.map((h) => (
            <div
              key={h.id}
              className="block rounded-lg border border-brand-200 bg-brand-100/70 p-4 hover:border-brand-500"
            >
              {h.status === "pending" ? (
                <div>
                  <div className="text-sm font-medium text-brand-900">{h.name}</div>
                  <div className="mt-1 text-xs text-amber-600">
                    ⏳ 建馆审核中：证明材料经专人核对后开通（依据 MZ/T 173—2025）
                  </div>
                </div>
              ) : h.status === "rejected" ? (
                <div>
                  <div className="text-sm font-medium text-brand-900">{h.name}</div>
                  <div className="mt-1 text-xs text-red-500">
                    建馆申请未通过审核，如有疑问请联系平台客服。
                  </div>
                </div>
              ) : (
                <div>
                  <Link href={`/halls/${h.id}`} className="block">
                    <div className="text-sm font-medium text-brand-900">{h.name}</div>
                    <div className="text-xs text-brand-400">
                      逝者：{h.deceasedName} · {h.isPublic ? "已公开" : "私密"}
                    </div>
                  </Link>
                  <Link
                    href={`/console/halls/${h.id}`}
                    className="mt-2 inline-block text-xs text-accent-600 hover:underline"
                  >
                    馆务管理（挽联 / 故人档案 / 相册）→
                  </Link>
                  <span className="mx-2 text-xs text-gray-300">|</span>
                  {whisperByHall.has(h.id) ? (
                    <Link
                      href={`/console/whispers/${whisperByHall.get(h.id)!.id}`}
                      className="mt-2 inline-block text-xs text-accent-600 hover:underline"
                    >
                      午夜悄悄话装置 →
                    </Link>
                  ) : (
                    <Link
                      href={`/whispers/${h.id}`}
                      className="mt-2 inline-block text-xs text-accent-600 hover:underline"
                    >
                      设立「午夜悄悄话」→
                    </Link>
                  )}
                </div>
              )}
            </div>
          ))}
          {halls.length === 0 && (
            <p className="text-sm text-brand-400">
              还没有纪念馆。建馆免费，实名认证后即可
              <Link href="/halls/new" className="ml-1 text-accent-600 hover:underline">
                申请建馆
              </Link>
              。
            </p>
          )}
        </div>
      </section>

      {/* 我的宗祠 —— 与纪念馆平行的一等资产，必须有自己的入口 */}
      <section id="clan" className="mb-10 scroll-mt-6">
        <h2 className="mb-3 text-lg font-semibold text-brand-900">我的宗祠</h2>
        <div className="space-y-3">
          {clanHalls.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-brand-200 bg-brand-100/70 p-4 hover:border-brand-500"
            >
              {c.status === "pending" ? (
                <div>
                  <div className="text-sm font-medium text-brand-900">
                    {c.hallName} · {c.name}
                  </div>
                  <div className="mt-1 text-xs text-amber-600">
                    ⏳ 建档审核中：宗祠信息公开展示前经专人核对
                  </div>
                </div>
              ) : c.status === "rejected" ? (
                <div>
                  <div className="text-sm font-medium text-brand-900">
                    {c.hallName} · {c.name}
                  </div>
                  <div className="mt-1 text-xs text-red-500">
                    建档申请未通过审核，如有疑问请联系平台客服。
                  </div>
                </div>
              ) : (
                <div>
                  <Link href={`/clan/halls/${c.id}`} className="block">
                    <div className="text-sm font-medium text-brand-900">
                      {c.hallName}
                      <span className="ml-2 text-xs font-normal text-brand-400">堂号 {c.name}</span>
                    </div>
                    <div className="text-xs text-brand-400">
                      {/* surname 正常存单字（林/陈/李），但也有历史数据存成「陆氏」，
                          直接拼「氏」会渲染成「陆氏氏」。这里做一次幂等收敛。 */}
                      {c.surname.endsWith("氏") ? c.surname : `${c.surname}氏`}
                      {c.ancestorName ? ` · 始祖 ${c.ancestorName}` : ""}
                      {c.origin ? ` · ${c.origin}` : ""} ·{" "}
                      {c.isPublic ? "已公开" : "私密"} · {c.viewCount} 次参访
                    </div>
                  </Link>
                  <Link
                    href={`/console/clan-halls/${c.id}`}
                    className="mt-2 inline-block text-xs text-accent-600 hover:underline"
                  >
                    宗祠管理（装修 / 相册 / 堂号字辈 / 祭祀记录）→
                  </Link>
                </div>
              )}
            </div>
          ))}
          {clanHalls.length === 0 && (
            <p className="text-sm text-brand-400">
              还没有宗祠。宗祠建档免费，实名认证后即可设立，
              <Link href="/clan/halls/new" className="ml-1 text-accent-600 hover:underline">
                去设立宗祠 →
              </Link>
            </p>
          )}
        </div>
      </section>

      {/* 我的供品 —— 供奉体系改消耗制后，库存是玩家侧唯一的事实来源 */}
      <section id="offerings" className="mb-10 scroll-mt-6">
        <h2 className="mb-3 text-lg font-semibold text-brand-900">我的供品</h2>
        {holdings.length === 0 ? (
          <p className="text-sm text-brand-400">
            暂无可用供品。免费礼器（上香 / 献花 / 点烛等）每日自动领 1 份，进入纪念馆或宗祠即可使用；
            更多精美供品可在
            <Link href="/mall" className="mx-1 text-accent-600 hover:underline">
              商城
            </Link>
            购买或
            <Link href="/points" className="mx-1 text-accent-600 hover:underline">
              积分兑换
            </Link>
            。
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-brand-400">
              共 {holdings.length} 种 · 供品为消耗制，每次献祭扣 1 份，用尽后需重新获得。
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {holdings.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-100/70 p-3"
                >
                  <span className="text-xl" aria-hidden="true">
                    {iconOf(h.product.slug)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-brand-900">{h.product.name}</div>
                    <div className="text-xs text-brand-400">
                      {h.product.isFree ? "免费礼器" : "已购"}
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                    {h.quantity} 份
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
