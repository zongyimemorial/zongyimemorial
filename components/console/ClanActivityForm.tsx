"use client";

import { useState } from "react";
import { createClanActivity } from "@/app/console/clan-halls/[id]/actions";

const field =
  "w-full rounded-md border border-brand-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";

const KINDS = ["祭祖大典", "宗亲联谊", "修谱研讨", "家族议事"];

export default function ClanActivityForm({
  clanHallId,
  idVerified,
  surname,
}: {
  clanHallId: string;
  idVerified: boolean;
  surname: string;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!idVerified) {
    return (
      <div className="rounded-xl border border-dashed border-brand-200 bg-brand-100/70 p-6 text-center text-sm text-brand-400">
        发布活动需先完成
        <a href="/console/realname" className="text-accent-600 hover:underline">实名认证</a>
      </div>
    );
  }

  return (
    <form
      className="rounded-xl border border-brand-200 bg-brand-100/70 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const fd = new FormData(e.currentTarget);
        fd.set("clanHallId", clanHallId);
        const res = await createClanActivity(fd);
        setBusy(false);
        setMsg({ ok: res.ok, text: res.message });
        if (res.ok) (e.target as HTMLFormElement).reset();
      }}
    >
      <input type="hidden" name="clanHallId" value={clanHallId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-brand-700">活动标题 *</label>
          <input name="title" required maxLength={80} placeholder="如：乙巳年冬至宗亲联谊会" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">活动类型</label>
          <select name="kind" defaultValue="宗亲联谊" className={field}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">活动时间 *</label>
          <input type="datetime-local" name="startAt" required className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">活动地点 *（线下地址，或「线上会议」）</label>
          <input name="location" required className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">名额上限</label>
          <input type="number" name="capacity" min={1} defaultValue={100} className={field} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-brand-700">线上参与链接</label>
          <input name="onlineLink" placeholder="https://" className={field} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-brand-700">活动说明</label>
          <textarea name="description" rows={4} placeholder="活动安排、议程、注意事项…" className={field} />
        </div>
      </div>

      <p className="mt-3 text-xs text-brand-400">
        本活动将面向 <b>{surname || "全体"}</b> 氏宗亲展示；提交后需平台审核通过，才会在「宗族活动」公页公开。
      </p>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-md bg-brand-800 px-6 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? "提交中…" : "提交活动（先审后显）"}
      </button>
    </form>
  );
}
