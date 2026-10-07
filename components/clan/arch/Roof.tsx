import * as React from "react";
import { DEF_ROOF, DEF_ROOF_DARK } from "./defs";
import { C_TILE } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 屋面 + 飞檐翘角
 *
 * 祠堂的第一识别特征。工笔的关键在于**举折**（屋面不是直线，而是上陡下缓的凹曲线）
 * 和**翘角**（檐口两端向上挑起，尖端有勾头滴水）。
 *
 * 画法要点（踩过的坑）：
 *  1. 瓦垄必须是**从屋脊向下发散的竖线（径向）**，不能画成同心弧 ——
 *     同心弧叠起来远看是一片灰网，完全读不出"瓦"。
 *  2. 屋面填色必须有厚度感：除了渐变，还要在檐口压一条**深色滴水带**，
 *     否则整片屋面会糊成一块浅灰。
 *
 * 四种形制：
 *  - hard   硬山：两坡顶，山墙与屋面齐平
 *  - gable  悬山：两坡顶，屋面挑出山墙
 *  - hip    庑殿：四坡顶，等级最高（御赐）
 *  - double 重檐：两层屋檐叠置
 *
 * viewBox 0 0 1200 420。
 */
export default function ClanRoof({
  form = "gable",
  color,
  size = "detail",
  palette,
  className,
  style,
}: ArchBaseProps & { form?: "hard" | "gable" | "hip" | "double" }) {
  const thumb = isThumb(size);
  const tile = palette?.roof ?? C_TILE;
  const body = color ?? `url(#${DEF_ROOF})`;
  const dark = `url(#${DEF_ROOF_DARK})`;

  /**
   * 径向瓦垄：从屋脊线（y=ridgeY）向檐口（y=eaveY）发散的竖线。
   * 屋面在水平方向自 x0 收到 x1，因此每根瓦垄从 ridgeX 走到 eaveX，
   * 天然呈放射状 —— 这才是"瓦"的观感。
   */
  const tiles = (
    ridgeY: number,
    ridgeX0: number,
    ridgeX1: number,
    eaveY: number,
    eaveX0: number,
    eaveX1: number,
    n: number,
  ) =>
    Array.from({ length: n }).map((_, i) => {
      const t = (i + 1) / (n + 1);
      const rx = ridgeX0 + (ridgeX1 - ridgeX0) * t;
      const ex = eaveX0 + (eaveX1 - eaveX0) * t;
      return (
        <path
          key={i}
          d={`M${rx} ${ridgeY} L${ex} ${eaveY}`}
          fill="none"
          stroke={tile.dark}
          strokeWidth={thumb ? 1.3 : 2}
          opacity={0.42}
        />
      );
    });

  /** 檐口的"滴水"圆点带：让檐边不至于是一条细线 */
  const dripBand = (y: number, x0: number, x1: number, n: number) =>
    Array.from({ length: n }).map((_, i) => {
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t;
      return <circle key={i} cx={Math.round(x)} cy={y} r={thumb ? 2.2 : 3.4} fill={tile.light} opacity={0.9} />;
    });

  /** 单侧翘角（飞檐）：从檐口向外上方挑起，像鸟翼 */
  const eave = (side: "l" | "r", y: number, outX: number, baseX: number, key?: string) => {
    const dir = side === "l" ? 1 : -1;
    const tipX = baseX + dir * outX;
    const tipY = y - 54;
    return (
      <g key={key ?? side}>
        {/* 翘角实体：上缘外挑、下缘回收，中间饱满 */}
        <path
          d={`M${baseX} ${y}
              C${baseX + dir * outX * 0.35} ${y - 16} ${tipX - dir * 26} ${tipY + 16} ${tipX} ${tipY}
              C${tipX - dir * 15} ${tipY + 20} ${baseX + dir * outX * 0.55} ${y + 16} ${baseX} ${y + 30} Z`}
          fill={tile.base}
          stroke={tile.dark}
          strokeWidth={thumb ? 1 : 1.5}
          strokeLinejoin="round"
        />
        {/* 翘角下缘的暗部 */}
        <path
          d={`M${baseX} ${y + 30} C${baseX + dir * outX * 0.55} ${y + 16} ${tipX - dir * 15} ${tipY + 20} ${tipX} ${tipY} L${tipX - dir * 8} ${tipY + 16} Z`}
          fill={tile.dark}
          opacity={0.5}
        />
        {/* 翘角上的瓦垄短线 */}
        <path
          d={`M${baseX + dir * outX * 0.32} ${y - 4} q${dir * outX * 0.22} -16 ${dir * outX * 0.4} -30`}
          fill="none"
          stroke={tile.light}
          strokeWidth={thumb ? 1 : 1.6}
          opacity={0.45}
        />
        {/* 勾头滴水：尖端一枚 */}
        <circle cx={tipX} cy={tipY + 1} r={thumb ? 3 : 4.6} fill={tile.light} opacity={0.95} stroke={tile.dark} strokeWidth="0.8" />
        <path
          d={`M${tipX - dir * 15} ${tipY + 12} q${dir * 8} -8 ${dir * 16} -3`}
          fill="none"
          stroke={tile.light}
          strokeWidth={thumb ? 1.2 : 1.8}
          opacity={0.75}
        />
      </g>
    );
  };

  /** 正脊（两端起翘）+ 脊饰 */
  const ridge = (y: number, apex: number, x0: number, x1: number) => (
    <>
      {/* 脊身（很粗的圆头线） */}
      <path
        d={`M${x0} ${y} Q600 ${apex} ${x1} ${y}`}
        fill="none"
        stroke={tile.dark}
        strokeWidth={thumb ? 9 : 15}
        strokeLinecap="round"
      />
      {/* 脊上高光 */}
      <path
        d={`M${x0 + 18} ${y - 4} Q600 ${apex - 5} ${x1 - 18} ${y - 4}`}
        fill="none"
        stroke={tile.light}
        strokeWidth={thumb ? 1.3 : 2.2}
        opacity={0.55}
      />
      {/* 脊刹（正中） */}
      <path
        d={`M588 ${apex + 4} q12 -28 24 0 q-12 -11 -24 0 Z`}
        fill={tile.light}
        stroke={tile.dark}
        strokeWidth="1"
      />
      {/* 两端鸱吻（缩略图省略） */}
      {!thumb && (
        <>
          <path d={`M${x0} ${y + 2} q-12 -24 7 -38 q13 13 7 35 Z`} fill={tile.light} opacity={0.92} stroke={tile.dark} strokeWidth="0.9" />
          <path d={`M${x1} ${y + 2} q12 -24 -7 -38 q-13 13 -7 35 Z`} fill={tile.light} opacity={0.92} stroke={tile.dark} strokeWidth="0.9" />
        </>
      )}
    </>
  );

  // ---------- 重檐：上下两层 ----------
  if (form === "double") {
    return (
      <svg viewBox="0 0 1200 420" className={className} style={style} role="img" aria-label="重檐屋面" preserveAspectRatio="xMidYMax meet">
        {/* ---- 下檐（更宽更缓） ---- */}
        <path d="M78 236 Q600 190 1122 236 L1180 316 Q600 262 20 316 Z" fill={dark} stroke={tile.dark} strokeWidth="1.2" />
        {tiles(240, 130, 1070, 312, 44, 1156, thumb ? 8 : 20)}
        {dripBand(318, 44, 1156, thumb ? 14 : 34)}
        {eave("l", 316, 62, 20, "lo")}
        {eave("r", 316, 62, 1180, "ro")}
        <rect x={20} y={316} width={1160} height={14} fill="rgba(0,0,0,0.3)" />

        {/* ---- 上檐（更陡更高） ---- */}
        <path d="M206 92 Q600 44 994 92 L1060 212 Q600 162 140 212 Z" fill={body} stroke={tile.dark} strokeWidth="1.6" />
        {tiles(100, 300, 900, 208, 152, 1048, thumb ? 6 : 15)}
        {dripBand(212, 152, 1048, thumb ? 10 : 24)}
        {eave("l", 212, 68, 140, "lu")}
        {eave("r", 212, 68, 1060, "ru")}
        <rect x={140} y={212} width={920} height={12} fill="rgba(0,0,0,0.26)" />
        {ridge(92, 44, 206, 994)}
      </svg>
    );
  }

  // ---------- 单檐：硬山 / 悬山 / 庑殿 ----------
  const isHip = form === "hip";
  return (
    <svg viewBox="0 0 1200 420" className={className} style={style} role="img" aria-label="屋面与飞檐" preserveAspectRatio="xMidYMax meet">
      {/* 屋面主体（举折凹曲线） */}
      <path
        d="M104 128 Q600 62 1096 128 L1176 296 Q600 236 24 296 Z"
        fill={body}
        stroke={tile.dark}
        strokeWidth={thumb ? 1.3 : 2}
      />

      {/* 径向瓦垄：从正脊发散到檐口 */}
      {tiles(134, 240, 960, 290, 52, 1148, thumb ? 9 : 22)}

      {/* 檐口滴水圆点带 */}
      {dripBand(294, 40, 1160, thumb ? 16 : 40)}

      {/* 庑殿：山面的垂脊（斜线） */}
      {isHip && (
        <>
          <path d="M104 128 L24 296" fill="none" stroke={tile.light} strokeWidth={thumb ? 2.5 : 4} opacity={0.5} />
          <path d="M1096 128 L1176 296" fill="none" stroke={tile.light} strokeWidth={thumb ? 2.5 : 4} opacity={0.5} />
        </>
      )}

      {/* 悬山/硬山：山墙封边 */}
      {!isHip && form === "hard" && (
        <>
          <path d="M104 128 L24 296 L24 320 L104 152 Z" fill={tile.dark} opacity={0.7} />
          <path d="M1096 128 L1176 296 L1176 320 L1096 152 Z" fill={tile.dark} opacity={0.7} />
        </>
      )}

      {/* 檐口飞翘 */}
      {eave("l", 296, 78, 24)}
      {eave("r", 296, 78, 1176)}

      {/* 正脊 */}
      {ridge(128, 62, 104, 1096)}

      {/* 檐下阴影带（把屋面与墙体分开，避免糊成一片） */}
      <rect x={24} y={296} width={1152} height={thumb ? 10 : 18} fill="rgba(0,0,0,0.32)" />
    </svg>
  );
}
