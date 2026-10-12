"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleObituaryStatus, deleteObituary } from "@/app/console/obituaries/actions";

type Props = {
  obituaryId: string;
  status: string;
  publicHref: string;
};

/**
 * 讣告管理操作条：查看公开页 / 上架下架 / 删除。
 *
 * ⚠️ 下架与删除都**不退还配额**（配额在发布时已消耗）。
 *    想保留内容只是隐藏 → 用下架；确认不要了 → 用删除（二次确认）。
 */
export default function ObituaryManageBar({ obituaryId, status, publicHref }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const published = status === "published";

  function run(fd: FormData, action: (f: FormData) => Promise<{ ok: boolean; message?: string }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await action(fd);
      setMsg(res.message || (res.ok ? "完成" : "操作失败"));
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="mb-6 rounded-lg border border-brand-200 bg-gray-50 p-4" data-obituary-manage>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={publicHref}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-brand-300 bg-brand-100/70 px-3 py-1.5 text-sm text-brand-700 hover:bg-gray-50"
        >
          查看公开页 ↗
        </a>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("obituaryId", obituaryId);
            run(fd, toggleObituaryStatus);
          }}
          className="rounded-md border border-brand-300 bg-brand-100/70 px-3 py-1.5 text-sm text-brand-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {published ? "下架" : "重新发布"}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("删除后不可恢复，且不退还配额。确定删除？")) return;
            const fd = new FormData();
            fd.set("obituaryId", obituaryId);
            setMsg(null);
            startTransition(async () => {
              const res = await deleteObituary(fd);
              if (res.ok) router.push("/console/obituaries");
              else setMsg(res.message || "删除失败");
            });
          }}
          className="rounded-md border border-red-200 bg-brand-100/70 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          删除
        </button>

        <span className="text-xs text-brand-400">
          下架 / 删除均不退还配额
        </span>
      </div>
      {msg && <div className="mt-2 text-sm text-brand-600">{msg}</div>}
    </div>
  );
}
