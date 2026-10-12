import Link from "next/link";
import type { LiveStatus } from "@prisma/client";

/**
 * 直播表单（新建 / 编辑共用）
 *
 * 为什么抽成一个组件：新建页与编辑页是**同一套字段**，早先只有新建页。
 * 补编辑页时若各写一份，两处的字段名、选项、提示文案迟早分叉
 * （AGENTS.md：同一真相写两处 = 必然漂移）。
 *
 * 另一个职责：**把《直播指引》接进后台**。
 * 此前后台表单与公开指引完全脱节 —— 指引花了一整节讲「去哪儿拿地址」「不要填推流地址」，
 * 但真到填表这一步，用户看不到任何提示，也找不回指引。
 * 所以这里内联了最容易填错的那几条，并给出指引深链。
 *
 * ⚠️ `data-live-form="1"`：给表单一个**稳定的测试钩子**。
 *   后台侧栏有一个「退出登录」表单，它的 <button type="submit"> 在 DOM 里排在
 *   页面内容**之前**。于是验收脚本里写 `page.click('button[type="submit"]')`
 *   点到的其实是"退出登录" —— 表现为提交后跳首页、登录态丢失、action 一行日志不打，
 *   看起来完全像"新建直播坏了"，实际是**选择器点错了按钮**。
 *   有了这个钩子，测试写成 `[data-live-form] button[type="submit"]` 就点不错。
 */
const CATEGORIES = ["公祭仪式", "生态安葬仪式", "宗祠落成", "祭祖大典", "追悼会"];

const STATUS_HINT: Record<LiveStatus, string> = {
  scheduled: "观众能看到这场直播的预告，但看不到画面。建议先选它，地址和标题随时可以再改。",
  live: "画面立即对观众可见 —— 一旦开播即不可撤回，请先确认已取得家属同意。",
  ended: "作为回放保留，观众可随时回看。",
};

export type LiveFormValues = {
  id?: string;
  title?: string;
  status?: LiveStatus;
  category?: string | null;
  embedType?: string | null;
  streamUrl?: string | null;
  description?: string | null;
};

export default function LiveForm({
  action,
  values = {},
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  values?: LiveFormValues;
  submitLabel: string;
}) {
  const field = "w-full rounded-md border border-brand-300 px-3 py-2 text-sm";
  const current = values.status ?? "scheduled";

  return (
    <form action={action} data-live-form="1" className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <div>
        <label className="mb-1 block text-xs font-medium text-brand-700">标题 *</label>
        <input
          name="title"
          required
          defaultValue={values.title ?? ""}
          placeholder="如：李氏宗祠落成典礼"
          className={field}
        />
        <p className="mt-1 text-xs text-brand-400">活动全称，会显示在直播大厅卡片与直播间大标题上。</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-brand-700">状态</label>
        <select name="status" defaultValue={current} className={field}>
          <option value="scheduled">预告</option>
          <option value="live">直播中</option>
          <option value="ended">回放</option>
        </select>
        <p className="mt-1 text-xs text-brand-400">{STATUS_HINT[current]}</p>
        <p className="mt-1 text-xs text-brand-500">改状态会自动记入开播 / 结束时间，无需手工填写。</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-brand-700">直播类型</label>
        <select name="category" defaultValue={values.category ?? ""} className={field}>
          <option value="">不分类</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-brand-400">用于直播大厅的筛选。</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-brand-700">接入方式</label>
        <select name="embedType" defaultValue={values.embedType ?? "video"} className={field}>
          <option value="video">视频流（自建推流 / mp4 / HLS）</option>
          <option value="iframe">iframe 嵌入（YouTube Live / Zoom 等平台）</option>
        </select>
        <p className="mt-1 text-xs text-brand-400">
          用 YouTube 或 Zoom 开播 → 选「iframe 嵌入」；用 OBS 等自建推流 → 选「视频流」。
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-brand-700">播放地址</label>
        <input
          name="streamUrl"
          defaultValue={values.streamUrl ?? ""}
          placeholder="https://..."
          className={field}
        />
        <p className="mt-1 text-xs text-brand-400">
          iframe 类填 <strong>嵌入页地址</strong>；视频流类填 <strong>.m3u8 播放地址</strong>。
        </p>
        {/*
          这是后台最容易填错的一条，指引里写了但表单上没有 —— 现在内联进来，
          并用醒目样式，别让它淹没在小灰字里。
        */}
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-600">
          ⚠️ 不要填<strong>推流地址</strong>（rtmp:// 开头），也不要填<strong>串流密钥</strong> ——
          观众会打不开。填错了画面出不来，但页面看起来一切正常，最难排查。
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-brand-700">描述</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={values.description ?? ""}
          placeholder="活动背景、议程、参与方式等"
          className={field}
        />
        <p className="mt-1 text-xs text-brand-400">会显示在直播间画面下方。</p>
      </div>

      {/*
        指引入口：后台与公开指引的接缝处。
        放在提交按钮**上方**，因为用户是「填到一半不确定」时才需要它。

        ⚠️ 链接文案刻意**不带「第X节」编号** —— 指引的章节编号会随内容增删而变，
        一旦在这里写死编号，改指引就得回来改这里，又是"同一真相写两处"。
        锚点（#address / #hardware / #publish）是稳定的，节名也一眼能认。
      */}
      <div className="rounded-lg border border-accent-200 bg-accent-50 px-4 py-3 text-xs leading-6 text-accent-800">
        <strong>不确定怎么拿到播放地址？</strong>
        <Link href="/live/guide#address" className="ml-1 font-medium text-accent-700 underline">
          指引 · 取地址
        </Link>
        <span className="mx-1">·</span>
        <Link href="/live/guide#hardware" className="font-medium text-accent-700 underline">
          软硬件配置
        </Link>
        <span className="mx-1">·</span>
        <Link href="/live/guide#publish" className="font-medium text-accent-700 underline">
          发布前自检清单
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-brand-800 px-5 py-2 text-sm text-white hover:bg-brand-700"
        >
          {submitLabel}
        </button>
        <Link href="/admin/live" className="text-sm text-brand-500 hover:text-brand-700">
          返回直播管理
        </Link>
      </div>
    </form>
  );
}
