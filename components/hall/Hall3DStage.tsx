"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

/**
 * 纪念馆 3D 舞台 v2 —— 全貌立体厅堂
 *
 * 相比 v1 的升级：
 *   1. 单点透视全貌：正墙 + 左右侧墙 + 地面（透视图木地板）+ 顶面 + 檐口横梁，
 *      构成完整房间纵深，不再是"半截墙"；
 *   2. 鼠标环视升级：除整体微旋转外，还同步移动透视原点（perspective-origin），
 *      产生真实的"头部移动"视差；
 *   3. 花圈实体化：纯 CSS 立体大花圈（藤叶基环 + 白菊金菊 + 金属支架 + 「奠」字
 *      缎带 + 地面投影），立在遗像正下方的前地板上，不再叠加在遗像上；
 *   4. 灯笼 / 香炉 / 烛台 / 匾额全部 CSS 实体化（修复 v1 emoji 灯笼被动画覆盖
 *      transform 导致位置漂移的问题）。
 *
 * 装修差异化：未装修 = 素墙白烛原木案；装修过 = 壁纸 / 木地板 / 金饰 / 红灯笼 /
 *   聚光灯 + 暖金光晕 + 深色描金供案 —— 材质、灯光、陈设三层拉开。
 *
 * 花圈 3 天后由服务端按 expiresAt 懒清理，自动消失。
 */

const SERIF = "'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif";

/* ---------------- 花圈：写实 SVG / AI 图（预留 imgSrc 直换照片） ---------------- */

const PETAL_ANGLES = Array.from({ length: 12 }, (_, i) => i * 30);
const WREATH_GRADS = ["wFlower", "cFlower", "gFlower"] as const;

/** 单朵菊花头：12 片放射状花瓣 + 花心 */
function WreathFlowerHead({ x, y, r, grad }: { x: number; y: number; r: number; grad: string }) {
  return (
    <g>
      {PETAL_ANGLES.map((a, i) => (
        <ellipse
          key={i}
          cx={x}
          cy={y - r * 0.6}
          rx={r * 0.32}
          ry={r * 0.58}
          fill={`url(#${grad})`}
          transform={`rotate(${a} ${x} ${y})`}
        />
      ))}
      <circle cx={x} cy={y} r={r * 0.3} fill={`url(#${grad})`} />
      <circle cx={x} cy={y} r={r * 0.15} fill="rgba(110,80,25,0.5)" />
    </g>
  );
}

/** 写实花圈：绿植基环 + 密集菊瓣花头（白/米/金相间）+ 木质三脚支架 +
 *  中央「奠」字牌 + 接触阴影。若传入 imgSrc 则改用真实照片。 */
function WreathSVG() {
  const cx = 110, cy = 108, R = 70;
  const heads = Array.from({ length: 22 }, (_, i) => {
    const a = (i * 360) / 22 - 90;
    const rad = (a * Math.PI) / 180;
    return { x: cx + R * Math.cos(rad), y: cy + R * Math.sin(rad), g: i % 3 };
  });
  const leaves = Array.from({ length: 22 }, (_, i) => {
    const a = ((i + 0.5) * 360) / 22 - 90;
    const rad = (a * Math.PI) / 180;
    return { x: cx + (R + 5) * Math.cos(rad), y: cy + (R + 5) * Math.sin(rad), rot: a + 90 };
  });
  return (
    <svg viewBox="0 0 220 250" className="h-full w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <radialGradient id="wFlower" cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#fffefb" />
          <stop offset="70%" stopColor="#f1e6cc" />
          <stop offset="100%" stopColor="#d8c49a" />
        </radialGradient>
        <radialGradient id="cFlower" cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#fff8e8" />
          <stop offset="70%" stopColor="#ecd6a6" />
          <stop offset="100%" stopColor="#cdb074" />
        </radialGradient>
        <radialGradient id="gFlower" cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#ffeeb0" />
          <stop offset="70%" stopColor="#e6c470" />
          <stop offset="100%" stopColor="#bd923f" />
        </radialGradient>
        <linearGradient id="wLeaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5c8a3e" />
          <stop offset="100%" stopColor="#2c4520" />
        </linearGradient>
        <radialGradient id="wMedal" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#4a3618" />
          <stop offset="100%" stopColor="#1d1208" />
        </radialGradient>
        <linearGradient id="wWood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a6a3c" />
          <stop offset="100%" stopColor="#3c2c14" />
        </linearGradient>
        <filter id="wSoft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {/* 落地接触阴影 */}
      <ellipse cx={cx} cy={242} rx={62} ry={7} fill="rgba(15,9,2,0.34)" filter="url(#wSoft)" />
      {/* 木质三脚支架（A 字正面） */}
      <polygon points="57,244 65,244 104,116 99,116" fill="url(#wWood)" />
      <polygon points="163,244 155,244 116,116 121,116" fill="url(#wWood)" />
      <rect x="95" y="110" width="30" height="7" rx="2.5" fill="url(#wWood)" />
      <rect x="55" y="240" width="52" height="6" rx="2" fill="url(#wWood)" />
      <rect x="113" y="240" width="52" height="6" rx="2" fill="url(#wWood)" />
      {/* 绿植基环 */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="url(#wLeaf)" strokeWidth={16} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(18,38,10,0.5)" strokeWidth={3} />
      {leaves.map((l, i) => (
        <ellipse key={i} cx={l.x} cy={l.y} rx={9} ry={4.2} fill="url(#wLeaf)" opacity={0.92} transform={`rotate(${l.rot} ${l.x} ${l.y})`} />
      ))}
      {/* 菊瓣花头：白 / 米 / 金相间 */}
      {heads.map((h, i) => (
        <WreathFlowerHead key={i} x={h.x} y={h.y} r={15} grad={WREATH_GRADS[h.g]} />
      ))}
      {/* 中央「奠」字牌 */}
      <circle cx={cx} cy={cy} r={31} fill="url(#wMedal)" stroke="rgba(216,184,120,0.85)" strokeWidth={2.5} />
      <circle cx={cx} cy={cy} r={25} fill="none" stroke="rgba(216,184,120,0.45)" strokeWidth={1} />
      <text x={cx} y={cy + 10} textAnchor="middle" fontFamily={SERIF} fontSize="30" fontWeight={700} fill="#e9c987">奠</text>
    </svg>
  );
}

export type Hall3DAltarItem = { id: string; glyph: string };

/* ---------------- 花圈：纯 CSS 立体实体 ---------------- */

function Wreath3D({ message, index, imgSrc }: { message?: string | null; index: number; imgSrc?: string }) {
  return (
    <div
      className="hall3d-wreath relative h-full w-full"
      style={{ animationDelay: `${index * 1.5}s`, transformStyle: "preserve-3d" }}
      title={message || "敬献花圈"}
      role="img"
      aria-label="敬献大花圈"
    >
      {imgSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          alt="敬献大花圈"
          className="absolute inset-0 h-full w-full object-contain"
          style={{ filter: "drop-shadow(0 6px 10px rgba(15,9,2,0.4))" }}
        />
      ) : (
        <WreathSVG />
      )}

      {/* 挽联飘带：左右一对竖幅，垂在花圈架前侧（前移越过供案深度）、随风轻摆。
          上联「沉痛悼念」；下联优先取用户祭语，否则「音容宛在」 */}
      {[
        { key: "r", chars: "沉痛悼念", right: true, pos: "80%" },
        {
          key: "l",
          chars:
            message && message.length > 0 && message.length <= 7
              ? message
              : "音容宛在",
          right: false,
          pos: "20%",
        },
      ].map((r) => (
        <div
          key={r.key}
          aria-hidden
          className="absolute"
          style={{
            top: "52%",
            left: r.pos,
            width: "clamp(10px, 1.4vw, 16px)",
            height: "40%",
            transform: "translateX(-50%) translateZ(65px)",
          }}
        >
          <div
            className="hall3d-ribbon h-full w-full"
            style={{ animationDelay: r.right ? "0s" : "0.9s" }}
          >
            <span
              className="block h-full w-full rounded-b-sm"
              style={{
                background: r.right
                  ? "linear-gradient(180deg, #fbf6ea 0%, #efe4cc 100%)"
                  : "linear-gradient(180deg, #f5edda 0%, #e7dabd 100%)",
                border: "1px solid rgba(216,184,120,0.55)",
                borderTop: "none",
                boxShadow: "0 5px 12px rgba(15,9,2,0.35)",
                writingMode: "vertical-rl",
                textOrientation: "upright",
                color: r.right ? "#6b2f1e" : "#3a2c14",
                fontFamily: SERIF,
                fontSize: "clamp(8px, 1vw, 11px)",
                letterSpacing: "0.06em",
                lineHeight: 1.3,
                paddingTop: "4px",
                textAlign: "center",
              }}
            >
              {r.chars}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- 供案烛台 / 香炉 ---------------- */

function Candle({
  decorated,
  side,
  delay,
}: {
  decorated: boolean;
  side: "left" | "right";
  delay: string;
}) {
  return (
    <span
      aria-hidden
      className="absolute"
      style={{
        bottom: "56%",
        [side]: "9%",
        width: "clamp(8px, 1.1vw, 14px)",
        height: "clamp(20px, 3.2vw, 34px)",
        borderRadius: "3px 3px 1px 1px",
        background: decorated
          ? "linear-gradient(180deg, #a02432 0%, #701722 100%)"
          : "linear-gradient(180deg, #ead9b6 0%, #c9b489 100%)",
        boxShadow: "0 2px 6px rgba(15,9,2,0.45)",
      }}
    >
      {/* 烛焰光晕 */}
      <span
        className="hall3d-halo absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{
          top: "-22px",
          width: "26px",
          height: "26px",
          background:
            "radial-gradient(circle, rgba(255,196,100,0.42) 0%, transparent 68%)",
          animationDelay: delay,
        }}
      />
      {/* 烛焰 */}
      <span
        className="hall3d-flame absolute left-1/2"
        style={{
          top: "-11px",
          width: "7px",
          height: "12px",
          transform: "translateX(-50%)",
          borderRadius: "50% 50% 50% 50% / 62% 62% 38% 38%",
          background:
            "radial-gradient(circle at 50% 72%, #ffedbe 0%, #f6b23e 55%, rgba(246,150,40,0) 100%)",
          animationDelay: delay,
        }}
      />
    </span>
  );
}

function IncenseBurner() {
  return (
    <span
      aria-hidden
      className="relative inline-block"
      style={{ width: "clamp(18px, 2.6vw, 30px)", height: "clamp(11px, 1.5vw, 16px)" }}
    >
      {/* 三炷香 */}
      {[
        { l: "28%", r: "-9deg" },
        { l: "48%", r: "0deg" },
        { l: "68%", r: "9deg" },
      ].map((s) => (
        <span
          key={s.l}
          className="absolute"
          style={{
            bottom: "55%",
            left: s.l,
            width: "2px",
            height: "130%",
            background: "linear-gradient(180deg, #55401f 0%, #3a2a16 100%)",
            transform: `rotate(${s.r})`,
            transformOrigin: "bottom center",
            borderRadius: "1px",
          }}
        />
      ))}
      {/* 香烟 */}
      <span
        className="hall3d-smoke absolute left-1/2 -translate-x-1/2 rounded"
        style={{
          top: "-34px",
          width: "3px",
          height: "26px",
          background:
            "linear-gradient(180deg, transparent 0%, rgba(206,196,176,0.55) 70%, rgba(206,196,176,0.2) 100%)",
          filter: "blur(2px)",
        }}
      />
      {/* 炉身 + 炉口沿 */}
      <span
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "72%",
          borderRadius: "22% 22% 42% 42%",
          background: "linear-gradient(180deg, #8a6a3c 0%, #4a3318 100%)",
          boxShadow: "inset 0 2px 0 rgba(216,184,120,0.45), 0 2px 5px rgba(15,9,2,0.4)",
        }}
      />
      <span
        className="absolute"
        style={{
          left: "-7%",
          right: "-7%",
          top: "16%",
          height: "16%",
          borderRadius: "50%",
          background: "#6a4c26",
          boxShadow: "inset 0 1px 0 rgba(216,184,120,0.5)",
        }}
      />
    </span>
  );
}

/* ---------------- 灯笼（檐下吊挂） ---------------- */

function Lantern({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className="absolute"
      style={{ top: "3.5%", [side]: "20%", transform: "translateZ(95px)" }}
    >
      <span
        className="hall3d-sway block"
        style={{
          transformOrigin: "top center",
          animationDelay: side === "left" ? "0s" : "1.6s",
        }}
      >
        <i
          className="mx-auto block"
          style={{ width: "2px", height: "22px", background: "linear-gradient(180deg, #8a6a3c, #5d452a)" }}
        />
        <i className="mx-auto block" style={{ width: "14px", height: "4px", borderRadius: "2px", background: "#c9a44c" }} />
        <b
          className="relative mx-auto block"
          style={{
            width: "30px",
            height: "36px",
            borderRadius: "46% 46% 50% 50%",
            background:
              "radial-gradient(circle at 38% 30%, #ff8d5c 0%, #d4372e 45%, #8e1a16 100%), repeating-linear-gradient(90deg, rgba(0,0,0,0.12) 0 1px, transparent 1px 7px)",
            boxShadow:
              "0 0 16px rgba(255,110,60,0.5), inset -4px -6px 10px rgba(110,10,8,0.55)",
          }}
        />
        <i className="mx-auto block" style={{ width: "14px", height: "4px", borderRadius: "2px", background: "#c9a44c" }} />
        <i className="mx-auto block" style={{ width: "2px", height: "10px", background: "#c9a44c" }} />
        <i
          className="mx-auto block"
          style={{
            width: "10px",
            height: "12px",
            background: "#c9a44c",
            opacity: 0.85,
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
          }}
        />
      </span>
    </span>
  );
}

/* ---------------- 主组件 ---------------- */

export default function Hall3DStage({
  portrait,
  deceasedName,
  isOwner = false,
  manageHref,
  frameStyle,
  altarItems = [],
  decorated = false,
  wallId,
  floorId,
  ornamentIds = [],
  wreaths = [],
  className = "",
}: {
  portrait?: string;
  deceasedName?: string;
  isOwner?: boolean;
  manageHref?: string;
  /** 相框样式（装修槽位 frame），套在遗像上 */
  frameStyle?: CSSProperties;
  altarItems?: Hall3DAltarItem[];
  /** 服务端判定：任一装修槽位偏离默认值即为 true */
  decorated?: boolean;
  /** 装修槽位 id（用于选择材质） */
  wallId?: string;
  floorId?: string;
  ornamentIds?: string[];
  /** 有效花圈（服务端已按未过期过滤，最多 2） */
  wreaths?: { id: string; message?: string | null }[];
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
  }, []);

  // 鼠标环视：整体微旋转 + 透视原点平移（真实的"头部移动"视差），rAF 节流
  useEffect(() => {
    const el = rootRef.current;
    if (!el || reduced) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const rect = el.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 ~ 0.5
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--ry", `${(nx * 4).toFixed(2)}deg`);
        el.style.setProperty("--rx", `${(-ny * 2.2).toFixed(2)}deg`);
        el.style.setProperty("--pox", `${(50 + nx * 9).toFixed(2)}%`);
        el.style.setProperty("--poy", `${(42 + ny * 6).toFixed(2)}%`);
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--ry", "0deg");
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--pox", "50%");
        el.style.setProperty("--poy", "42%");
      });
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  // —— 正墙材质 ——
  const wallBg = (() => {
    if (!decorated) {
      return {
        background:
          "repeating-linear-gradient(90deg, rgba(0,0,0,0.03) 0 1px, transparent 1px 96px)," +
          "linear-gradient(180deg, #f1ebdd 0%, #e9e1cf 62%, #ded3bc 100%)",
      };
    }
    switch (wallId) {
      case "wall-inkwash":
        return {
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(120,134,150,0.35), transparent 55%)," +
            "linear-gradient(180deg, #dfe3e2 0%, #c9cfcf 60%, #b4bcbe 100%)",
        };
      case "wall-night":
        return {
          background:
            "radial-gradient(1.5px 1.5px at 22% 24%, rgba(216,184,120,0.9), transparent 100%)," +
            "radial-gradient(1px 1px at 68% 16%, rgba(216,184,120,0.7), transparent 100%)," +
            "radial-gradient(1.2px 1.2px at 84% 38%, rgba(216,184,120,0.6), transparent 100%)," +
            "linear-gradient(180deg, #191207 0%, #241a0e 58%, #2e2214 100%)",
        };
      case "wall-goldweave":
        return {
          background:
            "radial-gradient(130% 82% at 50% 0%, rgba(255,222,150,0.32), transparent 58%)," +
            "repeating-linear-gradient(45deg, rgba(216,184,120,0.16) 0 10px, transparent 10px 22px)," +
            "repeating-linear-gradient(-45deg, rgba(216,184,120,0.12) 0 10px, transparent 10px 22px)," +
            "linear-gradient(180deg, #5e4628 0%, #4a3823 58%, #382b19 100%)",
        };
      default:
        return {
          background:
            "radial-gradient(130% 80% at 50% 0%, rgba(255,236,200,0.22), transparent 60%)," +
            "linear-gradient(180deg, #ece1c8 0%, #e0d2b2 62%, #d2c19c 100%)",
        };
    }
  })();

  // —— 侧墙 / 顶面 / 地面配色 ——
  const shell = useMemo(() => {
    if (!decorated) {
      return {
        sideL: "linear-gradient(90deg, #c6bda7 0%, #ddd4bf 100%)",
        sideR: "linear-gradient(270deg, #c6bda7 0%, #ddd4bf 100%)",
        sideLine: "rgba(70,56,34,0.12)",
        ceil: "linear-gradient(180deg, #d9d0ba 0%, #cfc5ac 100%)",
        ceilLine: "rgba(70,56,34,0.08)",
        floorBase: "linear-gradient(180deg, #cdc6b6 0%, #b4ab97 100%)",
        floorLine: "rgba(80,66,44,0.20)",
      };
    }
    switch (wallId) {
      case "wall-night":
        return {
          sideL: "linear-gradient(90deg, #171008 0%, #241a0e 100%)",
          sideR: "linear-gradient(270deg, #171008 0%, #241a0e 100%)",
          sideLine: "rgba(216,184,120,0.10)",
          ceil: "linear-gradient(180deg, #120c05 0%, #1c130a 100%)",
          ceilLine: "rgba(216,184,120,0.08)",
          floorBase: "linear-gradient(180deg, #3a2a14 0%, #241806 100%)",
          floorLine: "rgba(216,184,120,0.10)",
        };
      case "wall-inkwash":
        return {
          sideL: "linear-gradient(90deg, #aeb7b8 0%, #c4cccc 100%)",
          sideR: "linear-gradient(270deg, #aeb7b8 0%, #c4cccc 100%)",
          sideLine: "rgba(30,40,42,0.14)",
          ceil: "linear-gradient(180deg, #c2cac9 0%, #aab3b4 100%)",
          ceilLine: "rgba(30,40,42,0.10)",
          floorBase: "linear-gradient(180deg, #939a95 0%, #71786f 100%)",
          floorLine: "rgba(20,28,26,0.25)",
        };
      default:
        return {
          sideL: "linear-gradient(90deg, #43331e 0%, #5d4728 100%)",
          sideR: "linear-gradient(270deg, #43331e 0%, #5d4728 100%)",
          sideLine: "rgba(0,0,0,0.22)",
          ceil: "linear-gradient(180deg, #2c2010 0%, #3d2d16 100%)",
          ceilLine: "rgba(216,184,120,0.14)",
          floorBase: "linear-gradient(180deg, #a5824f 0%, #7c5c34 100%)",
          floorLine: "rgba(40,26,10,0.42)",
        };
    }
  }, [decorated, wallId]);

  // —— 木地板透视线（SVG data URI：板缝向灭点收敛 + 横向拼缝近疏远密） ——
  const floorLines = useMemo(() => {
    const ribs: string[] = [];
    for (let x = -140; x <= 1140; x += 92) ribs.push(`M500 -120 L${x} 460`);
    const seams = [460, 386, 320, 262, 212, 170, 134, 104, 79, 59].map(
      (y) => `M0 ${y} L1000 ${y}`
    );
    const paths = [...ribs, ...seams]
      .map(
        (d) =>
          `<path d='${d}' stroke='${shell.floorLine}' stroke-width='2.4' fill='none'/>`
      )
      .join("");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 460' preserveAspectRatio='none'>${paths}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, [shell.floorLine]);

  const hasLantern = decorated && ornamentIds.includes("orn-lantern-red");
  const hasHalo = decorated;
  const plaqueText = deceasedName ? `${deceasedName} 千古` : "音容宛在";

  return (
    <section className={`relative ${className}`}>
      <div
        ref={rootRef}
        data-hall3d-stage="1"
        className="relative w-full select-none overflow-hidden rounded-xl shadow-md"
        style={{
          height: "min(58vw, 580px)",
          minHeight: "340px",
          perspective: "1100px",
          perspectiveOrigin: "var(--pox, 50%) var(--poy, 42%)",
          ["--rx" as string]: "0deg",
          ["--ry" as string]: "0deg",
          ["--pox" as string]: "50%",
          ["--poy" as string]: "42%",
        }}
      >
        {/* —— 房间：preserve-3d，随鼠标微旋转，透视原点同步平移 —— */}
        <div
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            transform: reduced ? "none" : "rotateX(var(--rx)) rotateY(var(--ry))",
            transition: "transform 0.35s ease-out",
          }}
        >
          {/* ① 正墙（最远层）：匾额 + 遗像 + 聚光 */}
          <div
            className="absolute"
            style={{
              left: "14%",
              right: "14%",
              top: "10%",
              bottom: "24%",
              transform: "translateZ(-70px)",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                ...wallBg,
                boxShadow: decorated
                  ? "inset 0 0 60px rgba(15,9,2,0.45)"
                  : "inset 0 0 40px rgba(60,48,28,0.16)",
              }}
            />
            {/* 踢脚线 */}
            <div
              aria-hidden
              className="absolute bottom-0 left-0 right-0"
              style={{
                height: "4.5%",
                background: decorated
                  ? "linear-gradient(180deg, #5a452a 0%, #3a2a14 100%)"
                  : "#c3b89f",
                boxShadow: decorated ? "0 -1px 0 rgba(216,184,120,0.4)" : undefined,
              }}
            />
            {/* 聚光灯锥（装修过点亮） */}
            {hasHalo && (
              <div
                aria-hidden
                className="hall3d-halo absolute left-1/2"
                style={{
                  top: "-6%",
                  width: "60%",
                  height: "92%",
                  transform: "translateX(-50%)",
                  clipPath: "polygon(46% 0, 54% 0, 76% 100%, 24% 100%)",
                  background:
                    "linear-gradient(180deg, rgba(255,222,150,0.28) 0%, rgba(255,222,150,0.10) 55%, transparent 85%)",
                  filter: "blur(4px)",
                }}
              />
            )}
            {/* 遗像暖金光晕 */}
            {hasHalo && (
              <div
                aria-hidden
                className="hall3d-halo absolute left-1/2"
                style={{
                  top: "48%",
                  width: "72%",
                  aspectRatio: "1 / 1",
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(216,184,120,0.38) 0%, rgba(216,184,120,0.10) 55%, transparent 75%)",
                }}
              />
            )}
            {/* 匾额 */}
            <div
              className="absolute left-1/2 flex items-center justify-center"
              style={{
                top: "4.5%",
                width: "40%",
                transform: "translateX(-50%)",
                padding: "1.6% 0",
                background: decorated
                  ? "linear-gradient(180deg, #2e2110 0%, #463318 100%)"
                  : "linear-gradient(180deg, #dccfae 0%, #cbbc96 100%)",
                border: decorated
                  ? "1px solid rgba(216,184,120,0.6)"
                  : "1px solid rgba(120,100,60,0.35)",
                boxShadow: decorated
                  ? "0 0 0 3px #241a0c, 0 0 0 4px rgba(216,184,120,0.35), 0 4px 10px rgba(15,9,2,0.4)"
                  : "0 2px 6px rgba(60,48,28,0.2)",
              }}
            >
              <span
                style={{
                  color: decorated ? "#e6c987" : "#6b5432",
                  fontFamily: SERIF,
                  fontSize: "clamp(11px, 1.7vw, 21px)",
                  letterSpacing: "0.16em",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {plaqueText}
              </span>
            </div>
            {/* 遗像（或上传入口） */}
            {portrait ? (
              <div
                data-portrait-niche="3d"
                className="absolute left-1/2 overflow-hidden"
                style={{
                  top: "15%",
                  height: "66%",
                  aspectRatio: "3 / 4",
                  transform: "translateX(-50%)",
                  background: "#1a1208",
                  boxShadow: decorated
                    ? "0 14px 34px rgba(10,6,1,0.6), 0 0 0 2px rgba(216,184,120,0.55), 0 0 0 7px #33240f, 0 0 0 8px rgba(216,184,120,0.35)"
                    : "0 10px 24px rgba(40,30,12,0.35)",
                  ...frameStyle,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={portrait}
                  alt={deceasedName ? `${deceasedName}遗像` : "逝者遗像"}
                  className="h-full w-full object-cover"
                />
                {decorated && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      boxShadow:
                        "inset 0 0 30px rgba(216,160,80,0.18), inset 0 -30px 40px rgba(20,10,0,0.35)",
                    }}
                  />
                )}
              </div>
            ) : (
              isOwner &&
              manageHref && (
                <a
                  href={manageHref}
                  className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border border-dashed border-white/70 bg-black/35 text-center text-[10px] leading-tight text-white no-underline hover:bg-black/50"
                  style={{ width: "34%", aspectRatio: "3 / 4" }}
                >
                  上传
                  <br />
                  遗像
                </a>
              )
            )}
          </div>

          {/* ② 房间外壳：地面 / 左右侧墙 / 顶面（单点透视梯形） */}
          <div className="absolute inset-0" style={{ transform: "translateZ(-35px)" }}>
            {/* 地面：向观者铺开，木地板透视线 + 遗像暖光洒落 */}
            <div
              className="absolute inset-0"
              style={{
                clipPath: "polygon(14% 76%, 86% 76%, 106% 100%, -6% 100%)",
                background: shell.floorBase,
              }}
            >
              <div
                className="absolute inset-0"
                style={{ backgroundImage: floorLines, backgroundSize: "100% 100%" }}
              />
              {decorated && (
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(60% 85% at 50% 12%, rgba(255,214,150,0.30), transparent 62%)",
                  }}
                />
              )}
            </div>
            {/* 左侧墙 */}
            <div
              className="absolute inset-0"
              style={{
                clipPath: "polygon(-6% -4%, 14% 10%, 14% 76%, -6% 104%)",
                background: shell.sideL,
              }}
            >
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background: `repeating-linear-gradient(90deg, ${shell.sideLine} 0 2px, transparent 2px 54px)`,
                }}
              />
            </div>
            {/* 右侧墙 */}
            <div
              className="absolute inset-0"
              style={{
                clipPath: "polygon(106% -4%, 86% 10%, 86% 76%, 106% 104%)",
                background: shell.sideR,
              }}
            >
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background: `repeating-linear-gradient(90deg, ${shell.sideLine} 0 2px, transparent 2px 54px)`,
                }}
              />
            </div>
            {/* 顶面：藻井暗线 */}
            <div
              className="absolute inset-0"
              style={{
                clipPath: "polygon(-6% -6%, 106% -6%, 86% 10%, 14% 10%)",
                background: shell.ceil,
              }}
            >
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background: `repeating-linear-gradient(90deg, ${shell.ceilLine} 0 2px, transparent 2px 64px), repeating-linear-gradient(0deg, ${shell.ceilLine} 0 2px, transparent 2px 26px)`,
                }}
              />
            </div>
          </div>

          {/* ③ 花圈：立在遗像正下方的前地板上（最多 2 个） */}
          {wreaths.length > 0 && (
            <div
              className="absolute left-1/2 flex items-end"
              style={{
                bottom: "13.5%",
                height: "31%",
                transform: "translateX(-50%) translateZ(25px)",
                transformStyle: "preserve-3d",
                gap: "clamp(48px, 9vw, 128px)",
              }}
            >
              {wreaths.map((w, i) => (
                <div key={w.id} style={{ height: "100%", aspectRatio: "0.62", transformStyle: "preserve-3d" }}>
                  <Wreath3D message={w.message} index={i} imgSrc="/assets/wreath-ai.png" />
                </div>
              ))}
            </div>
          )}

          {/* ④ 供案（前景）：案面 + 立面 + 案腿，案上烛台 / 香炉 / 祭品 */}
          <div
            className="absolute bottom-0 left-1/2"
            style={{
              width: "52%",
              height: "18%",
              transform: "translateX(-50%) translateZ(80px)",
            }}
          >
            {/* 案面（近宽远窄的梯形顶面） */}
            <div
              className="absolute left-0 right-0 top-0"
              style={{
                height: "32%",
                clipPath: "polygon(5% 0, 95% 0, 100% 100%, 0 100%)",
                background: decorated
                  ? "linear-gradient(180deg, #8a6a3e 0%, #6e5230 100%)"
                  : "linear-gradient(180deg, #c9b48b 0%, #b59f74 100%)",
                boxShadow: decorated
                  ? "inset 0 1px 0 rgba(216,184,120,0.5)"
                  : "inset 0 1px 0 rgba(255,255,255,0.4)",
              }}
            />
            {/* 立面 */}
            <div
              className="absolute left-0 right-0"
              style={{
                top: "31%",
                height: "54%",
                background: decorated
                  ? "linear-gradient(180deg, #4c3720 0%, #33240f 70%, #241a0c 100%)"
                  : "linear-gradient(180deg, #c0a97e 0%, #a8906a 100%)",
                boxShadow: decorated
                  ? "inset 0 2px 0 rgba(216,184,120,0.6), 0 6px 18px rgba(15,9,2,0.4)"
                  : "inset 0 2px 0 rgba(255,255,255,0.35), 0 5px 14px rgba(60,48,28,0.2)",
              }}
            >
              {/* 描金案腿包边（装修过） */}
              {decorated && (
                <>
                  <span
                    aria-hidden
                    className="absolute top-0 bottom-0"
                    style={{ left: "2%", width: "2.5%", background: "rgba(216,184,120,0.4)" }}
                  />
                  <span
                    aria-hidden
                    className="absolute top-0 bottom-0"
                    style={{ right: "2%", width: "2.5%", background: "rgba(216,184,120,0.4)" }}
                  />
                </>
              )}
            </div>
            {/* 案腿 + 落地阴影 */}
            <span
              aria-hidden
              className="absolute bottom-0"
              style={{
                left: "4%",
                width: "4.5%",
                height: "22%",
                background: decorated ? "#241a0c" : "#8f7a56",
                borderRadius: "0 0 2px 2px",
              }}
            />
            <span
              aria-hidden
              className="absolute bottom-0"
              style={{
                right: "4%",
                width: "4.5%",
                height: "22%",
                background: decorated ? "#241a0c" : "#8f7a56",
                borderRadius: "0 0 2px 2px",
              }}
            />
            <span
              aria-hidden
              className="absolute bottom-0 left-0 right-0"
              style={{
                height: "6%",
                background: "radial-gradient(ellipse, rgba(15,9,2,0.4), transparent 70%)",
              }}
            />
            {/* 案上陈设：长明烛一对（两端）+ 香炉居中 + 祭品 */}
            <Candle decorated={decorated} side="left" delay="0s" />
            <Candle decorated={decorated} side="right" delay="0.7s" />
            <div
              className="absolute left-0 right-0 flex items-end justify-center"
              style={{ bottom: "56%", gap: "clamp(6px, 1.2vw, 14px)" }}
            >
              <IncenseBurner />
              {altarItems.map((a) => (
                <span
                  key={a.id}
                  className="relative z-10 drop-shadow"
                  style={{ fontSize: "clamp(14px, 2vw, 22px)", lineHeight: 1 }}
                  title={a.glyph}
                >
                  {a.glyph}
                </span>
              ))}
            </div>
          </div>

          {/* ⑤ 檐口横梁 + 吊灯（装修过的空间才有灯笼） */}
          <div
            className="absolute left-0 right-0 top-0"
            style={{
              height: "8.5%",
              transform: "translateZ(90px)",
              background: decorated
                ? "linear-gradient(180deg, #241a0c 0%, #3c2c14 70%, #4a3618 100%)"
                : "linear-gradient(180deg, #d6cbb2 0%, #c9bda2 100%)",
              boxShadow: decorated
                ? "0 3px 0 rgba(216,184,120,0.55), 0 10px 24px rgba(15,9,2,0.45)"
                : "0 3px 10px rgba(60,48,28,0.15)",
            }}
          >
            {decorated && (
              <span
                aria-hidden
                className="absolute bottom-0 left-0 right-0"
                style={{
                  height: "1.4%",
                  background:
                    "repeating-linear-gradient(90deg, rgba(216,184,120,0.7) 0 8px, transparent 8px 20px)",
                }}
              />
            )}
          </div>
          {hasLantern && <Lantern side="left" />}
          {hasLantern && <Lantern side="right" />}
        </div>

        {/* 全景暗角（2D 覆层，增强剧场感） */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(15,9,2,0.40) 100%)",
          }}
        />

        {/* 装修徽标：右上角轻标注（一眼区分装没装修） */}
        <span
          className="absolute right-3 top-3 z-10 rounded-full px-2.5 py-0.5 text-[10px] tracking-wide"
          style={{
            background: decorated ? "rgba(216,184,120,0.92)" : "rgba(120,110,90,0.55)",
            color: decorated ? "#2b1f10" : "#fff",
          }}
        >
          {decorated ? "精装纪念空间" : "标准纪念空间"}
        </span>
      </div>

      {/* 场景说明 */}
      <p className="mt-2 text-center text-[11px] text-brand-400">
        全貌 3D 纪念厅堂 · 移动鼠标环视空间 · 花圈立于遗像正下方 · 敬献后陈列 3 天
        {isOwner && manageHref && (
          <a href={manageHref} className="ml-2 text-accent-600 hover:underline">
            去装修 →
          </a>
        )}
      </p>
    </section>
  );
}
