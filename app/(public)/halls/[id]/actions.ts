"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { tributeTypeOf } from "@/lib/ritual";
import { consumeOffering, topUpFreeOfferings } from "@/lib/offerings";
import { identitySnapshot } from "@/lib/identity";
import { notifyOwnerOfTribute } from "@/lib/notify";

/**
 * 供奉体系：祭品是**消耗品**。
 *
 * 重构前这里靠「30 秒冷却 + OrderItem 是否付过款」判定能否祭拜，
 * 结果是买一次就能永久无限次祭拜，且"点两下只记一次"的行为与消耗语义矛盾。
 * 现在改为：每次祭拜原子扣减 1 份库存，库存为 0 直接拒绝。
 * 冷却机制随之删除 —— 库存本身就是更强的防重。
 */

/**
 * 身份快照已提到 lib/identity.ts，与社区帖子/回帖共用。
 * 三条写路径（免费/收费/留言）共用 identitySnapshot()，保证口径唯一。
 */

export type OfferResult = { ok: boolean; message: string; remaining?: number };

/**
 * 扣一份库存，免费品在库存不足时先补当日配额再重试一次。
 *
 * 为什么消耗失败还要补货：用户可能绕过页面直连 action（BFCache、直接调用），
 * 没经过页面渲染时的补货。这里兜底一次，保证"每天有 3 份"的承诺成立。
 */
async function consumeWithTopUp(userId: string, productId: string, isFree: boolean) {
  let consumed = await consumeOffering(userId, productId);
  if (!consumed.ok && isFree) {
    await topUpFreeOfferings(userId);
    consumed = await consumeOffering(userId, productId);
  }
  return consumed;
}

/** 库存不足时的统一文案：区分「从未持有」与「持有但用尽」 */
function noStockMessage(reason: "no_stock" | "no_holding", isFree: boolean, name: string) {
  if (reason === "no_holding") {
    return isFree ? `今日「${name}」尚未补充，请稍后重试` : `尚未持有「${name}」，请先在商城敬献`;
  }
  return isFree
    ? `今日份「${name}」已用尽，明日再来～`
    : `「${name}」库存不足，请先到商城敬献`;
}

// 免费祭品一键祭拜：校验 isRitual（不是 isFree）→ 扣库存 → 写入追思记录 + 供台陈列
//
// 用 isRitual 而非 isFree 做准入：收费祭品同样是礼器，
// 购买后由 offerPaidTribute 服务，两者共用同一套扣库存与写记录的逻辑。
export async function offerFreeTribute(hallId: string, productId: string): Promise<OfferResult> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const [hall, product] = await Promise.all([
    prisma.memorialHall.findUnique({ where: { id: hallId } }),
    prisma.product.findUnique({ where: { id: productId } }),
  ]);
  if (!hall || hall.status !== "active") return { ok: false, message: "纪念馆不可用" };
  if (!product || !product.isRitual || product.status !== "active")
    return { ok: false, message: "祭品不可用" };
  // 收费祭品必须走 offerPaidTribute，避免绕过付费直接把东西献出去
  if (!product.isFree) return { ok: false, message: "该祭品需先敬献后使用" };

  const consumed = await consumeWithTopUp(user.id, productId, true);
  if (!consumed.ok) return { ok: false, message: noStockMessage(consumed.reason, true, product.name) };

  const now = new Date();
  const snap = await identitySnapshot(user.id);
  await prisma.$transaction([
    prisma.memorialTribute.create({
      data: {
        hallId,
        userId: user.id,
        productId,
        type: tributeTypeOf(product.slug),
        // 身份快照：脱敏展示 + 完整值仅供馆主/管理台（前台只读 displayName）
        ...snap,
      },
    }),
    prisma.offeringOnAltar.create({
      data: { hallId, userId: user.id, productId, createdAt: now },
    }),
  ]);

  // 站内信：有人来祭拜，让馆主知道（自己献自己的不发）。事务已提交，通知失败不影响主流程。
  await notifyOwnerOfTribute({
    ownerUserId: hall.ownerUserId,
    actorUserId: user.id,
    hallName: hall.name,
    hallLink: `/halls/${hallId}`,
    actionLabel: `敬献了「${product.name}」`,
    actorDisplay: snap.displayName,
  });

  revalidatePath(`/halls/${hallId}`);
  return { ok: true, message: `${product.name}已敬献，心意已达`, remaining: consumed.remaining };
}

// 已购祭品一键祭拜：收费礼器购买后进库存，在这里消耗
export async function offerPaidTribute(hallId: string, productId: string): Promise<OfferResult> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const [hall, product] = await Promise.all([
    prisma.memorialHall.findUnique({ where: { id: hallId } }),
    prisma.product.findUnique({ where: { id: productId } }),
  ]);
  if (!hall || hall.status !== "active") return { ok: false, message: "纪念馆不可用" };
  if (!product || !product.isRitual || product.status !== "active")
    return { ok: false, message: "祭品不可用" };
  if (product.isFree) return { ok: false, message: "该祭品免费，可直接祭拜" };

  // 拥有关系已由库存表达，不再查 OrderItem ——
  // 查订单只能回答"是否买过"，回答不了"还剩几件"。
  const consumed = await consumeOffering(user.id, productId);
  if (!consumed.ok) return { ok: false, message: noStockMessage(consumed.reason, false, product.name) };

  const now = new Date();
  const snap = await identitySnapshot(user.id);
  await prisma.$transaction([
    prisma.memorialTribute.create({
      data: {
        hallId,
        userId: user.id,
        productId,
        type: tributeTypeOf(product.slug),
        ...snap,
      },
    }),
    prisma.offeringOnAltar.create({
      data: { hallId, userId: user.id, productId, createdAt: now },
    }),
  ]);

  // 站内信：同上，已购礼器祭拜也通知馆主
  await notifyOwnerOfTribute({
    ownerUserId: hall.ownerUserId,
    actorUserId: user.id,
    hallName: hall.name,
    hallLink: `/halls/${hallId}`,
    actionLabel: `敬献了「${product.name}」`,
    actorDisplay: snap.displayName,
  });

  revalidatePath(`/halls/${hallId}`);
  return { ok: true, message: `${product.name}已敬献，心意已达`, remaining: consumed.remaining };
}

// 免费留言追思（天堂信箱 / 留言）：带留言内容
export async function offerMessage(
  hallId: string,
  productId: string,
  message: string
): Promise<OfferResult> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };
  const text = message.trim().slice(0, 200);
  if (!text) return { ok: false, message: "请写下想说的话" };

  const hall = await prisma.memorialHall.findUnique({ where: { id: hallId } });
  if (!hall || hall.status !== "active") return { ok: false, message: "纪念馆不可用" };

  // 留言类祭品同样走库存（free-message / free-letter 都在免费礼器名单内）
  let remaining: number | undefined;
  if (productId) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    const consumed = await consumeWithTopUp(user.id, productId, !!product?.isFree);
    if (!consumed.ok) {
      return {
        ok: false,
        message: noStockMessage(consumed.reason, !!product?.isFree, product?.name ?? "留言"),
      };
    }
    remaining = consumed.remaining;
  }

  const now = new Date();
  const snap = await identitySnapshot(user.id);
  await prisma.$transaction([
    prisma.memorialTribute.create({
      data: {
        hallId,
        userId: user.id,
        productId: productId || null,
        type: "message",
        message: text,
        ...snap,
      },
    }),
    ...(productId
      ? [
          prisma.offeringOnAltar.create({
            data: { hallId, userId: user.id, productId, createdAt: now },
          }),
        ]
      : []),
  ]);

  // 站内信：留言追思同样让馆主知道
  await notifyOwnerOfTribute({
    ownerUserId: hall.ownerUserId,
    actorUserId: user.id,
    hallName: hall.name,
    hallLink: `/halls/${hallId}`,
    actionLabel: "留下了一段追思留言",
    actorDisplay: snap.displayName,
  });

  revalidatePath(`/halls/${hallId}`);
  return { ok: true, message: "留言已送达", remaining };
}

/**
 * 撤供：清空**本人**摆在供台上的供品。
 *
 * 只撤本人的 —— 纪念馆是公开的，若允许撤走别人的供品，
 * 任何访客都能一键清空馆主的供台。这是有意的权限边界。
 */
export async function clearAltar(hallId: string): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, message: "请先登录" };

  const res = await prisma.offeringOnAltar.updateMany({
    where: { hallId, userId: user.id, clearedAt: null },
    data: { clearedAt: new Date() },
  });

  revalidatePath(`/halls/${hallId}`);
  return { ok: true, message: res.count > 0 ? `已撤下 ${res.count} 件供品` : "供台已是空的" };
}

// 祭拜厅分时预约（清明/冬至等高峰期人流控制）
export async function reserveSlot(
  hallId: string,
  data: { date: string; timeSlot: string; name: string; phone: string }
): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "请先登录" };
  if (!data.date) return { ok: false, message: "请选择日期" };
  if (!data.name.trim() || !data.phone.trim())
    return { ok: false, message: "请填写姓名与手机号" };
  if (!/^1\d{10}$/.test(data.phone.trim()))
    return { ok: false, message: "手机号格式不正确" };

  const hall = await prisma.memorialHall.findUnique({ where: { id: hallId } });
  if (!hall || hall.status !== "active") return { ok: false, message: "纪念馆不可用" };

  const date = new Date(data.date + "T00:00:00+08:00");
  if (Number.isNaN(date.getTime())) return { ok: false, message: "日期格式不正确" };
  if (date.getTime() < new Date().setHours(0, 0, 0, 0))
    return { ok: false, message: "不能预约过去的日期" };

  // 同一时段最多 20 组，控制高峰人流
  const count = await prisma.hallReservation.count({
    where: { hallId, date, timeSlot: data.timeSlot, status: "confirmed" },
  });
  if (count >= 20) return { ok: false, message: "该时段已约满，请选择其他时段" };

  // 同一用户同日同时段不重复预约
  const dup = await prisma.hallReservation.findFirst({
    where: { hallId, userId: user.id, date, timeSlot: data.timeSlot, status: "confirmed" },
  });
  if (dup) return { ok: false, message: "您已预约该时段" };

  await prisma.hallReservation.create({
    data: {
      hallId,
      userId: user.id!,
      date,
      timeSlot: data.timeSlot,
      name: data.name.trim(),
      phone: data.phone.trim(),
    },
  });

  return { ok: true, message: `预约成功：${data.date} ${data.timeSlot}` };
}
