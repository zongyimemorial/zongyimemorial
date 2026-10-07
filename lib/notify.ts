/**
 * 通知与提醒 · P0 增长基建（2026-10）
 *
 * 三个职责：
 *   1. pushNotify        —— 站内信统一入口（新献祭/留言 → 通知馆主；审核结果 → 通知用户）
 *   2. syncUpcomingReminders —— 忌日/生日/节日提醒的幂等生成
 *   3. Email 通道预留     —— 配置了 RESEND_API_KEY 才发，未配置静默跳过
 *      （沙箱无 key，只保证代码路径存在、不抛错）
 *
 * 提醒触达方式（无 cron 环境的现实约束）：
 *   用户每次打开控制台时调用一次 syncUpcomingReminders（惰性触发，开销两次小查询），
 *   未来部署到有定时任务的环境后，可改为 Vercel Cron 每日批量调用同一函数。
 */

import { prisma } from "@/lib/db";
import { upcomingFestivals } from "@/lib/festivals";

export type NotifyKind = "tribute" | "festival" | "memorial" | "review" | "system";

export interface NotifyInput {
  userId: string;
  kind: NotifyKind;
  title: string;
  body?: string;
  link?: string;
  /** 幂等键：同一事件只生成一条（防重复扫描刷屏） */
  dedupeKey?: string;
}

/**
 * 站内信统一入口。dedupeKey 冲突时静默跳过（幂等）。
 *
 * 写库包 try/catch：通知是衍生行为，调用方（献祭/留言）的主事务此时已提交，
 * 若因通知失败向上抛错，用户会看到"操作失败"而数据实际已入库 —— 观感与事实背离。
 * 失败只打日志。Email 通道同理（下方本就自带 catch）。
 */
export async function pushNotify(input: NotifyInput): Promise<void> {
  const data = {
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    dedupeKey: input.dedupeKey ?? null,
  };
  try {
    if (input.dedupeKey) {
      // upsert 空实现：已存在则什么都不做
      await prisma.notification.upsert({
        where: { dedupeKey: input.dedupeKey },
        update: {},
        create: data,
      });
    } else {
      await prisma.notification.create({ data });
    }
  } catch (e) {
    console.warn("[notify] 站内信写入失败：", (e as Error).message);
  }

  // Email 通道预留：有 key 才发（沙箱无 key，直接跳过）。
  // 不在这里 try/catch 网络——RESEND_API_KEY 未配置时根本不会走到网络层。
  if (process.env.RESEND_API_KEY) {
    try {
      const { notifyByEmail } = await import("@/lib/mailer");
      await notifyByEmail(input);
    } catch (e) {
      // 邮件失败不影响站内信主流程
      console.warn("[notify] 邮件发送失败：", (e as Error).message);
    }
  }
}

/** 新献祭/留言 → 通知馆主（去重：不给自己发）。 */
export async function notifyOwnerOfTribute(opts: {
  ownerUserId: string;
  actorUserId: string | null;
  hallName: string;
  hallLink: string;
  actionLabel: string; // 「献了一束花」「留下了一段留言」
  actorDisplay: string; // 已脱敏的名号
}): Promise<void> {
  if (!opts.actorUserId || opts.actorUserId === opts.ownerUserId) return;
  await pushNotify({
    userId: opts.ownerUserId,
    kind: "tribute",
    title: `${opts.actorDisplay}在「${opts.hallName}」${opts.actionLabel}`,
    body: "打开纪念馆可以查看这条追思记录。",
    link: opts.hallLink,
  });
}

// ---------------------------------------------------------------- 提醒扫描

/** 月-日 的本地化 key，如 10-18 */
function mdKey(d: Date): string {
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * 幂等生成某用户未来 7 天内的提醒：
 *   - 忌日（MemorialHall.deathDate 的月日）与生日（birthDate 的月日）
 *   - 节日（lib/festivals.ts 的 upcomingFestivals）
 * 只在「临近期」（0-7 天）生成，过期不补（没人想收到三天前的提醒）。
 *
 * 返回本次新生成的条数（便于调用方/测试断言幂等性：第二次调用应为 0）。
 */
export async function syncUpcomingReminders(
  userId: string,
  opts: { windowDays?: number } = {},
): Promise<number> {
  const windowDays = opts.windowDays ?? 7;
  const now = new Date();
  let created = 0;

  // ---- 忌日 / 生日（馆主名下 active 的馆）----
  const halls = await prisma.memorialHall.findMany({
    where: {
      ownerUserId: userId,
      status: "active",
      OR: [{ birthDate: { not: null } }, { deathDate: { not: null } }],
    },
    select: { id: true, name: true, deceasedName: true, birthDate: true, deathDate: true },
    take: 50,
  });

  for (const hall of halls) {
    const events: { date: Date | null; kind: "memorial" | "birthday"; label: string }[] = [
      {
        date: hall.deathDate,
        kind: "memorial",
        label: "忌日",
      },
      {
        date: hall.birthDate,
        kind: "birthday",
        label: "生日",
      },
    ];
    for (const ev of events) {
      if (!ev.date) continue;
      // 今年与明年的周年（月日相同），取最近未过去的一次
      const thisYear = new Date(now.getFullYear(), ev.date.getMonth(), ev.date.getDate());
      const nextYear = new Date(now.getFullYear() + 1, ev.date.getMonth(), ev.date.getDate());
      const target = thisYear.getTime() >=
          new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        ? thisYear
        : nextYear;
      const days = Math.round((target.getTime() - now.getTime()) / 86400000);
      if (days < 0 || days > windowDays) continue;

      const iso = `${target.getFullYear()}-${mdKey(target)}`;
      const before = await prisma.notification.count({
        where: { dedupeKey: `memorial:${hall.id}:${ev.kind}:${iso}` },
      });
      if (before > 0) continue;

      await pushNotify({
        userId,
        kind: "memorial",
        title: `${hall.deceasedName}的${ev.label}${days === 0 ? "就在今天" : `将到（${days} 天后）`}`,
        body: `「${hall.name}」的${ev.label}是 ${target.getMonth() + 1} 月 ${target.getDate()} 日。${days === 0 ? "今天" : "记得提前"}来上一炷香、留一句话。`,
        link: `/halls/${hall.id}`,
        dedupeKey: `memorial:${hall.id}:${ev.kind}:${iso}`,
      });
      created++;
    }
  }

  // ---- 节日 ----
  for (const f of upcomingFestivals(now, 3)) {
    if (f.daysUntil > windowDays) continue;
    const iso = `${f.date.getFullYear()}-${mdKey(f.date)}`;
    const before = await prisma.notification.count({
      where: { dedupeKey: `festival:${userId}:${f.spec.kind}:${iso}` },
    });
    if (before > 0) continue;

    await pushNotify({
      userId,
      kind: "festival",
      title: `${f.spec.name}${f.daysUntil === 0 ? "就在今天" : `${f.daysUntil} 天后`}`,
      body: `${f.spec.tagline}可以提前来看看纪念馆，或了解${f.spec.name}的习俗。`,
      link: "/festivals",
      dedupeKey: `festival:${userId}:${f.spec.kind}:${iso}`,
    });
    created++;
  }

  return created;
}

// ---------------------------------------------------------------- 读取

export async function listNotifications(userId: string, take = 20) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/** 全部标记已读 */
export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
