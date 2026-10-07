import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createOrder } from "@/lib/orders";

type HallInfo = {
  deceasedName?: string;
  fireProof?: string;
  applicantIdCard?: string;
  applicantPhone?: string;
  relation?: string;
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    productId?: string;
    skuId?: string;
    quantity?: number;
    hallInfo?: HallInfo;
    targetHallId?: string;
    targetKind?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  if (!body.productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: String(body.productId) },
    });

    // 合规：建馆须先实名认证（《网络祭祀要求》MZ/T 173—2025）
    // ⚠️ 2026-10 起建馆免费（/halls/new），memorial_hall 商品已全部下架 ——
    //    本分支保留为防御路径（管理员若重新激活商品，校验口径与免费通道一致）。
    if (product?.type === "memorial_hall") {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id! } });
      if (!dbUser?.idVerified) {
        return NextResponse.json(
          { error: "创建纪念馆需先完成实名认证", needRealname: true },
          { status: 403 }
        );
      }
      const h = body.hallInfo || {};
      if (!h.deceasedName?.trim() || !h.fireProof?.trim() || !h.relation?.trim()) {
        return NextResponse.json(
          { error: "请完整填写逝者姓名、火化证明编号与逝者关系" },
          { status: 400 }
        );
      }
      if (!/^1\d{10}$/.test(h.applicantPhone || "")) {
        return NextResponse.json({ error: "经办人手机号格式不正确" }, { status: 400 });
      }
      if (!/^\d{17}[\dXx]$/.test(h.applicantIdCard || "")) {
        return NextResponse.json({ error: "经办人身份证号格式不正确" }, { status: 400 });
      }
    }

    const order = await createOrder({
      userId: user.id!,
      productId: String(body.productId),
      skuId: body.skuId ?? null,
      quantity: Number(body.quantity) || 1,
      hallInfo: body.hallInfo,
      // 容量包：作用目标馆（归属校验在 createOrder 内完成，防越权充值）
      targetHallId: body.targetHallId ?? null,
      targetKind: body.targetKind ?? null,
    });
    return NextResponse.json({ orderNo: order.orderNo });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "下单失败" },
      { status: 400 }
    );
  }
}
