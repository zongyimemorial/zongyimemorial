"use client";

import { useState } from "react";
import { saveActivity } from "@/app/admin/activities/actions";

const KINDS = ["祭祖大典", "宗亲联谊", "修谱研讨", "家族议事"];

interface Activity {
  id: string;
  title: string;
  kind: string;
  surname?: string | null;
  location: string;
  onlineLink?: string | null;
  coverImage?: string | null;
  description?: string | null;
  startAt: string | Date;
  capacity: number;
  reviewStatus?: string | null;
}

/** Date → <input type="datetime-local"> 需要的本地时间串（YYYY-MM-DDTHH:mm） */
function toLocalInput(d?: string | Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export default function ActivityEditor({ activity }: { activity?: Activity }) {
  const [title, setTitle] = useState(activity?.title ?? "");
  const [kind, setKind] = useState(activity?.kind ?? KINDS[0]);
  const [surname, setSurname] = useState(activity?.surname ?? "");
  const [location, setLocation] = useState(activity?.location ?? "");
  const [onlineLink, setOnlineLink] = useState(activity?.onlineLink ?? "");
  const [coverImage, setCoverImage] = useState(activity?.coverImage ?? "");
  const [startAt, setStartAt] = useState(toLocalInput(activity?.startAt));
  const [capacity, setCapacity] = useState(String(activity?.capacity ?? 100));
  const [description, setDescription] = useState(activity?.description ?? "");

  const field = "w-full rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500";
  const label = "mb-1 block text-xs font-medium text-brand-700";

  return (
    <form action={saveActivity} className="max-w-3xl space-y-4">
      {activity?.id && <input type="hidden" name="id" value={activity.id} />}

      <div>
        <label className={label}>活动标题 *</label>
        <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required className={field} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>活动类型</label>
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>面向姓氏（留空=全体）</label>
          <input name="surname" value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="如：李" className={field} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>活动时间 *</label>
          <input
            type="datetime-local"
            name="startAt"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
            className={field}
          />
        </div>
        <div>
          <label className={label}>名额上限</label>
          <input
            type="number"
            name="capacity"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className={field}
          />
        </div>
      </div>

      <div>
        <label className={label}>活动地点 *（线下地址，或「线上会议」）</label>
        <input name="location" value={location} onChange={(e) => setLocation(e.target.value)} required className={field} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>线上参与链接</label>
          <input name="onlineLink" value={onlineLink} onChange={(e) => setOnlineLink(e.target.value)} placeholder="https://" className={field} />
        </div>
        <div>
          <label className={label}>封面图 URL</label>
          <input name="coverImage" value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://" className={field} />
        </div>
      </div>

      <div>
        <label className={label}>活动说明</label>
        <textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className={field} />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          name="intent"
          value="pending"
          className="rounded-md border border-brand-300 px-5 py-2 text-sm text-brand-700 hover:bg-gray-50"
        >
          存为待审
        </button>
        <button
          type="submit"
          name="intent"
          value="publish"
          className="rounded-md bg-brand-800 px-5 py-2 text-sm text-white hover:bg-brand-700"
        >
          直接发布
        </button>
        <span className="text-xs text-brand-400">
          「直接发布」立即在公页公开；「存为待审」进入后台「内容审核」待审队列。
        </span>
      </div>
    </form>
  );
}
