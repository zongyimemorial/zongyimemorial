import { prisma } from "@/lib/db";
import { genOrderNo } from "@/lib/utils";
import { bonusFor, validateTopup, totalFor } from "@/lib/fortune";
import type { Order } from "@prisma/client";

export async function createOrder(params: {
  userId: string;
  productId: string;
  skuId?: string | null;
  quantity?: number;
  shippingAddress?: unknown;
  hallInfo?: unknown;
  /** 容量包作用的目标馆 id（storage 商品用） */
  targetHallId?: string | null;
  /** 目标类型："hall"（纪念馆）| "clan"（宗祠） */
  targetKind?: string | null;
}): Promise<Order> {
  const product = await prisma.product.findUnique({
    where: { id: params.productId },
    include: { skus: true },
  });
  if (!product || product.status !== "active") throw new Error("商品不可用");

  /*
    容量包：必须是「指定某一座馆」的，且该馆归下单人所有 ——
    否则用户能拿别人的馆 id 下单，把容量充进他人的馆（越权写）。
    校验在这里做一次，履约分支（simulatePay）就只管回写、不重复鉴权。
  */
  let targetHallId = params.targetHallId ?? null;
  let targetKind = params.targetKind ?? null;
  if (product.type === "storage") {
    if (!targetHallId) throw new Error("请先在控制台选择要扩容的纪念馆或宗祠");
    targetKind = targetKind === "clan" ? "clan" : "hall";
    const owned =
      targetKind === "clan"
        ? await prisma.clanHall.findFirst({
            where: { id: targetHallId, ownerUserId: params.userId },
            select: { id: true },
          })
        : await prisma.memorialHall.findFirst({
            where: { id: targetHallId, ownerUserId: params.userId },
            select: { id: true },
          });
    if (!owned) throw new Error("找不到该纪念馆/宗祠，或你没有管理权限");
  } else {
    // 非容量商品不带目标馆，避免脏字段混入
    targetHallId = null;
    targetKind = null;
  }

  const qty = Math.max(1, Math.min(99, Number(params.quantity) || 1));
  const sku = params.skuId
    ? product.skus.find((s) => s.id === params.skuId)
    : undefined;
  const unitPrice = sku ? sku.price : product.price;
  const total = unitPrice * qty;

  return prisma.order.create({
    data: {
      orderNo: genOrderNo(),
      userId: params.userId,
      totalAmount: total,
      payAmount: total,
      status: "pending",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      shippingAddress: params.shippingAddress ?? undefined,
      hallInfo: params.hallInfo ?? undefined,
      targetHallId: targetHallId ?? undefined,
      targetKind: targetKind ?? undefined,
      items: {
        create: {
          productId: product.id,
          skuId: sku?.id ?? null,
          quantity: qty,
          unitPrice,
          snapshot: { name: product.name, type: product.type },
        },
      },
    },
  });
}

/* ============================================================================
   福币充值下单

   ⚠️ 充值档位（10/20/30/…/499 与阶梯赠送）**不落 Product 表** —— 它们是
   `lib/fortune.ts` 里的代码常量。若每个档位都建一个商品行，商城列表会被充值
   商品污染，且改档位要写迁移。

   但 `OrderItem.productId` 是**必填外键**，所以这里用一个**哨兵商品**
   （`slug = "fortune-topup"`，`status = "inactive"` 故永不出现在商城），
   真实金额与赠送额存进 `snapshot`。

   `snapshot` 里冻结 `topupYuan` / `bonus` 是关键 —— 履约时**只读快照、不重算**，
   日后档位政策调整，历史订单仍按当时承诺发放（与"祭祀记录冻结快照"同源）。
   ========================================================================== */

/** 充值哨兵商品 slug（隐藏商品，仅用于满足 OrderItem 的外键约束） */
export const TOPUP_SENTINEL_SLUG = "fortune-topup";

/** 取得（必要时创建）充值哨兵商品 id */
async function ensureTopupSentinelId(): Promise<string> {
  const existed = await prisma.product.findUnique({
    where: { slug: TOPUP_SENTINEL_SLUG },
    select: { id: true },
  });
  if (existed) return existed.id;

  const cat = await prisma.category.findUnique({ where: { slug: "virtual" } });
  if (!cat) throw new Error("虚拟纪念分类不存在，无法创建充值商品");

  const created = await prisma.product.upsert({
    where: { slug: TOPUP_SENTINEL_SLUG },
    create: {
      slug: TOPUP_SENTINEL_SLUG,
      name: "福币充值",
      categoryId: cat.id,
      type: "fortune_topup",
      description: "用户钱包充值（金额由下单时指定，此商品不在商城展示）。",
      price: 0,
      // inactive：商城列表按 status=active 过滤，故永远不会被展示
      status: "inactive",
      stockType: "unlimited",
    },
    update: {},
    select: { id: true },
  });
  return created.id;
}

/**
 * 创建福币充值订单。
 *
 * ⚠️ 金额校验（`validateTopup`）与赠送计算（`bonusFor`）**都在服务端做** ——
 * 前端金额可伪造（与 AGENTS.md「现金金额恒为 0，绝不从前端接收」同源）。
 * 快照里同时写入 `bonus`，履约为**只读**。
 */
export async function createTopupOrder(params: {
  userId: string;
  yuan: number;
}): Promise<Order> {
  const err = validateTopup(params.yuan);
  if (err) throw new Error(err);

  const yuan = Math.floor(params.yuan);
  const bonus = bonusFor(yuan);
  const productId = await ensureTopupSentinelId();

  // 应付金额（分）：只算充值本金，赠送是权益不是收入
  const payFen = yuan * 100;

  return prisma.order.create({
    data: {
      orderNo: genOrderNo(),
      userId: params.userId,
      totalAmount: payFen,
      payAmount: payFen,
      status: "pending",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      items: {
        create: {
          productId,
          quantity: 1,
          unitPrice: payFen,
          /*
            快照冻结：type 必须是 "fortune_topup"，simulatePay 靠它路由。
            topupYuan / bonus 是履约的唯一依据（不重算）。
          */
          snapshot: {
            name: `福币充值 ¥${yuan}`,
            type: "fortune_topup",
            topupYuan: yuan,
            bonus,
            total: totalFor(yuan),
          },
        },
      },
    },
  });
}

