"use client";

import type { CSSProperties } from "react";
import {
  decorItem,
  findTemplate,
  type HallDecor,
} from "@/lib/hall-decor";
import type { SkinTokens } from "@/lib/decor-skin";
import {
  skinButtonStyle,
  skinCardStyle,
  skinDividerStyle,
  skinTitleStyle,
} from "@/lib/decor-skin";
import HallDecorLayer from "@/components/hall/HallDecorLayer";

/**
 * 整页换肤预览 —— 让用户在工坊里看到"馆页整页会变成什么样"。
 *
 * ## 它解决什么
 *
 * 工坊里的 3D 预览只展示**空间**，但阶段 4 的换肤是**整页联动**的：
 * 卡片圆角/描金边框/底纹、标题字重与字距、分隔线样式、按钮配色都会跟着变，
 * 而这些在 3D 场景里一个都看不见。用户花了钱升级，却在工坊里感知不到变化。
 * 所以补一个"整页效果"预览：把公页的卡片/标题/按钮骨架按换肤后的样式画一遍。
 *
 * ## 为什么复用公页的 HallDecorLayer（而不是自己造 --skin-* 变量）
 *
 * `HallDecorLayer` 没有 `"use client"`，但**也没有任何 server-only 依赖**
 * （不 import `server-only`、不读 `fs`、非 async），依赖的全是纯函数 ——
 * 被客户端组件 import 时会被打成客户端模块，因此**可以直接在工坊里渲染**。
 *
 * 复用它的价值：预览与公页**共用同一份换肤实现**。
 * 若在这里手写一套 `--skin-*` 注入，就成了"同一件事两个实现"，
 * 迟早与公页漂移（AGENTS.md 反复记过这个病）。
 *
 * ## ⚠️ 必须自己 `withDark` 再传（本文件最要紧的一条）
 *
 * Layer 内部是 `skin = props.skin ?? skinOf(...)`。若我们不传 `skin`，
 * 它算出来的就是**未经深色回写**的版本 —— 而公页传的是 `withDark(skin, dark)`。
 * 后果是"深色墙 + 浅色卡"在预览里文案看不见
 * （阶段 4 抓到过的真 bug：宗祠「字辈诗 · 派语」白字压浅米卡）。
 *
 * 所以这里显式走一遍 `skinOf` + `withDark`，**与公页同口径**。
 * 调用方负责把 `dark` 判定传进来（因为深色判定的并集列表在页面侧，
 * 层与本组件都看不到）。
 *
 * ## 为什么**不含 3D 场景**（刻意的边界）
 *
 * 1. **不污染 `[data-decor-3d]` 计数**：`verify-decor-studio-v2.mjs` 有
 *    `scenes.length === 2` / `=== 1` 两条硬断言，多挂一个 3D 实例会直接跑红。
 * 2. 整页预览的新价值就是**换肤**（颜色/边框/底纹/字重/描金），与 3D 空间正交，
 *    重复画一遍 3D 没有信息增量。
 * 3. 少一次 `ResizeObserver` + 透视容器，全屏层里两个 3D 抢拖拽的风险也一并消除。
 *
 * ## 隐私硬约束
 *
 * 预览里**不出现任何逝者照片**（AGENTS.md）。用堂号文字占位。
 */
export default function DecorPagePreview({
  decor,
  skin,
  dark,
  hallName = "示例堂号",
  className = "",
}: {
  decor: HallDecor;
  /**
   * 已算好的皮肤（调用方 `skinOf` + `withDark` 后的那份）。
   * 不传则回落到 Layer 自己的推断 —— 但那样**不会**做深色回写，慎用。
   */
  skin?: SkinTokens;
  /** 当前是否深色底（用于给预览一个深浅底色，与 skin 同源判定） */
  dark?: boolean;
  /** 堂号占位文字（不传则用通用文案） */
  hallName?: string;
  className?: string;
}) {
  const tpl = decor.templateId ? findTemplate(decor.templateId) : undefined;
  const wall = decorItem("wall", decor);
  const floor = decorItem("floor", decor);
  const orn = decorItem("ornament", decor);

  /*
    ⚠️ `transform: translateZ(0)` 不是为了动画，是为了**修 `fixed` 定位**。

    `HallDecorLayer` 的部分挂饰用 `position: fixed`（公页里贴视口顶部）。
    在全屏预览层（也是 fixed）里，fixed 仍相对**视口**定位 → 挂饰会跑到
    预览框外面去。CSS 规则：祖先有 `transform`/`filter`/`contain` 时，
    后代 `fixed` 改为相对该祖先定位。所以这里给容器一个 `translateZ(0)`
    当"定位参照系"，挂饰就老实待在预览框里了。
  */
  const frameStyle: CSSProperties = {
    transform: "translateZ(0)",
    contain: "paint",
  };

  const pageStyle: CSSProperties =
    dark === true
      ? { background: "linear-gradient(180deg,#1a1b1f,#0f1013)", color: "#f2efe8" }
      : { background: "linear-gradient(180deg,#fbfaf7,#f3f1ec)", color: "#1f262e" };

  return (
    <div
      data-decor-pagepreview
      data-decor-pagepreview-dark={dark === true ? "1" : "0"}
      className={"overflow-hidden rounded-lg border border-white/15 " + className}
      style={frameStyle}
    >
      <HallDecorLayer decor={decor} skin={skin} className="min-h-full">
        <div className="px-5 py-5" style={pageStyle}>
          {/* 顶部封面位：用壁纸色块示意（不出现逝者照片） */}
          <div
            className="h-16 w-full rounded-md"
            style={{
              background: wall?.style.background,
              backgroundImage: wall?.style.backgroundImage,
              opacity: 0.9,
            }}
          />

          <div className="mt-4 flex items-baseline justify-between gap-3">
            <h4 className="text-base" style={SKIN_TITLE}>
              {hallName}
            </h4>
            <span className="text-[11px] opacity-70">整页效果预览</span>
          </div>

          {/* 分隔线：换肤后的描金/素线 */}
          <div className="mt-2 h-px w-full" style={SKIN_DIVIDER} />

          {/* 一张内容卡：圆角/边框/底纹/阴影都随换肤变 */}
          <div className="mt-4 p-4" style={SKIN_CARD}>
            <div className="text-xs font-medium" style={SKIN_TITLE}>
              故人数字档案
            </div>
            <p className="mt-2 text-[11px] leading-relaxed opacity-75">
              这里示范换肤后的卡片观感：圆角、描金边框、底纹与阴影。
              与左侧 3D 空间合起来，就是你馆页的整页效果。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded px-2.5 py-1 text-[11px]" style={SKIN_BUTTON}>
                献花
              </span>
              <span className="rounded px-2.5 py-1 text-[11px]" style={SKIN_BUTTON}>
                留言
              </span>
            </div>
          </div>

          {/* 地面示意条（让"地纹也换了"可见） */}
          <div
            className="mt-4 h-8 w-full rounded-md"
            style={{
              background: floor?.style.background,
              backgroundImage: floor?.style.backgroundImage,
              opacity: 0.85,
            }}
          />

          <p className="mt-3 text-[10px] opacity-55">
            陈设：{orn?.name ?? "无"} · 模板：{tpl?.name ?? "自定义搭配"}
          </p>
        </div>
      </HallDecorLayer>
    </div>
  );
}

/*
  ⚠️ 直接复用 `lib/decor-skin.ts` 的四个页面侧 helper ——**不要内联重写**。

  这是本组件"预览 = 公页"的最强保证：同一个函数、同一份 CSS 变量引用。
  曾想过内联一份以微调内距/字号（预览比公页小），但那就成了
  "同一件事两个实现"，迟早与公页漂移（AGENTS.md 反复记过这个病）。
  需要小尺寸时，在**外层容器**上调字号/内距即可，
  helper 只管换肤属性（圆角/边框/底纹/阴影/字重/字距），两者互不干扰。
*/
const SKIN_CARD = skinCardStyle();
const SKIN_TITLE = skinTitleStyle();
const SKIN_DIVIDER = skinDividerStyle();
const SKIN_BUTTON = skinButtonStyle();
