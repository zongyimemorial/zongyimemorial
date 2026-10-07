"use client";

import { useMemo } from "react";
import Decor3DScene from "@/components/decor/Decor3DScene";
import {
  decorItem,
  findTemplate,
  resolveOrnamentItems,
  type HallDecor,
  type PropLayout,
} from "@/lib/hall-decor";
import { findClanTemplate } from "@/lib/clan-decor";

/**
 * 装修 3D 预览（纪念馆 / 宗祠通用）
 *
 * 职责：把「一份装修方案」翻译成「一个 3D 场景」。
 *
 * 三个关键判断都在这里做，不许下放到调用方 —— 否则公网馆页、控制台工坊、
 * 商城详情页三处会对同一份方案渲染出不同结果，那种不一致最难查：
 *
 *   1. **空间形态来自模板**：模板的 `space` 字段决定场景骨架。
 *      用户只换壁纸/挂饰（templateId 为空）时，空间骨架保持 classic ——
 *      这是对的：单件素材不该把整个空间结构换掉。
 *   2. **挂饰必须真的渲染出来**，哪怕它是一整面壁龛墙。
 *      早先在馆页里 `niche-wall` 被显式 return null（因为那版由
 *      NicheWallHero 单独渲染），在 3D 场景里不能这么干 ——
 *      否则用户挑了「壁龛」挂饰，预览里空空如也，看起来像 bug。
 *   3. **兜底**：模板 id 失效 / 空间标识拼错，一律退回 classic，
 *      脏数据不该让页面白屏。
 *
 * ⚠️ 零外部资源：本组件与 Decor3DScene 都不请求任何图片，
 *    几何全部由 lib/decor-3d.ts 推导（原因见该文件头的决策记录）。
 */
export type DecorSpacePreviewProps = {
  decor: HallDecor;
  /** 高度（px）。不传则按 16:9 */
  height?: number;
  /** 是否允许拖拽环视 */
  interactive?: boolean;
  /** 覆盖空间形态（商城详情页用：让用户先看模板长什么样，不必先拥有） */
  spaceKind?: string;
  /** 显示"当前空间形态"角标 */
  showBadge?: boolean;
  /**
   * 叠加在空间中心的内容（公网馆页用来放遗像）。
   *
   * ⚠️ 传进来的**必须是 HTML 节点**（真实 <img>），绝不能是画好的 SVG ——
   *    遗像要能按需加载、能被断言、letterbox 时不错位（AGENTS.md 硬约束）。
   *    不传时给一块中性供案，让空间不至于空荡。
   */
  children?: React.ReactNode;
  className?: string;
  /**
   * 引擎版本，透传给 `Decor3DScene`。
   *
   * **默认仍保留 `"v1"`**，但三处公页（馆页 / 祠页 / 商城商品详情页）与工坊
   * 现在都**显式传 `"v2"`**。默认值不跟着改的原因：它是分阶段切换的"回退开关" ——
   * 出问题时改调用处一处即可单独回退某页，不必担心改默认值会连带影响未来的新调用方。
   */
  engine?: "v1" | "v2";
  /**
   * 陈设布局覆盖 + 编辑态（公页馆主「调整布局」），透传给 Decor3DScene。
   * 不传（工坊 / 商城详情页 / 访客）= 无任何编辑能力，DOM 与现状一致。
   */
  layout?: Record<string, PropLayout>;
  editable?: boolean;
  onLayoutChange?: (id: string, pos: PropLayout) => void;
};

export default function DecorSpacePreview({
  decor,
  height,
  interactive = true,
  spaceKind,
  showBadge = true,
  children,
  className = "",
  engine = "v1",
  layout,
  editable = false,
  onLayoutChange,
}: DecorSpacePreviewProps) {
  /*
    ⚠️ **两张模板表都要查**：`findTemplate` 只覆盖纪念馆模板（`tpl-*`），
    宗祠模板（`clan-*`）在 `findClanTemplate` 里。本组件号称"纪念馆/宗祠通用"，
    只查一边就会让宗祠侧静默落回 `classic`。

    早先宗祠公页靠调用方自觉传 `spaceKind` 绕开了这个问题，所以一直没暴露；
    一旦有调用方**不传** `spaceKind`（商城详情页、未来的新版面），宗祠模板
    就会渲染成 2 柱 1 枋的常规厅堂 —— 不报错、不警告，只是"买的立体牌位寝堂
    看起来跟没装修一样"（AGENTS.md 记过同源的 `findTemplate` 误用真 bug）。

    兜底链与商城详情页完全一致：先纪念馆表，再宗祠表。
    两者 id 命名空间不重叠（`tpl-` vs `clan-tpl-`/`clan-kit-`），先后顺序无歧义。
  */
  const tpl = decor.templateId
    ? (findTemplate(decor.templateId) ?? findClanTemplate(decor.templateId))
    : undefined;
  const kind = spaceKind ?? tpl?.space ?? "classic";

  const items = useMemo(
    () => ({
      wall: decorItem("wall", decor),
      floor: decorItem("floor", decor),
      ornaments: resolveOrnamentItems(decor),
    }),
    [decor],
  );

  return (
    <div className={`relative ${className}`}>
      <Decor3DScene
        decor={decor}
        spaceKind={kind}
        items={items}
        height={height}
        interactive={interactive}
        engine={engine}
        layout={layout}
        editable={editable}
        onLayoutChange={onLayoutChange}
      >
        {children ?? <DefaultAltar />}
      </Decor3DScene>

      {showBadge && (
        <span
          data-space-badge={kind}
          className="absolute left-2 top-2 rounded bg-black/45 px-2 py-0.5 text-[10px] text-white/85 backdrop-blur"
        >
          {SPACE_LABEL[kind] ?? "常规厅堂"}
        </span>
      )}
    </div>
  );
}

/**
 * 缺省陈设：一块中性供案。
 *
 * 刻意**不**放遗像 —— 装修预览页（工坊、商城详情）不是馆页，
 * 那里渲染逝者照片既无必要也涉及隐私。公网馆页会自己传 children 覆盖。
 */
function DefaultAltar() {
  return (
    <div className="flex flex-col items-center" style={{ pointerEvents: "none" }}>
      {/* 供案：实体感靠三层叠加（案面 / 前沿 / 地面投影） */}
      <div
        style={{
          width: 96,
          height: 8,
          borderRadius: 3,
          background: "linear-gradient(180deg,#8a6a45,#5a3f28)",
          boxShadow: "0 10px 24px rgba(0,0,0,.45)",
        }}
      />
      <div
        style={{
          width: 78,
          height: 26,
          background: "linear-gradient(180deg,#6d5133,#3f2c1a)",
          borderRadius: "0 0 4px 4px",
          boxShadow: "inset 0 2px 0 rgba(255,255,255,.09)",
        }}
      />
      <div
        style={{
          width: 54,
          height: 4,
          marginTop: 2,
          borderRadius: 999,
          background: "rgba(0,0,0,.28)",
          filter: "blur(3px)",
        }}
      />
    </div>
  );
}

/** 空间形态的中文名（与 SpaceKind 一一对应，缺省回落"常规厅堂"） */
export const SPACE_LABEL: Record<string, string> = {
  classic: "常规厅堂",
  niche: "壁龛纪念墙",
  shrine: "祠堂寝堂",
  courtyard: "庭院天井",
  gate: "山门",
  hall: "享堂",
  pond: "莲池",
  starfield: "星河",
};
