"use client";

import { useState, useTransition } from "react";

/** 板块中文标签（纪念馆 / 宗祠共用一份渲染，标签随端不同） */
export const HALL_SECTION_LABELS: Record<string, string> = {
  hero: "壁龛 / 3D 首屏",
  worship: "祭拜面板",
  cover: "封面图",
  profile: "遗像 + 生平",
  couplet: "挽联横版",
  paidTributes: "敬献祭品",
  archive: "故人数字档案",
  tributes: "追思记录",
  community: "亲友交流社区",
  panorama: "3D 全景",
  decorInfo: "装修信息",
};

export const CLAN_SECTION_LABELS: Record<string, string> = {
  gate: "山门",
  clan3d: "3D 空间",
  info: "主图 + 名号 + 字辈诗",
  shrine: "寝堂（牌位墙）",
  worship: "献祭 · 敬奉先祖",
  courtyard: "天井",
  photos: "宗祠影像",
  mainhall: "享堂",
  tributes: "祭祀记录",
  community: "宗亲交流社区",
  decorSummary: "当前陈设",
  aboutDecor: "关于装修素材",
  links: "关联入口",
  ground: "落地场景（供桌收尾图）",
};

export type SectionOrderAction = (
  hallId: string,
  order: string[],
) => Promise<{ ok: boolean; error?: string }>;

export default function SectionOrderEditor({
  hallId,
  initialOrder,
  labels,
  action,
}: {
  hallId: string;
  initialOrder: string[];
  labels: Record<string, string>;
  action: SectionOrderAction;
}) {
  const [order, setOrder] = useState<string[]>(initialOrder);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    setDirty(true);
    setMsg(null);
  };

  const onDrop = (target: number) => {
    if (dragIndex === null || dragIndex === target) {
      setDragIndex(null);
      return;
    }
    const next = [...order];
    const [item] = next.splice(dragIndex, 1);
    next.splice(target, 0, item);
    setOrder(next);
    setDragIndex(null);
    setDirty(true);
    setMsg(null);
  };

  const reset = () => {
    setOrder(initialOrder);
    setDirty(false);
    setMsg(null);
  };

  const save = () => {
    startTransition(async () => {
      const res = await action(hallId, order);
      if (res.ok) {
        setDirty(false);
        setMsg({ ok: true, text: "已保存板块顺序" });
      } else {
        setMsg({ ok: false, text: res.error ?? "保存失败" });
      }
    });
  };

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-100/70 p-5">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-800">页面板块排序</h3>
        <span className="text-[11px] text-stone-400">拖拽或点 ↑/↓ 调整</span>
      </div>
      <p className="mb-3 text-xs text-stone-500">仅调整顺序，不会隐藏任何板块。</p>

      <ul className="space-y-2">
        {order.map((key, i) => (
          <li
            key={key}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(i)}
            className={
              "flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors " +
              (dragIndex === i
                ? "border-amber-400 bg-amber-50"
                : "border-brand-200 bg-brand-100/70 hover:border-stone-300")
            }
          >
            <span className="flex items-center gap-2">
              <span className="cursor-grab select-none text-stone-400" aria-hidden>
                ⠿
              </span>
              <span className="text-stone-700">{labels[key] ?? key}</span>
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="上移"
                className="rounded border border-brand-200 px-2 py-0.5 text-xs text-stone-600 hover:bg-gray-50 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
                aria-label="下移"
                className="rounded border border-brand-200 px-2 py-0.5 text-xs text-stone-600 hover:bg-gray-50 disabled:opacity-30"
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-40"
        >
          {pending ? "保存中…" : "保存顺序"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending || !dirty}
          className="rounded-lg border border-brand-200 px-4 py-1.5 text-sm text-stone-600 hover:bg-gray-50 disabled:opacity-40"
        >
          还原
        </button>
        {msg && (
          <span className={"text-xs " + (msg.ok ? "text-emerald-600" : "text-red-600")}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
