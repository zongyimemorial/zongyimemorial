import type { HallStatus } from "@prisma/client";

/**
 * 「下架 / 撤回为私密草稿」软撤回区（纪念馆 / 宗祠通用）。
 *
 * 与底部红色 DangerZone（永久删除）形成对照：此处是**可逆**操作——
 * 只翻 isPublic，馆内照片/装修/社区/祭拜记录/花圈等全部保留，磁盘文件不动，
 * 公页对非馆主 notFound()、列表过滤、SEO noindex，但馆主随时可重新公开。
 *
 * 服务端组件：用传入的 Server Action 直接渲染 `<form action>`，提交后
 * revalidate 即在控制台重渲染出最新状态，无需客户端交互。
 */
export default function HallVisibilityZone({
  hallId,
  kindLabel,
  idField,
  isPublic,
  status,
  action,
}: {
  hallId: string;
  kindLabel: string;
  /** "hallId" 或 "clanHallId" */
  idField: "hallId" | "clanHallId";
  isPublic: boolean;
  status?: HallStatus | string;
  /** setHallPublic / setClanHallPublic */
  action: (fd: FormData) => Promise<{ ok: boolean; message?: string }>;
}) {
  const isActive = status === "active";
  const btnBase =
    "rounded-md px-4 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  // React 的 <form action> 类型要求返回 void，但服务端动作返回 ActionResult；
  // 运行时 React 会忽略返回值，这里仅做类型转换，动作仍是合法 Server Action。
  const formAction = action as unknown as (fd: FormData) => void | Promise<void>;

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-6">
      <h2 className="text-sm font-semibold text-amber-800">下架 / 撤回为私密草稿</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-brand-600">
        撤回后，{kindLabel}从公开展示移除，<b>馆内全部内容保留</b>：照片与相册、装修方案、
        挽联与故人档案、交流社区、祭拜 / 祭祀记录、敬献花圈均原样留存，仅对你自己可见，
        你可随时重新公开。这与下方「永久删除」不同——删除会清空一切且<b>不可恢复</b>。
        依据《个人信息保护法》第 47 条，你有权撤回同意并限制处理，本操作会留痕。
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span
          className={
            "rounded px-2 py-0.5 text-xs " +
            (isPublic ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600")
          }
        >
          当前：{isPublic ? "已公开（访客可访问）" : "仅你可见（私密草稿）"}
        </span>

        {isPublic ? (
          <form action={formAction}>
            <input type="hidden" name={idField} value={hallId} />
            <input type="hidden" name="isPublic" value="0" />
            <button type="submit" className={`${btnBase} border border-amber-300 bg-white text-amber-700 hover:bg-amber-100`}>
              下架并撤回为私密草稿
            </button>
          </form>
        ) : isActive ? (
          <form action={formAction}>
            <input type="hidden" name={idField} value={hallId} />
            <input type="hidden" name="isPublic" value="1" />
            <button type="submit" className={`${btnBase} bg-brand-800 text-white hover:bg-brand-700`}>
              重新公开{kindLabel}
            </button>
          </form>
        ) : (
          <span className="text-xs text-brand-400">本馆仍在审核流程中，通过后自动公开，无需手动撤回。</span>
        )}
      </div>
    </section>
  );
}
