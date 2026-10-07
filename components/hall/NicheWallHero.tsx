import * as React from "react";
import type { CSSProperties } from "react";
import NicheWallScene, {
  nicheBlock,
  NICHE_PORTRAIT_BLOCK,
  NICHE_PORTRAIT_BLOCK_SLOT,
  NICHE_VIEWBOX,
  type AltarGlyph,
} from "./NicheWallScene";

/**
 * 壁龛纪念墙 Hero —— 场景 + 遗像叠加。
 *
 * 这是「一份数据驱动两处」的落地点：
 *   - `NicheWallScene` 用 `NICHE_GRID` 的百分比几何在 SVG 里画 45 个壁龛格；
 *   - 这里用**同一个** `nicheCell()` 把遗像 `<img>` 绝对定位到同一个格。
 *   两者共用一份几何，所以窗口怎么缩放都不会错位。
 *
 * 遗像为什么不用背景图或 SVG `<image>` 画：
 *   - 遗像是业务数据（可能为空），必须是真实 `<img>` 才能让浏览器按需加载、
 *     走原有的上传/鉴权链路，也才能被脚本断言；
 *   - 用 HTML 叠加还能直接复用纪念馆既有的 `decorStyle("frame")` 相框样式。
 */

export default function NicheWallHero({
  portrait,
  deceasedName,
  /** 馆主是否登录 —— 未上传遗像时只给馆主看引导，访客看到的是空白壁龛 */
  isOwner = false,
  manageHref,
  frameStyle,
  className = "",
  altarItems,
}: {
  portrait?: string;
  deceasedName?: string;
  isOwner?: boolean;
  manageHref?: string;
  /** 相框样式（来自 frame 槽位），套在遗像上 */
  frameStyle?: CSSProperties;
  className?: string;
  /** 供台陈列：透传给 NicheWallScene，摆在柜面上 */
  altarItems?: AltarGlyph[];
}) {
  /*
    遗像占 **3×3 = 9 个壁龛格** 的面积（见 NICHE_PORTRAIT_BLOCK）。
    只占 1 格时约 56×40px，人脸根本看不清；9 格后约 237×173px，是能辨认的尺寸。
    内缩 0.06：四面各让出一点木格，读成"嵌进格墙里"而不是"贴了张纸盖住格子"。
  */
  const cell = nicheBlock(
    NICHE_PORTRAIT_BLOCK_SLOT.col,
    NICHE_PORTRAIT_BLOCK_SLOT.row,
    NICHE_PORTRAIT_BLOCK.cols,
    NICHE_PORTRAIT_BLOCK.rows,
    0.06,
  );

  /*
    对齐的关键（勿改）：
    场景 SVG 用 preserveAspectRatio="meet"，在非 1200:700 的容器里会**上下或左右留白**。
    如果遗像直接按容器的百分比定位，一旦出现留白就会与画出来的壁龛格错位。

    解法：把「SVG + 遗像」一起放进一个**保持 1200:700 比例**的内层盒子
    （`BOX`），由外层的限高容器负责 letterbox 这个盒子。
    这样内层盒子的坐标系与 SVG 的 viewBox **严格同构**，
    百分比定位就永远与画出来的格子对齐 —— 与外面怎么缩放无关。
  */
  const RATIO = `${NICHE_VIEWBOX.w} / ${NICHE_VIEWBOX.h}`;

  return (
    <section className={`relative ${className}`}>
      {/* 外层：限高，负责把内层等比盒子居中留白 */}
      <div
        className="relative flex w-full items-center justify-center"
        style={{ height: "min(42vw, 420px)", minHeight: "180px" }}
      >
        {/* 内层：严格 1200:700，SVG 与遗像共享同一坐标系 */}
        <div
          className="relative"
          style={{
            aspectRatio: RATIO,
            /* 取宽高中更受限的一边，保证盒子完整放进外层 */
            height: "100%",
            maxWidth: "100%",
          }}
        >
          <NicheWallScene
            style={{ position: "absolute", inset: 0 }}
            altarItems={altarItems}
            portrait={portrait}
          />

          {portrait ? (
            /*
              遗像：绝对定位到壁龛格。
              外层留出格子的位置，内层再套相框 —— 相框的 border 往内画
              （box-sizing: border-box），因此不会把图撑出格子。
            */
            <div
              className="absolute"
              style={{
                left: cell.left,
                top: cell.top,
                width: cell.width,
                height: cell.height,
              }}
            >
              <div
                className="h-full w-full overflow-hidden border-solid"
                style={{
                  boxSizing: "border-box",
                  ...frameStyle,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={portrait}
                  alt={deceasedName ? `${deceasedName}遗像` : "逝者遗像"}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          ) : (
            /*
              未上传遗像：**该格保持空白**（与其它空格一致），绝不画破图。
              仅馆主看到一行引导。
            */
            isOwner &&
            manageHref && (
              <a
                href={manageHref}
                className="absolute flex items-center justify-center rounded-sm border border-dashed border-white/70 bg-black/35 text-center text-[10px] leading-tight text-white no-underline hover:bg-black/50"
                style={{
                  left: cell.left,
                  top: cell.top,
                  width: cell.width,
                  height: cell.height,
                }}
              >
                上传
                <br />
                遗像
              </a>
            )
          )}
        </div>
      </div>

      {/* 场景说明（低调） */}
      <p className="mt-2 text-center text-[11px] text-brand-400">
        壁龛纪念堂 · 遗像安奉于墙面正中
      </p>
    </section>
  );
}
