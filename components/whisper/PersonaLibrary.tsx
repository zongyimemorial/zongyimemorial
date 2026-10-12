"use client";

import { useMemo, useState } from "react";
import {
  regenerateSystemPrompt,
  savePersonaLibrary,
  saveSystemPrompt,
} from "@/app/console/whispers/[id]/actions";

const field =
  "w-full rounded-md border border-brand-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";

export type MemoryItem = { id?: string; year?: string; title?: string; content?: string };
export type RelationItem = { name?: string; relation?: string; note?: string };

export type PersonaLibraryProps = {
  profileId: string;
  personaName: string;
  personTitle: string;
  bio: string;
  traits: string[];
  speechStyle: {
    tone?: string;
    dialect?: string;
    addressForm?: string;
    catchphrases?: string[];
  };
  memories: MemoryItem[];
  relationships: RelationItem[];
  systemPrompt: string;
  promptVersion: number;
  /** 记忆条目上限，-1 = 不限 */
  memoryLimit: number;
  planName: string;
};

/** 把结构化记忆转回「年份|标题|内容」的行文本 */
function memoriesToText(items: MemoryItem[]): string {
  return items
    .map((m) => [m.year ?? "", m.title ?? "", m.content ?? ""].join("|"))
    .join("\n");
}

/** 把结构化关系转回「姓名|关系|备注」的行文本 */
function relationsToText(items: RelationItem[]): string {
  return items.map((r) => [r.name ?? "", r.relation ?? "", r.note ?? ""].join("|")).join("\n");
}

export default function PersonaLibrary(props: PersonaLibraryProps) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const [memoriesText, setMemoriesText] = useState(() => memoriesToText(props.memories));
  const [promptText, setPromptText] = useState(props.systemPrompt);

  // 记忆条数（实时，用于配额提示）
  const memoryCount = useMemo(
    () => memoriesText.split("\n").filter((l) => l.trim()).length,
    [memoriesText],
  );
  const relationCount = useMemo(
    () => relationsToText(props.relationships).split("\n").filter((l) => l.trim()).length,
    [props.relationships],
  );

  const overLimit = props.memoryLimit !== -1 && memoryCount > props.memoryLimit;

  async function run(key: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fn();
      setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "已完成" : "操作失败") });
    } catch {
      setMsg({ ok: false, text: "请求失败，请重试" });
    }
    setBusy(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("profileId", props.profileId);
    fd.set("memories", memoriesText);
    return run("save", () => savePersonaLibrary(fd));
  }

  async function onRegenerate() {
    const fd = new FormData();
    fd.set("profileId", props.profileId);
    await run("regen", () => regenerateSystemPrompt(fd));
  }

  async function onSavePrompt() {
    const fd = new FormData();
    fd.set("profileId", props.profileId);
    fd.set("systemPrompt", promptText);
    await run("prompt", () => saveSystemPrompt(fd));
  }

  return (
    <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-brand-900">
            生平资料库 <span className="ml-1 font-normal text-brand-400">数据越丰，越像他/她</span>
          </h2>
          <p className="mt-1 text-xs text-brand-400">
            这里的内容会作为事实依据注入 AI 人格，并在对话中按相关性检索引用。
          </p>
        </div>
        <span className="text-xs text-brand-400">
          记忆{" "}
          <b className={overLimit ? "text-red-500" : "text-brand-700"}>{memoryCount}</b>
          {props.memoryLimit === -1 ? " 条（不限）" : ` / ${props.memoryLimit} 条`} · 关系{" "}
          {relationCount} 人 · 当前「{props.planName}」
        </span>
      </div>

      <form onSubmit={onSubmit} className="mt-4">
        {/* —— 基础身份 —— */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">称呼（AI 自称）*</label>
            <input
              name="personaName"
              defaultValue={props.personaName}
              maxLength={30}
              className={field}
              placeholder="如：李老先生"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">身份 / 头衔</label>
            <input
              name="personTitle"
              defaultValue={props.personTitle}
              maxLength={20}
              className={field}
              placeholder="如：中学语文教师"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">性格特征</label>
            <input
              name="traits"
              defaultValue={props.traits.join("，")}
              className={field}
              placeholder="温和，爱说笑，节俭"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-brand-700">生平概述</label>
          <textarea
            name="bio"
            rows={4}
            defaultValue={props.bio}
            className={field}
            placeholder="出生地、求学与工作经历、性格与生前常挂在嘴边的话、与家人的相处方式……"
          />
        </div>

        {/* —— 语言风格 —— */}
        <div className="mt-5 rounded-lg bg-brand-50/50 p-4">
          <p className="text-xs font-semibold text-brand-800">语言风格（决定「像不像」的关键）</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">语气</label>
              <input
                name="tone"
                defaultValue={props.speechStyle.tone ?? ""}
                maxLength={200}
                className={field}
                placeholder="慢条斯理，爱用反问"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">方言 / 口音</label>
              <input
                name="dialect"
                defaultValue={props.speechStyle.dialect ?? ""}
                maxLength={100}
                className={field}
                placeholder="带闽南口音"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">习惯称呼家人为</label>
              <input
                name="addressForm"
                defaultValue={props.speechStyle.addressForm ?? ""}
                maxLength={200}
                className={field}
                placeholder="叫孙女「阿妹」"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-brand-700">
              口头禅（每行一句，会自然穿插进回复）
            </label>
            <textarea
              name="catchphrases"
              rows={2}
              defaultValue={(props.speechStyle.catchphrases ?? []).join("\n")}
              className={field}
              placeholder={"慢慢来，不着急\n饭吃了没有"}
            />
          </div>
        </div>

        {/* —— 记忆条目 —— */}
        <div className="mt-5">
          <label className="mb-1 block text-xs font-medium text-brand-700">
            生平记忆条目（每行一条，格式：<code className="text-accent-700">年份|标题|内容</code>）
          </label>
          <p className="mb-2 text-xs text-brand-400">
            写得越具体，AI 越能在对话中提起真实细节。例如：
            <code className="ml-1 text-accent-700">1965-1995|教书的那些年|在城关中学教语文三十年，最得意的是带出了三个大学生。</code>
          </p>
          <textarea
            name="memories"
            rows={10}
            value={memoriesText}
            onChange={(e) => setMemoriesText(e.target.value)}
            className={field + " font-mono text-xs leading-relaxed"}
            placeholder={"1965-1995|教书的那些年|在城关中学教语文三十年。\n1982|院子里的月季|每年春天都要修剪院墙下的月季。"}
          />
          {overLimit && (
            <p className="mt-1 text-xs text-red-500">
              超出当前套餐上限（{props.memoryLimit} 条），保存会被拒绝。可精简内容或升级套餐。
            </p>
          )}
        </div>

        {/* —— 关系图谱 —— */}
        <div className="mt-5">
          <label className="mb-1 block text-xs font-medium text-brand-700">
            关系图谱（每行一位，格式：<code className="text-accent-700">姓名|关系|备注</code>）
          </label>
          <textarea
            name="relationships"
            rows={5}
            defaultValue={relationsToText(props.relationships)}
            className={field + " font-mono text-xs leading-relaxed"}
            placeholder={"李小雨|孙女|最疼她，常带她去买糖葫芦\n王秀兰|妻子|1962 年结婚"}
          />
        </div>

        {msg && (
          <p className={`mt-3 text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            disabled={busy !== null}
            className="rounded-md bg-brand-800 px-6 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy === "save" ? "保存中…" : "保存资料库"}
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy !== null}
            className="rounded-md border border-brand-300 px-5 py-2 text-sm text-brand-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === "regen" ? "生成中…" : "保存并重新生成人格"}
          </button>
        </div>
      </form>

      {/* —— 人格提示词（进阶） —— */}
      <div className="mt-6 border-t border-brand-200 pt-4">
        <button
          type="button"
          onClick={() => setShowPrompt((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-xs font-semibold text-brand-800">
            人格提示词（进阶） · v{props.promptVersion}
            <span className="ml-2 font-normal text-brand-400">
              系统据资料库自动生成，可手工微调
            </span>
          </span>
          <span className="text-xs text-brand-400">{showPrompt ? "收起 ▲" : "展开 ▼"}</span>
        </button>

        {showPrompt && (
          <div className="mt-3">
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={14}
              className={field + " font-mono text-[11px] leading-relaxed"}
              placeholder="（尚未生成，点击下方按钮生成）"
            />
            <p className="mt-2 text-xs text-amber-700">
              提示词中的「边界」段落是本平台强制写入的合规约束（不得自称真人、不得引导沉浸、
              危机情况须转介援助热线），请勿删除。
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onSavePrompt}
                disabled={busy !== null}
                className="rounded-md border border-brand-300 px-5 py-2 text-sm text-brand-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy === "prompt" ? "保存中…" : "保存提示词"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
