"use client";

import { useState, useTransition } from "react";

/**
 * 删除「整座馆 / 整座祠」的危险操作区（馆主 / 祠主行使数据删除权）。
 *
 * 与追思装置的 DangerZone 同款交互：输入馆名二次确认（GitHub 式），
 * 明确告知删除范围与不可逆性，避免误删。
 *
 * 仅渲染 UI 与调用传入的 Server Action；删除的权限校验与级联清理全部在服务端完成。
 */
export default function HallDangerZone({
  hallId,
  hallName,
  kindLabel,
  idField,
  action,
}: {
  hallId: string;
  hallName: string;
  /** "纪念馆" 或 "宗祠" */
  kindLabel: string;
  /** 服务端 action 读取的字段名："hallId" 或 "clanHallId" */
  idField: "hallId" | "clanHallId";
  /** 服务端删除动作（deleteMemorialHall / deleteClanHall） */
  action: (fd: FormData) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const matched = typed.trim() === hallName && hallName.length > 0;

  function submit() {
    const fd = new FormData();
    fd.set(idField, hallId);
    startTransition(async () => {
      const r = await action(fd);
      if (r.ok) {
        // 删除成功后服务端会 redirect；此处兜底避免白屏
        setMsg({ ok: true, text: r.message ?? "已删除" });
      } else {
        setMsg({ ok: false, text: r.message ?? "删除失败" });
      }
    });
  }

  return (
    <section className="rounded-xl border border-red-200 bg-red-50/40 p-6">
      <h2 className="text-sm font-semibold text-red-700">删除{kindLabel}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-brand-600">
        删除后将<b>永久移除</b>：馆内全部照片与相册、装修方案、挽联与故人档案、交流社区成员与帖子、
        祭拜 / 祭祀记录、敬献花圈，以及关联在本馆下的电子讣告与追思装置（含声线样本与对话历史）。
        <span className="text-red-600">此操作不可撤销，也无法找回。</span>
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-brand-500">
        依据《个人信息保护法》第 47 条，你有权在目的实现后删除上述个人信息。
        若只是想暂时对访客隐藏、日后还可能重新公开，请先使用上方的「下架 / 撤回为私密草稿」
        ——它会完整保留馆内一切数据且可随时撤销，无需删除。
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-md border border-red-300 bg-brand-100/70 px-4 py-2 text-xs text-red-600 hover:bg-red-50"
        >
          我要删除这个{kindLabel}
        </button>
      ) : (
        <div className="mt-4 rounded-lg border border-red-200 bg-brand-100/70 p-4">
          <label className="block text-xs text-brand-700">
            请输入{kindLabel}名称
            <span className="mx-1 font-medium text-red-600">{hallName}</span>
            以确认删除：
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={hallName}
            className="mt-2 w-full max-w-xs rounded-md border border-brand-300 px-3 py-1.5 text-sm outline-none focus:border-red-400"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!matched || pending}
              onClick={submit}
              className="rounded-md bg-red-600 px-4 py-2 text-xs text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "删除中…" : "确认永久删除"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setMsg(null);
              }}
              className="rounded-md border border-brand-300 px-4 py-2 text-xs text-brand-700 hover:bg-gray-50"
            >
              取消
            </button>
          </div>
          {msg && (
            <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>
          )}
        </div>
      )}
    </section>
  );
}
