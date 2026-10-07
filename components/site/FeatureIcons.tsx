import type { SVGProps } from "react";

/**
 * 首页五大板块的线性描边图标（内联 SVG，零外部图标库）。
 *
 * 统一画法：24×24 viewBox / stroke=currentColor / strokeWidth 1.5 / fill=none
 * / 圆头圆角。**不上色** —— 由外层容器的 `color` 决定（首页卡片用
 * `style={{ color: "var(--tone)" }}` 注入该板块的专属主色）。
 *
 * 所以这五个组件的 className / style 一律透传，方便外层套色与调尺寸。
 */
type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** 数字纪念馆 —— 碑 / 堂：牌位立于龛中，上有檐。 */
export function IconMemorial(props: IconProps) {
  return (
    <Base {...props}>
      {/* 屋檐 */}
      <path d="M3.5 7.5 12 3l8.5 4.5" />
      <path d="M5 7.5h14" />
      {/* 龛柱 */}
      <path d="M6.5 7.5v12M17.5 7.5v12" />
      {/* 牌位 */}
      <rect x="9.25" y="10" width="5.5" height="9.5" rx="1.2" />
      <path d="M11 12.6h2M11 15.1h2" />
      {/* 基座 */}
      <path d="M4.5 19.5h15" />
    </Base>
  );
}

/** 宗亲文化 —— 族 / 树：根系分叉，喻世系延续。 */
export function IconClan(props: IconProps) {
  return (
    <Base {...props}>
      {/* 主干 */}
      <path d="M12 20.5v-5" />
      {/* 分叉 */}
      <path d="M12 15.5 7.5 11M12 15.5 16.5 11" />
      <path d="M7.5 11V8.5M16.5 11V8.5" />
      {/* 三层枝叶 */}
      <path d="M12 11c0-2.2-1.4-3.6-3.2-3.6-1 0-1.8.4-2.3 1.1-.6-.9-1.6-1.5-2.8-1.5" />
      <path d="M12 11c0-2.9 1.9-4.9 4.2-4.9 1.3 0 2.4.6 3 1.5" />
      <path d="M12 7.6V4" />
      <circle cx="12" cy="3.2" r="1.2" />
    </Base>
  );
}

/** 云直播 —— 信号塔 + 电波。 */
export function IconLive(props: IconProps) {
  return (
    <Base {...props}>
      {/* 塔身 */}
      <path d="M10 20.5 12 9l2 11.5" />
      <path d="M10.9 15.5h2.2M10.5 18h3" />
      {/* 发射点 */}
      <circle cx="12" cy="6.6" r="1.5" />
      {/* 电波 */}
      <path d="M8.6 4.6a5 5 0 0 0 0 5.6" />
      <path d="M15.4 4.6a5 5 0 0 1 0 5.6" />
      <path d="M6.2 2.8a8.3 8.3 0 0 0 0 9.2" />
      <path d="M17.8 2.8a8.3 8.3 0 0 1 0 9.2" />
      {/* 底座 */}
      <path d="M7.5 20.5h9" />
    </Base>
  );
}

/** 新闻资讯 —— 卷 / 册：展开的卷轴。 */
export function IconNews(props: IconProps) {
  return (
    <Base {...props}>
      {/* 卷身 */}
      <path d="M6.5 4.5h11a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5H8" />
      <path d="M6.5 4.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 1-1.5 1.5" />
      {/* 文字行 */}
      <path d="M9 8.5h7M9 11.5h7M9 14.5h4.5" />
      {/* 卷轴下沿 */}
      <path d="M6.5 19.5H19" />
    </Base>
  );
}

/** 虚拟祭品 —— 香炉：三足鼎，双耳，香烟袅袅。 */
export function IconOffering(props: IconProps) {
  return (
    <Base {...props}>
      {/* 香烟 */}
      <path d="M12 2.5c-1.2 1.3-1.2 2.4 0 3.5s1.2 2.2 0 3.5" />
      {/* 双耳 */}
      <path d="M5.5 9.5v2a2 2 0 0 0 2 2M18.5 9.5v2a2 2 0 0 1-2 2" />
      {/* 炉身 */}
      <path d="M6.5 8h11a0 0 0 0 1 0 0c0 4-2.4 6.5-5.5 6.5S6.5 12 6.5 8Z" />
      {/* 三足 */}
      <path d="M9.2 14.4 8 18.5M14.8 14.4 16 18.5M12 14.5v4" />
      {/* 底座 */}
      <path d="M6.5 18.5h11" />
    </Base>
  );
}
