import * as React from "react";
import { C_GRANITE } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 石狮镇门（一对）
 *
 * 真实祠堂门前的石狮是**坐姿**：前腿伸直撑地、后腿蹲坐、昂首挺胸、
 * 鬃毛（螺髻）成团、前爪踩绣球。底座是须弥座（上枋 / 束腰 / 下枋），
 * 束腰内收、上下外挑，座上刻回纹。
 *
 * 画法要点（踩过的坑）：
 *  1. 头不能画成圆 —— 用**方斗形（额窄、腮宽、下颌方）**才有狮相，圆弧会读成宠物犬。
 *  2. 鬃毛必须成**成团的螺髻**（密集小圆，两三层），这是狮子最强识别特征。
 *  3. 眼睛要**斜吊**（外眼角上挑），配宽鼻、张口獠牙，才有威。
 *  4. 各部件必须共用同一套坐标基准：**臀线在 y=196（坐在座上）**、
 *     **头中心在 (150,72)**、**前腿在 x≈108 落地**。坐标一乱，部件就会彼此脱开。
 *
 * 单只占 300×280（x∈[10,290]，y∈[0,272]），两只并排 viewBox 0 0 600 280。
 * 石色用**青石（C_GRANITE）**而非汉白玉 —— 汉白玉与宣纸底几乎同色，狮子会溶进背景。
 */
export default function ClanStoneLion({
  color,
  size = "detail",
  className,
  style,
  count = 2,
}: ArchBaseProps & { count?: number }) {
  const thumb = isThumb(size);
  const stone = color ?? C_GRANITE.base;
  const lite = C_GRANITE.light;
  const line = C_GRANITE.dark;

  // ---- 单只石狮的统一基准（所有部件都引用这些常量，改一处即可整体挪动）----
  const SEAT = 196; // 臀部/爪底所在的水平线（坐在须弥座上枋顶面）
  const HEAD_X = 150;
  const HEAD_Y = 74;

  /** 螺髻：两层密集小圆，绕头后成"团" */
  const curls = (n: number) => (
    <>
      {Array.from({ length: n }).map((_, i) => {
        const a = Math.PI * 1.68 - (i / (n - 1)) * Math.PI * 1.0;
        return (
          <circle
            key={i}
            cx={Number((HEAD_X - 6 + Math.cos(a) * 40).toFixed(1))}
            cy={Number((HEAD_Y - 4 + Math.sin(a) * 38).toFixed(1))}
            r={thumb ? 6 : 7.4}
            fill={stone}
            stroke={line}
            strokeWidth="1.1"
          />
        );
      })}
      {!thumb &&
        Array.from({ length: Math.max(2, n - 3) }).map((_, i) => {
          const a = Math.PI * 1.6 - (i / Math.max(1, n - 4)) * Math.PI * 0.86;
          return (
            <circle
              key={`i${i}`}
              cx={Number((HEAD_X - 8 + Math.cos(a) * 22).toFixed(1))}
              cy={Number((HEAD_Y - 2 + Math.sin(a) * 21).toFixed(1))}
              r={6.4}
              fill={stone}
              stroke={line}
              strokeWidth="1.1"
            />
          );
        })}
    </>
  );

  /** 单只石狮（头朝右），座 + 坐姿 + 昂首 */
  const lion = (
    <g>
      {/* ================= 须弥座 ================= */}
      {/* 下枋（最外挑） */}
      <rect x={14} y={238} width={272} height={32} rx={3} fill={lite} stroke={line} strokeWidth="1.8" />
      {/* 圭角（下枋底脚） */}
      {!thumb && <rect x={30} y={268} width={240} height={7} fill={line} opacity={0.26} />}
      {/* 束腰（内收，明显比上下枋窄） */}
      <rect x={38} y={214} width={224} height={24} fill={line} opacity={0.4} />
      {/* 上枋（外挑，狮子站在其顶面 SEAT） */}
      <rect x={22} y={SEAT} width={256} height={20} rx={2} fill={lite} stroke={line} strokeWidth="1.6" />
      {/* 束腰上的回纹 */}
      {!thumb && (
        <path
          d="M50 230 h14 v-9 h-7 v5 h-3 M96 230 h14 v-9 h-7 v5 h-3 M142 230 h14 v-9 h-7 v5 h-3 M188 230 h14 v-9 h-7 v5 h-3 M234 230 h14 v-9 h-7 v5 h-3"
          fill="none"
          stroke={lite}
          strokeWidth="1.5"
          opacity={0.95}
        />
      )}

      {/* ================= 后腿蹲坐（臀 → 足，一整块） ================= */}
      {/* 臀部大块面：右缘外凸到 x≈248，上缘到 y≈118（与背部衔接） */}
      <path
        d={`M206 ${SEAT} Q250 ${SEAT} 252 152 Q252 122 226 118 Q200 116 190 140 L186 ${SEAT} Z`}
        fill={stone}
        stroke={line}
        strokeWidth="1.6"
      />
      {/* 后足（露出在座前，脚趾） */}
      <path d={`M212 ${SEAT} q26 -3 34 8 q-20 8 -36 2 Z`} fill={stone} stroke={line} strokeWidth="1.2" />

      {/* ================= 前腿伸直撑地 ================= */}
      <path d={`M100 ${SEAT} L96 128 Q98 112 112 110 L126 112 Q134 118 132 132 L128 ${SEAT} Z`} fill={stone} stroke={line} strokeWidth="1.6" />
      {/* 前爪踩绣球 */}
      <ellipse cx={112} cy={SEAT - 4} rx={20} ry={11} fill={stone} stroke={line} strokeWidth="1.3" />
      {!thumb && (
        <>
          <circle cx={112} cy={SEAT - 12} r={12} fill="none" stroke={line} strokeWidth="1.4" opacity={0.8} />
          <path d={`M104 ${SEAT - 12} q8 -8 16 0 M104 ${SEAT - 5} q8 7 16 0`} fill="none" stroke={line} strokeWidth="1" opacity={0.65} />
        </>
      )}

      {/* ================= 身躯（挺胸 · 收腰 · 与臀衔接） ================= */}
      <path
        d={`M100 ${SEAT - 34}
            Q92 ${SEAT - 66} 106 96
            L156 86
            Q186 92 190 120
            Q192 148 186 ${SEAT - 24}
            L128 ${SEAT - 18}
            Q102 ${SEAT - 16} 100 ${SEAT - 34} Z`}
        fill={stone}
        stroke={line}
        strokeWidth="1.6"
      />
      {/* 腰线内收（左侧凹进去，坐狮标志性剪影） */}
      <path d={`M100 ${SEAT - 40} Q112 ${SEAT - 70} 110 100`} fill="none" stroke={line} strokeWidth="1.3" opacity="0.45" />
      {/* 身躯右下暗部 */}
      <path d={`M158 88 q26 16 26 62 q0 30 -20 42 q22 -18 20 -50 q-2 -38 -26 -54 Z`} fill={line} opacity="0.3" />
      {/* 胸肌分界 */}
      {!thumb && <path d={`M134 100 q5 30 -2 56`} fill="none" stroke={line} strokeWidth="1.1" opacity="0.42" />}

      {/* ================= 鬃毛螺髻（垫在头后） ================= */}
      {curls(thumb ? 6 : 10)}

      {/* ================= 头（方斗形：额窄 · 腮宽 · 下颌方） ================= */}
      <path
        d={`M${HEAD_X - 30} ${HEAD_Y - 30}
            L${HEAD_X + 4} ${HEAD_Y - 34}
            L${HEAD_X + 22} ${HEAD_Y - 18}
            L${HEAD_X + 26} ${HEAD_Y + 12}
            L${HEAD_X + 14} ${HEAD_Y + 36}
            L${HEAD_X - 16} ${HEAD_Y + 38}
            L${HEAD_X - 34} ${HEAD_Y + 16}
            L${HEAD_X - 36} ${HEAD_Y - 12} Z`}
        fill={stone}
        stroke={line}
        strokeWidth="1.8"
      />
      {/* 额上覆毛（压低额头） */}
      <path d={`M${HEAD_X - 30} ${HEAD_Y - 28} q16 -9 34 -6 q16 3 22 14 q-28 -10 -56 -8 Z`} fill={line} opacity="0.32" />
      {/* 方腮（下颌宽而方 → 狮相） */}
      <path d={`M${HEAD_X - 34} ${HEAD_Y + 12} q26 10 58 4 q-8 16 -26 20 q-24 5 -32 -9 Z`} fill={stone} stroke={line} strokeWidth="1.3" />

      {/* 眉弓：粗、外眼角上挑 */}
      <path d={`M${HEAD_X - 18} ${HEAD_Y - 12} q22 -10 38 3`} fill="none" stroke={line} strokeWidth={thumb ? 2.2 : 3.4} strokeLinecap="round" />
      {/* 眼：杏核形，外角上挑 */}
      <path d={`M${HEAD_X - 14} ${HEAD_Y - 1} q15 -6 25 2 q-13 6 -25 -2 Z`} fill={line} />
      {!thumb && <circle cx={HEAD_X - 6} cy={HEAD_Y - 3} r={1.9} fill={lite} opacity="0.95" />}

      {/* 宽鼻（扁而阔） */}
      <path d={`M${HEAD_X + 2} ${HEAD_Y + 9} q16 -2 20 7 q-5 9 -18 8 q-13 -1 -14 -8 q1 -6 12 -7 Z`} fill={line} opacity="0.88" />
      {!thumb && <path d={`M${HEAD_X + 9} ${HEAD_Y + 19} q2 6 0 10`} fill="none" stroke={line} strokeWidth="1.6" />}

      {/* 口：张口露齿 + 绶带 */}
      <path d={`M${HEAD_X - 6} ${HEAD_Y + 29} q16 8 30 2 q-10 12 -26 8 q-7 -4 -4 -10 Z`} fill={line} opacity="0.82" />
      {!thumb && (
        <>
          <path
            d={`M${HEAD_X - 2} ${HEAD_Y + 32} l3 7 M${HEAD_X + 5} ${HEAD_Y + 34} l1 7 M${HEAD_X + 21} ${HEAD_Y + 32} l-3 6`}
            fill="none"
            stroke={lite}
            strokeWidth="1.4"
          />
          <path
            d={`M${HEAD_X + 22} ${HEAD_Y + 33} q13 12 9 29 q-3 10 -10 13 M${HEAD_X + 29} ${HEAD_Y + 35} q15 10 13 27`}
            fill="none"
            stroke={line}
            strokeWidth="1.5"
            opacity="0.75"
          />
        </>
      )}

      {/* 耳（后贴的小尖耳） */}
      <path d={`M${HEAD_X - 26} ${HEAD_Y - 36} q-7 -15 8 -17 q11 -1 9 13 Z`} fill={stone} stroke={line} strokeWidth="1.3" />
    </g>
  );

  /*
    单只狮子占 x∈[10,290]（宽 280）。双狮画幅 600 宽，因此：
      · 左狮：先水平翻转（得到 x∈[-290,-10]），再整体右移 300 → x∈[10,290]
      · 右狮：直接右移 310 → x∈[320,600]
    两者以 x=300 为轴对望，各占一半画幅。
    （先前写成 translate(-300,0) 会把左狮推到 x∈[-590,-310]，整个飞出画布）
  */
  const PAIR = (
    <>
      <g transform="translate(300,0) scale(-1,1)">{lion}</g>
      <g transform="translate(310,0)">{lion}</g>
    </>
  );

  return (
    <svg
      viewBox="0 0 600 280"
      className={className}
      style={style}
      role="img"
      aria-label="石狮镇门"
      preserveAspectRatio="xMidYMax meet"
    >
      {count >= 2 ? PAIR : <g transform="translate(150 0)">{lion}</g>}
    </svg>
  );
}
