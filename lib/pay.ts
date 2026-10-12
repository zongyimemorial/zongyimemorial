import { isPremiumUntil } from "@/lib/premium";
import { prisma } from "@/lib/db";
import { track, acqChannelFromCookie } from "@/lib/analytics";
import { issueGrant } from "@/lib/decor-grant";
import { issueDecorEntitlement, resolveDecorEntitlement } from "@/lib/decor-products";
import { earnPoints, pointsFromSpend } from "@/lib/points";
import { creditFortune } from "@/lib/fortune";
import { PLAN_SPECS, SINGLE_PACK } from "@/lib/whisper";
import { nextExpiry } from "@/lib/hall-decor";
import { STORAGE_PLANS, GB, type StorageKind } from "@/lib/storage";
import { grantObituaryQuota } from "@/lib/obituary";
import { isServiceProduct, createServiceFulfillment } from "@/lib/service";
import {
  WREATH_PRODUCT_SLUG,
  WREATH_MAX_PER_HALL,
  WREATH_TTL_MS,
} from "@/lib/wreaths";
import type { Order } from "@prisma/client";

/**
 * 模拟支付：内测阶段零资质跑通交易闭环。
 * 订单标记 paid → 写支付记录 → 若为纪念馆商品则自动开通纪念馆。
 * （真实微信/支付宝通道在资质齐全后接入，逻辑与此同构。）
 */
export async function simulatePay(orderNo: string): Promise<Order> {
  let hallCreated = false;
  let payAmount = 0;
  let userId = "";
  // 供事务外判定「是否充值订单」（不返消费积分）
  let snapshotTypes: string[] = [];

  const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { orderNo },
      include: { items: { include: { product: true } }, user: true },
    });
    if (!order) throw new Error("订单不存在");
    if (order.status === "paid") return order;
    if (order.status === "closed") throw new Error("订单已关闭");

    payAmount = order.payAmount;
    userId = order.userId;
    snapshotTypes = order.items.map(
      (it) => (it.snapshot as { type?: string } | null)?.type ?? it.product.type,
    );

    const result = await tx.order.update({
      where: { orderNo },
      data: {
        status: "paid",
        paidAt: new Date(),
        payChannel: "simulate",
        shipStatus: order.shippingAddress ? "pending" : null,
      },
    });

    await tx.payment.create({
      data: {
        orderId: order.id,
        channel: "simulate",
        tradeNo: "SIM-" + orderNo,
        amount: order.payAmount,
        status: "success",
        paidAt: new Date(),
      },
    });

    // 纪念馆商品：支付成功后提交建馆申请（status=pending，专人审核后生效）
    // 依据《网络祭祀要求》(MZ/T 173—2025)：须提供火化证明、经办人身份证、手机号、逝者关系证明
    // ⚠️ 2026-10 起建馆免费（/halls/new），memorial_hall 商品已全部下架 ——
    //    本分支保留为兜底（历史订单重放 / 管理员重新激活商品时行为不变）。
    for (const item of order.items) {
      if (item.product.type === "memorial_hall") {
        const existing = await tx.memorialHall.findFirst({
          where: { orderId: order.id },
        });
        if (!existing) {
          const info = (order.hallInfo as {
            deceasedName?: string;
            fireProof?: string;
            applicantIdCard?: string;
            applicantPhone?: string;
            relation?: string;
          }) || {};
          const created = await tx.memorialHall.create({
            data: {
              ownerUserId: order.userId,
              name: info.deceasedName
                ? `${info.deceasedName}纪念馆`
                : `${item.product.name}空间`,
              deceasedName: info.deceasedName?.trim() || "待补充",
              description: "建馆申请已提交，证明材料审核通过后对公众展示。",
              isPublic: false,
              status: "pending",
              // 历史付费订单走「标准通道」兜底：fireProof 升级为新 materials 结构，保持兼容
              reviewChannel: "standard",
              proofs: {
                applicantIdCard: info.applicantIdCard || "",
                applicantPhone: info.applicantPhone || "",
                relation: info.relation || "",
                materials: info.fireProof
                  ? [{ type: "fireProof", label: "火化证明", value: info.fireProof }]
                  : [],
                promiseSigned: false,
              },
              orderId: order.id,
            },
            select: { id: true },
          });

          /*
            建馆赠品：新馆自动获赠一套模板（永久免费）。
            必须传 tx —— 用全局 prisma 会写到事务外，
            主事务一回滚就变成"馆没建成、赠品却发出去了"。
          */
          await issueGrant("hall", created.id, tx as unknown as Parameters<typeof issueGrant>[2]);

          hallCreated = true;
        }
      }

      // 高级功能订阅：为用户名下最近的有效纪念馆开通 premium（年订）
      if (item.product.type === "subscription") {
        const slug = item.product.slug;
        const days = 365;
        const hall = await tx.memorialHall.findFirst({
          where: { ownerUserId: order.userId, status: "active" },
          orderBy: { createdAt: "desc" },
        });
        if (hall) {
          // 续期基准：订阅仍有效则从到期日续，否则从今天起算
          const base = isPremiumUntil(hall.premiumUntil)
            ? new Date(hall.premiumUntil as Date)
            : new Date();
          const until = new Date(base.getTime() + days * 24 * 3600 * 1000);
          const data: Record<string, unknown> = {
            premiumUntil: until,
            templateConfig: {
              ...((hall.templateConfig as Record<string, unknown>) ?? {}),
              premiumDomain: slug === "premium-domain",
              premiumFamily: slug === "premium-family",
            },
          };
          /*
            旧「大容量存储」订阅（premium-storage）：**商品已下架（status=inactive）**，
            但这段履约逻辑必须保留 —— 存量已购订单不能因为下架就失效
            （Prisma 的订单只存 productId，履约时要能回放到）。

            它的老定义 = ¥99/年 · 50GB，与容量包 `storage-50g`（¥99/年 · 50GB）
            **完全重叠**，且它不支持积分兑换。这就是下架原因：同一件事两个商品，
            用户无法二选一，还会造成价格歧视。

            历史档位换算：直接写容量包（≈ 进阶 50GB），不再写 premiumStorage 标记 ——
            容量判据统一走 lib/storage.ts。
            `premiumUntil` 仍会被上面那行赋上（延续 20MB 高清原片权限）——
            2026-10 起 20MB 权限已并入容量包（见 lib/storage.ts hasHdUpload），
            容量包用户无需 premium 也能传 20MB，但已购 premium 的权益照样不剥夺。
          */
          if (slug === "premium-storage") {
            data.storageSubBytes = BigInt(50 * GB);
            data.storageUntil = new Date(
              nextExpiry(hall.storageUntil ? hall.storageUntil.toISOString() : null, 365),
            );
          }
          await tx.memorialHall.update({ where: { id: hall.id }, data });
        }
      }
      // 午夜悄悄话：按次时长 / 订阅 / 声音克隆资格
      // 注意：此分支只发配额，不自动开启装置——装置还需通过「家属授权 + 人工审核」
      if (item.product.type === "whisper_plan") {
        const slug = item.product.slug;
        const qty = Math.max(1, item.quantity);

        if (slug === "whisper-single") {
          // 按次：累加额外分钟数，永久有效
          await tx.whisperQuota.upsert({
            where: { userId: order.userId },
            create: {
              userId: order.userId,
              plan: "free",
              monthlyMins: 0,
              monthlyRounds: 30,
              extraMins: SINGLE_PACK.minutes * qty,
            },
            update: { extraMins: { increment: SINGLE_PACK.minutes * qty } },
          });
        } else if (slug === "whisper-basic" || slug === "whisper-premium") {
          const plan = slug === "whisper-basic" ? "basic" : "premium";
          const spec = PLAN_SPECS[plan];
          const periodEnd = new Date(Date.now() + 30 * qty * 86400000);
          await tx.whisperQuota.upsert({
            where: { userId: order.userId },
            create: {
              userId: order.userId,
              plan,
              monthlyMins: spec.monthlyMins,
              monthlyRounds: spec.monthlyRounds,
              usedMins: 0,
              usedRounds: 0,
              periodStart: new Date(),
              periodEnd,
            },
            update: {
              plan,
              monthlyMins: spec.monthlyMins,
              monthlyRounds: spec.monthlyRounds,
              usedMins: 0,
              usedRounds: 0,
              periodStart: new Date(),
              periodEnd,
            },
          });
          // 订阅同时授予用户级 premium（与宗祠/族谱图精美版式共用）
          // 续期基准：同上（用户级 premium 与宗祠/族谱共用）
          const base = isPremiumUntil(order.user?.premiumUntil)
            ? new Date(order.user!.premiumUntil as Date)
            : new Date();
          await tx.user.update({
            where: { id: order.userId },
            data: { premiumUntil: new Date(base.getTime() + 30 * qty * 86400000) },
          });
        } else if (slug === "whisper-clone") {
          // 声音克隆资格申请：支付后置 cloneApplied=true，解锁克隆入口。
          // 真实克隆训练由订阅档 cloneLimit 承载；内测 Mock 引擎零成本。
          // 资格属用户级权益：对该用户名下全部追思装置一并解锁（避免多装置只开最新一个）。
          await tx.whisperProfile.updateMany({
            where: { ownerUserId: order.userId },
            data: { cloneApplied: true },
          });
        }
      }

      // 虚拟祭品 / 纪念物品：发放到消耗式库存。
      //
      // 这是供奉体系重构补上的关键一环 —— 原先这两个 type 落进 simulatePay
      // 直接穿透、没有任何副作用，买完只剩一条 OrderItem 行，
      // 等于「付了钱却拿不到东西」。现在购买即入库存，祭拜时再消耗。
      // 数量用 increment（购买是叠加）；免费品的每日补货才用覆盖写。
      //
      // ⚠️ 敬献大花圈（grand-wreath）虽是 tribute_item，但**不入库存**：
      //    它是「付钱即陈列」的一次性祭献，履约 = 在目标馆立一条 3 天有效花圈记录。
      if (
        item.product.type === "virtual_flower" ||
        (item.product.type === "tribute_item" && item.product.slug !== WREATH_PRODUCT_SLUG)
      ) {
        const qty = Math.max(1, item.quantity);
        await tx.offeringHolding.upsert({
          where: {
            userId_productId: { userId: order.userId, productId: item.productId },
          },
          create: { userId: order.userId, productId: item.productId, quantity: qty },
          update: { quantity: { increment: qty } },
        });
      }

      /*
        敬献大花圈：支付成功 = 花圈入馆陈列 3 天。
        履约时**在事务内复查**「最多 2 个」—— 下单与支付之间可能隔了几分钟，
        别人可能已经把名额用掉；超出的那单不再补立花圈（钱已付，属于极端并发，
        由展示端取最近 2 个兜底，这里不退款）。
        必须传 tx —— 订单回滚不能留下花圈。
      */
      if (item.product.slug === WREATH_PRODUCT_SLUG) {
        const tid = order.targetHallId;
        if (tid) {
          const active = await tx.hallWreath.count({
            where: { hallId: tid, removedAt: null, expiresAt: { gt: new Date() } },
          });
          if (active < WREATH_MAX_PER_HALL) {
            await tx.hallWreath.create({
              data: {
                hallId: tid,
                userId: order.userId,
                orderId: order.id,
                expiresAt: new Date(Date.now() + WREATH_TTL_MS),
              },
            });
          }
        }
      }

      /*
        空间装修：买断模板 / 装饰套件 → 把权益写进该用户名下所有对应馆的
        `decor.unlocked`。与积分兑换落到**同一个键**，因此两条路买到的素材
        在界面上完全等价（不会出现"用积分换的锁还在"）。

        必须传 tx —— 用全局 prisma 会写到事务外，订单回滚后权益却留下了。
      */
      if (item.product.type === "decor") {
        const ent = resolveDecorEntitlement(item.product.slug);
        if (ent) {
          await issueDecorEntitlement(
            order.userId,
            ent,
            tx as unknown as Parameters<typeof issueDecorEntitlement>[2],
          );
        }
      }

      /*
        电子讣告发布：购买即发放**发布配额**（不建实体）。
        用户在控制台「我的讣告」里用配额发布，生成公开缅怀页。

        ⚠️ **必须 `&& slug === "e-obituary"`** —— memorial_service 类型下还有
        传记代写 / 纪念视频 / 扫码云碑等同类型商品，只判 type 会让买"追思视频"
        的用户静默拿到讣告配额。

        必须传 tx —— 用全局 prisma 会写到事务外，
        主事务一回滚就变成"订单没付成、配额却发了"。
      */
      if (item.product.type === "memorial_service" && item.product.slug === "e-obituary") {
        await grantObituaryQuota(
          order.userId,
          Math.max(1, item.quantity),
          tx as unknown as Parameters<typeof grantObituaryQuota>[2],
        );
      }

      /*
        服务受理类商品（云祭扫 / 非讣告纪念服务）：人工服务，无自动履约能力。
        支付成功后自动建一张 `pending` 受理单，用户在控制台「我的服务」提交需求资料，
        管理员在后台「服务工单」受理/完成。

        用 isServiceProduct 统一判定，避免把 e-obituary（走 ObituaryQuota）误纳入。

        ⚠️ 必须传 tx —— 与 grantObituaryQuota 同源，订单回滚不能留下受理单。
      */
      if (isServiceProduct(item.product)) {
        await createServiceFulfillment(
          {
            userId: order.userId,
            productId: item.productId,
            slug: item.product.slug,
            productName: item.product.name,
            type: item.product.type,
            orderId: order.id,
          },
          tx as unknown as Parameters<typeof createServiceFulfillment>[1],
        );
      }

      /*
        福币充值：入钱包 + 写两条流水（本金 topup / 赠送 bonus）。

        ⚠️ **金额与赠送额一律从 snapshot 读，绝不在这里重算 `bonusFor`** ——
        档位政策日后调整时，历史订单必须按**下单当时**承诺的额度发放。
        （若在这里重算，一次调档就会让"已下单未支付"的订单额度漂移，
        用户看到"充值页说送 20、支付后只到账 10"。）
        与「祭祀记录冻结快照」同源。

        必须传 tx —— 用全局 prisma 会写到事务外，主事务一回滚就变成
        "订单没付成、福币却到账了"。
      */
      if (item.snapshot && (item.snapshot as { type?: string }).type === "fortune_topup") {
        const snap = item.snapshot as {
          topupYuan?: number;
          bonus?: number;
          name?: string;
        };
        const yuan = Math.max(0, Math.floor(Number(snap.topupYuan) || 0));
        const bonus = Math.max(0, Math.floor(Number(snap.bonus) || 0));
        if (yuan > 0) {
          await creditFortune({
            userId: order.userId,
            amount: yuan,
            kind: "topup",
            reason: `福币充值 ¥${yuan}`,
            refId: order.id,
            tx: tx as unknown as Parameters<typeof creditFortune>[0]["tx"],
          });
          if (bonus > 0) {
            await creditFortune({
              userId: order.userId,
              amount: bonus,
              kind: "bonus",
              reason: `充值 ¥${yuan} 赠送 ${bonus} 福币`,
              refId: order.id,
              tx: tx as unknown as Parameters<typeof creditFortune>[0]["tx"],
            });
          }
        }
      }

      /*
        存储空间容量包：指定某一座馆/祠，按年订阅。        与 decor 分支同构：必须传 tx + 用 nextExpiry 顺延
        （续费叠加、过期从今天起算）。到期回退免费额度、已存资料不删。

        单一判据：只写 storageSubBytes + storageUntil，绝不碰 premium。
        目标馆由下单时写入的 order.targetHallId / order.targetKind 决定
        （容量包是「某一座馆」的，不是用户级 spread）。
      */
      if (item.product.type === "storage") {
        const plan = STORAGE_PLANS[item.product.slug as keyof typeof STORAGE_PLANS];
        const tid = order.targetHallId;
        const kind: StorageKind = order.targetKind === "clan" ? "clan" : "hall";
        if (plan && tid) {
          /*
            ⚠️ 两条 kind 分支必须**分开写**，不能 `const model = kind === "clan" ? tx.clanHall : tx.memorialHall`：
            两个 Prisma delegate 的调用签名不完全兼容，TypeScript 会报
            "union type ... none of those signatures are compatible"（不 callable）。
            分开写既过类型检查，也让"写到哪张表"在阅读时一眼可见。
          */
          if (kind === "clan") {
            const cur = await tx.clanHall.findUnique({
              where: { id: tid },
              select: { storageUntil: true },
            });
            await tx.clanHall.update({
              where: { id: tid },
              data: {
                storageSubBytes: BigInt(plan.gb * GB),
                storageUntil: new Date(
                  nextExpiry(cur?.storageUntil ? cur.storageUntil.toISOString() : null, 365),
                ),
              },
            });
          } else {
            const cur = await tx.memorialHall.findUnique({
              where: { id: tid },
              select: { storageUntil: true },
            });
            await tx.memorialHall.update({
              where: { id: tid },
              data: {
                storageSubBytes: BigInt(plan.gb * GB),
                storageUntil: new Date(
                  nextExpiry(cur?.storageUntil ? cur.storageUntil.toISOString() : null, 365),
                ),
              },
            });
          }
        }
      }
    }

    return result;
  });

  // 交易结束后发放积分（独立事务，避免嵌套事务冲突）
  if (hallCreated) {
    await earnPoints({ userId, amount: 500, reason: "开通数字纪念馆" });
  }
  /*
    ⚠️ 充值订单**不返消费积分**。

    理由：福币充值已用「阶梯赠送」作为激励（充 100 送 20）。
    若再按 `pointsFromSpend` 返 3 积分/元，则用户充 100 元 → 同时拿到
    20 福币 + 300 积分，充值成了"双重奖励"，且福币是平台的**负债**，
    对充值返积分等于给负债再叠加一层支出。

    「积分赠送政策不变」指的是**商品消费**那部分口径没动 —— 别把它理解成
    "充值也要返积分"。判据用 snapshot.type，与履约分支同源。
  */
  const isTopupOrder =
    snapshotTypes.length > 0 && snapshotTypes.every((t) => t === "fortune_topup");
  if (!isTopupOrder) {
    const earned = pointsFromSpend(payAmount);
    if (earned > 0) {
      await earnPoints({
        userId,
        amount: earned,
        reason: `消费返积分（订单 ${orderNo}）`,
      });
    }
    // 首单转化埋点：用户首笔已付非充值订单（之前无含实物/服务的已付订单）
    const priorPaid = await prisma.order.count({
      where: {
        userId,
        status: "paid",
        id: { not: updated.id },
        items: { some: { product: { type: { not: "fortune_topup" } } } },
      },
    });
    if (priorPaid === 0) {
      await track({
        type: "first_pay",
        userId,
        channel: await acqChannelFromCookie(),
        valueFen: payAmount,
        path: "/pay",
      });
    }
  }

  return updated;
}
