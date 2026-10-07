import { prisma } from "@/lib/db";

/**
 * 服务受理体系（人工服务类商品的履约载体）。
 *
 * 商品「云祭扫服务」「纪念服务（传记/追思会/视频/云碑等，非电子讣告）」是人工服务，
 * 平台没有自动履约能力。支付/积分兑换成功后自动建一张 `pending` 受理单，
 * 用户随后在控制台「我的服务」提交需求资料，管理员在后台「服务工单」受理/完成。
 *
 * 范围：isServiceProduct(p) = p.type === "cloud_worship"
 *        || (p.type === "memorial_service" && p.slug !== "e-obituary")
 * 电子讣告（e-obituary）走自身 ObituaryQuota 通道，不在此表。
 */

/** 服务类商品判定：云祭扫 + 非电子讣告的纪念服务。 */
export function isServiceProduct(p: { type: string; slug: string }): boolean {
  return p.type === "cloud_worship" || (p.type === "memorial_service" && p.slug !== "e-obituary");
}

/** 受理单状态文案（前端徽标与后台工单一处定义）。 */
export const SERVICE_STATUS_LABEL: Record<string, string> = {
  pending: "待受理",
  processing: "受理中",
  done: "已完成",
  rejected: "已驳回",
};

/** 可传事务 tx 的最小 db 契约（与 lib/obituary.ts 同构）。 */
type ServiceDb = {
  serviceFulfillment: {
    create: (a: unknown) => Promise<unknown>;
  };
};

export type CreateServiceFulfillmentInput = {
  userId: string;
  productId?: string | null;
  slug: string;
  productName: string;
  type: string;
  orderId?: string | null;
  redemptionId?: string | null;
};

/**
 * 创建一张服务受理单（status=pending）。
 *
 * ⚠️ 在 `simulatePay` 的事务里调用时**必须传 `tx`**，否则订单回滚而受理单已建。
 * 积分兑换路径（`redeemItem`）在事务外调用，传默认 prisma 即可。
 */
export async function createServiceFulfillment(
  data: CreateServiceFulfillmentInput,
  db?: ServiceDb,
): Promise<void> {
  const c = (db ?? prisma) as unknown as NonNullable<ServiceDb>;
  await c.serviceFulfillment.create({
    data: {
      userId: data.userId,
      productId: data.productId ?? null,
      slug: data.slug,
      productName: data.productName,
      type: data.type,
      orderId: data.orderId ?? null,
      redemptionId: data.redemptionId ?? null,
      status: "pending",
    },
  });
}
