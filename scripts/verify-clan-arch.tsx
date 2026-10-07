/**
 * 宗祠建筑构件（arch）单元验证
 *
 * 用 renderToStaticMarkup 把每个构件渲染成静态 HTML，断言：
 *   - 产出合法 <svg>（含 viewBox）
 *   - 确实画了东西（有 <path> 或 <circle> 或 <rect>）
 *   - 关键色值出现（金 / 朱红 / 黛瓦）
 *   - size="thumb" 时细节被裁剪（路径数少于 detail），保证工坊 40+ 缩略图不卡
 *
 * 运行：npx tsx scripts/verify-clan-arch.mts
 *
 * 注意：项目 tsconfig 的 jsx 是 "preserve"（交给 Next 处理），
 * 因此这里必须显式 `import * as React from "react"` 才能让 tsx 正确转译 JSX。
 */
import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import ClanRoof from "@/components/clan/arch/Roof";
import ClanDougong from "@/components/clan/arch/Dougong";
import ClanPillarPair from "@/components/clan/arch/PillarPair";
import ClanDoor from "@/components/clan/arch/Door";
import ClanGate from "@/components/clan/arch/Gate";
import ClanTerrace from "@/components/clan/arch/Terrace";
import ClanCenser from "@/components/clan/arch/Censer";
import ClanStoneLion from "@/components/clan/arch/StoneLion";
import ClanTabletWall from "@/components/clan/arch/TabletWall";
import ClanBannerPair from "@/components/clan/arch/BannerPair";
import ClanPlaque from "@/components/clan/arch/Plaque";
import ClanLantern from "@/components/clan/arch/Lantern";
import ClanHalo from "@/components/clan/arch/Halo";
import ClanAltar from "@/components/clan/arch/Altar";
import ClanArchDefs from "@/components/clan/arch/defs";
import {
  C_GOLD,
  C_TILE,
  C_VERMILION,
  DEFAULT_PALETTE,
  triGradient,
  triStops,
} from "@/components/clan/arch/palette";
import { isThumb } from "@/components/clan/arch/types";
import {
  SceneCourtyard,
  SceneGate,
  SceneGround,
  SceneMainHall,
  SceneShrine,
} from "@/components/clan/ClanHallScene";
import { clanDecorThumb } from "@/components/clan/ClanDecorThumb";
import type { DecorStudioEntry } from "@/components/console/DecorStudio";
import {
  CLAN_ARCH_PRESETS,
  CLAN_FLOORS,
  CLAN_FONTS,
  CLAN_FRAMES,
  CLAN_ORNAMENTS,
  CLAN_WALLS,
  DEFAULT_ARCH,
  clanArchParams,
  type ClanDecorItem,
} from "@/lib/clan-decor";

const results: { name: string; ok: boolean; extra?: string }[] = [];
const check = (name: string, ok: boolean, extra = "") => results.push({ name, ok: !!ok, extra });

/** 统计某标签出现次数 */
const count = (s: string, tag: string) => (s.match(new RegExp(`<${tag}\\b`, "g")) ?? []).length;

// ---------------------------------------------------------------- 色板
{
  check("色板：黛瓦三点齐备", !!C_TILE.light && !!C_TILE.base && !!C_TILE.dark, JSON.stringify(C_TILE));
  check("色板：金三点齐备", !!C_GOLD.light && !!C_GOLD.base && !!C_GOLD.dark);
  check("色板：朱红三点齐备", !!C_VERMILION.light && !!C_VERMILION.base && !!C_VERMILION.dark);

  check("色板：默认主题板含 roof/pillar/beam/gold/wall", Object.keys(DEFAULT_PALETTE).length === 5, Object.keys(DEFAULT_PALETTE).join(","));

  const g = triGradient(C_GOLD);
  check("triGradient 生成 linear-gradient 三停靠点", /linear-gradient\(.*0%.*52%.*100%\)/.test(g), g);

  const st = triStops(C_GOLD);
  check("triStops 返回 3 个 stop", st.length === 3 && st[0].offset === "0%" && st[2].offset === "100%");

  check("isThumb(thumb)=true", isThumb("thumb") === true);
  check("isThumb(detail)=false", isThumb("detail") === false);
  check("isThumb(undefined)=false", isThumb(undefined) === false);
}

// ---------------------------------------------------------------- defs
{
  const html = renderToStaticMarkup(<ClanArchDefs />);
  check("defs：含 defs 容器", html.includes("\u003cdefs\u003e"), html.slice(0, 40));
  check("defs：含黛瓦渐变", html.includes("clan-arch-roof"), "");
  check("defs：含朱红立柱渐变（横向）", html.includes("clan-arch-pillar") && /x1="0" y1="0" x2="1"/.test(html), "");
  check("defs：含金箔渐变", html.includes("clan-arch-gold"), "");
  check("defs：含砖缝 pattern", html.includes("clan-arch-brick-pat"), "");
  check("defs：withPattern=false 时不输出 pattern", !renderToStaticMarkup(<ClanArchDefs withPattern={false} />).includes("\u003cpattern"), "");
}

// ---------------------------------------------------------------- 屋面
{
  for (const form of ["hard", "gable", "hip", "double"] as const) {
    const html = renderToStaticMarkup(<ClanRoof form={form} />);
    check(
      `屋面 ${form}：合法 svg + 有路径`,
      html.startsWith("\u003csvg") && html.includes("viewBox=\"0 0 1200 420\"") && count(html, "path") >= 4,
      `path=${count(html, "path")}`,
    );
  }

  const detail = renderToStaticMarkup(<ClanRoof form="gable" size="detail" />);
  const thumb = renderToStaticMarkup(<ClanRoof form="gable" size="thumb" />);
  check(
    "屋面：thumb 路径数少于 detail（降细节生效）",
    count(thumb, "path") < count(detail, "path"),
    `thumb=${count(thumb, "path")} detail=${count(detail, "path")}`,
  );
  check("屋面：飞檐翘角画出勾头滴水（含 circle）", count(detail, "circle") >= 2, `circle=${count(detail, "circle")}`);
  check("屋面：引用黛瓦渐变", detail.includes("url(#clan-arch-roof)"), "");
  check("屋面：可指定 color 覆盖", renderToStaticMarkup(<ClanRoof color="#123456" />).includes("#123456"), "");
}

// ---------------------------------------------------------------- 斗拱
{
  const html = renderToStaticMarkup(<ClanDougong />);
  check("斗拱：合法 svg + viewBox", html.includes("viewBox=\"0 0 1200 110\""), "");
  check("斗拱：含金色渐变", html.includes("url(#clan-arch-gold)"), "");
  const detail = renderToStaticMarkup(<ClanDougong size="detail" />);
  const thumb = renderToStaticMarkup(<ClanDougong size="thumb" />);
  check("斗拱：thumb 用更少构件数", count(thumb, "rect") < count(detail, "rect"), `thumb=${count(thumb, "rect")} detail=${count(detail, "rect")}`);
  check("斗拱：count 参数生效", count(renderToStaticMarkup(<ClanDougong count={3} />), "g") >= 3, "");
}

// ---------------------------------------------------------------- 立柱
{
  const html = renderToStaticMarkup(<ClanPillarPair />);
  check("立柱：合法 svg + viewBox", html.includes("viewBox=\"0 0 420 400\""), "");
  check("立柱：引用朱红横向渐变（圆柱感）", html.includes("url(#clan-arch-pillar)"), "");
  check("立柱：含柱础汉白玉", html.includes("url(#clan-arch-marble)"), "");
  check("立柱：含雀替（rect 数 >= 4）", count(html, "rect") >= 4, `rect=${count(html, "rect")}`);
  const detail = renderToStaticMarkup(<ClanPillarPair size="detail" />);
  const thumb = renderToStaticMarkup(<ClanPillarPair size="thumb" />);
  check("立柱：thumb 减少彩画细节", thumb.length < detail.length, `thumb=${thumb.length} detail=${detail.length}`);
}

// ---------------------------------------------------------------- 大门
{
  const html = renderToStaticMarkup(<ClanDoor />);
  check("大门：合法 svg + viewBox", html.includes("viewBox=\"0 0 400 460\""), "");
  check("大门：门钉成阵（circle >= 25）", count(html, "circle") >= 25, `circle=${count(html, "circle")}`);
  check("大门：铺首衔环（金色）", html.includes("url(#clan-arch-gold)"), "");
  check("大门：中缝分双扇", html.includes("rgba(0,0,0,0.5)"), "");
  const detail = renderToStaticMarkup(<ClanDoor size="detail" />);
  const thumb = renderToStaticMarkup(<ClanDoor size="thumb" />);
  check("大门：thumb 门钉更少", count(thumb, "circle") < count(detail, "circle"), `thumb=${count(thumb, "circle")} detail=${count(detail, "circle")}`);
}

// ---------------------------------------------------------------- 门楼
{
  for (const form of ["arch", "post", "paifang"] as const) {
    const html = renderToStaticMarkup(<ClanGate form={form} />);
    check(
      `门楼 ${form}：合法 svg + 有路径`,
      html.includes("viewBox=\"0 0 1200 520\"") && count(html, "path") >= 1,
      `path=${count(html, "path")}`,
    );
  }
  const paifang = renderToStaticMarkup(<ClanGate form="paifang" />);
  check("牌坊：四柱", count(paifang, "rect") >= 10, `rect=${count(paifang, "rect")}`);
  const arch = renderToStaticMarkup(<ClanGate form="arch" />);
  check("门洞：圆券门（含 a 弧线命令）", /d="M470 448 V268 a130 130/.test(arch), "");
}

// ---------------------------------------------------------------- 月台
{
  const none = renderToStaticMarkup(<ClanTerrace form="none" />);
  check("台基 none：不渲染", none === "", JSON.stringify(none));

  const platform = renderToStaticMarkup(<ClanTerrace form="platform" />);
  check(
    "台基 platform：合法 svg + 有台基",
    platform.includes("viewBox=\"0 0 1200 200\"") && platform.includes("url(#clan-arch-marble)"),
    "",
  );

  const moon = renderToStaticMarkup(<ClanTerrace form="moon" />);
  check("月台 moon：含望柱栏板（circle 柱头 >= 14）", count(moon, "circle") >= 14, `circle=${count(moon, "circle")}`);
  check("月台：含三级踏步", count(moon, "rect") > count(platform, "rect"), `moon=${count(moon, "rect")} platform=${count(platform, "rect")}`);
}

// ---------------------------------------------------------------- 香炉
{
  const html = renderToStaticMarkup(<ClanCenser />);
  check("香炉：合法 svg + viewBox", html.includes("viewBox=\"0 0 260 300\""), "");
  check("香炉：三足", count(html, "ellipse") >= 4, `ellipse=${count(html, "ellipse")}`);
  check("香炉：含青烟动画 class", html.includes("smoke"), "");
  check("香炉：指定 color 覆盖生效", renderToStaticMarkup(<ClanCenser color="#123456" />).includes("#123456"), "");
  const detail = renderToStaticMarkup(<ClanCenser size="detail" />);
  const thumb = renderToStaticMarkup(<ClanCenser size="thumb" />);
  check("香炉：thumb 关闭动画", !thumb.includes("smoke"), "");
  check("香炉：thumb 省略饕餮纹", thumb.length < detail.length, `thumb=${thumb.length} detail=${detail.length}`);
}

// ---------------------------------------------------------------- 石狮
{
  const html = renderToStaticMarkup(<ClanStoneLion />);
  check("石狮：合法 svg + viewBox", html.includes("viewBox=\"0 0 600 280\""), "");
  check("石狮：一对（含镜像 transform）", html.includes("scale(-1,1)"), "");
  // 石狮用**青石（花岗岩）**而非汉白玉：汉白玉 #dfdbd1 与宣纸底 #f7f4ec 几乎同色，
  // 狮子会溶进背景。此处断言"用了更深的青石色"，防止有人又改回汉白玉。
  check(
    "石狮：须弥座（青石色，不含汉白玉渐变）",
    !html.includes("url(#clan-arch-marble)") && /#(9b978c|b4b0a6)/.test(html),
    "",
  );
  check("石狮：单只 count=1 不镜像", !renderToStaticMarkup(<ClanStoneLion count={1} />).includes("scale(-1,1)"), "");
  const detail = renderToStaticMarkup(<ClanStoneLion size="detail" />);
  const thumb = renderToStaticMarkup(<ClanStoneLion size="thumb" />);
  check("石狮：thumb 省略座上回纹", count(thumb, "path") < count(detail, "path"), `thumb=${count(thumb, "path")} detail=${count(detail, "path")}`);
}

// ---------------------------------------------------------------- 牌位墙
{
  const html = renderToStaticMarkup(<ClanTabletWall />);
  check("牌位墙：合法 svg + viewBox", html.includes("viewBox=\"0 0 900 340\""), "");
  check("牌位墙：含供台", html.includes("rgba(255,255,255,0.14)"), "");
  // 昭穆序：中间牌位最高 → 检查存在高度差（非全部等高的 rect）
  const heights = [...html.matchAll(/height="(\d+)"/g)].map((m) => Number(m[1]));
  const uniq = new Set(heights.filter((h) => h > 100));
  check("牌位墙：昭穆序（存在多种牌位高度）", uniq.size >= 2, `heights=${[...uniq].join(",")}`);
  check("牌位墙：count 参数生效", count(renderToStaticMarkup(<ClanTabletWall count={3} />), "text") <= 3, "");

  // 祭祀记录复用：names 渲染为牌面文字
  const named = renderToStaticMarkup(<ClanTabletWall count={3} names={["李*华", "张*", "us***@test.com"]} />);
  check("牌位墙：names 刻为牌面文字", named.includes("李*华") && named.includes("张*"), "");
  check("牌位墙：无 names 时显示「先祖神位」", html.includes("先祖神位"), "");
}

// ---------------------------------------------------------------- style 透传
// 回归护栏：ArchBaseProps.style 必须真正落到 <svg> 上。
// 这些构件会被包在固定高度的装饰层里（ClanDecorLayer），靠 width/height:100% 适配；
// 若某个构件漏掉 style，就会被撑成默认尺寸、溢出压住正文 —— 且不报错。
{
  const all: [string, React.ReactElement][] = [
    ["屋面 Roof", <ClanRoof />],
    ["斗拱 Dougong", <ClanDougong />],
    ["立柱 PillarPair", <ClanPillarPair />],
    ["大门 Door", <ClanDoor />],
    ["门楼 Gate", <ClanGate />],
    ["月台 Terrace", <ClanTerrace form="moon" />],
    ["石狮 StoneLion", <ClanStoneLion />],
    ["香炉 Censer", <ClanCenser />],
    ["牌位墙 TabletWall", <ClanTabletWall />],
    ["幡旗 BannerPair", <ClanBannerPair />],
    ["匾额 Plaque", <ClanPlaque text="祖德流芳" />],
    ["宫灯 Lantern", <ClanLantern />],
    ["光晕 Halo", <ClanHalo />],
    ["香案 Altar", <ClanAltar />],
  ];
  const style = { width: "100%", height: "100%" };
  const missing = all
    .map(([name, node]) => [
      name,
      renderToStaticMarkup(React.cloneElement(node, { style } as never)),
    ] as const)
    .filter(([, h]) => !/width:\s*100%/.test(h) || !/height:\s*100%/.test(h))
    .map(([name]) => name);
  check("全部构件：style 透传到 <svg>（装饰层靠它自适应）", missing.length === 0, missing.join(" / "));

  // 多形态组件的每个分支都要透传（Gate 2 个 svg、Roof 2 个 svg）
  const gateForms = (["post", "arch", "paifang"] as const).map(
    (form) => renderToStaticMarkup(<ClanGate form={form} style={style} />),
  );
  check(
    "门楼三种形制：style 全覆盖",
    gateForms.every((h) => /width:\s*100%/.test(h)),
    `post/arch/paifang=${gateForms.map((h) => (/width:\s*100%/.test(h) ? 1 : 0)).join("")}`,
  );

  const roofForms = (["hard", "gable", "hip", "double"] as const).map(
    (form) => renderToStaticMarkup(<ClanRoof form={form} style={style} />),
  );
  check(
    "屋面四种形制：style 全覆盖",
    roofForms.every((h) => /width:\s*100%/.test(h)),
    `hard/gable/hip/double=${roofForms.map((h) => (/width:\s*100%/.test(h) ? 1 : 0)).join("")}`,
  );
}

// ---------------------------------------------------------------- 形制参数
// 回归护栏：arch 是纯呈现层参数，不能影响任何素材 id / 名称 / 档位 / 解锁规则。
{
  // 每种墙面都要能解析出完整形制（不能有 undefined 字段）
  const all = CLAN_WALLS.map((w) => ({ id: w.id, p: clanArchParams(w.id, w) }));
  const missing = all.filter(
    (a) =>
      !a.p.roof ||
      !a.p.gate ||
      !a.p.terrace ||
      typeof a.p.steps !== "number" ||
      typeof a.p.dougong !== "boolean",
  );
  check(
    "形制参数：六种墙面均解析出完整 ClanArchParams",
    missing.length === 0 && all.length === 6,
    `count=${all.length}`,
  );

  // 未知墙面 id 必须回退到 DEFAULT_ARCH（不能崩、不能留空）
  const unknown = clanArchParams("clan-wall-not-exist");
  check(
    "形制参数：未知墙面回退 DEFAULT_ARCH",
    unknown.roof === DEFAULT_ARCH.roof &&
      unknown.gate === DEFAULT_ARCH.gate &&
      unknown.terrace === DEFAULT_ARCH.terrace &&
      unknown.steps === DEFAULT_ARCH.steps,
    `${unknown.roof}/${unknown.gate}/${unknown.terrace}/steps=${unknown.steps}`,
  );

  // 素材自带 arch 必须覆盖预设（这是「单素材微调」的能力）
  const override = clanArchParams("clan-wall-brick", {
    id: "x",
    name: "x",
    desc: "",
    tier: "free",
    preview: { icon: "" },
    style: {},
    arch: { roof: "double", steps: 3 },
  } as ClanDecorItem);
  check(
    "形制参数：素材自带 arch 覆盖预设",
    override.roof === "double" && override.steps === 3 && override.gate === "post",
    `roof=${override.roof} steps=${override.steps} gate=${override.gate}`,
  );

  // 等级单调性：最朴素的墙面不应出现牌坊，最高规格必须是牌坊
  const earth = clanArchParams("clan-wall-earth");
  const gilt = clanArchParams("clan-wall-gilt");
  check(
    "形制分级：夯土墙不用牌坊、金饰墙用牌坊",
    earth.gate !== "paifang" && gilt.gate === "paifang",
    `earth=${earth.gate} gilt=${gilt.gate}`,
  );
  check(
    "形制分级：等级由低到高（台基级数递增）",
    clanArchParams("clan-wall-earth").steps <= clanArchParams("clan-wall-gilt").steps,
    `earth=${clanArchParams("clan-wall-earth").steps} gilt=${clanArchParams("clan-wall-gilt").steps}`,
  );

  // 预设引用的墙面 id 必须真实存在（防改名后静默失配）
  const badPreset = Object.keys(CLAN_ARCH_PRESETS).filter(
    (id) => !CLAN_WALLS.some((w) => w.id === id),
  );
  check("形制预设：引用的墙面 id 全部存在", badPreset.length === 0, badPreset.join(","));

  // arch 扩展不得动到素材目录本体（id数量是硬指标）
  check(
    "素材目录：id 数量未因扩展而变动",
    CLAN_WALLS.length === 6 && CLAN_ORNAMENTS.length === 10,
    `walls=${CLAN_WALLS.length} orn=${CLAN_ORNAMENTS.length}`,
  );
}

// ---------------------------------------------------------------- 分镜场景
// 回归护栏：四段分镜必须能独立渲染，且绝不使用 position:fixed。
// fixed 会让建筑在长页面里"跟着滚"，脱离地面 —— 这是曾经踩过的坑（装饰层同理）。
{
  // 前四段是"画出来的建筑"，必须有 <svg>；第五段是纯 CSS 的落地阴影，不含 svg。
  const scenes: [string, () => string, boolean][] = [
    ["山门 Gate", () => renderToStaticMarkup(<SceneGate hallName="测试宗祠" surname="陆" ancestorTitle="吴郡" />), true],
    ["天井 Courtyard", () => renderToStaticMarkup(<SceneCourtyard />), true],
    ["享堂 MainHall", () => renderToStaticMarkup(<SceneMainHall plaqueText="敦本堂" />), true],
    ["寝堂 Shrine", () => renderToStaticMarkup(<SceneShrine />), true],
    ["落地 Ground", () => renderToStaticMarkup(<SceneGround />), false],
  ];

  let ok = true;
  const detail: string[] = [];
  for (const [name, fn, needSvg] of scenes) {
    try {
      const h = fn();
      const hasSvg = /<svg/.test(h);
      const noFixed = !/position:\s*fixed/.test(h);
      const rendered = h.length > 60;
      // 需要 svg 的场景必须有 svg；不需要的也允许有（不强制）
      if (rendered === false || !noFixed || (needSvg && !hasSvg)) ok = false;
      detail.push(`${name}=${hasSvg ? "svg" : "div"}${noFixed ? "" : "/FIXED"}`);
    } catch (e) {
      ok = false;
      detail.push(`${name}=ERR(${(e as Error).message})`);
    }
  }
  check("分镜场景：五段均可独立渲染且不含 position:fixed", ok, detail.join(" "));

  // 匾额文字必须是 HTML 节点（脚本靠它断言），不能只画在 SVG 里
  const mainHall = renderToStaticMarkup(<SceneMainHall plaqueText="敦本堂" />);
  check(
    "享堂：匾额文字为 HTML 节点（可被文案断言命中）",
    mainHall.includes("敦本堂") && !/<text[^>]*>敦本堂/.test(mainHall),
    "",
  );

  // 山门画幅比例必须与 RATIO.gate 一致，否则 preserveAspectRatio 会letterbox
  const gate = renderToStaticMarkup(<SceneGate hallName="测试宗祠" surname="陆" />);
  check("山门：viewBox 为 900×656（与容器比例一致）", /viewBox="0 0 900 656"/.test(gate), "");
  check("寝堂：牌位墙 viewBox 为 980×340（三间不被裁切）", /viewBox="0 0 980 340"/.test(renderToStaticMarkup(<SceneShrine />)), "");
}

// ---------------------------------------------------------------- 工坊缩略图
// 回归护栏：工坊里的每件素材都要能渲染出**真实构件**（而不是只剩 emoji）。
{
  const walls = CLAN_WALLS.map((i) => [
    i.id,
    clanDecorThumb(i as unknown as DecorStudioEntry, "wall"),
  ] as const);
  const wallsWithSvg = walls.filter(([, n]) => n !== null);
  check(
    "工坊缩略图：六种墙面全部有真实构件图",
    wallsWithSvg.length === 6,
    `withThumb=${wallsWithSvg.length}/6`,
  );

  // 挂饰：10 件里 9 件有构件（clan-orn-none 是"不加挂饰"，本就该回退 emoji）
  const orns = CLAN_ORNAMENTS.map((i) => [
    i.id,
    clanDecorThumb(i as unknown as DecorStudioEntry, "ornament"),
  ] as const);
  const ornWithThumb = orns.filter(([, n]) => n !== null);
  const noneThumb = orns.find(([id]) => id === "clan-orn-none")?.[1] ?? null;
  check(
    "工坊缩略图：10 件挂饰中 9 件有真实构件（none 回退 emoji）",
    ornWithThumb.length === 9 && noneThumb === null,
    `withThumb=${ornWithThumb.length}/10 none=${noneThumb === null ? "null" : "svg"}`,
  );

  // 地面/相框/字体无建筑构件，必须回退（返回 null）而不是崩或空白
  check(
    "工坊缩略图：地面/相框/字体回退默认预览（返回 null 不抛错）",
    clanDecorThumb({ ...CLAN_FLOORS[0] } as unknown as DecorStudioEntry, "floor") === null &&
      clanDecorThumb({ ...CLAN_FRAMES[0] } as unknown as DecorStudioEntry, "frame") === null &&
      clanDecorThumb({ ...CLAN_FONTS[0] } as unknown as DecorStudioEntry, "font") === null,
    "",
  );

  // 缩略图必须走 thumb 档（降细节、关动画），否则工坊几十个实例会卡
  const thumbHtml = renderToStaticMarkup(
    <>{ornWithThumb.map(([id, n]) => (
      <div key={id}>{n}</div>
    ))}</>,
  );
  check(
    "工坊缩略图：构件均为 thumb 档（不含动画元素）",
    !/@keyframes|animate-/.test(thumbHtml) && /<svg/.test(thumbHtml),
    "",
  );
}

// ---------------------------------------------------------------- 工坊按钮
// 回归护栏：已锁定素材的按钮必须按档位分流。
// 曾经 premium 素材落进"积分解锁"分支，渲染出「用 undefined 积分兑换」——
// 因为 premium 素材根本没有 points 字段（积分买不到，只能订阅）。
{
  const src = readFileSync(
    new URL("../components/console/DecorStudio.tsx", import.meta.url),
    "utf8",
  );
  check(
    "工坊按钮：锁定素材按档位分流（premium 走订阅、points 走积分）",
    /item\.tier === "premium"\s*\?/.test(src),
    "",
  );
  check(
    "工坊按钮：无「undefined 积分」渲染风险（积分分支受 tier 保护）",
    /*
      直接按结构断言，不用固定字符窗口（易随注释长度失效）：
      取「item.tier === "premium"」到该分支结束之间的整段代码，
      其中必须出现 premiumHref（订阅分支），且积分文案只能出现在 else 一侧。
      做法：把 premium 三元表达式整体切出来，确认它同时含两种按钮。
    */
    (() => {
      const i = src.indexOf('item.tier === "premium"');
      if (i < 0) return false;
      // 从三元起点往后取足量片段，覆盖 points / premium 两个分支
      const seg = src.slice(i, i + 1200);
      const hasPremiumLink = seg.includes("premiumHref");
      const hasPointsBtn = seg.includes("用 ${item.points} 积分兑换");
      // 关键：premium 分支里绝不能出现积分文案
      const premiumBranch = seg.slice(0, seg.indexOf(") : ("));
      const premiumClean = !premiumBranch.includes("积分兑换");
      return hasPremiumLink && hasPointsBtn && premiumClean;
    })(),
    "",
  );
  // 素材本身：premium 档不得带 points（否则语义矛盾）
  const badPremium = [...CLAN_WALLS, ...CLAN_FLOORS, ...CLAN_ORNAMENTS, ...CLAN_FRAMES, ...CLAN_FONTS]
    .filter((i) => i.tier === "premium" && (i as { points?: number }).points != null)
    .map((i) => i.id);
  check(
    "素材档位：premium 素材一律不带 points（积分买不到）",
    badPremium.length === 0,
    badPremium.join(","),
  );
}

// ---------------------------------------------------------------- 汇总
console.log("\n================ 宗祠建筑构件 单元验证 ================");
let pass = 0;
for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.extra ? "  — " + r.extra : ""}`);
  if (r.ok) pass++;
}
console.log(`\n结果: ${pass}/${results.length} 通过\n`);
process.exit(pass === results.length ? 0 : 1);
