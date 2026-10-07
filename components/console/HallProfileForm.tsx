"use client";

import { useState } from "react";
import { saveHallProfile } from "@/app/console/halls/[id]/actions";

const field =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";

export default function HallProfileForm({
  hallId,
  initial,
}: {
  hallId: string;
  initial: {
    coupletLeft: string;
    coupletRight: string;
    coupletHorizontal: string;
    epitaph: string;
    hometown: string;
    timeline: string;
    career: string;
    quote: string;
  };
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-6">
      {/* 挽联横版配置 + 故人数字档案 */}
      <section className="rounded-xl border border-gray-100 bg-white p-6">
        <h2 className="text-sm font-semibold text-brand-900">挽联横版配置</h2>
        <p className="mb-4 mt-1 text-xs text-brand-400">上联、下联各不超过30字，横批不超过8字；留空则不显示挽联。</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const fd = new FormData(e.currentTarget);
            fd.set("hallId", hallId);
            const res = await saveHallProfile(fd);
            setBusy(false);
            setMsg({ ok: res.ok, text: res.message });
          }}
        >
          <input type="hidden" name="hallId" value={hallId} />
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">上联（右轴）</label>
              <input name="coupletLeft" defaultValue={initial.coupletLeft} maxLength={30} className={field} placeholder="音容宛在归瑶池" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">下联（左轴）</label>
              <input name="coupletRight" defaultValue={initial.coupletRight} maxLength={30} className={field} placeholder="德泽犹存驾鹤乡" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">横批</label>
              <input name="coupletHorizontal" defaultValue={initial.coupletHorizontal} maxLength={8} className={field} placeholder="永垂不朽" />
            </div>
          </div>

          <h3 className="mb-2 mt-6 text-sm font-semibold text-brand-900">故人数字档案</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">籍贯</label>
              <input name="hometown" defaultValue={initial.hometown} className={field} placeholder="如：福建泉州" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">生平身份 / 职业</label>
              <input name="career" defaultValue={initial.career} maxLength={60} className={field} placeholder="如：乡镇教师 · 一生执教四十年" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">墓志铭 / 生平结语</label>
              <input name="epitaph" defaultValue={initial.epitaph} maxLength={200} className={field} placeholder="一生勤俭持家，泽被子孙" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">座右铭 / 家训一句</label>
              <input name="quote" defaultValue={initial.quote} maxLength={120} className={field} placeholder="如：踏实做人，认真做事" />
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-brand-700">
              生平时间线（每行一条：年份|事件）
            </label>
            <textarea
              name="timeline"
              rows={5}
              defaultValue={initial.timeline}
              className={`${field} font-mono`}
              placeholder={"1938|出生于福建泉州\n1960|与祖母成婚\n1985|创办家庭作坊\n2018|四世同堂全家福"}
            />
          </div>
          {msg && (
            <p className={`mt-3 text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
          )}
          <button
            disabled={busy}
            className="mt-4 rounded-md bg-brand-800 px-6 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "保存中…" : "保存配置"}
          </button>
        </form>
      </section>
    </div>
  );
}
