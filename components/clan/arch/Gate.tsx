import * as React from "react";
import { DEF_BRICK_PATTERN, DEF_GOLD, DEF_WALL } from "./defs";
import { C_BRICK, C_GOLD, C_MARBLE, C_TILE } from "./palette";
import { isThumb, type ArchBaseProps } from "./types";

/**
 * 门楼 / 牌坊 / 门洞
 *
 * 三种形制：
 *  - arch    门洞：墙上开圆券门（小祠、侧门）
 *  - post    门楼：独立门屋 —— 屋面 + 斗拱带 + 墙身 + 木门 + 门枕石 + 台基
 *  - paifang 牌坊：四柱三间，冲天式（御赐 / 显赫宗祠）
 *
 * 画法要点（踩过的坑）：
 *  门楼最容易画成"灰方块戴帽子"。根因是**屋面只画了檐口、没画完整的举折屋面**，
 *  且墙身是一整块平色。修正：
 *   1. 屋面用与 ClanRoof 同构的画法（檐口外挑 + 径向瓦垄 + 正脊 + 翘角），
 *      并让**屋面下沿压在墙身上沿之上**（y 重叠 12px），才"坐得住"。
 *   2. 墙身分四段：墙裙(石) / 墙身(青砖) / 墙檐阴影 / 门额带，避免一块平色。
 *
 * viewBox 0 0 1200 520：正立面。
 */
export default function ClanGate({
  form = "post",
  color,
  size = "detail",
  palette,
  className,
  style,
}: ArchBaseProps & { form?: "arch" | "post" | "paifang" }) {
  const thumb = isThumb(size);
  const brick = palette?.wall ?? C_BRICK;
  const tile = palette?.roof ?? C_TILE;
  const wallFill = color ?? `url(#${DEF_WALL})`;
  const line = `url(#${DEF_BRICK_PATTERN})`;
  const gold = palette?.gold?.base ?? C_GOLD.base;
  const GOLD_FILL = `url(#${DEF_GOLD})`;

  /** 屋面（与 ClanRoof gable 同构）：ridgeY→eaveY 铺径向瓦垄 */
  const roof = (
    ridgeY: number,
    ridgeX0: number,
    ridgeX1: number,
    eaveY: number,
    eaveX0: number,
    eaveX1: number,
    apexY: number,
  ) => (
    <g>
      {/* 屋面实体 */}
      <path
        d={`M${ridgeX0} ${ridgeY} Q600 ${apexY} ${ridgeX1} ${ridgeY} L${eaveX1} ${eaveY} Q600 ${eaveY - 50} ${eaveX0} ${eaveY} Z`}
        fill={`url(#clan-arch-roof-dark)`}
        stroke={tile.dark}
        strokeWidth={thumb ? 1.2 : 1.8}
      />
      {/* 径向瓦垄 */}
      {Array.from({ length: thumb ? 9 : 22 }).map((_, i) => {
        const t = (i + 1) / (thumb ? 10 : 23);
        const rx = ridgeX0 + (ridgeX1 - ridgeX0) * t;
        const ex = eaveX0 + (eaveX1 - eaveX0) * t;
        return (
          <path
            key={i}
            d={`M${rx} ${ridgeY} L${ex} ${eaveY}`}
            fill="none"
            stroke={C_TILE.dark}
            strokeWidth={thumb ? 1.2 : 1.8}
            opacity={0.42}
          />
        );
      })}
      {/* 檐口滴水点 */}
      {Array.from({ length: thumb ? 12 : 30 }).map((_, i) => {
        const t = (i + 0.5) / (thumb ? 12 : 30);
        return <circle key={i} cx={Math.round(eaveX0 + (eaveX1 - eaveX0) * t)} cy={eaveY - 3} r={thumb ? 2.2 : 3.2} fill={tile.light} opacity={0.9} />;
      })}
      {/* 正脊 */}
      <path d={`M${ridgeX0} ${ridgeY} Q600 ${apexY} ${ridgeX1} ${ridgeY}`} fill="none" stroke={tile.dark} strokeWidth={thumb ? 8 : 13} strokeLinecap="round" />
      {/* 脊刹 */}
      <path d={`M588 ${apexY + 6} q12 -24 24 0 q-12 -10 -24 0 Z`} fill={tile.light} stroke={tile.dark} strokeWidth="0.9" />
      {/* 飞檐翘角 */}
      <path
        d={`M${eaveX0 + 4} ${eaveY} C${eaveX0 - 18} ${eaveY - 12} ${eaveX0 - 34} ${eaveY - 34} ${eaveX0 - 48} ${eaveY - 58} C${eaveX0 - 24} ${eaveY - 34} ${eaveX0 - 8} ${eaveY - 18} ${eaveX0 + 12} ${eaveY - 8} Z`}
        fill={tile.base}
        stroke={tile.dark}
        strokeWidth="1"
      />
      <path
        d={`M${eaveX1 - 4} ${eaveY} C${eaveX1 + 18} ${eaveY - 12} ${eaveX1 + 34} ${eaveY - 34} ${eaveX1 + 48} ${eaveY - 58} C${eaveX1 + 24} ${eaveY - 34} ${eaveX1 + 8} ${eaveY - 18} ${eaveX1 - 12} ${eaveY - 8} Z`}
        fill={tile.base}
        stroke={tile.dark}
        strokeWidth="1"
      />
      {/* 檐下阴影带（屋面压在墙上） */}
      <rect x={eaveX0} y={eaveY - 4} width={eaveX1 - eaveX0} height={thumb ? 8 : 14} fill="rgba(0,0,0,0.34)" />
    </g>
  );

  if (form === "paifang") {
    // ---------- 牌坊：四柱三间，冲天式 ----------
    const pillarX = [128, 440, 760, 1072];
    const CAP_H = 24;
    return (
      <svg viewBox="0 0 1200 520" className={className} style={style} role="img" aria-label="牌坊" preserveAspectRatio="xMidYMax meet">
        {/* 台基（牌坊前后出陛） */}
        <rect x={62} y={452} width={1076} height={40} fill={C_MARBLE.base} stroke={C_MARBLE.dark} strokeWidth="1.6" />
        <rect x={62} y={452} width={1076} height={6} fill="#ffffff" opacity={0.9} />
        <rect x={62} y={484} width={1076} height={8} fill="rgba(0,0,0,0.22)" />

        {/* 四柱（青砖柱身 + 竖向受光条 + 抱鼓石） */}
        {pillarX.map((x, idx) => (
          <g key={x}>
            <rect x={x - 24} y={78} width={48} height={378} fill={wallFill} stroke={brick.dark} strokeWidth="1.3" />
            <rect x={x - 24} y={78} width={48} height={378} fill={line} opacity={0.5} />
            <rect x={x - 16} y={78} width={12} height={378} fill="rgba(255,255,255,0.16)" />
            <rect x={x + 12} y={78} width={12} height={378} fill="rgba(0,0,0,0.16)" />
            {/* 柱头云冠 */}
            <path d={`M${x - 30} 78 q30 -18 60 0 Z`} fill={brick.dark} />
            {/* 抱鼓石（土衬 + 鼓） */}
            {!thumb && (
              <>
                <rect x={x - 40} y={438} width={80} height={18} rx={2} fill={C_MARBLE.base} stroke={C_MARBLE.dark} strokeWidth="1.1" />
                <ellipse cx={x} cy={426} rx={30} ry={16} fill={C_MARBLE.base} stroke={C_MARBLE.dark} strokeWidth="1.1" />
                {idx % 2 === 0 && <ellipse cx={x} cy={426} rx={14} ry={7} fill="none" stroke={C_MARBLE.dark} strokeWidth="1" />}
              </>
            )}
          </g>
        ))}

        {/* 三道额枋（下枋宽、上枋窄，中间留匾位） */}
        <rect x={92} y={78} width={1016} height={32} rx={3} fill={wallFill} stroke={brick.dark} strokeWidth="1.3" />
        <rect x={92} y={78} width={1016} height={32} rx={3} fill={line} opacity={0.5} />
        <rect x={92} y={78} width={1016} height={5} fill="rgba(255,255,255,0.18)" />

        <rect x={140} y={126} width={920} height={28} rx={3} fill={wallFill} stroke={brick.dark} strokeWidth="1.2" />
        <rect x={140} y={126} width={920} height={28} rx={3} fill={line} opacity={0.5} />

        {/* 明间匾位（留给文字） */}
        <rect x={448} y={40} width={304} height={52} rx={3} fill="rgba(20,16,10,0.42)" stroke={gold} strokeWidth="2" />
        <rect x={456} y={47} width={288} height={38} fill="none" stroke={GOLD_FILL} strokeWidth="1.2" opacity={0.8} />

        {/* 两次间小额枋 */}
        <rect x={164} y={166} width={252} height={20} rx={2} fill={wallFill} stroke={brick.dark} strokeWidth="1.1" />
        <rect x={784} y={166} width={252} height={20} rx={2} fill={wallFill} stroke={brick.dark} strokeWidth="1.1" />

        {/* 顶部三座小庑殿顶（明间高、次间低） */}
        <path d="M416 40 Q600 8 784 40 L812 66 Q600 38 388 66 Z" fill={tile.base} stroke={tile.dark} strokeWidth="1.2" />
        <path d="M544 30 h112" stroke={tile.dark} strokeWidth="7" strokeLinecap="round" />
        <path d="M96 78 Q290 52 484 78 L500 96 Q290 74 80 96 Z" fill={tile.base} stroke={tile.dark} strokeWidth="1.1" />
        <path d="M716 78 Q910 52 1104 78 L1120 96 Q910 74 700 96 Z" fill={tile.base} stroke={tile.dark} strokeWidth="1.1" />

        {/* 夹杆石底座 */}
        <rect x={72} y={452} width={1056} height={-0} fill="none" />
      </svg>
    );
  }

  // ---------- 门楼 / 门洞 ----------
  const isArch = form === "arch";
  // 门楼：墙身上沿（屋面下檐 y=200，重叠 12px 到 212）
  const WALL_TOP = isArch ? 96 : 188;
  const WALL_BOT = 448;

  return (
    <svg viewBox="0 0 1200 520" className={className} style={style} role="img" aria-label="门楼" preserveAspectRatio="xMidYMax meet">
      {/* ---------- 门楼屋面 ---------- */}
      {!isArch && roof(78, 300, 900, 200, 122, 1078, 40)}

      {/* ---------- 两侧墙体 ---------- */}
      {/* 墙身主色 */}
      <rect x={0} y={WALL_TOP} width={1200} height={WALL_BOT - WALL_TOP} fill={wallFill} />
      <rect x={0} y={WALL_TOP} width={1200} height={WALL_BOT - WALL_TOP} fill={line} opacity={0.5} />
      {/* 墙檐阴影（顶部压暗，与屋面交接处） */}
      <rect x={0} y={WALL_TOP} width={1200} height={isArch ? 24 : 20} fill="rgba(0,0,0,0.26)" />
      {/* 墙身受光（中段略亮） */}
      <rect x={0} y={WALL_TOP + 40} width={1200} height={100} fill="rgba(255,255,255,0.07)" />
      {/* 墙裙（石质基座带，把墙身与台基分开） */}
      <rect x={0} y={WALL_BOT - 34} width={1200} height={34} fill={C_MARBLE.base} stroke={C_MARBLE.dark} strokeWidth="1.2" />
      <rect x={0} y={WALL_BOT - 34} width={1200} height={5} fill="#ffffff" opacity={0.85} />
      <rect x={0} y={WALL_BOT - 6} width={1200} height={6} fill="rgba(0,0,0,0.2)" />

      {/* ---------- 门洞 ---------- */}
      {isArch ? (
        <>
          {/* 圆券门洞 */}
          <path d="M470 448 V268 a130 130 0 0 1 260 0 V448 Z" fill="rgba(18,14,10,0.62)" />
          {/* 券脸石（外圈） */}
          <path
            d="M456 448 V268 a144 144 0 0 1 288 0 V448"
            fill="none"
            stroke={C_MARBLE.base}
            strokeWidth="16"
            strokeLinecap="round"
          />
          {/* 券脸石内圈高光 */}
          <path
            d="M464 448 V268 a136 136 0 0 1 272 0 V448"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.6"
            opacity={0.55}
          />
        </>
      ) : (
        <>
          {/* 木门（朱漆双扇） */}
          <rect x={470} y={244} width={260} height={204} fill="rgba(18,14,10,0.55)" stroke={brick.dark} strokeWidth="2" />
          <rect x={474} y={248} width={125} height={196} fill={C_TILE.dark} opacity={0.5} />
          <rect x={601} y={248} width={125} height={196} fill={C_TILE.dark} opacity={0.42} />
          {/* 门缝 */}
          <path d="M600 248 V444" stroke={brick.dark} strokeWidth="2" opacity={0.8} />

          {/* 门套（石质抱框） */}
          <rect x={452} y={230} width={296} height={16} rx={2} fill={C_MARBLE.base} stroke={C_MARBLE.dark} strokeWidth="1.2" />
          <rect x={452} y={230} width={16} height={218} fill={C_MARBLE.base} stroke={C_MARBLE.dark} strokeWidth="1.1" />
          <rect x={732} y={230} width={16} height={218} fill={C_MARBLE.base} stroke={C_MARBLE.dark} strokeWidth="1.1" />

          {/* 门枕石一对 */}
          {!thumb && (
            <>
              <rect x={424} y={430} width={44} height={22} rx={3} fill={C_MARBLE.base} stroke={C_MARBLE.dark} strokeWidth="1.1" />
              <rect x={732} y={430} width={44} height={22} rx={3} fill={C_MARBLE.base} stroke={C_MARBLE.dark} strokeWidth="1.1" />
            </>
          )}
        </>
      )}

      {/* ---------- 门额（匾位，留给文字） ---------- */}
      <rect
        x={500}
        y={isArch ? 128 : 156}
        width={200}
        height={isArch ? 44 : 46}
        rx={3}
        fill="rgba(20,16,10,0.42)"
        stroke={gold}
        strokeWidth="1.8"
      />
      <rect
        x={508}
        y={(isArch ? 128 : 156) + 7}
        width={184}
        height={isArch ? 30 : 32}
        fill="none"
        stroke={GOLD_FILL}
        strokeWidth="1.1"
        opacity={0.75}
      />

      {/* ---------- 台基 ---------- */}
      <rect x={0} y={448} width={1200} height={38} fill={C_MARBLE.base} stroke={C_MARBLE.dark} strokeWidth="1.3" />
      <rect x={0} y={448} width={1200} height={5} fill="#ffffff" opacity={0.9} />
      <rect x={0} y={474} width={1200} height={12} fill="rgba(0,0,0,0.24)" />
    </svg>
  );
}
