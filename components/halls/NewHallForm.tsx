"use client";

import { useMemo, useState } from "react";
import { createMemorialHall } from "@/app/(public)/halls/new/actions";
import {
  CHANNEL_META,
  MATERIAL_TYPES,
  REVIEW_CHANNELS,
  type ChannelKey,
  type MaterialItem,
} from "@/lib/hall-review";

const field =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";
const RELATIONS = ["亲属", "配偶", "子女", "父母", "兄弟姐妹", "朋友", "宗亲", "单位（逝者生平相关）"];

/** 简单图片上传（走 /api/proof-upload，返回可访问 URL） */
function useProofUploader() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  async function upload(file: File): Promise<string | null> {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/proof-upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "上传失败");
        return null;
      }
      return json.url as string;
    } catch {
      setError("上传失败，请重试");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { upload, busy, error };
}

export default function NewHallForm() {
  const [channel, setChannel] = useState<ChannelKey>("standard");
  const [values, setValues] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [relationProof, setRelationProof] = useState("");
  const [promiseLetter, setPromiseLetter] = useState("");
  const [promiseSigned, setPromiseSigned] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const uploader = useProofUploader();
  const meta = CHANNEL_META[channel];
  const channelTypes = meta.materialTypes;

  const collectedMaterials = useMemo<MaterialItem[]>(() => {
    return channelTypes.flatMap((type) => {
      const value = (values[type] || "").trim();
      const url = urls[type] || "";
      if (!value && !url) return [];
      return [
        {
          type,
          label: MATERIAL_TYPES[type as keyof typeof MATERIAL_TYPES].label,
          value: value || undefined,
          url: url || undefined,
        },
      ];
    });
  }, [channelTypes, values, urls]);

  function onUpload(type: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploader.upload(file).then((url) => {
      if (url) setUrls((u) => ({ ...u, [type]: url }));
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    setFormError("");
    if (collectedMaterials.length < meta.requireMin) {
      e.preventDefault();
      setFormError(`请至少提供一项${meta.label}所需的证明材料`);
      return;
    }
    if (meta.requirePromise) {
      if (!relationProof.trim()) {
        e.preventDefault();
        setFormError("特殊申述通道需提供亲属关系证明");
        return;
      }
      if (!promiseLetter.trim()) {
        e.preventDefault();
        setFormError("特殊申述通道需上传已签署的真实性承诺书");
        return;
      }
      if (!promiseSigned) {
        e.preventDefault();
        setFormError("请勾选「已阅读并签署真实性承诺书」");
        return;
      }
    }
    // 校验通过：隐藏字段已在下方受控渲染，表单正常提交到 server action
    setSubmitting(true);
  }

  return (
    <form action={createMemorialHall as unknown as (fd: FormData) => void} onSubmit={onSubmit} className="mt-6 space-y-6">
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="materials" value={JSON.stringify(collectedMaterials)} />
      <input type="hidden" name="relationProof" value={relationProof} />
      <input type="hidden" name="promiseLetter" value={promiseLetter} />
      <input type="hidden" name="promiseSigned" value={promiseSigned ? "on" : "off"} />

      {/* —— 审核通道选择 —— */}
      <section className="rounded-xl border border-gray-100 bg-white p-6">
        <h2 className="text-sm font-semibold text-brand-900">选择审核通道</h2>
        <p className="mb-4 mt-1 text-xs text-brand-400">
          依据《网络祭祀要求》（MZ/T 173—2025），建馆须核验经办人身份与逝者关系。无火化证明等法定材料时，可走替代核验或特殊申述通道。
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {REVIEW_CHANNELS.map((ch) => {
            const m = CHANNEL_META[ch];
            const active = channel === ch;
            return (
              <button
                type="button"
                key={ch}
                onClick={() => setChannel(ch)}
                className={`rounded-lg border p-3 text-left transition ${
                  active ? "border-accent-500 bg-accent-50 ring-1 ring-accent-300" : "border-gray-200 hover:border-accent-300"
                }`}
              >
                <div className="text-sm font-semibold text-brand-900">{m.label}</div>
                <div className="mt-1 text-xs leading-relaxed text-brand-500">{m.desc}</div>
                <div className="mt-2 text-[11px] text-brand-400">审核：{m.slaText}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* —— 实名与逝者信息 —— */}
      <section className="rounded-xl border border-gray-100 bg-white p-6">
        <h2 className="text-sm font-semibold text-brand-900">实名与逝者信息</h2>
        <p className="mb-4 mt-1 text-xs text-brand-400">
          依据《网络祭祀要求》（MZ/T 173—2025）：建馆须提供经办人身份证、手机号及逝者关系，经专人审核后方可开通。材料仅用于合规审核，加密存储。
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">逝者姓名 *</label>
            <input name="deceasedName" required maxLength={30} className={field} placeholder="将用作纪念馆名称" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">与逝者关系 *</label>
            <select name="relation" required defaultValue="亲属" className={field}>
              {RELATIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">经办人身份证号 *</label>
            <input name="applicantIdCard" required maxLength={18} className={field} placeholder="18位身份证号（加密存储）" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">经办人手机号 *</label>
            <input name="applicantPhone" required maxLength={11} className={field} placeholder="11位手机号" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">经办人姓名（选填）</label>
            <input name="applicantRealName" maxLength={30} className={field} placeholder="与实名认证一致" />
          </div>
        </div>
      </section>

      {/* —— 证明材料（按通道） —— */}
      <section className="rounded-xl border border-gray-100 bg-white p-6">
        <h2 className="text-sm font-semibold text-brand-900">{meta.label} · 证明材料</h2>
        <p className="mb-4 mt-1 text-xs text-brand-400">{meta.desc}</p>
        <div className="space-y-4">
          {channelTypes.map((type) => {
            const mt = MATERIAL_TYPES[type as keyof typeof MATERIAL_TYPES];
            const hasUrl = !!urls[type];
            return (
              <div key={type} className="rounded-lg border border-gray-100 bg-gray-50/40 p-3">
                <label className="mb-1 block text-xs font-medium text-brand-700">{mt.label}（编号 / 说明）</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={values[type] || ""}
                    onChange={(e) => setValues((v) => ({ ...v, [type]: e.target.value }))}
                    maxLength={200}
                    className={field}
                    placeholder="填写编号或文字说明"
                  />
                  <label className="cursor-pointer whitespace-nowrap rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-brand-600 hover:border-accent-400">
                    {uploader.busy ? "上传中…" : hasUrl ? "重新上传图片" : "上传图片（可选）"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(type, e)} />
                  </label>
                  {hasUrl && (
                    <a href={urls[type]} target="_blank" rel="noreferrer" className="text-xs text-accent-600 hover:underline">
                      查看已传图片
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {uploader.error && <p className="mt-2 text-xs text-red-600">{uploader.error}</p>}
      </section>

      {/* —— 特殊申述专属：关系证明 + 承诺书 —— */}
      {meta.requirePromise && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-6">
          <h2 className="text-sm font-semibold text-brand-900">特殊申述补充材料</h2>
          <p className="mb-4 mt-1 text-xs text-brand-500">
            本通道仅创建者可见，需在建馆后 60 天内补传正式材料方可转公开。请先下载承诺书签署后上传。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">亲属关系证明（编号 / 说明）*</label>
              <input
                value={relationProof}
                onChange={(e) => setRelationProof(e.target.value)}
                maxLength={200}
                className={field}
                placeholder="如：户口本编号 / 亲属关系说明"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">真实性承诺书（已签署）*</label>
              <div className="flex flex-wrap items-center gap-2">
                <a href="/docs/commitment-letter.md" target="_blank" rel="noreferrer" className="text-xs font-medium text-accent-600 hover:underline">
                  下载《真实性承诺书》模板
                </a>
                <label className="cursor-pointer whitespace-nowrap rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-brand-600 hover:border-accent-400">
                  {uploader.busy ? "上传中…" : promiseLetter ? "重新上传" : "上传签署件"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploader.upload(f).then((u) => u && setPromiseLetter(u));
                  }} />
                </label>
                {promiseLetter && (
                  <a href={promiseLetter} target="_blank" rel="noreferrer" className="text-xs text-accent-600 hover:underline">查看</a>
                )}
              </div>
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-brand-700">
            <input type="checkbox" checked={promiseSigned} onChange={(e) => setPromiseSigned(e.target.checked)} />
            我已阅读并签署《纪念馆信息真实性承诺书》，承诺所提交材料真实有效
          </label>
        </section>
      )}

      {formError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{formError}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand-800 px-7 py-2.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? "提交中…" : "免费提交建馆申请"}
        </button>
        <a href="/halls" className="text-sm text-brand-500 hover:text-brand-700">返回纪念馆列表</a>
      </div>
    </form>
  );
}
