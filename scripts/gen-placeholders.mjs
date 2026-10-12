// 一次性生成「宗忆堂」品牌风格的商品占位图（深墨褐底 + 香槟金 + 星点 + 标注产品名）。
// 与 LOGO 同色系：底色取 LOGO 主基调 #403010 的墨褐渐变，高光用品牌香槟金 #d8b878。
// 这些占位图用于「按分类/按服务」统一补齐 coverImage，解决装饰套件/空间模板/典藏礼包、
// 云存储、纪念服务、纪念短片此前无图（灰底块）或共用一张通用图的问题。
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public/assets");

// ===== 品牌色 =====
const BG_TOP = "#2a2316";
const BG_MID = "#403010"; // LOGO 主基调
const BG_BOT = "#181208";
const GOLD = "#d8b878";
const GOLD_BRIGHT = "#ecd29a";
const TEXT = "#e9d9b8";

// ===== 确定性星点（LCG，保证每次生成一致）=====
function starField() {
  let s = 20261021;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let out = "";
  for (let i = 0; i < 46; i++) {
    const x = (rnd() * 752 + 24).toFixed(1);
    const y = (rnd() * 552 + 24).toFixed(1);
    const r = (rnd() * 1.1 + 0.5).toFixed(2);
    const o = (rnd() * 0.35 + 0.12).toFixed(2);
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="${GOLD_BRIGHT}" opacity="${o}"/>`;
  }
  return out;
}

// ===== 图标（在 0..120 局部坐标内绘制，stroke=GOLD）=====
const ICON = {
  bio: `<path d="M60 34 C50 26 30 28 22 34 L22 92 C30 86 50 84 60 92 Z" fill="none" stroke="${GOLD}" stroke-width="5" stroke-linejoin="round"/><path d="M60 34 C70 26 90 28 98 34 L98 92 C90 86 70 84 60 92 Z" fill="none" stroke="${GOLD}" stroke-width="5" stroke-linejoin="round"/><path d="M60 34 L60 92" stroke="${GOLD}" stroke-width="5"/>`,
  obituary: `<rect x="34" y="24" width="52" height="72" rx="6" fill="none" stroke="${GOLD}" stroke-width="5"/><line x1="44" y1="44" x2="76" y2="44" stroke="${GOLD}" stroke-width="5" stroke-linecap="round"/><line x1="44" y1="58" x2="76" y2="58" stroke="${GOLD}" stroke-width="5" stroke-linecap="round"/><line x1="44" y1="72" x2="64" y2="72" stroke="${GOLD}" stroke-width="5" stroke-linecap="round"/>`,
  video: `<rect x="30" y="38" width="60" height="44" rx="6" fill="none" stroke="${GOLD}" stroke-width="5"/><circle cx="42" cy="48" r="3" fill="${GOLD}"/><circle cx="60" cy="48" r="3" fill="${GOLD}"/><circle cx="78" cy="48" r="3" fill="${GOLD}"/><circle cx="42" cy="72" r="3" fill="${GOLD}"/><circle cx="60" cy="72" r="3" fill="${GOLD}"/><circle cx="78" cy="72" r="3" fill="${GOLD}"/><path d="M54 54 L70 60 L54 66 Z" fill="${GOLD}"/>`,
  meeting: `<circle cx="44" cy="50" r="12" fill="none" stroke="${GOLD}" stroke-width="5"/><path d="M26 92 C26 74 62 74 62 92" fill="none" stroke="${GOLD}" stroke-width="5"/><circle cx="80" cy="56" r="10" fill="none" stroke="${GOLD}" stroke-width="5"/><path d="M66 92 C66 78 94 78 94 92" fill="none" stroke="${GOLD}" stroke-width="5"/>`,
  qr: `<rect x="34" y="34" width="52" height="52" rx="6" fill="none" stroke="${GOLD}" stroke-width="5"/><rect x="42" y="42" width="14" height="14" fill="${GOLD}"/><rect x="64" y="42" width="14" height="14" fill="none" stroke="${GOLD}" stroke-width="4"/><rect x="42" y="64" width="14" height="14" fill="none" stroke="${GOLD}" stroke-width="4"/><rect x="64" y="64" width="14" height="14" fill="${GOLD}"/>`,
  play: `<circle cx="60" cy="60" r="34" fill="none" stroke="${GOLD}" stroke-width="5"/><path d="M52 44 L76 60 L52 76 Z" fill="${GOLD}"/>`,
  kit: `<rect x="28" y="32" width="64" height="56" rx="4" fill="none" stroke="${GOLD}" stroke-width="5"/><rect x="40" y="44" width="40" height="32" rx="2" fill="none" stroke="${GOLD}" stroke-width="4"/>`,
  tpl: `<path d="M24 52 L60 30 L96 52" fill="none" stroke="${GOLD}" stroke-width="5" stroke-linejoin="round"/><line x1="18" y1="52" x2="102" y2="52" stroke="${GOLD}" stroke-width="5" stroke-linecap="round"/><rect x="34" y="56" width="10" height="34" fill="none" stroke="${GOLD}" stroke-width="5"/><rect x="55" y="56" width="10" height="34" fill="none" stroke="${GOLD}" stroke-width="5"/><rect x="76" y="56" width="10" height="34" fill="none" stroke="${GOLD}" stroke-width="5"/><line x1="20" y1="90" x2="100" y2="90" stroke="${GOLD}" stroke-width="5" stroke-linecap="round"/>`,
  bundle: `<rect x="30" y="48" width="60" height="44" rx="4" fill="none" stroke="${GOLD}" stroke-width="5"/><line x1="60" y1="48" x2="60" y2="92" stroke="${GOLD}" stroke-width="5"/><path d="M60 48 C50 36 36 40 44 30 C52 24 60 40 60 48 Z" fill="none" stroke="${GOLD}" stroke-width="5"/><path d="M60 48 C70 36 84 40 76 30 C68 24 60 40 60 48 Z" fill="none" stroke="${GOLD}" stroke-width="5"/>`,
  cloud: `<path d="M40 84 C24 84 22 64 38 62 C38 46 64 44 68 60 C86 58 90 80 74 84 Z" fill="none" stroke="${GOLD}" stroke-width="5" stroke-linejoin="round"/>`,
};

// ===== 模板 =====
function svg({ eyebrow, label, icon }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG_TOP}"/>
      <stop offset="0.55" stop-color="${BG_MID}"/>
      <stop offset="1" stop-color="${BG_BOT}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.38" r="0.6">
      <stop offset="0" stop-color="${GOLD_BRIGHT}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${GOLD_BRIGHT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <rect width="800" height="600" fill="url(#glow)"/>
  ${starField()}
  <rect x="24" y="24" width="752" height="552" rx="14" fill="none" stroke="${GOLD}" stroke-opacity="0.45" stroke-width="2"/>
  <g transform="translate(340,250)">${ICON[icon]}</g>
  <text x="400" y="438" text-anchor="middle" font-family="'Noto Serif SC','Songti SC',serif" font-size="22" letter-spacing="6" fill="${GOLD_BRIGHT}" opacity="0.9">${eyebrow}</text>
  <text x="400" y="486" text-anchor="middle" font-family="'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif" font-size="38" font-weight="700" letter-spacing="2" fill="${TEXT}">${label}</text>
</svg>`;
}

// ===== 要生成的图（文件名 → 内容）=====
const ITEMS = [
  ["prod-svc-bio.svg", { eyebrow: "纪念服务", label: "生平传记代写", icon: "bio" }],
  ["prod-svc-obituary.svg", { eyebrow: "纪念服务", label: "电子讣告", icon: "obituary" }],
  ["prod-svc-video.svg", { eyebrow: "纪念服务", label: "追思纪念视频", icon: "video" }],
  ["prod-svc-meeting.svg", { eyebrow: "纪念服务", label: "线上追思会", icon: "meeting" }],
  ["prod-svc-qr.svg", { eyebrow: "纪念服务", label: "扫码云碑", icon: "qr" }],
  ["prod-video.svg", { eyebrow: "午夜悄悄话", label: "纪念短片", icon: "play" }],
  ["prod-decor-kit.svg", { eyebrow: "纪念馆装修", label: "装饰套件", icon: "kit" }],
  ["prod-decor-tpl.svg", { eyebrow: "纪念馆装修", label: "空间模板", icon: "tpl" }],
  ["prod-decor-bundle.svg", { eyebrow: "纪念馆装修", label: "典藏礼包", icon: "bundle" }],
  ["prod-storage.svg", { eyebrow: "云存储", label: "云存储空间", icon: "cloud" }],
];

mkdirSync(OUT, { recursive: true });
for (const [file, data] of ITEMS) {
  writeFileSync(join(OUT, file), svg(data), "utf8");
  console.log("generated:", file);
}
console.log(`\n✅ 共生成 ${ITEMS.length} 张品牌占位图 → ${OUT}`);
