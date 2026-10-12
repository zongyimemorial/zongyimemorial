import { prisma } from "@/lib/db";

/**
 * 后台运营数据：纪念馆 / 宗祠消费台帐聚合层。
 *
 * 设计原则（合规）：
 * - 只做「聚合级」汇总，归属对象是「馆 / 祠」，不提供逐用户的消费下钻。
 * - 金额汇总 = 已绑定 targetHallId 的已付订单 + 建馆订单（MemorialHall.orderId）。
 * - 祭品 / 云祭扫以「消耗式库存」在馆内供奉，购买时不绑定具体馆
 *   （OfferingHolding 用户级共享），金额不强行归属到馆，仅以「供奉次数」作活跃度指标。
 * - 零 schema 变更，全部基于现有 Order / MemorialHall / ClanHall / *Tribute 关系。
 */

export const PRODUCT_TYPE_LABEL: Record<string, string> = {
  memorial_hall: "建馆 / 续费",
  cloud_worship: "云祭扫服务",
  virtual_flower: "虚拟献花点灯",
  tribute_item: "纪念物品",
  physical_goods: "实体商品",
  memorial_service: "纪念服务",
  subscription: "高级订阅",
  whisper_plan: "午夜悄悄话",
  decor: "空间装修",
  storage: "存储容量",
  fortune_topup: "福币充值",
};

export const HALL_STATUS_LABEL: Record<string, string> = {
  pending: "待审核",
  active: "已开通",
  rejected: "已驳回",
};

export type ConsumptionSummary = {
  totalFen: number;
  count: number;
  lastAt: Date | null;
  tributeCount: number;
  byCategory: { type: string; label: string; fen: number }[];
  orders: {
    id: string;
    orderNo: string;
    payAmount: number;
    createdAt: Date;
    buyer: string;
    items: { name: string; type: string }[];
  }[];
};

/** 单座纪念馆的消费汇总 + 近期订单 + 按品类拆分 */
export async function getHallConsumption(hallId: string): Promise<ConsumptionSummary> {
  const hall = await prisma.memorialHall.findUnique({
    where: { id: hallId },
    select: { orderId: true },
  });

  const idSet = new Set<string>();
  if (hall?.orderId) idSet.add(hall.orderId);

  const targeted = await prisma.order.findMany({
    where: { targetHallId: hallId, targetKind: "hall", status: "paid" },
    select: { id: true },
  });
  targeted.forEach((o) => idSet.add(o.id));

  const orders = await prisma.order.findMany({
    where: { id: { in: [...idSet] }, status: "paid" },
    include: {
      items: { include: { product: { select: { name: true, type: true } } } },
      user: { select: { realName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const byCat = new Map<string, number>();
  let totalFen = 0;
  let lastAt: Date | null = null;
  for (const o of orders) {
    totalFen += o.payAmount;
    if (!lastAt || o.createdAt > lastAt) lastAt = o.createdAt;
    for (const it of o.items) {
      const fen = (it.unitPrice ?? 0) * (it.quantity ?? 1);
      byCat.set(it.product?.type ?? "other", (byCat.get(it.product?.type ?? "other") ?? 0) + fen);
    }
  }

  const tributeCount =
    (await prisma.memorialTribute.count({ where: { hallId } })) +
    (await prisma.offeringOnAltar.count({ where: { hallId } }));

  const byCategory = [...byCat.entries()]
    .map(([type, fen]) => ({ type, label: PRODUCT_TYPE_LABEL[type] ?? type, fen }))
    .sort((a, b) => b.fen - a.fen);

  return {
    totalFen,
    count: orders.length,
    lastAt,
    tributeCount,
    byCategory,
    orders: orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      payAmount: o.payAmount,
      createdAt: o.createdAt,
      buyer: o.user?.realName || o.user?.email || "—",
      items: o.items.map((it) => ({
        name: (it.snapshot as { name?: string } | null)?.name || it.product?.name || "商品",
        type: it.product?.type ?? "other",
      })),
    })),
  };
}

/** 单座宗祠的消费汇总 + 近期订单 + 按品类拆分 */
export async function getClanConsumption(clanHallId: string): Promise<ConsumptionSummary> {
  const orders = await prisma.order.findMany({
    where: { targetHallId: clanHallId, targetKind: "clan", status: "paid" },
    include: {
      items: { include: { product: { select: { name: true, type: true } } } },
      user: { select: { realName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const byCat = new Map<string, number>();
  let totalFen = 0;
  let lastAt: Date | null = null;
  for (const o of orders) {
    totalFen += o.payAmount;
    if (!lastAt || o.createdAt > lastAt) lastAt = o.createdAt;
    for (const it of o.items) {
      const fen = (it.unitPrice ?? 0) * (it.quantity ?? 1);
      byCat.set(it.product?.type ?? "other", (byCat.get(it.product?.type ?? "other") ?? 0) + fen);
    }
  }

  const tributeCount =
    (await prisma.clanTribute.count({ where: { clanHallId } })) +
    (await prisma.offeringOnAltar.count({ where: { clanHallId } }));

  const byCategory = [...byCat.entries()]
    .map(([type, fen]) => ({ type, label: PRODUCT_TYPE_LABEL[type] ?? type, fen }))
    .sort((a, b) => b.fen - a.fen);

  return {
    totalFen,
    count: orders.length,
    lastAt,
    tributeCount,
    byCategory,
    orders: orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      payAmount: o.payAmount,
      createdAt: o.createdAt,
      buyer: o.user?.realName || o.user?.email || "—",
      items: o.items.map((it) => ({
        name: (it.snapshot as { name?: string } | null)?.name || it.product?.name || "商品",
        type: it.product?.type ?? "other",
      })),
    })),
  };
}

type LedgerRow = {
  id: string;
  name: string;
  sub: string; // 故人姓名 / 堂号
  owner: string;
  status: string;
  totalFen: number;
  count: number;
  lastAt: Date | null;
  tributeCount: number;
};

/** 纪念馆消费台帐列表（聚合，O(订单) 而非 O(馆)） */
export async function listHallLedger(): Promise<LedgerRow[]> {
  const [halls, targetAgg, creationOrders, tributeAgg, altarAgg] = await Promise.all([
    prisma.memorialHall.findMany({
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { realName: true, email: true } } },
    }),
    prisma.order.groupBy({
      by: ["targetHallId"],
      where: { targetKind: "hall", status: "paid", targetHallId: { not: null } },
      _sum: { payAmount: true },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.order.findMany({
      where: { hall: { isNot: null }, status: "paid" },
      select: { payAmount: true, createdAt: true, hall: { select: { id: true } } },
    }),
    prisma.memorialTribute.groupBy({ by: ["hallId"], _count: { _all: true } }),
    prisma.offeringOnAltar.groupBy({
      by: ["hallId"],
      where: { hallId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const agg = new Map<string, { fen: number; count: number; lastAt: Date | null }>();
  for (const a of targetAgg) {
    if (!a.targetHallId) continue;
    agg.set(a.targetHallId, {
      fen: a._sum.payAmount ?? 0,
      count: a._count._all,
      lastAt: a._max.createdAt ?? null,
    });
  }
  for (const o of creationOrders) {
    const hid = o.hall?.id;
    if (!hid) continue;
    const cur = agg.get(hid) ?? { fen: 0, count: 0, lastAt: null as Date | null };
    cur.fen += o.payAmount;
    cur.count += 1;
    if (o.createdAt && (!cur.lastAt || o.createdAt > cur.lastAt)) cur.lastAt = o.createdAt;
    agg.set(hid, cur);
  }

  const trib = new Map<string, number>();
  for (const t of tributeAgg) trib.set(t.hallId, (trib.get(t.hallId) ?? 0) + t._count._all);
  for (const a of altarAgg) if (a.hallId) trib.set(a.hallId, (trib.get(a.hallId) ?? 0) + a._count._all);

  return halls.map((h) => {
    const s = agg.get(h.id);
    return {
      id: h.id,
      name: h.name,
      sub: h.deceasedName,
      owner: h.owner?.realName || h.owner?.email || "—",
      status: h.status,
      totalFen: s?.fen ?? 0,
      count: s?.count ?? 0,
      lastAt: s?.lastAt ?? null,
      tributeCount: trib.get(h.id) ?? 0,
    };
  });
}

/** 宗祠消费台帐列表（聚合） */
export async function listClanLedger(): Promise<LedgerRow[]> {
  const [clans, targetAgg, tributeAgg, altarAgg] = await Promise.all([
    prisma.clanHall.findMany({
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { realName: true, email: true } } },
    }),
    prisma.order.groupBy({
      by: ["targetHallId"],
      where: { targetKind: "clan", status: "paid", targetHallId: { not: null } },
      _sum: { payAmount: true },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.clanTribute.groupBy({ by: ["clanHallId"], _count: { _all: true } }),
    prisma.offeringOnAltar.groupBy({
      by: ["clanHallId"],
      where: { clanHallId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const agg = new Map<string, { fen: number; count: number; lastAt: Date | null }>();
  for (const a of targetAgg) {
    if (!a.targetHallId) continue;
    agg.set(a.targetHallId, {
      fen: a._sum.payAmount ?? 0,
      count: a._count._all,
      lastAt: a._max.createdAt ?? null,
    });
  }

  const trib = new Map<string, number>();
  for (const t of tributeAgg) trib.set(t.clanHallId, (trib.get(t.clanHallId) ?? 0) + t._count._all);
  for (const a of altarAgg) if (a.clanHallId) trib.set(a.clanHallId, (trib.get(a.clanHallId) ?? 0) + a._count._all);

  return clans.map((c) => {
    const s = agg.get(c.id);
    return {
      id: c.id,
      name: `${c.surname}氏${c.hallName}`,
      sub: c.name,
      owner: c.owner?.realName || c.owner?.email || "—",
      status: c.status,
      totalFen: s?.fen ?? 0,
      count: s?.count ?? 0,
      lastAt: s?.lastAt ?? null,
      tributeCount: trib.get(c.id) ?? 0,
    };
  });
}
