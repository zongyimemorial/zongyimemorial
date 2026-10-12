"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updatePublicMemorialDecor } from "./actions";

interface Props {
  slug: string;
  /** 初始装修方案 id（默认传世典藏） */
  giftSuiteId: string;
  /** 可切换的尊享层方案列表 */
  suiteChoices: { id: string; name: string }[];
  portraitUrl: string | null;
  couplet: { left?: string; right?: string; horizontal?: string } | null;
}

export default function MemorialDecorForm({
  slug,
  giftSuiteId,
  suiteChoices,
  portraitUrl,
  couplet,
}: Props) {
  const [state, formAction, pending] = useActionState(
    updatePublicMemorialDecor,
    { ok: false } as { ok: boolean; error?: string }
  );

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="slug" value={slug} />

      {/* 装修方案 */}
      <section className="rounded-xl border border-brand-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-brand-900">平台赠礼装修方案</h2>
        <p className="mt-1 text-xs text-brand-400">
          公益馆由平台统一赠予尊享层顶级装修，公众零付费、零装修入口。切换方案后 3D 厅堂材质即时变化。
        </p>
        <select
          name="giftSuiteId"
          defaultValue={giftSuiteId}
          className="mt-3 w-full rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          {suiteChoices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </section>

      {/* 遗像 */}
      <section className="rounded-xl border border-brand-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-brand-900">逝者遗像</h2>
        <p className="mt-1 text-xs text-brand-400">
          填公网可访问的图片 URL（http(s):// 开头）。留空则详情页展示庄重占位图。
        </p>
        <input
          name="portraitUrl"
          defaultValue={portraitUrl ?? ""}
          placeholder="https://example.com/portrait.jpg"
          className="mt-3 w-full rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </section>

      {/* 挽联 */}
      <section className="rounded-xl border border-brand-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-brand-900">挽联</h2>
        <p className="mt-1 text-xs text-brand-400">
          上联 / 下联 / 横批。填写后详情页以竖排展示；全部留空则不显示挽联板块。
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-brand-500">
            上联
            <input
              name="coupletLeft"
              defaultValue={couplet?.left ?? ""}
              placeholder="如：一生俭朴留典范"
              className="mt-1 w-full rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </label>
          <label className="text-xs text-brand-500">
            下联
            <input
              name="coupletRight"
              defaultValue={couplet?.right ?? ""}
              placeholder="如：半世勤劳传家风"
              className="mt-1 w-full rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </label>
          <label className="text-xs text-brand-500">
            横批
            <input
              name="coupletHorizontal"
              defaultValue={couplet?.horizontal ?? ""}
              placeholder="如：德范长存"
              className="mt-1 w-full rounded-md border border-brand-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </label>
        </div>
      </section>

      {/* 提交 */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-800 px-5 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "保存中…" : "保存馆务配置"}
        </button>
        <Link
          href={`/memorial/${slug}`}
          target="_blank"
          className="text-sm text-accent-600 hover:underline"
        >
          预览详情页 →
        </Link>
      </div>

      {state.ok && (
        <p className="rounded-md border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">
          已保存，详情页（3D 厅堂 / 挽联 / 赠礼）已即时更新。
        </p>
      )}
      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
