/**
 * 遗像龛 —— 3D 空间场景里安奉遗像的**统一规格**。
 *
 * ============================================================================
 * 为什么要有这个组件（用户反馈：「这两个地方为什么不一样？不统一呢？」）
 * ============================================================================
 *
 * 同一位逝者/先祖的遗像，在本站会出现在两条不同的渲染路径里：
 *
 *   ① **壁龛墙 / 牌位墙**（建馆赠品的默认归宿）
 *      `NicheWallHero` / `SceneShrine` —— 遗像占据墙面视觉中心的大龛，
 *      带描金外框与龛底背板，面积最大。
 *
 *   ② **付费 3D 空间**（用户花积分/钱买了立体模板）
 *      `DecorSpacePreview` 的 children —— 早先只是一张贴在场景上的
 *      120×150 / 128×160 小图，**没有任何龛体**。
 *
 * 后果是：用户**花钱升级**之后，遗像的待遇反而**变差**了 ——
 * 从"安奉在墙面正中"退化成"浮在空气里的一张小照片"。
 * 这与"付费升级应当改善观感"的常识相反，也正是两处观感不统一的根源。
 *
 * 所以统一口径为：**不论走哪条路径，遗像都由"龛 + 像"两部分构成，**
 * 且尺寸、描金边框、投影、下方名讳签的规格完全一致。
 *
 * ============================================================================
 * 规格为什么是这两个数字
 * ============================================================================
 *
 * 3D 场景的透视容器高度是 320–340px（见两个公页的调用），
 * 减去龛框与名讳签的占位，遗像本体取 **150×188**（≈ 4:5，接近证件照/遗照常用比例）
 * 能让面部在 1280 宽的页面上清晰可辨，同时不撑破场景。
 *
 * 尺寸写成常量导出而不是散落两处字面量 —— 这正是 AGENTS.md 记的
 * "遗像 `<img>` 与 SVG 龛位必须共用同一份数字"那条约束的延伸：
 * 两处各自漂移，遗像就会与画出来的龛框错位。
 */

/** 遗像本体尺寸（px）。两条路径共用，勿在调用处另写数字。 */
export const PORTRAIT_W = 150;
export const PORTRAIT_H = 188;

export default function PortraitNiche({
  src,
  alt,
  /** 名讳签文案（如「先祖 张老先生」）。不传则不渲染签。 */
  caption,
  /** 描金/素银边框色，默认暖金，与壁龛墙一致 */
  frameColor = "rgba(255,246,224,.72)",
  className,
}: {
  src: string;
  alt: string;
  caption?: string;
  frameColor?: string;
  className?: string;
}) {
  return (
    <div
      data-portrait-niche="1"
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      {/*
        龛体：三层叠加做出"嵌进去"的感觉 ——
        外层描金框 → 内层暗色内衬（模拟龛内进深）→ 遗像本体。
        纯 CSS，零外部素材（隧道稳定性要求，见 lib/decor-3d.ts 文件头）。
      */}
      <div
        style={{
          padding: 7,
          borderRadius: 6,
          background:
            "linear-gradient(160deg, rgba(255,238,196,.30), rgba(120,92,48,.30))",
          border: `1px solid ${frameColor}`,
          boxShadow:
            "0 18px 42px rgba(0,0,0,.52), inset 0 0 0 1px rgba(0,0,0,.35)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          style={{
            width: PORTRAIT_W,
            height: PORTRAIT_H,
            objectFit: "cover",
            display: "block",
            borderRadius: 3,
            // 描金边框由外层龛体提供；img 自身不再描边（防双描边，见 AGENTS.md）
            boxShadow: "inset 0 0 24px rgba(0,0,0,.42)",
          }}
        />
      </div>

      {caption && (
        <span
          style={{
            borderRadius: 4,
            padding: "2px 10px",
            fontSize: 12,
            letterSpacing: ".08em",
            color: "rgba(255,252,244,.94)",
            background: "rgba(24,18,12,.58)",
            border: "1px solid rgba(255,246,224,.22)",
          }}
        >
          {caption}
        </span>
      )}
    </div>
  );
}
