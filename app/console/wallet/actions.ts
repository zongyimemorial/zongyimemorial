"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createTopupOrder } from "@/lib/orders";
import { validateTopup } from "@/lib/fortune";

export type TopupOrderResult = { ok: boolean; orderNo?: string; error?: string };

/**
 * 创建福币充值订单并跳转账页。
 *
 * ⚠️ 金额校验（`validateTopup`）**必须在这里做一次**，不能只靠前端 ——
 * 前端金额可伪造（与 AGENTS.md「现金金额 amountFen 恒为 0，绝不从前端接收」同源）。
 * `createTopupOrder` 内部也会再校验一次（双保险），此处提前校验只为给出友好文案。
 */
export async function createFortuneTopupOrder(yuan: number): Promise<TopupOrderResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "请先登录" };

  const invalid = validateTopup(Number(yuan));
  if (invalid) return { ok: false, error: invalid };

  try {
    const order = await createTopupOrder({ userId: user.id!, yuan: Number(yuan) });
    return { ok: true, orderNo: order.orderNo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "下单失败" };
  }
}

/** 充值成功后回到钱包页时刷新余额与流水 */
export async function refreshWalletAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  revalidatePath("/console/wallet");
  revalidatePath("/console");
}
