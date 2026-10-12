"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitComment } from "@/app/(public)/news/[slug]/actions";

type CommentItem = {
  id: string;
  body: string;
  createdAt: Date | string;
  user?: { realName?: string | null; email?: string | null } | null;
};

export default function CommentSection({
  articleId,
  comments,
}: {
  articleId: string;
  comments: CommentItem[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const res = await submitComment(articleId, text);
    setLoading(false);
    setOk(res.ok);
    setMsg(res.message);
    if (res.ok) setText("");
  }

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-lg font-semibold text-brand-900">
        用户互动 <span className="ml-1 text-xs font-normal text-brand-400">评论先审后显，弘扬文明祭扫</span>
      </h2>

      <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="分享你的看法，或投稿家风故事…（500字以内）"
          className="w-full rounded-md border border-brand-200 px-3 py-2 text-sm"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-brand-400">文明上网，不发布封建迷信内容</span>
          <button
            onClick={submit}
            disabled={loading || !text.trim()}
            className="rounded-md bg-brand-800 px-5 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? "提交中…" : "提交评论"}
          </button>
        </div>
        {msg && (
          <p className={ok ? "mt-2 text-xs text-green-600" : "mt-2 text-xs text-red-500"}>
            {msg}
          </p>
        )}
      </div>

      <ul className="mt-5 space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="rounded-lg border border-brand-200 bg-brand-100/70 p-4 text-sm">
            <div className="text-xs text-brand-400">
              {c.user?.realName || c.user?.email?.split("@")[0] || "网友"}
              <span className="ml-2">
                {new Date(c.createdAt).toLocaleDateString("zh-CN")}
              </span>
            </div>
            <p className="mt-1 text-gray-700">{c.body}</p>
          </li>
        ))}
        {comments.length === 0 && (
          <li className="text-sm text-brand-400">暂无评论，来抢沙发～</li>
        )}
      </ul>

      <div className="mt-6 rounded-lg border border-dashed border-brand-200 bg-brand-50/50 p-4 text-sm">
        <span className="font-medium text-brand-800">✍️ 家风故事征集：</span>
        <span className="text-brand-500">
          投稿你家的家风家训与追思故事，优秀稿件将在平台文化专栏发布。
        </span>
        <button
          onClick={() => router.push("/news/contribute")}
          className="ml-3 rounded-md border border-brand-300 px-3 py-1 text-xs text-brand-700 hover:bg-brand-100/70"
        >
          我要投稿
        </button>
      </div>
    </section>
  );
}
