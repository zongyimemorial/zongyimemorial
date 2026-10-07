"use client";

import { useState } from "react";

/**
 * 装修指引（工坊顶部的可展开步骤条）。
 *
 * ## 为什么放在工坊里而不是只给一个链接
 *
 * 装修这套东西有三个**反直觉**的点，不解释用户一定会踩：
 *   ① 改完要**点保存**才生效（以前是点一下就存，用户会习惯性地以为已经存了）；
 *   ② 买 ≠ 用 —— 积分兑换的是"使用权"，换完还得选中它并保存；
 *   ③ 建馆送的模板与它用到的零件是**永久免费**的，「恢复默认」也不会吞掉。
 *
 * 放在工坊里可以**就地折叠**：老用户点一下收起，不挡路；
 * 新用户默认展开第一屏，一眼看完全流程。
 *
 * 长文版在 `/guide/decor`，这里每段末尾给"查看完整说明"的入口。
 */
const STEPS = [
  {
    n: "1",
    t: "挑一套模板",
    d: "「整套模板」一次换掉壁纸、地纹、挂饰、相框、字体，还会改变空间形态 —— 立体模板会呈现可环视的 3D 空间。",
    tip: "建馆赠送的那套永久免费，先用它打底最快。",
  },
  {
    n: "2",
    t: "按需替换单件",
    d: "在「背景壁纸」「地面地纹」「挂饰陈设」「遗像相框」「字体风格」里单独挑选。手动改过任一项后就不再算整套模板，变成你的自定义搭配。",
    tip: "「装饰套件」是一次换好几件（不动你挑好的墙与地），比逐件点更快。",
  },
  {
    n: "3",
    t: "看预览",
    d: "上方是实时预览；点「全屏预览」可以整屏细看，拖拽画面左右环视，确认纵深与光线。",
    tip: "预览不写数据，随便看、随便试。",
  },
  {
    n: "4",
    t: "保存并完成装修",
    d: "点右上角「保存并完成装修」才真正生效。保存前顶部会一直提示「有未保存的改动」，也可以点「放弃改动」退回上次保存的样子。",
    tip: "这样设计是为了让你可以放心试各种搭配，不必担心点错就改了馆。",
  },
];

export default function DecorStudioGuide({ guideHref = "/guide/decor" }: { guideHref?: string }) {
  const [open, setOpen] = useState(true);

  return (
    <div
      data-decor-guide=""
      className="mt-4 rounded-lg border border-accent-200 bg-accent-50/60 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-accent-800">装修指引</span>
          <span className="text-[11px] text-accent-600">四步完成装修</span>
        </div>
        <div className="flex items-center gap-3">
          <a href={guideHref} className="text-[11px] text-accent-700 hover:underline">
            查看完整说明 →
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="rounded border border-accent-300 px-2 py-0.5 text-[11px] text-accent-700 hover:bg-accent-100"
          >
            {open ? "收起" : "展开"}
          </button>
        </div>
      </div>

      {open && (
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-md border border-accent-200 bg-white/70 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-500 text-[11px] font-medium text-white">
                  {s.n}
                </span>
                <span className="text-xs font-medium text-brand-900">{s.t}</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-brand-600">{s.d}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-accent-700">💡 {s.tip}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
