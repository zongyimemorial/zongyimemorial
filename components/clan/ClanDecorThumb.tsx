// 项目 tsconfig 的 jsx 为 "preserve"（交给 Next 处理）。
// 在 scripts/*.tsx 里用 renderToStaticMarkup 单独渲染本模块时走经典运行时，需显式引入 React。
import * as React from "react";
import type { ReactNode } from "react";
import {
  ClanAltar,
  ClanBannerPair,
  ClanCenser,
  ClanGate,
  ClanHalo,
  ClanLantern,
  ClanPillarPair,
  ClanPlaque,
  ClanStoneLion,
  ClanTabletWall,
  ClanTerrace,
  DEFAULT_PALETTE,
} from "@/components/clan/arch";
import type { ClanOrnamentSpec } from "@/lib/clan-decor";
import type { DecorStudioEntry } from "@/components/console/DecorStudio";

/**
 * 宗祠装修工坊的**真实构件缩略图**。
 *
 * 目的：工坊里的每一件素材都直接呈现"装到宗祠上长什么样"，
 * 而不是一个 emoji —— emoji 完全无法传达形制、比例与做工。
 *
 * 尺寸策略：所有构件都是固定 viewBox 的 SVG，这里只给**宽度**、高度交给比例，
 * 外层固定 h-20 并 overflow-hidden，因此 40+ 张缩略图不会变形也不会抖动。
 *
 * 注意：缩略图一律 size="thumb"（降细节、关动画），否则工坊会渲染几十个动画实例。
 */

/** 每个挂饰 kind 对应的构件 viewBox 比例 */
const ORN_RATIO: Record<string, string> = {
  "stone-lion": "600 / 280",
  "incense-burner": "260 / 300",
  "tablet-wall": "980 / 340",
  "banner-pair": "1200 / 700",
  lantern: "400 / 300",
  plaque: "480 / 130",
  halo: "600 / 300",
  "couplet-pillar": "420 / 400",
  shelf: "900 / 260",
};

/**
 * 一间缩略图容器。
 *
 * 关键：缩略图格子是**固定高度**（外层 h-20 = 80px），因此不能只给宽度 ——
 * 宽高比偏"竖"的构件（宫灯 400×300、香炉 260×300）按宽度撑开后会超出格子被裁掉。
 * 这里改为**同时约束宽度与高度**（max-width + max-height），让构件在格子内等比缩放到刚好放下，
 * 既不裁切也不变形。
 */
function Thumb({ ratio, children }: { ratio: string; children: ReactNode }) {
  const [w, h] = ratio.split("/").map((s) => Number(s.trim()));
  const safe = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  return (
    <div className="flex h-full w-full items-center justify-center p-1.5">
      <div
        style={{
          aspectRatio: ratio,
          // 以"能放进 80px 高格子"为准反推宽度；同时不超过格子的 92% 宽
          width: safe ? `min(92%, ${((h ? 68 / h : 1) * w).toFixed(1)}px)` : "92%",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** 挂饰 → 真实构件（与 ClanDecorLayer 的映射保持一致） */
function OrnamentThumb({ spec }: { spec: ClanOrnamentSpec }) {
  const p = DEFAULT_PALETTE;
  const full = { width: "100%", height: "100%" } as const;
  const r = (k: string) => ORN_RATIO[k] ?? "1 / 1";

  switch (spec.kind) {
    case "stone-lion":
      return (
        <Thumb ratio={r("stone-lion")}>
          <ClanStoneLion color={spec.color} count={2} palette={p} size="thumb" style={full} />
        </Thumb>
      );
    case "incense-burner":
      return (
        <Thumb ratio={r("incense-burner")}>
          <ClanCenser color={spec.color} palette={p} size="thumb" style={full} />
        </Thumb>
      );
    case "tablet-wall":
      return (
        <Thumb ratio={r("tablet-wall")}>
          <ClanTabletWall color={spec.color} count={5} palette={p} size="thumb" style={full} />
        </Thumb>
      );
    case "banner-pair":
      return (
        <Thumb ratio="360 / 480">
          <ClanBannerPair
            color={spec.color}
            text={spec.text ?? ["祖", "宗"]}
            palette={p}
            size="thumb"
            style={full}
          />
        </Thumb>
      );
    case "lantern":
      return (
        <Thumb ratio={r("lantern")}>
          <ClanLantern color={spec.color} count={spec.count ?? 2} palette={p} size="thumb" style={full} />
        </Thumb>
      );
    case "plaque":
      return (
        <Thumb ratio={r("plaque")}>
          <ClanPlaque
            text={spec.text ?? "祖德流芳"}
            variant="imperial"
            color={spec.color}
            palette={p}
            size="thumb"
            style={full}
          />
        </Thumb>
      );
    case "halo":
      return (
        <Thumb ratio={r("halo")}>
          <ClanHalo color={spec.color} palette={p} size="thumb" style={full} />
        </Thumb>
      );
    case "couplet-pillar":
      return (
        <Thumb ratio={r("couplet-pillar")}>
          <ClanPillarPair color={spec.color} palette={p} size="thumb" style={full} />
        </Thumb>
      );
    case "shelf":
      return (
        <Thumb ratio={r("shelf")}>
          <ClanAltar color={spec.color} palette={p} size="thumb" style={full} />
        </Thumb>
      );
    default:
      return null;
  }
}

/**
 * 宗祠素材 → 缩略图。
 *
 * 覆盖三类槽位：
 *   - ornament：真实挂饰构件
 *   - wall：按该墙面的**建筑形制**画一座小门楼（体现建材等级）
 *   - floor / frame / font：无对应构件，回退 emoji（返回 null）
 */
export function clanDecorThumb(entry: DecorStudioEntry, slot: string): ReactNode {
  const full = { width: "100%", height: "100%" } as const;

  if (slot === "wall") {
    /*
      墙面缩略图：不画"一块颜色"，而是用该墙面的**形制等级**画一座小门楼。
      这样一眼就能看出「金饰墙 = 重檐牌坊」与「夯土墙 = 随墙门」的等级差距，
      比纯色块有信息量得多。
    */
    const GATE_BY_WALL: Record<string, "arch" | "post" | "paifang"> = {
      "clan-wall-brick": "post",
      "clan-wall-earth": "arch",
      "clan-wall-white": "post",
      "clan-wall-vermilion": "paifang",
      "clan-wall-nanmu": "post",
      "clan-wall-gilt": "paifang",
    };
    return (
      <Thumb ratio="900 / 656">
        <ClanGate
          form={GATE_BY_WALL[entry.id] ?? "post"}
          palette={DEFAULT_PALETTE}
          size="thumb"
          style={full}
        />
      </Thumb>
    );
  }

  if (slot === "ornament") {
    const spec = (entry as DecorStudioEntry & { style?: { ornament?: ClanOrnamentSpec } }).style?.ornament;
    if (!spec) return null;
    return <OrnamentThumb spec={spec} />;
  }

  // floor / frame / font：无对应建筑构件，交回默认 emoji 预览
  return null;
}

/** 楼层/台基预览（供 wall 分类下补充"台基等级"信息时使用） */
export function clanTerraceThumb(form: "none" | "platform" | "moon"): ReactNode {
  const full = { width: "100%", height: "100%" } as const;
  return (
    <Thumb ratio="1200 / 300">
      <ClanTerrace form={form} size="thumb" style={full} />
    </Thumb>
  );
}
