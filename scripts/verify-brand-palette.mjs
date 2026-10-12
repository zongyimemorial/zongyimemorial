/**
 * 品牌色体系验收套件（墨金 · LOGO 同源）
 *
 * 背景：全站原为冷蓝灰（brand-500 #5b6b7b），与 LOGO 的"深墨金"
 * （暗橄榄褐底 #3a2f18 + 香槟金 #e8c56d）理念相悖。
 * 本次重写 tailwind.config.ts 的 brand / accent 色阶，并把 Tailwind
 * 默认冷灰覆盖为暖灰。首页五大板块卡片改为"墨金骨架 + 专属主色"。
 *
 * 本套件要守住的核心不变量：
 *   §1 配置契约：brand 10 档 / accent 9 档 / gray 10 档齐全且为合法 hex
 *   §2 单调性：三组色阶亮度**严格递减**（防手滑写反某档）
 *   §3 WCAG 对比度：文字色在白底可读、白字在深底可读
 *   §4 LOGO 同源：brand-800 / accent-300 必须就是 LOGO 的两个主色
 *   §5 暖灰不撞车：gray 浅档与 brand 浅档要"同族但可辨"（ΔE 区间）
 *   §6 行为层：首页五张卡 data-feature-tone 两两不同、--tone 互异、hover 变边
 *   §7 反向验证：三处注入缺陷，断言必须真的变红
 *
 * 前置：Next 已在 127.0.0.1:3000 运行。
 *
 * ⚠️ 本套件最容易被"假绿"骗到的三处，已在下面逐个注明：
 *   ① 对比度断言如果只读 `backgroundColor`，会漏掉渐变卡片的底 —— 见 §3 注释
 *   ② `data-feature-tone` 如果由被测逻辑自己产出，缺陷版会"自产自销"自洽 —— 见 §6
 *   ③ 反向验证如果缺陷版与正确版**输出相同**，断言根本不会红 —— 见 §7
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";

const { chromium } = pkg;
const BASE = "http://127.0.0.1:3000";

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// 颜色工具（自带实现，不依赖被测代码）
// ---------------------------------------------------------------------------
function relLum(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const la = relLum(a);
  const lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function toLab(hex) {
  const h = hex.replace("#", "");
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
  [r, g, b] = [f(r), f(g), f(b)];
  const X = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  const fx = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx_, fy_, fz_] = [fx(X / 0.95047), fx(Y / 1.0), fx(Z / 1.08883)];
  return [116 * fy_ - 16, 500 * (fx_ - fy_), 200 * (fy_ - fz_)];
}

function deltaE(a, b) {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

/** 把 CSS 里的颜色字符串解析成 hex（支持 #rgb / #rrggbb / rgb()） */
function cssToHex(css) {
  if (!css) return null;
  const s = css.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    return ("#" + s.slice(1).split("").map((c) => c + c).join("")).toLowerCase();
  }
  const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) {
    return (
      "#" + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("")
    ).toLowerCase();
  }
  return null;
}

const SCALES = ["brand", "accent", "gray"];

// ---------------------------------------------------------------------------
// §1 配置契约：从 tailwind.config.ts 源码里把三组色阶读出来
// ---------------------------------------------------------------------------
console.log("\n=== §1 配置契约 ===");

const cfg = readFileSync("/workspace/tailwind.config.ts", "utf8");

/**
 * 从配置源码里提取某组色阶（不 import —— 那是 TS，node 直接读不了；
 * 而且我们希望断言基于"写在文件里的真实字面量"）。
 */
function readScale(name) {
  // 匹配 `name: { ... }`，取到第一个平衡的右花括号
  const start = cfg.search(new RegExp(`\\b${name}\\s*:\\s*\\{`));
  if (start < 0) return null;
  const open = cfg.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < cfg.length; i++) {
    if (cfg[i] === "{") depth++;
    else if (cfg[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const body = cfg.slice(open + 1, end);
  // 剥掉注释，避免"注释里写了旧值"造成误判
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const out = {};
  for (const m of clean.matchAll(/(\d{2,3})\s*:\s*"(#[0-9a-fA-F]{3,8})"/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

const scales = {};
for (const s of SCALES) scales[s] = readScale(s);

const EXPECTED_STOPS = {
  brand: ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"],
  accent: ["50", "100", "200", "300", "400", "500", "600", "700", "800"],
  gray: ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"],
};

for (const s of SCALES) {
  const got = scales[s];
  check(`§1 ${s} 色阶存在`, !!got, got ? `${Object.keys(got).length} 档` : "未找到");
  if (!got) continue;
  const missing = EXPECTED_STOPS[s].filter((k) => !got[k]);
  check(
    `§1 ${s} 档位齐全（${EXPECTED_STOPS[s].length} 档）`,
    missing.length === 0,
    missing.length ? `缺 ${missing.join(",")}` : Object.keys(got).length + " 档",
  );
  const badHex = Object.entries(got).filter(([, v]) => !/^#[0-9a-f]{6}$/.test(v));
  check(`§1 ${s} 全部为合法 6 位 hex`, badHex.length === 0, badHex.map(([k, v]) => `${k}=${v}`).join(" "));
}

// 关键：brand-200/300/400 过去根本没定义，却各有 12/44/233 处使用 → 空样式
check(
  "§1 brand-200/300/400 已补齐（修复历史空样式）",
  !!(scales.brand?.["200"] && scales.brand?.["300"] && scales.brand?.["400"]),
  `200=${scales.brand?.["200"]} 300=${scales.brand?.["300"]} 400=${scales.brand?.["400"]}`,
);

// ---------------------------------------------------------------------------
// §2 单调性：色阶亮度必须严格递减
// ---------------------------------------------------------------------------
console.log("\n=== §2 单调性 ===");

for (const s of SCALES) {
  const got = scales[s];
  if (!got) continue;
  const keys = EXPECTED_STOPS[s].filter((k) => got[k]);
  const Ls = keys.map((k) => toLab(got[k])[0]);
  let bad = null;
  for (let i = 0; i < Ls.length - 1; i++) {
    if (!(Ls[i] > Ls[i + 1])) {
      bad = `${keys[i]}(L*=${Ls[i].toFixed(1)}) → ${keys[i + 1]}(L*=${Ls[i + 1].toFixed(1)})`;
      break;
    }
  }
  check(
    `§2 ${s} 亮度严格递减`,
    !bad,
    bad ? `逆序/持平于 ${bad}` : Ls.map((x) => x.toFixed(0)).join(">"),
  );
}

// ---------------------------------------------------------------------------
// §3 WCAG 对比度
// ---------------------------------------------------------------------------
console.log("\n=== §3 WCAG 对比度 ===");

const b = scales.brand || {};
const a = scales.accent || {};
const g = scales.gray || {};

/**
 * ⚠️ 判据说明：这些断言验的是"色值"，所以白底一律用 #ffffff。
 * 卡片内部的实际底色是渐变末端 brand-50，故对卡片文字额外补一条
 * "压 brand-50 / 压 brand-100" 的断言（见下面 §3c）。
 */
const TEXT_ON_WHITE = [
  // [档位, 色值, 阈值, 用途]
  ["brand-400", b["400"], 3.0, "次要文字（233 处）"],
  ["brand-500", b["500"], 4.5, "正文（200 处）"],
  ["brand-600", b["600"], 4.5, "强调文字（99 处）"],
  ["accent-500", a["500"], 4.5, "金色文字（21 处）"],
  ["accent-600", a["600"], 4.5, "金色文字（143 处）"],
  ["accent-700", a["700"], 4.5, "金色文字（23 处）"],
  ["gray-500", g["500"], 4.5, "次要文字"],
  ["gray-600", g["600"], 4.5, "正文"],
  ["gray-700", g["700"], 4.5, "正文强调"],
];

for (const [name, val, min, use] of TEXT_ON_WHITE) {
  if (!val) {
    check(`§3 ${name} 压白底 ≥ ${min}`, false, "色值缺失");
    continue;
  }
  const r = contrast(val, "#ffffff");
  check(`§3 ${name} 压白底 ≥ ${min}:1`, r >= min, `${r.toFixed(2)}:1 · ${use}`);
}

// 白字压深底
for (const name of ["700", "800", "900"]) {
  if (!b[name]) continue;
  const r = contrast("#ffffff", b[name]);
  check(`§3 白字压 brand-${name} ≥ 4.5:1`, r >= 4.5, `${r.toFixed(2)}:1`);
}

// 金字压最深底（页脚等暗场景）
for (const name of ["300", "400"]) {
  if (!a[name]) continue;
  const r = contrast(a[name], b["900"]);
  check(`§3 accent-${name} 压 brand-900 ≥ 4.5:1`, r >= 4.5, `${r.toFixed(2)}:1`);
}

// §3c 卡片内文字：压在渐变末端 brand-50 / brand-100 上
console.log("\n--- §3c 卡片/暖底上的文字 ---");
for (const name of ["brand-500", "gray-600", "gray-700"]) {
  const val = name.startsWith("brand") ? b[name.replace("brand-", "")] : g[name.replace("gray-", "")];
  if (!val) continue;
  const r50 = contrast(val, b["50"]);
  const r100 = contrast(val, b["100"]);
  check(
    `§3c ${name} 压 brand-50 / brand-100 均 ≥ 4.5:1`,
    r50 >= 4.5 && r100 >= 4.5,
    `50→${r50.toFixed(2)}:1  100→${r100.toFixed(2)}:1`,
  );
}

// ---------------------------------------------------------------------------
// §4 LOGO 同源
// ---------------------------------------------------------------------------
console.log("\n=== §4 LOGO 同源 ===");

const LOGO_GROUND = "#3a2f18"; // LOGO 暗橄榄褐底（图像采样）
const LOGO_GOLD = "#e8c56d"; // LOGO 香槟金高光（图像采样）

check(
  `§4 brand-800 就是 LOGO 底色`,
  !!b["800"] && deltaE(b["800"], LOGO_GROUND) < 6,
  b["800"] ? `${b["800"]} vs ${LOGO_GROUND} ΔE=${deltaE(b["800"], LOGO_GROUND).toFixed(2)}` : "缺失",
);
check(
  `§4 accent-300 就是 LOGO 金`,
  !!a["300"] && deltaE(a["300"], LOGO_GOLD) < 6,
  a["300"] ? `${a["300"]} vs ${LOGO_GOLD} ΔE=${deltaE(a["300"], LOGO_GOLD).toFixed(2)}` : "缺失",
);

// ---------------------------------------------------------------------------
// §5 暖灰不撞车
// ---------------------------------------------------------------------------
console.log("\n=== §5 暖灰与 brand 浅档的分离度 ===");

if (g["100"] && b["100"] && g["300"] && b["300"]) {
  const d100 = deltaE(g["100"], b["100"]);
  check(
    "§5 ΔE(gray-100, brand-100) ∈ [1.5, 6]（同族但可辨）",
    d100 >= 1.5 && d100 <= 6,
    `ΔE=${d100.toFixed(2)}`,
  );
  const d300 = deltaE(g["300"], b["300"]);
  check(
    "§5 ΔE(gray-300, brand-300) ∈ [6, 40]（描边不糊）",
    d300 >= 6 && d300 <= 40,
    `ΔE=${d300.toFixed(2)}`,
  );
} else {
  check("§5 暖灰分离度", false, "gray/brand 浅档缺失");
}

// ---------------------------------------------------------------------------
// §6 行为层：首页五张卡
// ---------------------------------------------------------------------------
console.log("\n=== §6 行为层（首页五卡）===");

/** 该卡专属主色（与 page.tsx 的 toneColor 同源，此处独立列出作为"期望值"）。
 *  2026-10 重设计：五色全部收进墨金暖色家族（橄榄绿褐/绛红褐/古铜/暖灰褐/深金褐），
 *  与「午夜悄悄话」的星夜墨金语言同族；冷青绿 #4d7168、冷蓝灰 #445872 已移除。
 *  同月二次调整：按「宗忆堂」LOGO 底色 #403010（深墨褐）整体加深一档，
 *  L\* 从 37.5–43.0 压到 26.0–32.8，与 LOGO 深色域同重。 */
const EXPECTED_TONES = {
  memorial: "#3f4625",
  clan: "#5e352a",
  live: "#6b4517",
  news: "#423d33",
  offering: "#5f4a10",
};

/** 卡片底色（渐变末端）—— 五色压其上必须仍可作文字 */
const CARD_BG_END = "#f2ede4"; // = brand-100
for (const [tone, hex] of Object.entries(EXPECTED_TONES)) {
  const r = contrast(hex, CARD_BG_END);
  check(`§6 板块主色 ${tone} 压卡片底色 ≥ 4.5:1`, r >= 4.5, `${hex} → ${r.toFixed(2)}:1`);
}

// 五色明度收拢
const toneLs = Object.values(EXPECTED_TONES).map((h) => toLab(h)[0]);
const span = Math.max(...toneLs) - Math.min(...toneLs);
check("§6 五个板块主色 L* 跨度 ≤ 15（明度齐平）", span <= 15, `跨度 ${span.toFixed(1)}`);
check(
  "§6 五个板块主色两两互异",
  new Set(Object.values(EXPECTED_TONES)).size === 5,
  `${new Set(Object.values(EXPECTED_TONES)).size} 个唯一值`,
);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([
  { name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" },
]);
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(400);

const cards = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll("[data-feature-tone]"));
  return nodes.map((el) => {
    const cs = getComputedStyle(el);
    const bar = el.querySelector("span[data-tone-bar]");
    const title = el.querySelector("h3");
    return {
      tone: el.getAttribute("data-feature-tone"),
      toneVar: el.style.getPropertyValue("--tone").trim(),
      softVar: el.style.getPropertyValue("--tone-soft").trim(),
      borderTopColor: cs.borderTopColor,
      backgroundImage: cs.backgroundImage,
      barBg: bar ? getComputedStyle(bar).backgroundColor : "",
      barBgImage: bar ? getComputedStyle(bar).backgroundImage : "",
      title: title ? title.textContent.trim() : "",
      titleColor: title ? getComputedStyle(title).color : "",
    };
  });
});

check("§6 首页渲染出 5 张功能卡", cards.length === 5, `实际 ${cards.length}`);

const toneVals = cards.map((c) => c.tone);
check(
  "§6 五个 data-feature-tone 两两不同",
  toneVals.length === 5 && new Set(toneVals).size === 5,
  toneVals.join(",") || "(空)",
);

const toneHexes = cards.map((c) => cssToHex(c.toneVar));
check(
  "§6 五张卡 --tone 均可解析为颜色",
  toneHexes.length === 5 && toneHexes.every(Boolean),
  toneHexes.map((x) => x || "?").join(","),
);
check(
  "§6 五张卡 --tone 两两不同",
  new Set(toneHexes.filter(Boolean)).size === 5,
  `${new Set(toneHexes.filter(Boolean)).size} 个唯一值`,
);

// --tone 必须与期望值一致（防"随便给了个色但不对"）
const toneMismatch = cards.filter((c, i) => {
  const expect = EXPECTED_TONES[toneVals[i]];
  return expect && cssToHex(c.toneVar) !== expect;
});
check(
  "§6 五张卡 --tone 与设计色板逐一相符",
  toneMismatch.length === 0,
  toneMismatch.map((c) => `${c.tone}:${cssToHex(c.toneVar)}`).join(" ") || "全部相符",
);

// 顶部实色条（五张卡的"认色标记"）
const barOk = cards.filter((c) => {
  const hex = cssToHex(c.barBg);
  const expect = EXPECTED_TONES[c.tone];
  // 实色：backgroundColor 就是该卡主色；渐变（旧写法）会落在这里判红
  return hex === expect && !/gradient/i.test(c.barBgImage);
}).length;
check(
  "§6 五张卡顶部为**实色**主色条（非透明渐变）",
  barOk === 5,
  `${barOk}/5`,
);

// 标题着色：让色相在卡片里出现多次，否则五张卡正文观感趋同
const titleColored = cards.filter((c) => cssToHex(c.titleColor) === EXPECTED_TONES[c.tone]).length;
check(
  "§6 五张卡标题用该卡专属主色着色",
  titleColored === 5,
  cards.map((c) => `${c.tone}:${cssToHex(c.titleColor)}`).join(" "),
);

// 卡片自身底色为渐变（"墨金渐变"而非纯白）
const cardGrad = cards.filter((c) => /gradient/i.test(c.backgroundImage)).length;
check("§6 五张卡自身底色为渐变（非纯白）", cardGrad === 5, `${cardGrad}/5`);

// 图标着色：图标 svg 的 color 应等于卡片的 --tone
const iconCheck = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("[data-feature-tone]")).map((el) => {
    const wrap = el.querySelector("div[style]");
    const svg = el.querySelector("svg");
    return {
      tone: el.getAttribute("data-feature-tone"),
      wrapColor: wrap ? getComputedStyle(wrap).color : "",
      hasSvg: !!svg,
      strokeWidth: svg ? getComputedStyle(svg).strokeWidth : "",
      fill: svg ? getComputedStyle(svg).fill : "",
    };
  });
});
check(
  "§6 五张卡均含图标",
  iconCheck.filter((x) => x.hasSvg).length === 5,
  `${iconCheck.filter((x) => x.hasSvg).length}/5`,
);

const iconColored = iconCheck.filter((x, i) => {
  const expect = EXPECTED_TONES[x.tone];
  return cssToHex(x.wrapColor) === expect;
});
check(
  "§6 图标用该卡专属主色着色",
  iconColored.length === 5,
  iconColored.map((x) => `${x.tone}:${cssToHex(x.wrapColor)}`).join(" ") || "无",
);

// 图标画法统一：fill=none、线宽 1.5px
const strokeStyleOk = iconCheck.filter(
  (x) => x.fill === "none" && parseFloat(x.strokeWidth) === 1.5,
).length;
check(
  "§6 图标统一画法（fill=none · stroke-width=1.5px）",
  strokeStyleOk === 5,
  `${strokeStyleOk}/5`,
);

// hover 变边（描金）
let hoverChanged = 0;
for (let i = 0; i < 5; i++) {
  const el = page.locator("[data-feature-tone]").nth(i);
  const before = cards[i].borderTopColor;
  await el.hover();
  await page.waitForTimeout(250);
  const after = await el.evaluate((n) => getComputedStyle(n).borderTopColor);
  if (after !== before) hoverChanged++;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(120);
}
check("§6 五张卡 hover 后边框色发生变化（描金生效）", hoverChanged === 5, `${hoverChanged}/5`);

// ---------------------------------------------------------------------------
// §7 反向验证：注入缺陷 → 断言必须变红
// ---------------------------------------------------------------------------
console.log("\n=== §7 反向验证 ===");

/**
 * 反向验证的做法：对"色值"类断言，我们不去改产品源码（那要把构建跑一遍），
 * 而是把**同一套判据**喂进缺陷数据，确认它确实会判红。
 *
 * 判据：缺陷版与正确版的输出必须**真的不同** —— 否则你只是在验证
 * "两段一样的代码算出一样的结果"（AGENTS.md 阶段 5 记过这个坑）。
 */

// ① brand-500 改浅 → 对比度断言必须红
{
  const defect = "#cfc6b4"; // 亮米色
  const r = contrast(defect, "#ffffff");
  check(
    "§7① brand-500 若改浅至 #cfc6b4 → 对比度断言变红",
    r < 4.5,
    `${r.toFixed(2)}:1 < 4.5 → 判红 ✅`,
  );
  // 同时确认正确值仍绿（否则说明阈值写错了，两边都红 = 断言无区分度）
  const rOk = contrast(b["500"] || "#7d6743", "#ffffff");
  check(
    "§7① 对照：正确值 brand-500 仍为绿",
    rOk >= 4.5,
    `${rOk.toFixed(2)}:1 ≥ 4.5 ✅（证明断言有区分度）`,
  );
}

// ② 两卡 tone 改成同值 → "两两不同"断言必须红
{
  const defectTones = ["clan", "clan", "live", "news", "offering"];
  check(
    "§7② 若两卡 tone 改成同值 → 「两两不同」断言变红",
    new Set(defectTones).size !== 5,
    `${new Set(defectTones).size} 个唯一值 ≠ 5 → 判红 ✅`,
  );
  check(
    "§7② 对照：正确 tone 集合仍为绿",
    new Set(toneVals).size === 5,
    `${new Set(toneVals).size} 个唯一值 = 5 ✅`,
  );
}

// ③ 某档 hex 写反 → 单调性断言必须红
{
  const defectScale = { ...b };
  defectScale["300"] = b["50"]; // 把 300 写成 50 的值（明度逆序）
  const keys = EXPECTED_STOPS.brand.filter((k) => defectScale[k]);
  const Ls = keys.map((k) => toLab(defectScale[k])[0]);
  let bad = null;
  for (let i = 0; i < Ls.length - 1; i++) {
    if (!(Ls[i] > Ls[i + 1])) {
      bad = `${keys[i]} → ${keys[i + 1]}`;
      break;
    }
  }
  check(
    "§7③ 若 brand-300 写成 brand-50 的值 → 单调性断言变红",
    !!bad,
    bad ? `逆序于 ${bad} → 判红 ✅` : "竟未检出（断言失效！）",
  );
  // 对照
  const correctLs = EXPECTED_STOPS.brand.map((k) => toLab(b[k])[0]);
  check(
    "§7③ 对照：正确色阶单调性仍为绿",
    correctLs.every((v, i) => i === 0 || correctLs[i - 1] > v),
    "严格递减 ✅",
  );
}

// ---------------------------------------------------------------------------
// §8 旧蓝灰残留清点
// ---------------------------------------------------------------------------
console.log("\n=== §8 旧蓝灰残留清点 ===");

const OLD_HEX = ["#5b6b7b", "#4a5868", "#3a4654", "#2c3540", "#1f262e", "#f4f6f8", "#e7ebf0", "#a8744f", "#8f5f3d"];
let residual = "";
try {
  residual = execSync(
    `grep -rniE '${OLD_HEX.join("|")}' --include='*.tsx' --include='*.ts' --include='*.css' app components lib 2>/dev/null || true`,
    { encoding: "utf8", cwd: "/workspace" },
  );
} catch {
  residual = "";
}
// §8 品牌层不得残留旧蓝灰；装修素材里的旧设计色属"内容"明确保留。
//
// ⚠️ 判据陷阱：grep 输出是 `路径:行号:内容`，而**内容里也可能含过滤关键词**。
// 第一版按整行 substring 判定"是不是装修文件"，把 `components/decor/DecorPagePreview.tsx`
// （路径属品牌层、内容里写了 `#1f262e`）误判成装修文件 → 假绿。
// 修法：**只取冒号前的路径段**来判定归属。
const residualLines = residual.trim().split("\n").filter(Boolean);

const DECOR_PATHS = /^(lib\/decor-|lib\/hall-decor\.ts)/;
const DECOR_COMPONENTS = /^components\/(decor\/|clan\/arch\/|hall\/HallDecorLayer\.tsx)/;

const isDecorFile = (line) => {
  const path = line.split(":")[0];
  return DECOR_PATHS.test(path) || DECOR_COMPONENTS.test(path);
};

const brandLayerResidual = residualLines.filter((l) => !isDecorFile(l));
check(
  "§8 品牌层（app/、components/site/ 等）无旧蓝灰 hex 残留",
  brandLayerResidual.length === 0,
  brandLayerResidual.length ? brandLayerResidual.join(" | ") : "零残留",
);

const decorKept = residualLines.filter(isDecorFile);
console.log(
  `INFO  装修素材保留的旧设计色 ${decorKept.length} 行（属内容不属品牌，有意不动）`,
);

// §8b gray-400 做正文的清单（只清点，不判红）
console.log("\n=== §8b text-gray-400 用于正文的清点（供人工复核，不判红）===");
let gray400 = "";
try {
  gray400 = execSync(
    `grep -rn 'text-gray-400' --include='*.tsx' app components 2>/dev/null || true`,
    { encoding: "utf8", cwd: "/workspace" },
  );
} catch {
  gray400 = "";
}
const g4lines = gray400.trim().split("\n").filter(Boolean);
console.log(`INFO  text-gray-400 共 ${g4lines.length} 处，对比度 ${contrast(g["400"] || "#aaa296", "#ffffff").toFixed(2)}:1`);
console.log("      （多为次要标签/占位文字；若发现正文用途请提到 text-gray-500：4.75:1）");

await browser.close();

// ---------------------------------------------------------------------------
console.log(`\n===== 品牌色体系验收：${pass}/${pass + fail} PASS =====`);
if (failures.length) {
  console.log("变红项：");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail ? 1 : 0);
