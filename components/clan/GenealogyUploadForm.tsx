"use client";

import { useState } from "react";
import Link from "next/link";
import { uploadGenealogy } from "@/app/(public)/clan/actions";

const field =
  "w-full rounded-md border border-brand-200 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none";

export default function GenealogyUploadForm({
  isLoggedIn,
  idVerified,
}: {
  isLoggedIn: boolean;
  idVerified: boolean;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border border-dashed border-brand-200 bg-brand-100/70 p-6 text-center text-sm text-brand-400">
        <Link href="/login" className="text-accent-600 hover:underline">登录</Link>
        后即可上传族谱，参与共建姓氏文化记忆库
      </div>
    );
  }
  if (!idVerified) {
    return (
      <div className="rounded-xl border border-dashed border-brand-200 bg-brand-100/70 p-6 text-center text-sm text-brand-400">
        上传族谱需先完成<Link href="/console/realname" className="text-accent-600 hover:underline">实名认证</Link>
      </div>
    );
  }

  return (
    <form
      className="rounded-xl border border-brand-200 bg-brand-100/70 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await uploadGenealogy(new FormData(e.currentTarget));
        setBusy(false);
        setMsg({ ok: res.ok, text: res.message });
        if (res.ok) (e.target as HTMLFormElement).reset();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">姓氏 *</label>
          <input name="surname" required placeholder="如：陈" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">堂号</label>
          <input name="hallName" placeholder="如：颍川堂" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-700">祖籍 / 郡望</label>
          <input name="origin" placeholder="如：河南颍川" className={field} />
        </div>
      </div>
      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-brand-700">
          字辈派语（世系用字，如"仁义礼智信…"）
        </label>
        <input name="lineage" className={field} />
      </div>
      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-brand-700">迁徙源流概述</label>
        <textarea name="migration" rows={3} className={field} placeholder="一族自何地迁出、落脚何处、繁衍分支…" />
      </div>
      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-brand-700">
          世系成员（数字化录入，每行一条：世代|姓名|关系|备注）
        </label>
        <textarea
          name="members"
          rows={5}
          className={`${field} font-mono`}
          placeholder={"十二世|陈廷敬|本支|清康熙朝名臣\n十三世|陈世信|廷敬之子|…"}
        />
      </div>
      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-brand-700">
          原始族谱文件链接（扫描件 URL，选填）
        </label>
        <input name="fileUrl" placeholder="https://…" className={field} />
      </div>
      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      )}
      <button
        disabled={busy}
        className="mt-4 rounded-md bg-brand-800 px-6 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? "提交中…" : "提交族谱（审核后公开，+50积分）"}
      </button>
    </form>
  );
}
