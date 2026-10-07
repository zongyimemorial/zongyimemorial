"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PropLayout } from "@/lib/hall-decor";
import DecorSpacePreview from "@/components/decor/DecorSpacePreview";
import { saveDecorLayout } from "@/app/console/halls/[id]/actions";
import { saveClanDecorLayout } from "@/app/console/clan-halls/[id]/actions";

/**
 * 公页 3D 场景的「调整布局」编辑器（纪念馆 / 宗祠共用，包在 DecorSpacePreview 外）。
 *
 * ⚠️ 架构约束：本组件是 Client Component，公页（Server Component）传进来的
 *    **children 只能是普通 React 节点**（遗像等），**绝不能是函数**（render-prop）——
 *    RSC 序列化边界不允许函数穿过（实测报 "Functions cannot be passed directly
 *    to Client Components"，整页落错误边界）。所以本组件自己渲染 DecorSpacePreview，
 *    公页只传 decor/spaceKind/engine/children 这些可序列化的东西。
 *
 * 职责与边界：
 *  - **仅馆主**渲染「调整布局」开关；访客不渲染任何编辑 DOM（零回归硬约束）。
 *  - 开启后 DecorSpacePreview 进入 editable：每件陈设描金虚线描边、可拖；
 *    环视在编辑态被 Decor3DScene 冻结（拖拽与环视不打架）。
 *  - 保存策略（对抗 localhost.run 免费版 30–50% 边缘抖动）：
 *      拖拽落点 → 乐观更新本地 layout → **debounce 800ms** 自动调 server action；
 *      失败不回滚视觉（公页 SSR 以库值为准，刷新即见库值），浮层亮「保存失败」可点重试。
 *  - **只提交 layout**：server action 侧只写 layout 字段（templateId/slots/unlocked/
 *    granted 全部沿用库值），这里也只传 layout JSON —— 前后端双重保证不碰权益。
 */

type SaveState = "idle" | "saving" | "error";

export type SceneLayoutEditorProps = {
  hallId: string;
  /** 宗祠侧传 true → 调 saveClanDecorLayout（否则纪念馆 saveDecorLayout） */
  clanSide?: boolean;
  isOwner: boolean;
  /** 库里已保存的布局（SSR 传入；undefined = 未自定义过） */
  initialLayout?: Record<string, PropLayout>;
  /** ↓ 以下原样透传给 DecorSpacePreview */
  decor: Parameters<typeof DecorSpacePreview>[0]["decor"];
  spaceKind?: string;
  engine?: "v1" | "v2";
  className?: string;
  children?: React.ReactNode;
};

export default function SceneLayoutEditor({
  hallId,
  clanSide = false,
  isOwner,
  initialLayout,
  decor,
  spaceKind,
  engine,
  className,
  children,
}: SceneLayoutEditorProps) {
  const [layout, setLayout] = useState<Record<string, PropLayout> | undefined>(initialLayout);
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<Record<string, PropLayout> | undefined>(initialLayout);

  const persist = useCallback(
    async (next: Record<string, PropLayout> | undefined) => {
      latestRef.current = next;
      setSaveState("saving");
      try {
        const fd = new FormData();
        fd.set(clanSide ? "clanHallId" : "hallId", hallId);
        fd.set("layout", JSON.stringify(next ?? {}));
        const res = clanSide ? await saveClanDecorLayout(fd) : await saveDecorLayout(fd);
        if (res?.ok) setSaveState("idle");
        else setSaveState("error");
      } catch {
        // 隧道抖动 / 网络失败：保留本地布局，让用户手动重试
        setSaveState("error");
      }
    },
    [clanSide, hallId],
  );

  const scheduleSave = useCallback(
    (next: Record<string, PropLayout> | undefined) => {
      latestRef.current = next;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void persist(next), 800);
    },
    [persist],
  );

  // 卸载时清掉未触发的防抖定时器（未落盘改动宁可丢也不能在卸载后再 setState）
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onLayoutChange = useCallback(
    (id: string, pos: PropLayout) => {
      const next = { ...(latestRef.current ?? {}), [id]: pos };
      setLayout(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  const resetLayout = () => {
    setLayout(undefined);
    setSaveState("idle");
    void persist(undefined);
  };

  const finish = () => {
    setEditing(false);
    // 有未落盘的防抖改动 → 立即保存
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      void persist(latestRef.current);
    }
  };

  return (
    <div className="relative">
      <DecorSpacePreview
        decor={decor}
        spaceKind={spaceKind}
        engine={engine}
        className={className}
        layout={isOwner ? layout : initialLayout}
        editable={isOwner && editing}
        onLayoutChange={isOwner ? onLayoutChange : undefined}
      >
        {children}
      </DecorSpacePreview>

      {/* 编辑能力仅馆主可见；访客不渲染任何编辑 DOM（零回归硬约束） */}
      {isOwner && (
        <>
          <button
            type="button"
            data-layout-toggle={editing ? "on" : "off"}
            onClick={() => (editing ? finish() : setEditing(true))}
            className="absolute right-2 top-2 z-20 rounded border border-amber-300/50 bg-black/55 px-2.5 py-1 text-[11px] text-amber-100 backdrop-blur transition hover:bg-black/75"
          >
            {editing ? "完成布局" : "调整布局"}
          </button>

          {editing && (
            <div
              data-layout-bar="1"
              className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300/40 bg-black/65 px-3 py-1.5 text-[11px] text-amber-50 backdrop-blur"
            >
              <span className="hidden sm:inline">拖动陈设重排 · 建筑（墙/柱/枋）不可拖</span>
              <button
                type="button"
                onClick={resetLayout}
                className="rounded-full border border-white/25 px-2.5 py-0.5 hover:bg-white/10"
              >
                恢复默认
              </button>
              <button
                type="button"
                onClick={finish}
                className="rounded-full bg-amber-400/90 px-2.5 py-0.5 font-medium text-black hover:bg-amber-300"
              >
                完成
              </button>
              <span data-layout-save={saveState} className="w-16 text-right">
                {saveState === "saving"
                  ? "保存中…"
                  : saveState === "error"
                    ? (
                      <button
                        type="button"
                        onClick={() => void persist(latestRef.current)}
                        className="text-red-300 underline underline-offset-2"
                      >
                        保存失败·重试
                      </button>
                    )
                    : layout !== initialLayout
                      ? "已保存"
                      : ""}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
