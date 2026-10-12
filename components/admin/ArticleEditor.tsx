"use client";

import { useState } from "react";
import { saveArticle } from "@/app/admin/articles/actions";

interface Category {
  id: string;
  name: string;
}

interface Article {
  id: string;
  title: string;
  slug?: string | null;
  categoryId?: string | null;
  summary?: string | null;
  body?: string | null;
  seoTitle?: string | null;
  seoKeywords?: string | null;
  seoDescription?: string | null;
  status?: string | null;
  isAiGenerated?: boolean | null;
}

export default function ArticleEditor({
  categories,
  article,
}: {
  categories: Category[];
  article?: Article;
}) {
  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? "");
  const [summary, setSummary] = useState(article?.summary ?? "");
  const [body, setBody] = useState(article?.body ?? "");
  const [seoTitle, setSeoTitle] = useState(article?.seoTitle ?? "");
  const [seoKeywords, setSeoKeywords] = useState(article?.seoKeywords ?? "");
  const [seoDescription, setSeoDescription] = useState(article?.seoDescription ?? "");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  // 合规：AI 生成内容须带显式标识。AI 生成草稿后自动置位；也允许编辑手动勾选/取消。
  const [aiGenerated, setAiGenerated] = useState(article?.isAiGenerated ?? false);

  async function generate() {
    if (!topic.trim()) {
      setMsg("请先输入一个主题，如：清明数字祭扫的意义");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/articles/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const d = await res.json();
      if (d.error) {
        setMsg(d.error);
        return;
      }
      setTitle(d.title || title);
      setSummary(d.summary || "");
      setBody(d.body || "");
      setSeoTitle(d.seoTitle || "");
      setSeoKeywords(d.seoKeywords || "");
      setSeoDescription(d.seoDescription || "");
      setAiGenerated(true);
      setMsg("✅ AI 已生成草稿，请检查并补充后发布（AI 内容不会自动发布，已自动标记「AI 生成」）");
    } catch {
      setMsg("生成失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  const field = "w-full rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500";
  const label = "mb-1 block text-xs font-medium text-brand-700";

  return (
    <form action={saveArticle} className="max-w-3xl space-y-4">
      {article?.id && <input type="hidden" name="id" value={article.id} />}

      <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-4">
        <div className="mb-2 flex items-end gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="输入主题，如：清明数字祭扫的意义"
            className={field}
          />
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="shrink-0 rounded-md bg-brand-800 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? "生成中…" : "AI 生成草稿"}
          </button>
        </div>
        {msg && <p className="text-xs text-brand-600">{msg}</p>}
      </div>

      <div>
        <label className={label}>标题 *</label>
        <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required className={field} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>栏目</label>
          <select name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={field}>
            <option value="">未选择</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>URL Slug（留空自动生成）</label>
          <input name="slug" value={slug} onChange={(e) => setSlug(e.target.value)} className={field} />
        </div>
      </div>

      <div>
        <label className={label}>摘要</label>
        <textarea name="summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className={field} />
      </div>

      <div>
        <label className={label}>正文（支持 Markdown：## 小标题、- 列表）</label>
        <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={12} className={field} />
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-800">
        <input
          type="checkbox"
          name="isAiGenerated"
          value="true"
          checked={aiGenerated}
          onChange={(e) => setAiGenerated(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          本内容为 <b>AI 辅助生成</b>。依据《人工智能生成合成内容标识办法》，AI 生成内容须带显式标识；
          点击「AI 生成草稿」后会自动勾选，你也可以手动勾选/取消。发布后公页将显示「AI 辅助生成（经人工编辑）」。
        </span>
      </label>

      <details className="rounded-lg border border-brand-200 p-3">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">SEO 设置</summary>
        <div className="mt-3 space-y-3">
          <div>
            <label className={label}>SEO 标题</label>
            <input name="seoTitle" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>SEO 关键词</label>
            <input name="seoKeywords" value={seoKeywords} onChange={(e) => setSeoKeywords(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>SEO 描述</label>
            <textarea name="seoDescription" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={2} className={field} />
          </div>
        </div>
      </details>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          name="status"
          value="draft"
          className="rounded-md border border-brand-300 px-5 py-2 text-sm text-brand-700 hover:bg-gray-50"
        >
          存为草稿
        </button>
        <button
          type="submit"
          name="status"
          value="published"
          className="rounded-md bg-brand-800 px-5 py-2 text-sm text-white hover:bg-brand-700"
        >
          发布
        </button>
      </div>
    </form>
  );
}
