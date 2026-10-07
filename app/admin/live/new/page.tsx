import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createLive } from "@/app/admin/live/actions";
import type { LiveStatus } from "@prisma/client";

const statuses: LiveStatus[] = ["scheduled", "live", "ended"];
const statusLabel: Record<LiveStatus, string> = {
  scheduled: "预告",
  live: "直播中",
  ended: "回放",
};
const categories = ["公祭仪式", "生态安葬仪式", "宗祠落成", "祭祖大典", "追悼会"];

export default async function NewLivePage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) redirect("/console");

  const field = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold text-brand-900">新建直播</h1>
      <form action={createLive} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">标题 *</label>
          <input name="title" required className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">状态</label>
          <select name="status" className={field}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {statusLabel[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">直播类型</label>
          <select name="category" className={field}>
            <option value="">不分类</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">接入方式</label>
          <select name="embedType" className={field}>
            <option value="video">视频流（mp4 / HLS / 云直播）</option>
            <option value="iframe">iframe 嵌入（YouTube Live / Zoom 等免费平台）</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">
            播放地址（视频流填 mp4/HLS；iframe 填嵌入页地址）
          </label>
          <input name="streamUrl" placeholder="https://..." className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">描述</label>
          <textarea name="description" rows={3} className={field} />
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand-800 px-5 py-2 text-sm text-white hover:bg-brand-700"
        >
          创建
        </button>
      </form>
    </div>
  );
}
