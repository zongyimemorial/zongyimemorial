// 生成品牌 SVG 配图资源（沉静蓝灰 brand + 暖铜 accent）
// 运行：node scripts/gen-assets.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "assets");
mkdirSync(OUT, { recursive: true });

// 品牌色
const C = {
  ink900: "#1f262e",
  ink800: "#2c3540",
  ink700: "#3a4654",
  ink600: "#4a5868",
  ink500: "#5b6b7b",
  ink100: "#e7ebf0",
  ink50: "#f4f6f8",
  accent: "#a8744f",
  accentD: "#8f5f3d",
  warm: "#d8a878",
};

const write = (name, svg) => {
  writeFileSync(join(OUT, name), svg.trim() + "\n");
  console.log("✓", name);
};

/* ============ 首页主视觉 hero ============ */
const hero = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 640" width="1280" height="640" role="img" aria-label="思念长明的数字纪念夜景">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.ink900}"/>
      <stop offset="0.55" stop-color="${C.ink800}"/>
      <stop offset="1" stop-color="${C.ink600}"/>
    </linearGradient>
    <radialGradient id="moon" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fbf6ee"/>
      <stop offset="0.7" stop-color="${C.warm}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${C.warm}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.ink700}"/>
      <stop offset="1" stop-color="${C.ink900}"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="640" fill="url(#sky)"/>
  <circle cx="980" cy="150" r="220" fill="url(#moon)"/>
  <circle cx="980" cy="150" r="62" fill="#fbf6ee" opacity="0.92"/>
  <!-- 远山 -->
  <path d="M0 470 L180 360 L320 430 L470 340 L640 440 L820 350 L1000 440 L1180 360 L1280 430 L1280 640 L0 640 Z" fill="${C.ink700}" opacity="0.55"/>
  <path d="M0 520 L220 430 L400 500 L560 420 L760 510 L940 430 L1120 510 L1280 450 L1280 640 L0 640 Z" fill="${C.ink800}" opacity="0.8"/>
  <!-- 水面 -->
  <rect y="520" width="1280" height="120" fill="url(#water)"/>
  <path d="M0 520 L1280 520" stroke="${C.warm}" stroke-opacity="0.18" stroke-width="1"/>
  <ellipse cx="980" cy="540" rx="70" ry="10" fill="${C.warm}" opacity="0.16"/>
  <!-- 漂浮的灯 -->
  ${[ [180,360,10],[300,300,7],[430,420,6],[150,440,6],[520,250,8],[760,300,7],[700,400,5],[1080,360,6] ]
    .map(([x,y,r])=>`<g><circle cx="${x}" cy="${y}" r="${r+5}" fill="${C.warm}" opacity="0.18"/><circle cx="${x}" cy="${y}" r="${r}" fill="#f6c98a"/></g>`).join("\n  ")}
  <!-- 前景烛台 -->
  <g transform="translate(250 430)">
    <rect x="-26" y="60" width="52" height="14" rx="4" fill="${C.ink600}"/>
    <rect x="-14" y="0" width="28" height="64" rx="6" fill="${C.ink500}"/>
    <rect x="-14" y="0" width="10" height="64" rx="6" fill="${C.ink600}" opacity="0.6"/>
    <ellipse cx="0" cy="-6" rx="9" ry="14" fill="${C.warm}" opacity="0.35"/>
    <path d="M0 -34 C 12 -22 12 -6 0 0 C -12 -6 -12 -22 0 -34 Z" fill="#f6c98a"/>
    <circle cx="0" cy="-16" r="5" fill="#fff3df"/>
  </g>
</svg>`;

/* ============ 新闻栏目封面（800x450） ============ */
function coverArt(opts) {
  const { bg1, bg2, glyph, title, sub } = opts;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#g)"/>
  <text x="620" y="360" font-family="serif" font-size="320" fill="#ffffff" fill-opacity="0.06">${glyph}</text>
  <circle cx="120" cy="120" r="60" fill="#ffffff" fill-opacity="0.07"/>
  <text x="56" y="300" font-family="sans-serif" font-size="42" font-weight="700" fill="#ffffff">${title}</text>
  <text x="58" y="338" font-family="sans-serif" font-size="18" fill="#ffffff" fill-opacity="0.7">${sub}</text>
</svg>`;
}
const coverPolicy = coverArt({ bg1: C.ink600, bg2: C.ink800, glyph: "法", title: "政策解读", sub: "备案 · 合规 · 行业政策" });
const coverCulture = coverArt({ bg1: C.ink500, bg2: C.ink700, glyph: "礼", title: "殡葬文化", sub: "生命文化 · 数字礼仪" });
const coverStory = coverArt({ bg1: C.accent, bg2: C.ink600, glyph: "念", title: "追思故事", sub: "记忆 · 缅怀 · 传承" });
const coverAnnounce = coverArt({ bg1: C.ink700, bg2: C.ink900, glyph: "告", title: "平台公告", sub: "动态 · 功能 · 须知" });

/* ============ 商品封面（800x600） ============ */
function prodArt(opts) {
  const { bg1, bg2, inner } = opts;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" role="img" aria-label="宗忆堂商品">
  <defs>
    <linearGradient id="pb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#pb)"/>
  <circle cx="640" cy="120" r="160" fill="#ffffff" fill-opacity="0.05"/>
  <g transform="translate(400 300)">${inner}</g>
</svg>`;
}

// 数字纪念馆：牌坊 + 莲花 + 灯
const prodHall = prodArt({ bg1: C.ink600, bg2: C.ink800, inner: `
  <g stroke="${C.warm}" stroke-width="6" fill="none" stroke-linecap="round">
    <path d="M-150 -120 H150"/>
    <path d="M-150 -120 L-120 40 H-90 L-90 -120"/>
    <path d="M150 -120 L120 40 H90 L90 -120"/>
    <path d="M-40 -120 H40"/>
    <path d="M-40 -120 L-30 40 H30 L40 -120"/>
  </g>
  <g transform="translate(0 90)">
    <path d="M0 40 C -40 -10 -40 -50 0 -70 C 40 -50 40 -10 0 40 Z" fill="${C.warm}" opacity="0.85"/>
    <path d="M0 40 C -22 -6 -22 -40 0 -54 C 22 -40 22 -6 0 40 Z" fill="#f6c98a"/>
  </g>
  <circle cx="0" cy="-150" r="9" fill="#f6c98a"/>
` });

// 云祭扫：云 + 献花的手
const prodCloud = prodArt({ bg1: C.ink500, bg2: C.ink700, inner: `
  <path d="M-120 -40 a50 50 0 0 1 40 -78 a60 60 0 0 1 110 -8 a44 44 0 0 1 78 40 a40 40 0 0 1 -8 86 H-90 a46 46 0 0 1 -30 -40 Z" fill="#ffffff" fill-opacity="0.85"/>
  <g transform="translate(0 70)">
    <path d="M0 40 C -30 -6 -30 -44 0 -60 C 30 -44 30 -6 0 40 Z" fill="${C.warm}"/>
    <path d="M0 40 C -16 -2 -16 -34 0 -46 C 16 -34 16 -2 0 40 Z" fill="#f6c98a"/>
    <path d="M-30 30 q30 36 60 0" stroke="${C.ink900}" stroke-width="5" fill="none"/>
  </g>
` });

// 虚拟献花/点灯
const prodFlower = prodArt({ bg1: C.accent, bg2: C.ink600, inner: `
  <g stroke="${C.ink900}" stroke-width="5" fill="none" stroke-linecap="round">
    <path d="M0 120 V-10"/>
  </g>
  <g fill="${C.warm}">
    <circle cx="0" cy="-40" r="22"/>
    <circle cx="-30" cy="-20" r="18"/>
    <circle cx="30" cy="-20" r="18"/>
    <circle cx="-18" cy="6" r="16"/>
    <circle cx="18" cy="6" r="16"/>
  </g>
  <circle cx="0" cy="-22" r="14" fill="#f6c98a"/>
` });

// 纪念服务：羽毛笔 + 卷轴
const prodService = prodArt({ bg1: C.ink700, bg2: C.ink900, inner: `
  <rect x="-110" y="-60" width="220" height="120" rx="10" fill="#ffffff" fill-opacity="0.9"/>
  <g stroke="${C.ink500}" stroke-width="4" opacity="0.5">
    <path d="M-80 -20 H80"/><path d="M-80 0 H80"/><path d="M-80 20 H60"/>
  </g>
  <g transform="translate(70 -90) rotate(35)" stroke="${C.warm}" stroke-width="6" fill="${C.warm}">
    <path d="M0 0 C 40 -10 60 -50 40 -100 C 20 -60 4 -36 0 0 Z"/>
    <path d="M0 0 L-6 60" stroke="${C.ink900}" stroke-width="5"/>
  </g>
` });

// 纪念视频：胶片 + 播放
const prodVideo = prodArt({ bg1: C.ink600, bg2: C.ink800, inner: `
  <rect x="-120" y="-80" width="240" height="160" rx="14" fill="#ffffff" fill-opacity="0.12" stroke="${C.warm}" stroke-width="5"/>
  <circle cx="0" cy="0" r="44" fill="${C.warm}"/>
  <path d="M-14 -22 L26 0 L-14 22 Z" fill="${C.ink900}"/>
  <g fill="${C.ink900}" opacity="0.5">
    <rect x="-120" y="-80" width="14" height="160"/><rect x="106" y="-80" width="14" height="160"/>
  </g>
` });

// 扫码云碑：二维码 + 碑
const prodQr = prodArt({ bg1: C.ink500, bg2: C.ink700, inner: `
  <g fill="#ffffff" fill-opacity="0.92">
    <rect x="-70" y="-90" width="140" height="140" rx="8"/>
  </g>
  <g fill="${C.ink900}">
    <rect x="-58" y="-78" width="34" height="34"/><rect x="24" y="-78" width="34" height="34"/><rect x="-58" y="4" width="34" height="34"/>
    <rect x="-46" y="-66" width="10" height="10" fill="#fff"/><rect x="36" y="-66" width="10" height="10" fill="#fff"/><rect x="-46" y="16" width="10" height="10" fill="#fff"/>
    <rect x="-10" y="-66" width="12" height="12"/><rect x="8" y="-44" width="12" height="12"/><rect x="-10" y="-30" width="12" height="12"/>
    <rect x="24" y="-30" width="12" height="12"/><rect x="44" y="-50" width="12" height="12"/><rect x="44" y="4" width="12" height="12"/>
    <rect x="8" y="24" width="12" height="12"/><rect x="-30" y="24" width="12" height="12"/>
  </g>
  <rect x="-22" y="70" width="44" height="20" rx="4" fill="${C.warm}"/>
` });

// 实体祭祀用品：花圈 + 香
const prodSupplies = prodArt({ bg1: C.accentD, bg2: C.ink700, inner: `
  <circle cx="0" cy="0" r="86" fill="none" stroke="${C.warm}" stroke-width="14"/>
  <g fill="${C.warm}">
    ${Array.from({length:16}).map((_,i)=>{const a=i/16*Math.PI*2;const x=Math.cos(a)*86,y=Math.sin(a)*86;return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13"/>`}).join("\n    ")}
  </g>
  <circle cx="0" cy="0" r="30" fill="#f6c98a"/>
` });

/* ============ 区块插画 ============ */
const illusAbout = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 460" width="600" height="460" role="img" aria-label="关于宗忆堂">
  <rect width="600" height="460" rx="18" fill="${C.ink100}"/>
  <circle cx="300" cy="200" r="120" fill="${C.ink700}" opacity="0.08"/>
  <g transform="translate(300 210)">
    <path d="M0 70 C -56 -8 -56 -86 0 -120 C 56 -86 56 -8 0 70 Z" fill="${C.warm}" opacity="0.9"/>
    <path d="M0 70 C -30 -4 -30 -66 0 -94 C 30 -66 30 -4 0 70 Z" fill="#f6c98a"/>
    <path d="M-70 30 q70 46 140 0" stroke="${C.accent}" stroke-width="8" fill="none" stroke-linecap="round"/>
  </g>
  <text x="300" y="400" text-anchor="middle" font-family="sans-serif" font-size="22" fill="${C.ink700}">以数字方式，留存思念</text>
</svg>`;

const illusProcess = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300" width="600" height="300" role="img" aria-label="服务流程">
  <rect width="600" height="300" rx="18" fill="${C.ink50}"/>
  ${[["1","注册实名","注册并完成实名"],["2","创建纪念馆","建立纪念空间"],["3","追思缅怀","献花 · 点灯 · 留言"]]
    .map((s,i)=>{const x=110+i*190;return `
    <g transform="translate(${x} 150)">
      <circle r="46" fill="${C.ink700}"/>
      <text y="10" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="700" fill="#fff">${s[0]}</text>
      <text y="84" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="600" fill="${C.ink900}">${s[1]}</text>
      <text y="110" text-anchor="middle" font-family="sans-serif" font-size="14" fill="${C.ink500}">${s[2]}</text>
    </g>
    ${i<2?`<path d="M${x+58} 150 H${x+132}" stroke="${C.warm}" stroke-width="4" stroke-dasharray="6 6"/>`:""}`}).join("\n  ")}
</svg>`;

const illusFaq = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420" width="600" height="420" role="img" aria-label="常见问题">
  <rect width="600" height="420" rx="18" fill="${C.ink100}"/>
  <circle cx="300" cy="170" r="110" fill="${C.ink700}" opacity="0.1"/>
  <g transform="translate(300 150)" fill="none" stroke="${C.accent}" stroke-width="14" stroke-linecap="round">
    <path d="M-66 0 a66 66 0 1 1 132 0 c0 26 -22 36 -22 60"/>
  </g>
  <circle cx="300" cy="214" r="11" fill="${C.accent}"/>
  <text x="300" y="320" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="600" fill="${C.ink800}">关于纪念服务，你可能想问</text>
</svg>`;

/* ============ 纪念馆 / 直播封面 ============ */
const hallCover = prodHall;
const liveCover = prodCloud;

/* ============ 输出 ============ */
write("hero.svg", hero);
write("cover-policy.svg", coverPolicy);
write("cover-culture.svg", coverCulture);
write("cover-story.svg", coverStory);
write("cover-announcement.svg", coverAnnounce);
write("prod-hall.svg", prodHall);
write("prod-cloud.svg", prodCloud);
write("prod-flower.svg", prodFlower);
write("prod-service.svg", prodService);
write("prod-video.svg", prodVideo);
write("prod-qr.svg", prodQr);
write("prod-supplies.svg", prodSupplies);
write("illus-about.svg", illusAbout);
write("illus-process.svg", illusProcess);
write("illus-faq.svg", illusFaq);
write("hall-cover.svg", hallCover);
write("live-cover.svg", liveCover);
console.log("\n全部配图已生成至 public/assets/");
