"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reserveSlot } from "@/app/(public)/halls/[id]/actions";

const TIME_SLOTS = [
  "09:00-11:00",
  "11:00-13:00",
  "14:00-16:00",
  "16:00-18:00",
  "19:00-21:00",
];

// 清明 / 冬至等祭扫高峰日提示
function isPeakDate(d: Date) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (m === 4 && day >= 1 && day <= 6) return "清明祭扫高峰";
  if (m === 12 && day >= 19 && day <= 24) return "冬至祭扫高峰";
  if ((m === 8 && day >= 30) || (m === 9 && day <= 2)) return "中元祭扫高峰";
  if (m === 1 && day >= 25 && day <= 31) return "春节祭扫高峰";
  return null;
}

export default function ReservePanel({
  hallId,
  isLoggedIn,
}: {
  hallId: string;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const today = new Date();
  const min = today.toISOString().slice(0, 10);
  const max = new Date(today.getTime() + 30 * 86400 * 1000).toISOString().slice(0, 10);

  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[0]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const peak = date ? isPeakDate(new Date(date + "T00:00:00")) : null;

  async function submit() {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    setLoading(true);
    const res = await reserveSlot(hallId, { date, timeSlot, name, phone });
    setLoading(false);
    setMsg(res.message);
    setOk(res.ok);
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5">
      <h2 className="text-lg font-semibold text-brand-900">预约祭拜</h2>
      <p className="mt-1 text-xs text-brand-400">
        分时预约、错峰祭拜；清明、冬至等高峰期请提前预约，每时段限20组。
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">日期</label>
          <input
            type="date"
            min={min}
            max={max}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          {peak && (
            <p className="mt-1 text-xs text-red-500">⚠️ {peak}，建议尽早预约</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">时段</label>
          <select
            value={timeSlot}
            onChange={(e) => setTimeSlot(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {TIME_SLOTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">预约人</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="姓名"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">手机号</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="11位手机号"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={loading}
          className="rounded-md bg-brand-800 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? "提交中…" : "提交预约"}
        </button>
        {msg && (
          <span className={ok ? "text-sm text-green-600" : "text-sm text-red-500"}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
