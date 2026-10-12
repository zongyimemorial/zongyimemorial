"use client";

import { useState } from "react";
import { saveClanHallProfile, submitClanHallForReview } from "@/app/console/clan-halls/[id]/actions";

const field =
  "w-full rounded-md border border-brand-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";

export type ClanHallProfileInitial = {
  surname: string;
  hallName: string;
  name: string;
  origin: string;
  ancestorName: string;
  ancestorTitle: string;
  description: string;
  generationPoem: string;
};

export default function ClanHallProfileForm({
  clanHallId,
  initial,
}: {
  clanHallId: string;
  initial: ClanHallProfileInitial;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    fd.set("clanHallId", clanHallId);
    const res = await saveClanHallProfile(fd);
    setBusy(false);
    setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "已保存" : "保存失败") });
  }

  async function onResubmit() {
    setBusy(true);
    const fd = new FormData();
    fd.set("clanHallId", clanHallId);
    const res = await submitClanHallForReview(fd);
    setBusy(false);
    setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "已提交审核" : "提交失败") });
  }

  return (
    <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-6">
      <h2 className="text-sm font-semibold text-brand-900">宗祠基本信息</h2>
      <p className="mb-4 mt-1 text-xs text-brand-400">
        堂号、始祖与字辈是宗祠的根脉，填得越完整，宗亲越容易认领。修改后需重新送审。
      </p>
      <form onSubmit={onSubmit}>
        <input type="hidden" name="clanHallId" value={clanHallId} />
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">姓氏 *</label>
            <input name="surname" defaultValue={initial.surname} maxLength={10} className={field} placeholder="如：李" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">宗祠名称 *</label>
            <input name="hallName" defaultValue={initial.hallName} maxLength={40} className={field} placeholder="如：陇西李氏宗祠" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">堂号 *</label>
            <input name="name" defaultValue={initial.name} maxLength={20} className={field} placeholder="如：敦本堂" />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">郡望 / 堂号别称</label>
            <input name="ancestorTitle" defaultValue={initial.ancestorTitle} maxLength={30} className={field} placeholder="如：陇西" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">始祖</label>
            <input name="ancestorName" defaultValue={initial.ancestorName} maxLength={20} className={field} placeholder="如：李广" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">始迁地 / 祖籍</label>
            <input name="origin" defaultValue={initial.origin} maxLength={60} className={field} placeholder="如：甘肃陇西" />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-brand-700">宗祠简介</label>
          <textarea
            name="description"
            rows={3}
            defaultValue={initial.description}
            className={field}
            placeholder="简述宗祠始建年代、迁建沿革、堂号由来与主要的祭祖活动。"
          />
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-brand-700">
            字辈诗 / 派语（每行一句，也可整段粘贴）
          </label>
          <textarea
            name="generationPoem"
            rows={3}
            defaultValue={initial.generationPoem}
            className={field}
            placeholder={"克明俊德，以亲九族\n平章百姓，协和万邦"}
          />
        </div>

        {msg && (
          <p className={`mt-3 text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            disabled={busy}
            className="rounded-md bg-brand-800 px-6 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "保存中…" : "保存修改"}
          </button>
          <button
            type="button"
            onClick={onResubmit}
            disabled={busy}
            className="rounded-md border border-brand-300 px-5 py-2 text-sm text-brand-700 hover:bg-gray-50 disabled:opacity-50"
          >
            保存并重新送审
          </button>
        </div>
      </form>
    </section>
  );
}
