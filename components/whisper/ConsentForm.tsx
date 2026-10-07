"use client";

import { useState } from "react";
import { revokeConsent, saveConsent } from "@/app/console/whispers/[id]/actions";

const field =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";

export type ConsentState = {
  applicantName: string;
  relation: string;
  deceasedWill: string;
  otherHeirsAck: boolean;
  /** 身份证号是否已录入（不回传明文） */
  hasIdNo: boolean;
  /** 撤回时间，非空表示已撤回 */
  revokedAt: string | null;
  createdAt: string | null;
} | null;

export default function ConsentForm({
  profileId,
  consent,
}: {
  profileId: string;
  consent: ConsentState;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(consent?.otherHeirsAck ?? false);
  const [showRevoke, setShowRevoke] = useState(false);

  const revoked = !!consent?.revokedAt;
  const valid = !!consent && !revoked;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set("profileId", profileId);
    if (ack) fd.set("otherHeirsAck", "on");
    try {
      const res = await saveConsent(fd);
      setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "已保存" : "保存失败") });
      if (res.ok) window.location.reload();
    } catch {
      setMsg({ ok: false, text: "请求失败，请重试" });
    }
    setBusy(false);
  }

  async function onRevoke() {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("profileId", profileId);
    try {
      const res = await revokeConsent(fd);
      setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "已撤回" : "操作失败") });
      if (res.ok) window.location.reload();
    } catch {
      setMsg({ ok: false, text: "请求失败，请重试" });
    }
    setBusy(false);
    setShowRevoke(false);
  }

  return (
    <section
      className={
        "rounded-xl border p-6 " +
        (valid ? "border-emerald-200 bg-emerald-50/30" : "border-amber-200 bg-amber-50/30")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-brand-900">
            家属授权 <span className="ml-1 font-normal text-brand-400">开启装置的前置条件</span>
          </h2>
          <p className="mt-1 text-xs text-brand-500">
            须由逝者近亲属作为申请人确认。未授权时：不允许克隆声音、不允许提交审核、装置无法开启。
          </p>
        </div>
        <span
          className={
            "rounded px-2 py-0.5 text-xs " +
            (valid
              ? "bg-emerald-100 text-emerald-700"
              : revoked
                ? "bg-red-100 text-red-600"
                : "bg-amber-100 text-amber-700")
          }
        >
          {valid ? "授权有效" : revoked ? "已撤回" : "未授权"}
        </span>
      </div>

      {/* —— 法律依据 —— */}
      <div className="mt-4 rounded-lg bg-white/70 px-4 py-3 text-xs leading-relaxed text-brand-600">
        <p className="font-medium text-brand-800">为什么必须做这一步</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>
            《民法典》<b>第 994 条</b>：死者的姓名、肖像、名誉、隐私、遗体等受到侵害的，
            其配偶、子女、父母有权依法请求行为人承担民事责任——使用逝者声音与形象须经近亲属同意。
          </li>
          <li>
            《民法典》<b>第 1019 条</b>：未经同意不得制作、使用、公开他人的肖像与声音。
          </li>
          <li>
            《个人信息保护法》<b>第 28 条</b>：声纹属敏感个人信息，须单独同意；
            本平台对身份证号采用 AES-256 加密存储。
          </li>
          <li>
            《人工智能拟人化互动服务管理暂行办法》：须明确告知 AI 身份、
            禁止诱导情感依赖，故本装置全程带「AI 生成」标识并留存对话日志不少于 6 个月。
          </li>
        </ul>
      </div>

      <form onSubmit={onSubmit} className="mt-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">授权人姓名 *</label>
            <input
              name="applicantName"
              defaultValue={consent?.applicantName ?? ""}
              maxLength={30}
              className={field}
              placeholder="近亲属本人姓名"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">
              与逝者的关系 *
            </label>
            <input
              name="relation"
              defaultValue={consent?.relation ?? ""}
              maxLength={20}
              className={field}
              placeholder="如：女儿 / 配偶 / 儿子"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-700">身份证号</label>
            <input
              name="applicantIdNo"
              className={field}
              placeholder={consent?.hasIdNo ? "已录入（加密存储）" : "用于授权关系核验"}
              autoComplete="off"
            />
            <p className="mt-1 text-[11px] text-brand-400">
              加密存储，审核员仅可见校验结果，不显示明文。
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-brand-700">
            逝者生前意愿（可选，如留有文字嘱托请记录）
          </label>
          <textarea
            name="deceasedWill"
            rows={3}
            defaultValue={consent?.deceasedWill ?? ""}
            className={field}
            placeholder="例如：老人生前多次表示愿意留下声音给孙辈留念。"
          />
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg bg-white/70 px-4 py-3">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-accent-600"
          />
          <span className="text-xs leading-relaxed text-brand-700">
            <b>我确认：其他近亲属对设立本装置无异议。</b>
            <span className="block text-brand-500">
              《民法典》994 条规定的权利人为配偶、子女、父母共同享有。若后续有权利人提出异议，
              本平台将依申请或主动关闭该装置，并删除相关数据。
            </span>
          </span>
        </label>

        {msg && (
          <p className={`mt-3 text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            disabled={busy || !ack}
            className="rounded-md bg-brand-800 px-6 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "提交中…" : valid ? "更新授权信息" : "提交授权"}
          </button>
          {valid && (
            <>
              {showRevoke ? (
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-brand-600">撤回后将立即关闭追思对话，确定？</span>
                  <button
                    type="button"
                    onClick={onRevoke}
                    disabled={busy}
                    className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    确认撤回
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRevoke(false)}
                    className="rounded border border-gray-300 px-3 py-1.5 text-brand-700 hover:bg-gray-50"
                  >
                    取消
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowRevoke(true)}
                  className="rounded border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  撤回授权
                </button>
              )}
            </>
          )}
        </div>
      </form>

      {consent?.createdAt && (
        <p className="mt-3 text-[11px] text-brand-400">
          授权记录创建于 {new Date(consent.createdAt).toLocaleString("zh-CN")}
          {consent.revokedAt
            ? ` · 于 ${new Date(consent.revokedAt).toLocaleString("zh-CN")} 撤回`
            : ""}
        </p>
      )}
    </section>
  );
}
