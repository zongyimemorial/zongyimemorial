import type { CSSProperties, ReactNode } from "react";
import { Ornament } from "@/components/hall/HallDecorLayer";
import {
  clanDecorItem,
  clanDecorStyle,
  findClanTemplate,
  resolveClanOrnamentItems,
  type ClanOrnamentSpec,
  type HallDecor,
} from "@/lib/clan-decor";
import { skinIsActive, skinOf, skinVars, type SkinTokens } from "@/lib/decor-skin";
import {
  ClanAltar,
  ClanBannerPair,
  ClanCenser,
  ClanHalo,
  ClanLantern,
  ClanPillarPair,
  ClanPlaque,
  ClanStoneLion,
  ClanTabletWall,
  DEFAULT_PALETTE,
  type ArchPalette,
} from "@/components/clan/arch";

/**
 * 宗祠装修层。
 *
 * 与纪念馆共用 HallDecorLayer 的壁纸 / 地纹 / 字体 / 相框渲染逻辑，
 * 但「祠堂挂饰」不再用 CSS 色块拼，而是交给 components/clan/arch 下的
 * **真实建筑构件 SVG**（屋面 / 斗拱 / 门楼 / 石狮 / 香炉 / 牌位墙 / 幡旗…）。
 *
 * 关键约束（勿改）：
 *  1. 素材 id（clan-orn-*）、kind 值、tier、points 一律不变 —— 数据库里已存了用户选择，
 *     改了 id 会让所有人的装修方案失效。这里只换「画法」，不换「接口」。
 *  2. 挂饰是装饰层，一律 pointer-events-none，不能挡住底下的献祭按钮。
 *
 * 旧数据兼容：素材只存了一个 color（如 clan-orn-lion 的 "#a9a49b"），
 * 因此每个构件都接受单个 color 就能渲染（palette 缺省用 DEFAULT_PALETTE）。
 */

/**
 * 挂饰绘制：kind → 真实建筑构件 SVG
 *
 * 尺寸策略（重要）：
 *   每个构件都带一个固定 viewBox（如石狮 600×280、香炉 260×300）。
 *   若把它塞进一个"比例不对的槽位"（比如 86×420），
 *   `preserveAspectRatio="meet"` 会按窄边缩放，结果被压成一条细缝 ——
 *   立柱因此曾经只剩下一根红杠。
 *
 *   所以这里只给**宽度**，高度由 `aspect-ratio` 按 viewBox 比例自然撑开。
 *   这样任何视口下都不变形，也不需要为每个构件手写高度。
 */
const RATIO: Record<string, string> = {
  "stone-lion": "600 / 280",
  "incense-burner": "260 / 300",
  "tablet-wall": "900 / 340",
  "banner-pair": "360 / 480",
  lantern: "400 / 300",
  plaque: "480 / 130",
  halo: "600 / 300",
  "couplet-pillar": "420 / 400",
  shelf: "900 / 260",
};

/** 按比例撑高的容器（只给宽度） */
function Fit({
  ratio,
  className = "",
  children,
}: {
  ratio: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} style={{ aspectRatio: ratio }}>
      {children}
    </div>
  );
}

function ClanOrnament({ spec }: { spec: ClanOrnamentSpec }) {
  // 祠堂的默认主题板：青砖黛瓦 · 朱红立柱
  const palette: ArchPalette = DEFAULT_PALETTE;
  const r = (k: string) => RATIO[k] ?? "1 / 1";
  const full = { width: "100%", height: "100%" } as const;

  switch (spec.kind) {
    /* ---------- 祠堂专属（扩展 kind） ---------- */
    case "stone-lion":
      return (
        <div className="mx-auto w-full max-w-3xl px-8 md:px-16">
          <Fit ratio={r("stone-lion")}>
            <ClanStoneLion color={spec.color} count={spec.count ?? 2} palette={palette} style={full} />
          </Fit>
        </div>
      );

    case "incense-burner":
      return (
        <div className="mx-auto w-[130px] md:w-[160px]">
          <Fit ratio={r("incense-burner")}>
            <ClanCenser color={spec.color} palette={palette} style={full} />
          </Fit>
        </div>
      );

    case "tablet-wall":
      return (
        <div className="mx-auto w-full max-w-3xl px-4">
          <Fit ratio={r("tablet-wall")}>
            <ClanTabletWall color={spec.color} count={spec.count ?? 7} palette={palette} style={full} />
          </Fit>
        </div>
      );

    case "banner-pair":
      // 长幡挂在天井两侧：按 360:480 竖比例撑开，左右各一
      return (
        <div className="flex w-full items-start justify-between px-3 md:px-10">
          {[0, 1].map((i) => (
            <div key={i} className="w-[78px] md:w-[104px]">
              <Fit ratio={r("banner-pair")}>
                <ClanBannerPair
                  color={spec.color}
                  text={spec.text ?? ["祖", "宗"]}
                  palette={palette}
                  style={full}
                />
              </Fit>
            </div>
          ))}
        </div>
      );

    /* ---------- 复用纪念馆通用 kind，但改用工笔构件实现 ---------- */
    case "lantern":
      return (
        <div className="mx-auto w-[240px] md:w-[320px]">
          <Fit ratio={r("lantern")}>
            <ClanLantern color={spec.color} count={spec.count ?? 2} palette={palette} style={full} />
          </Fit>
        </div>
      );

    case "plaque":
      return (
        <div className="mx-auto w-[280px] md:w-[400px]">
          <Fit ratio={r("plaque")}>
            <ClanPlaque
              text={spec.text ?? "祖德流芳"}
              variant="imperial"
              color={spec.color}
              palette={palette}
              style={full}
            />
          </Fit>
        </div>
      );

    case "halo":
      return (
        <div className="pointer-events-none mx-auto w-full max-w-3xl">
          <Fit ratio={r("halo")}>
            <ClanHalo color={spec.color} palette={palette} style={full} />
          </Fit>
        </div>
      );

    case "couplet-pillar":
      // 楹联柱 → 朱红立柱一对（左右各一，按 420:400 比例）
      return (
        <div className="flex w-full items-start justify-between px-3 md:px-10">
          {[0, 1].map((i) => (
            <div key={i} className="w-[104px] md:w-[140px]">
              <Fit ratio={r("couplet-pillar")}>
                <ClanPillarPair color={spec.color} palette={palette} style={full} />
              </Fit>
            </div>
          ))}
        </div>
      );

    case "shelf":
      // 供桌 → 香案供桌（祭器陈设）
      return (
        <div className="mx-auto w-full max-w-3xl px-4">
          <Fit ratio={r("shelf")}>
            <ClanAltar color={spec.color} palette={palette} style={full} />
          </Fit>
        </div>
      );

    /* ---------- 其余纪念馆通用挂饰（无祠堂对应构件） ---------- */
    default:
      /*
        ⚠️ 这里兜底到纪念馆的 `Ornament`。
        阶段 2 新增的 9 个 kind（宫灯/供桌/香几/花瓶/烛台/匾额联/屏风/影壁/挂轴）
        都走这条路径 —— 它们是**通用陈设**，两个端共用同一套 CSS 实现，
        不必各自再写一份（写两份必然漂移，用户会发现"宗祠里的供桌和纪念馆不一样")。

        `caisson-light` 例外：它在 2D 端返回 null（藻井灯由结构层承担），
        这是有意的 —— 祠堂 2D 分镜里已有藻井绘制，再叠一盏灯会重复。
      */
      return <Ornament spec={spec} />;
  }
}

/** 哪些挂饰需要挂在页面上方（其余贴底部/两侧） */
const TOP_KINDS = new Set([
  "lantern",
  "imperial-lantern",
  "caisson-light",
  "plaque",
  "plaque-pair",
  "halo",
  "tablet-wall",
]);
const SURROUND_KINDS = new Set([
  "couplet-pillar",
  "banner-pair",
  "banner",
  "scroll-painting",
]);

function ornamentPlacement(spec: ClanOrnamentSpec) {
  if (SURROUND_KINDS.has(spec.kind)) return "surround" as const;
  if (TOP_KINDS.has(spec.kind)) return "top" as const;
  return "bottom" as const;
}

export default function ClanDecorLayer(props: {
  decor: HallDecor;
  className?: string;
  children?: ReactNode;
  style?: CSSProperties;
  /**
   * 已算好的皮肤（可选）。传了就以它为准 —— 理由同 HallDecorLayer：
   * "文字色/卡片底色必须同源"，而深色判定只有调用方知道。
   */
  skin?: SkinTokens;
  /**
   * 底部挂饰（石狮 / 香炉 / 供桌 / 牌位墙）的锚点：
   *  - "layer"  贴在本层容器底部（默认；内容不足一屏时最自然）
   *  - "content" 贴在**内容最后一屏**底部（长页面必须用这个，
   *              否则挂饰会沉到所有文字下方、压住页脚说明）
   *
   * 实现方式：把挂饰的绝对定位容器改为包在内容外层、相对内容定位。
   * 之所以不做成自动判断：页面上「内容多长」只有调用方知道。
   */
  bottomAnchor?: "layer" | "content";
}) {
  const { decor, className = "", children, style, bottomAnchor = "layer" } = props;
  const wall = clanDecorItem("wall", decor);
  const floor = clanDecorItem("floor", decor);
  /*
    多挂饰（2026-10）：挂饰一律经 resolveClanOrnamentItems 取清单（首件 = 主陈设），
    绝不直接读 slots.ornament —— 否则多挂饰会在某些视图悄悄退化成单件
    （AGENTS.md 记的「同一事实两个判据」同源病）。皮肤取色仍用主陈设。
  */
  const ornItems = resolveClanOrnamentItems(decor);
  const orn = ornItems[0] ?? clanDecorItem("ornament", decor);
  const font = clanDecorItem("font", decor);

  /*
    全页换肤（与纪念馆同口径，merge 顺序见 lib/decor-skin.ts 文件头）。
    ⚠️ 宗祠侧查模板必须用 `findClanTemplate` ——
       这里是 lib/clan-decor 的命名空间，`findTemplate` 是**纪念馆的**表，
       用它会让宗祠模板的 skin 永远取不到（AGENTS.md 记过这个 bug 的同源形态：
       宗祠公页曾误用 findTemplate，导致付费 3D 空间从来不渲染）。
  */
  /*
    `props.skin` 由调用方传入时**优先**（不再自己算）—— 理由同 HallDecorLayer：
    "文字色 / 卡片底色必须来自同一个判据"，而深色判定（旧硬编码列表）只有调用方知道。
    详见 lib/decor-skin.ts 的 `withDark()`。
  */
  const skin =
    props.skin ??
    skinOf(decor, {
      items: {
        wall,
        floor,
        ornament: orn,
        frame: clanDecorItem("frame", decor),
        font,
      },
      template: decor.templateId
        ? { id: decor.templateId, skin: findClanTemplate(decor.templateId)?.skin }
        : undefined,
    });

  /*
    多挂饰清单：每件带自己的锚点档（top / surround / bottom）。
    单件时必须走**原路径**（下方 ornamentLayer 的单件分支）——
    多挂饰上线前所有现存方案都是单件，包装一层 flex 都可能让
    既有 30+ 验收套件的布局断言漂移。只有 ≥2 件才走新的并排路径。
  */
  const orns = ornItems
    .map((it) => ({ id: it.id, spec: it.style.ornament as ClanOrnamentSpec | undefined }))
    .filter((x): x is { id: string; spec: ClanOrnamentSpec } => !!x.spec);
  const hasBottom = orns.some((o) => ornamentPlacement(o.spec) === "bottom");

  /** 挂饰层本体：按 placement 决定定位方式 */
  const ornamentLayer = (z: string) => {
    if (orns.length === 0) return null;
    // 不设高度：内部 Fit 用 aspect-ratio 自撑，容器随内容自然展开
    const base = `pointer-events-none absolute inset-x-0 ${z}`;

    // —— 单件：与多挂饰改造前完全一致的原路径 ——
    if (orns.length === 1) {
      const p = ornamentPlacement(orns[0].spec);
      if (p === "top")
        return (
          <div className={`${base} top-2`}>
            <ClanOrnament spec={orns[0].spec} />
          </div>
        );
      if (p === "surround")
        // 从顶部挂下（幡旗/立柱都是从檐下悬垂的构件）
        return (
          <div className={`${base} top-0`}>
            <ClanOrnament spec={orns[0].spec} />
          </div>
        );
      return (
        <div className={`${base} bottom-0`}>
          <ClanOrnament spec={orns[0].spec} />
        </div>
      );
    }

    // —— 多件：按锚点档分组，同档并排（flex），不同档各占一层 ——
    //    每件包一层 flex 子项（min-w-0 让固定宽构件可收缩；flex-1 均分排位）。
    const bandRow = (band: "top" | "surround" | "bottom", items: typeof orns) => {
      if (items.length === 0) return null;
      const align = band === "bottom" ? "items-end" : "items-start";
      const top = band === "bottom" ? "bottom-0" : band === "top" ? "top-2" : "top-0";
      return (
        <div key={band} className={`${base} ${top} flex ${align} justify-center gap-2 md:gap-5 px-2 md:px-6`}>
          {items.map((o) => (
            <div key={o.id} data-ornament={o.id} className="min-w-0 flex-1 max-w-2xl">
              <ClanOrnament spec={o.spec} />
            </div>
          ))}
        </div>
      );
    };
    const bands: Record<"top" | "surround" | "bottom", typeof orns> = {
      top: [],
      surround: [],
      bottom: [],
    };
    for (const o of orns) bands[ornamentPlacement(o.spec)].push(o);
    return (
      <>
        {bandRow("surround", bands.surround)}
        {bandRow("top", bands.top)}
        {bandRow("bottom", bands.bottom)}
      </>
    );
  };

  return (
    <div
      className={`relative ${className}`}
      data-skin={skinIsActive(skin) ? "on" : "off"}
      style={{ ...clanDecorStyle("wall", decor), ...skinVars(skin), ...style }}
    >
      {/* 壁纸叠加纹理 */}
      {wall?.style.overlay && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: wall.style.overlay }}
        />
      )}

      {/*
        挂饰层：全部用 absolute（不用 fixed）。
        fixed 会让挂饰在长页面滚动时"跟着飘"，脱离建筑本身；
        absolute 绑定在本层容器上，滚动时与建筑一起移动。
        容器统一 pointer-events-none，绝不遮挡底下的献祭按钮。
      */}
      {bottomAnchor === "layer" && ornamentLayer("z-20")}

      {/* 地面层 */}
      {floor && floor.style.backgroundImage && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
          style={{
            backgroundImage: floor.style.backgroundImage,
            maskImage: "linear-gradient(180deg, transparent, black 65%)",
            WebkitMaskImage: "linear-gradient(180deg, transparent, black 65%)",
            opacity: 0.85,
          }}
        />
      )}

      {/*
        内容块。bottomAnchor="content" 时，底部挂饰渲染在 children **之后**
        并相对内容底部定位 —— 于是它会叠在最后一块内容上（视觉上是"陈设在堂前"）。

        但纯叠加会压住正文（祭祀记录表格尤其明显），所以再补一段
        **占位空隙**（reserveBelow）：先撑开高度，挂饰落在这段空白里，
        内容与挂饰就此互不遮挡。
      */}
      <div
        className={bottomAnchor === "content" ? "relative" : "relative z-10"}
        style={{
          fontFamily: font?.style.fontFamily,
          letterSpacing: font?.style.letterSpacing,
          textShadow: font?.style.textShadow,
        }}
      >
        {children}

        {bottomAnchor === "content" && (
          <>
            {/* 占位：给底部挂饰留出落地空间，避免压住正文（多挂饰时任一件落底都算） */}
            {hasBottom && <div aria-hidden className="h-40 md:h-44" />}
            {ornamentLayer("z-30")}
          </>
        )}
      </div>
    </div>
  );
}

export { ClanOrnament };
