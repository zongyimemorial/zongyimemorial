"use client";

import { useEffect, useState } from "react";
import DecorSpacePreview from "@/components/decor/DecorSpacePreview";
import DecorPagePreview from "@/components/decor/DecorPagePreview";
import type { HallDecor } from "@/lib/hall-decor";
import type { SkinTokens } from "@/lib/decor-skin";

/**
 * 全屏装修预览。
 *
 * ## 它解决什么
 *
 * 工坊里那块 340px 的预览够用来看"改了没"，但看不清空间本身 ——
 * 尤其是 3D 空间（星河、天井、牌位寝堂）的纵深与环视，小窗里完全体会不到。
 * 所以给一个"整屏看看我到底装成什么样"的机会。
 *
 * ## 三个必须做对的细节
 *
 * ① **锁背景滚动**。全屏层打开后，如果 body 还能滚，用户拖拽环视时
 *    会把底层页面一起拖动，体感很糟。挂载时设 `overflow:hidden`，卸载时还原
 *    **原值**（不是写死 ""，否则会破坏别的组件设过的样式）。
 *
 * ② **Esc 关闭**。这是全屏层的通用预期，少了会让人不知道怎么退出去。
 *
 * ③ **只有一个 3D 场景实例**。全屏层是"同一份 decor 换个尺寸再画一遍"，
 *    不是再挂一个背景页 —— 两个 Canvas/透视容器同时活着会互相抢拖拽事件。
 *    这里用条件渲染，全屏时工坊那块就地卸载。
 *
 * ⚠️ 预览**不写入任何数据**：它只是把当前草稿画大一点。
 *    保存仍然只由「保存并完成装修」触发。
 */
export default function DecorFullPreview({
  open,
  onClose,
  decor,
  spaceKind,
  title = "装修预览",
  spaceName,
  engine = "v1",
  /** 整页预览所需的皮肤（`skinOf` + `withDark` 后的那份）；不传则整页 tab 用默认色 */
  skin,
  /** 当前是否深色底，与 skin 同源 */
  dark,
  /** 堂号占位（整页预览用，不出现逝者照片） */
  hallName,
}: {
  open: boolean;
  onClose: () => void;
  decor: HallDecor;
  /** 空间形态（来自模板的 space） */
  spaceKind?: string;
  title?: string;
  /** 空间形态的中文名，显示在标题旁 */
  spaceName?: string;
  /**
   * 引擎版本，透传给 `DecorSpacePreview`。
   *
   * **必须与工坊那块小预览同值** —— 全屏层是"同一份装饰换个尺寸再画一遍"，
   * 若小窗走 v2、全屏走 v1，用户点"全屏预览"会看到**完全不同的空间**，
   * 第一反应是"我刚才装的东西丢了"。这类"同一份数据两处渲染不一致"
   * 是最难自查的 bug（AGENTS.md 也点过名）。
   */
  engine?: "v1" | "v2";
  skin?: SkinTokens;
  dark?: boolean;
  hallName?: string;
}) {
  const [mounted, setMounted] = useState(false);
  /*
    预览视图切换（阶段 5）：`space` = 3D 空间（原有），`page` = 整页换肤骨架。

    为什么做成 tab 而不是两个独立入口：
      全屏层已经是"看整体"的地方，且已处理好 Esc 关闭与 body 滚动锁还原原值；
      再开一个全屏层就是重复造轮子，还容易两个层叠在一起互相抢滚动锁。
  */
  const [view, setView] = useState<"space" | "page">("space");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // 服务端不渲染全屏层（它依赖 window 的键盘事件与滚动锁）
  if (!mounted || !open) return null;

  return (
    <div
      data-decor-fullpreview=""
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-[#0b0d10]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-medium text-white/90">{title}</span>
          {view === "space" && spaceName && (
            <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
              {spaceName}
            </span>
          )}
          {/* 视图切换：3D 空间 / 整页效果（换肤骨架） */}
          <div className="ml-1 flex items-center gap-1 rounded bg-white/8 p-0.5">
            {(
              [
                ["space", "3D 空间"],
                ["page", "整页效果"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                data-decor-fullpreview-tab={k}
                aria-pressed={view === k}
                className={
                  "rounded px-2.5 py-1 text-[11px] transition " +
                  (view === k ? "bg-white/85 text-[#0b0d10]" : "text-white/70 hover:bg-white/10")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-white/20 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
        >
          关闭预览（Esc）
        </button>
      </div>

      <div className="min-h-0 flex-1 p-4">
        {view === "space" ? (
          <DecorSpacePreview
            decor={decor}
            spaceKind={spaceKind}
            className="h-full"
            height={undefined}
            engine={engine}
          />
        ) : (
          /*
            整页效果：换肤后的卡片/标题/按钮骨架。

            ⚠️ 这里**不挂 3D 场景**（刻意）—— 见 DecorPagePreview 文件头：
               既避免污染 `[data-decor-3d]` 计数（v2 有 `=== 2` / `=== 1` 硬断言），
               也因为整页预览的价值是"换肤"，与 3D 空间正交。
          */
          <div className="mx-auto max-w-md">
            <DecorPagePreview
              decor={decor}
              skin={skin}
              dark={dark}
              hallName={hallName}
            />
          </div>
        )}
      </div>

      <p className="px-5 pb-4 text-center text-[11px] text-white/40">
        {view === "space"
          ? "拖拽画面可左右环视 · 关闭后继续编辑，改动仍需点「保存」才会生效"
          : "整页效果展示换肤后的卡片/标题/按钮观感 · 预览不写入任何数据"}
      </p>
    </div>
  );
}
