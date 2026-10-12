"use client";

import { useState, useTransition } from "react";
import { deleteProfile } from "@/app/console/whispers/[id]/actions";

/**
 * 危险操作区：删除追思装置（行使数据删除权）。
 *
 * 设计取舍：
 *   - 不做浏览器 confirm（不可测、易被忽略），改为**输入装置名称**二次确认，
 *     与 GitHub 删除仓库同款交互，误删概率几乎为零。
 *   - 明确告知删除范围与不可逆性（《个人信息保护法》第 47 条要求告知）。
 */
export default function DangerZone({
  profileId,
  personaName,
}: {
  profileId: string;
  personaName: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const matched = typed.trim() === personaName;

  function submit() {
    const fd = new FormData();
    fd.set("profileId", profileId);
    startTransition(async () => {
      const r = await deleteProfile(fd);
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
      <h2 className="text-sm font-semibold text-red-700">删除追思装置</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-brand-600">
        删除后将<b>永久移除</b>：逝者生平资料库、已生成的人格提示词、家属授权记录、
        全部声线及其样本音频、所有对话历史与生成音频。
        <span className="text-red-600">此操作不可撤销，也无法找回。</span>
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-brand-500">
        依据《个人信息保护法》第 47 条，你有权在目的实现后删除上述个人信息。
        若只是想暂时关闭对话，请在下方使用「关闭追思对话」。
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-md border border-red-300 bg-brand-100/70 px-4 py-2 text-xs text-red-600 hover:bg-red-50"
        >
          我要删除这个装置
        </button>
      ) : (
        <div className="mt-4 rounded-lg border border-red-200 bg-brand-100/70 p-4">
          <label className="block text-xs text-brand-700">
            请输入装置名称
            <span className="mx-1 font-medium text-red-600">{personaName}</span>
            以确认删除：
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={personaName}
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
