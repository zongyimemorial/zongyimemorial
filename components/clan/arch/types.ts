import type { ArchPalette } from "./palette";

/**
 * 宗祠建筑构件（arch）统一接口
 *
 * 所有构件组件都接受 ArchBaseProps，这样它们可以在两处复用：
 *   1. 公网宗祠详情页（size="detail"，全尺寸，含动画）
 *   2. 装修工坊素材缩略图（size="thumb"，降细节、去动画，40+ 张不卡）
 *
 * 旧数据兼容：宗祠挂饰素材在数据库中只存了一个 color（如 clan-orn-lion
 * 的 spec.color），因此每个构件都必须能在「只给 color、不给 palette」时正常渲染。
 */

/** 渲染档位 */
export type ArchSize = "detail" | "thumb" | "compact";

export type ArchBaseProps = {
  /** 主色。继承自挂饰素材的 color；缺省时回退到 palette 对应槽位 */
  color?: string;
  /** 主题板。来自墙面素材的 arch.palette；缺省用 DEFAULT_PALETTE */
  palette?: ArchPalette;
  /** 渲染档位：thumb 会减少叠瓦/门钉层数并关闭动画 */
  size?: ArchSize;
  className?: string;
  /** 覆盖默认 viewBox 高度（用于需要更扁/更高的场景） */
  style?: React.CSSProperties;
};

/** 是否处于缩略图档（用于降低细节与关闭动画） */
export function isThumb(size: ArchSize | undefined) {
  return size === "thumb" || size === "compact";
}

/**
 * 生成组件内唯一的 SVG defs id。
 * 避免同一页面多个构件实例的 <linearGradient id> 互相覆盖
 * （SVG id 是全局作用域，重复 id 会让后定义者生效）。
 */
let _seq = 0;
export function archId(prefix: string) {
  _seq = (_seq + 1) % 100000;
  return `carch-${prefix}-${_seq.toString(36)}`;
}
