"use client";

import { encodeQr } from "@/lib/qrcode";

/**
 * 纯 SSR 安全的二维码渲染（不依赖 window / canvas）。
 *
 * 自绘 SVG 而非引第三方库的原因（写死在这里，免得后人"顺手换成 qrcode.react"）：
 *   1. 内测隧道抖动 + 「零外部资源」原则 —— 每多一个依赖就多一处水合/体积风险；
 *   2. 编码器 lib/qrcode.ts 已用独立解码器（jsQR）做过往返验证，可信；
 *   3. SVG 天然可断言（验收脚本能数矩形），canvas 不能。
 *
 * ⚠️ 本组件是**纯函数式渲染**：同一 input 必产出同一 SVG，
 *    所以服务端渲染与客户端水合结果一致，不会有 mismatch。
 */
export function QrCode({
  value,
  size = 200,
  margin = 4,
  label,
}: {
  value: string;
  size?: number;
  margin?: number;
  label?: string;
}) {
  const matrix = encodeQr(value);
  const modules = matrix.length;
  const total = modules + margin * 2;

  // 用 0..total 的整数坐标系，再靠 viewBox 缩放 —— 避免小数误差导致边缘锯齿。
  const rects: string[] = [];
  for (let r = 0; r < modules; r++) {
    let c = 0;
    while (c < modules) {
      if (!matrix[r][c]) {
        c++;
        continue;
      }
      // 横向合并连续暗块，减少 DOM 节点数（QR 里成片黑块很多）
      let run = 1;
      while (c + run < modules && matrix[r][c + run]) run++;
      rects.push(`M${c + margin},${r + margin}h${run}v1h-${run}z`);
      c += run;
    }
  }

  return (
    <svg
      role="img"
      aria-label={label ?? "分享二维码"}
      data-qr-value={value}
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      className="block"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={rects.join("")} fill="#111111" />
    </svg>
  );
}
