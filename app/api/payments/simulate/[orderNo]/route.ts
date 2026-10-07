import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { simulatePay } from "@/lib/pay";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { orderNo } = await params;
  const order = await prisma.order.findUnique({ where: { orderNo } });
  if (!order || order.userId !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const updated = await simulatePay(orderNo);
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "支付失败" },
      { status: 400 }
    );
  }
}
