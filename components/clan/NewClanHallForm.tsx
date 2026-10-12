"use client";

import { useMemo, useState } from "react";
import { createClanHall } from "@/app/(public)/clan/halls/actions";
import {
  CLAN_CHANNEL_META,
  MATERIAL_TYPES,
  REVIEW_CHANNELS,
  type ClanChannelKey,
  type MaterialItem,
} from "@/lib/hall-review";

const field =
  "w-full rounded-md border border-brand-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";

/**
 * 各材料类型的输入框占位符：标准通道 3 项刻意沿用旧表单文案，
 * 以保证既有烟测（scripts/smoke-clan-review.mjs 的 standard 路径）按 placeholder 命中。
 */
const MAT_PLACEHOLDER: Record<string, string> = {
  clan_relation: "如：族谱记载 / 宗亲会证明编号",
  genealogy_record: "如：某版族谱第几卷记载",
  clan_history_photo: "如：祠堂现状 / 文保编号",
  clan_committee_letter: "如：宗亲会/村委会出具的证明信编号",
  clan_witness: "如：宗亲联名见证 / 邻里证明说明",
  clan_video_verify: "如：视频核验 / 口述历史说明",
  clan_obituary: "如：历史祭祖文告 / 讣告记载",
  clan_old_photo: "如：老祠堂照片 / 旧影像说明",
  clan_history_doc: "如：地方志 / 文史记载出处",
  clan_family_record: "如：家族口述史料 / 记载说明",
};

export default function NewClanHallForm() {
  const [channel, setChannel] = useState<ClanChannelKey>("standard");
  const [values, setValues] = useState<Record<string, string>>({});
  const [relationProof, setRelationProof] = useState("");
  const [promiseLetterFile, setPromiseLetterFile] = useState("");
  const [promiseSigned, setPromiseSigned] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const meta = CLAN_CHANNEL_META[channel];
  const channelTypes = meta.materialTypes;

  // 当前通道下已填（文本或文件占位）的材料清单
  const collectedMaterials = useMemo<MaterialItem[]>(() => {
    const out: MaterialItem[] = [];
    for (const type of channelTypes) {
      const value = (values[type] || "").trim();
      if (!value) continue;
      out.push({
        type,
        label: MATERIAL_TYPES[type as keyof typeof MATERIAL_TYPES].label,
        value,
      });
    }
    return out;
  }, [channelTypes, values]);

  function onMaterialsValid() {
    if (collectedMaterials.length < meta.requireMin) {
      setFormError(`请至少提供一项${meta.label}所需的证明材料`);
      return false;
    }
    if (meta.requirePromise) {
      if (!relationProof.trim()) {
        setFormError("特殊申述通道需提供宗族关系说明或证明");
        return false;
      }
      if (!promiseLetterFile) {
        setFormError("特殊申述通道需上传已签署的真实性承诺书");
        return false;
      }
      if (!promiseSigned) {
        setFormError("请勾选「已阅读并签署真实性承诺书」");
        return false;
      }
    }
    return true;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    setFormError("");
    if (!onMaterialsValid()) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  return (
    <form action={createClanHall} onSubmit={onSubmit} className="mt-6 space-y-6">
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="relationProof" value={relationProof} />
      <input type="hidden" name="promiseSigned" value={promiseSigned ? "on" : "off"} />

      {/* —— 审核通道选择 —— */}
      <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-6">
        <h2 className="text-sm font-semibold text-brand-900">选择审核通道</h2>
        <p className="mb-4 mt-1 text-xs text-brand-400">
          依据《网络祭祀要求》（MZ/T 173—2025），设立宗祠须核验经办人身份与宗族关系。无族谱等资质证明时，可走替代核验或特殊申述通道先建后补。
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {REVIEW_CHANNELS.map((ch) => {
            const m = CLAN_CHANNEL_META[ch as ClanChannelKey];
            const active = channel === ch;
            return (
              <button
                type="button"
                key={ch}
                onClick={() => {
                  setChannel(ch as ClanChannelKey);
                  setFormError("");
                }}
                className={`rounded-lg border p-3 text-left transition ${
                  active ? "border-accent-500 bg-accent-50 ring-1 ring-accent-300" : "border-brand-200 hover:border-accent-300"
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

      {/* —— 宗祠名号与源流 —— */}
      <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-6">
        <h2 className="text-sm font-semibold text-brand-900">宗祠名号与源流</h2>
        <p className="mb-4 mt-1 text-xs text-brand-400">
          宗祠名称与堂号是识别宗族的标志，请按族谱记载填写。
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">姓氏 *</label>
            <input name="surname" required maxLength={10} className={field} placeholder="如：李" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">宗祠名称 *</label>
            <input name="hallName" required maxLength={40} className={field} placeholder="如：陇西李氏宗祠" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">堂号 *</label>
            <input name="name" required maxLength={20} className={field} placeholder="如：敦本堂" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">郡望 / 堂号别称</label>
            <input name="ancestorTitle" maxLength={30} className={field} placeholder="如：陇西" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">始祖</label>
            <input name="ancestorName" maxLength={20} className={field} placeholder="如：李广" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">始迁地 / 祖籍</label>
            <input name="origin" maxLength={60} className={field} placeholder="如：甘肃陇西" />
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-brand-700">宗祠简介</label>
          <textarea
            name="description"
            rows={3}
            className={field}
            placeholder="简述宗祠始建年代、迁建沿革、堂号由来与主要祭祖活动。"
          />
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-brand-700">
            字辈诗 / 派语（每行一句，也可整段粘贴）
          </label>
          <textarea
            name="generationPoem"
            rows={3}
            className={field}
            placeholder={"克明俊德，以亲九族\n平章百姓，协和万邦"}
          />
        </div>
      </section>

      {/* —— 佐证材料（按通道，服务端上传） —— */}
      <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-6">
        <h2 className="text-sm font-semibold text-brand-900">{meta.label} · 证明材料</h2>
        <p className="mb-4 mt-1 text-xs text-brand-400">{meta.desc}</p>
        <div className="space-y-4">
          {channelTypes.map((type) => {
            const mt = MATERIAL_TYPES[type as keyof typeof MATERIAL_TYPES];
            return (
              <div key={type} className="rounded-lg border border-brand-200 bg-gray-50/40 p-3">
                <label className="mb-1 block text-xs font-medium text-brand-700">{mt.label}（编号 / 说明）</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    name={`mat_${type}`}
                    value={values[type] || ""}
                    onChange={(e) => setValues((v) => ({ ...v, [type]: e.target.value }))}
                    maxLength={200}
                    className={field}
                    placeholder={MAT_PLACEHOLDER[type] ?? "填写编号或文字说明"}
                  />
                  <input type="file" name={`file_${type}`} accept="image/*" className="text-xs text-brand-500" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* —— 经办人实名 —— */}
      <section className="rounded-xl border border-brand-200 bg-brand-100/70 p-6">
        <h2 className="text-sm font-semibold text-brand-900">经办人实名</h2>
        <p className="mb-4 mt-1 text-xs text-brand-400">
          依据《网络祭祀要求》（MZ/T 173—2025）：设立宗祠须提供经办人身份证、手机号，经专人审核后方可开通。材料仅用于合规审核，加密存储。
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">经办人身份证号 *</label>
            <input name="applicantIdCard" required maxLength={18} className={field} placeholder="18位（加密存储）" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">经办人手机号 *</label>
            <input name="applicantPhone" required maxLength={11} className={field} placeholder="11位" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">经办人姓名（选填）</label>
            <input name="applicantRealName" maxLength={30} className={field} placeholder="与实名认证一致" />
          </div>
        </div>
      </section>

      {/* —— 特殊申述专属：宗族关系说明 + 真实性承诺书 —— */}
      {meta.requirePromise && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-6">
          <h2 className="text-sm font-semibold text-brand-900">特殊申述补充材料</h2>
          <p className="mb-4 mt-1 text-xs text-brand-500">
            本通道仅创建者可见，需在建馆后 60 天内补传正式材料方可转公开。请先下载承诺书签署后上传。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">宗族关系说明 / 证明 *</label>
              <input
                value={relationProof}
                onChange={(e) => setRelationProof(e.target.value)}
                maxLength={200}
                className={field}
                placeholder="如：与始祖/宗族关系说明、户籍或族谱佐证"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-700">真实性承诺书（已签署）*</label>
              <div className="flex flex-wrap items-center gap-2">
                <a href="/docs/commitment-letter.md" target="_blank" rel="noreferrer" className="text-xs font-medium text-accent-600 hover:underline">
                  下载《真实性承诺书》模板
                </a>
                <label className="cursor-pointer whitespace-nowrap rounded-md border border-brand-300 bg-brand-100/70 px-3 py-2 text-xs text-brand-600 hover:border-accent-400">
                  {promiseLetterFile ? "已上传，重新上传" : "上传签署件"}
                  <input
                    type="file"
                    name="file_promiseLetter"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setPromiseLetterFile(f.name);
                    }}
                  />
                </label>
                {promiseLetterFile && (
                  <span className="text-xs text-brand-500">{promiseLetterFile}</span>
                )}
              </div>
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-brand-700">
            <input type="checkbox" checked={promiseSigned} onChange={(e) => setPromiseSigned(e.target.checked)} />
            我已阅读并签署《宗祠信息真实性承诺书》，承诺所提交材料真实有效
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
          {submitting ? "提交中…" : "提交并进入装修工坊"}
        </button>
        <a href="/clan/halls" className="text-sm text-brand-500 hover:text-brand-700">
          返回宗祠列表
        </a>
      </div>
    </form>
  );
}
