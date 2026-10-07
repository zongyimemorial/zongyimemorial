"use client";

import { useActionState } from "react";
import { redeemItem } from "@/app/(public)/points/actions";

export default function PointsRedeemButton({
  productId,
  pointsPrice,
}: {
  productId: string;
  pointsPrice: number;
}) {
  const [state, formAction, pending] = useActionState(redeemItem, {});

  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-amber-600 py-2.5 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-60"
      >
        {pending ? "兑换中…" : `用 ${pointsPrice} 积分兑换`}
      </button>
      {state?.ok && (
        <p className="mt-2 text-sm text-green-600">兑换成功！可前往“我的纪念馆”查看。</p>
      )}
      {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
