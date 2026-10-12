"use client";

import { useState } from "react";
import { submitApplication } from "@/app/(public)/memorial/actions";
import { CATEGORY_LABEL, type MemorialCategory } from "@/lib/memorial";

const CATEGORIES: MemorialCategory[] = ["CELEBRITY", "HEROIC", "GOOD_DEED"];

export default function ApplyForm() {
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors([]);
    const fd = new FormData(e.currentTarget);
    const res = await submitApplication(fd);
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
    } else {
      setErrors(res.errors ?? ["提交失败，请稍后再试"]);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="text-4xl">✅</div>
        <h2 className="mt-3 text-lg font-semibold text-emerald-800">申请已提交</h2>
        <p className="mt-2 text-sm text-emerald-700">
          已进入人工审核队列。平台将在核验家属授权与权威来源后决定是否上线，
          审核结果不会主动通知，可在数个工作日后回访本板块查看。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <ul className="list-disc space-y-1 pl-5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <fieldset className="rounded-xl border border-brand-200 p-4">
        <legend className="px-2 text-sm font-medium text-brand-800">逝者信息</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="逝者姓名 *">
            <input name="deceasedName" required className={inputCls} placeholder="如：张某某" />
          </Field>
          <Field label="纪念类别 *">
            <select name="category" required defaultValue="" className={inputCls}>
              <option value="" disabled>
                请选择
              </option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="出生年份">
            <input name="birthYear" type="number" className={inputCls} placeholder="如：1958" />
          </Field>
          <Field label="逝世年份">
            <input name="deathYear" type="number" className={inputCls} placeholder="如：2021" />
          </Field>
          <Field label="一句话称号 *" full>
            <input name="honorTitle" required className={inputCls} placeholder="如：三十年义务摆渡的乡村好人" />
          </Field>
          <Field label="事迹简介 *" full>
            <textarea name="summary" required rows={3} className={inputCls} placeholder="一句话概括生平与事迹" />
          </Field>
          <Field label="事迹详情 *" full>
            <textarea name="story" required rows={5} className={inputCls} placeholder="详细事迹，建议包含时间、地点与影响" />
          </Field>
          <Field label="权威来源链接 *" full>
            <input
              name="sourceUrl"
              type="url"
              required
              className={inputCls}
              placeholder="官方通报 / 主流媒体报道 / 称号评定文书链接"
            />
            <p className="mt-1 text-xs text-brand-400">
              依据合规要求，建堂须提供权威来源以核验真实性，防止虚假立碑。
            </p>
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-brand-200 p-4">
        <legend className="px-2 text-sm font-medium text-brand-800">申请人（近亲属）信息</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="申请人姓名 *">
            <input name="applicantName" required className={inputCls} />
          </Field>
          <Field label="与逝者关系 *">
            <input name="applicantRelation" required className={inputCls} placeholder="如：子女" />
          </Field>
          <Field label="联系方式 *">
            <input name="applicantContact" required className={inputCls} placeholder="手机 / 邮箱" />
          </Field>
        </div>
      </fieldset>

      {/* 合规：家属授权书勾选 */}
      <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-brand-700">
        <input
          type="checkbox"
          name="consentConfirmed"
          value="on"
          required
          className="mt-0.5 h-4 w-4"
        />
        <span>
          我已阅读并同意《家属授权书》：本人为逝者近亲属，确认所填信息真实，
          并授权平台在征得本人同意后免费创建本公益纪念堂、公开展示逝者事迹与来源，
          且知悉本人可随时申请撤下或更正。
        </span>
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-brand-700 px-5 py-3 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {submitting ? "提交中…" : "提交申请（进入审核队列）"}
      </button>
      <p className="text-center text-xs text-brand-400">
        本板块纯公益、永久免费，无任何付费引导。
      </p>
    </form>
  );
}

const inputCls =
  "w-full rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500";

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={"block" + (full ? " sm:col-span-2" : "")}>
      <span className="mb-1 block text-xs font-medium text-brand-600">{label}</span>
      {children}
    </label>
  );
}
