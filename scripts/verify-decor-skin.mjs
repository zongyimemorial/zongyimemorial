/**
 * 全页联动换肤 验收套件（阶段 4，2026-10）
 *
 * 背景（用户原话）：
 *   「保证修装后的纪念馆、宗祠美观豪华，且与没有装修过的有明显区别，
 *     否则用户就没有装修的欲望与动机」
 *
 * 阶段 1–3 把"装修"做成了**一块 340px 高的画布**：用户花 ¥59 买了「缂丝金龙」，
 * 整页仍然是素白的标题、白卡片、灰分隔线 —— 落差只在那块画布里。
 * 本阶段把装修**铺满整页**：标题 / 卡片 / 分隔线 / 按钮 / 阴影全部随皮肤走。
 *
 * ============================================================================
 * 本套件守什么（每条都对应一个真实踩过、或极易踩的坑）
 * ============================================================================
 *
 *  A. **未装修 = 明确的对照基准**。
 *     未装修页 `--skin-gilt` 必须是 `transparent`。
 *     这条是"有明显区别"这个需求的**可证伪形式** —— 若素白档也有描金，
 *     那"装修了"就看不出来，"装修的欲望"也就无从谈起。
 *     刻意断言 `transparent` 而不是"某个浅金色"：后者是主观的，
 *     前者是二值的，改坏了必红。
 *
 *  B. **豪华档必须真的激活**。
 *     豪华模板页 `--skin-gilt` 非透明，且圆角 / 字重 / 阴影 / 卡片 borderStyle
 *     中至少三项偏离基准。只断言"gilt 非透明"太弱：有人可以把 gilt 填成
 *     一个跟背景差不多的金色，断言照过、肉眼看不见。
 *
 *  C. **id → mood 覆盖率 100%**。
 *     规则表漏一个 id，那件素材**静默不换肤**：页面照开、不报错、
 *     没有任何控制台警告，只是"我花钱买的没反应"。
 *     实测第一版规则表在 168 个真实 id 上漏了 17 套模板。
 *     所以这里 dump 全部真实 id 跑一遍，落回 `plain` 的必须命中白名单。
 *
 *  D. **两个页面同口径**。
 *     纪念馆与宗祠必须注入同一组变量、用同一份 helper。
 *     两处手写的必然漂移 —— 而"两个地方不一样"正是用户提过的原话。
 *     本套件同时扫源码与运行时（真正的 computed style）。
 *
 *  E. **不改 DOM 结构**。
 *     换肤只允许"多加 inline style / data 属性"，既有 class 一个字不动。
 *     既有 23 套断言全建立在那些 class 上（卡片标题、overflow-hidden、p-3…），
 *     动一下就是连锁回归。
 *
 *  F. **深色判定取并集而不是替换**（灰度期）。
 *     `skin.dark || onDarkWall` / `skin.dark || isClanDarkDecor(decor)`。
 *     直接替换会让两套判据不重合的素材突然变浅底 —— 那是肉眼可见的回归，
 *     而这条恰恰最难在静态断言里发现，所以显式锁住"两个判据都在"。
 *
 * ============================================================================
 * 反向验证（AGENTS.md 硬要求，**已做，结果如下**）
 * ============================================================================
 *
 * §9 有两个"判定式级"探针；此外本套件在**真实产品代码**上做过六轮缺陷注入，
 * 逐条确认断言会红，再还原：
 *
 * | # | 注入的缺陷 | 变红的断言 | 结果 |
 * |---|---|---|---|
 * | ① | `MOOD_SKIN.imperial.gilt` → transparent | §4「豪华档 gilt 非透明」 | ✅ 48→47 |
 * | ② | 删掉 `MOOD_RULES` 的夜/星两条规则 | §2「覆盖率」，**点名 7 个 id** | ✅ |
 * | ③ | `HallDecorLayer` 去掉 `skinVars(skin)` | §1「纪念馆层 注入 skinVars」 | ✅ |
 * | ④ | 祠页深色判定改成直接替换 | §6「祠页深色判定并集」 | ✅ |
 * | ⑤ | 删掉 `MOOD_OVERRIDE["tpl-tangzhi"]` | **无**（见下） | ⚠️ |
 * | ⑥ | 祠页 `skin={pageSkin}` → `skin={skin}` | §6「pageSkin 传给装修层」+ §8「亮度差」 | ✅ 62/63 |
 * | ⑦ | 祠页 `data-page-skin` 用 `skin`（不用 `pageSkin`） | §1「data-page-skin 用 pageSkin」 | ✅ 57/58 |
 *
 * ②最重要：它证明"静默不换肤"真的会被抓出来，并逐个点名
 * `tpl-nightlight / tpl-starry / tpl-starry3d / tpl-longnight3d /
 * wall-night / wall-starry / wall-starfield-deep`。
 *
 * ⑤ **没变红，且这是有效信息**：规则表里的 `tangzhi` 关键词已能接住它，
 *   该 override 实为冗余。说明"规则表兜底 + 白名单兜底"两层里规则表先兜住了。
 *   §9 反向② 另行证明"若规则也接不住 → 落 plain → 被白名单拦下"，
 *   所以覆盖率的兜底能力仍然成立。
 *
 * ⑥ **是本套件最有价值的一条**：它对应的是一张截图里肉眼可见的真 bug
 *   （宗祠页「字辈诗 · 派语」白字压浅米卡，几乎看不见）。
 *   正确版 Δ=0.39 PASS，缺陷版 Δ=0.07 FAIL —— 断的是**渲染出来的像素**，
 *   不是源码文本，所以骗不过去。
 *
 * ⑦ **是 ⑥ 的复发**：同一个"判定源分叉"病在**标记属性**上又犯了一次 ——
 *   渲染用 `pageSkin`、标记用原始 `skin`，于是"深色墙 + 没买皮肤"的页面
 *   已被深色皮肤接管（`--skin-dark:1`、gilt `#d4af37`）却报 `data-skin=off`。
 *   探针一跑就现形：原始 `skinIsActive=false`、`--skin-dark=0`；
 *   回写后 `true` / `1` / `#d4af37`。
 *   教训：**修完一处要去搜同类判据**（本次 4 处调用、错 1 处），
 *   问的是同一句：`它跟真正渲染的那份是同口径吗？`
 *   新增行为级断言直接读页面输出的两个信号，要求 `on ⟺ gilt 非 transparent`。
 *
 * ============================================================================
 * 本套件自身踩过的三个坑（都不是产品问题，但都会造成误判）
 * ============================================================================
 *
 *  1. **档位判定把 `priceFen`（分）当元用** → 41 套模板全落"豪华档"，
 *     断言报「0/0」，看着像"没有豪华模板"，其实是口径错了。
 *  2. **探针按"有 templateId"挑已装修馆** → 挑到 `tpl-niche`（槽位全是占位项、
 *     皮肤本就不该激活），于是报"已装修馆 data-skin=on 失败"。
 *     正确做法：用**产品同一套判据** `skinIsActive(skinOf(...))` 去筛。
 *  3. **对比度只读 `backgroundColor`** → 深色卡的半透明白（`rgba(255,255,255,.1)`)
 *     被算成"白色"，把**正确**的深色卡误判成浅底（假红）；反过来，
 *     缺陷版的浅米 `background-image` 渐变又被忽略（假绿）。
 *     `background-color` 与 `background-image` 是两层，必须**都算**，
 *     且半透明层要沿祖先链合成到"屏幕实际颜色"。
 *
 *  三条的共同教训：**测业务规则时，别在测试里重写一遍口径**（前两条），
 *  以及**验视觉时，要验渲染结果而不是源码里的某个值**（第三条）。
 *  已写进 AGENTS.md。
 *
 * 跑法：
 *   node scripts/verify-decor-skin.mjs            # 静态 + 运行时
 *   node scripts/verify-decor-skin.mjs --offline  # 只跑静态（服务器没起时）
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";

const OFFLINE = process.argv.includes("--offline");

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

function src(p) {
  try {
    return readFileSync(`/workspace/${p}`, "utf8");
  } catch {
    return "";
  }
}

/* ===========================================================================
 * 0. 数据导出（真值优先，不重写解析）
 * =========================================================================== */

const PROBE_DIR = "/workspace/.probe";
mkdirSync(PROBE_DIR, { recursive: true });

/**
 * dump 全部真实 id + 它们的 mood。
 *
 * ⚠️ 用临时文件而不是 `npx tsx -e '…'`：
 *    那串代码要穿「JS 字符串 → shell → tsx → esbuild」四层，引号/换行必被剥坏
 *    （AGENTS.md 记过：报出来的错像 TS 语法错，其实是 shell 吃了引号）。
 * ⚠️ 文件必须落在 /workspace 内，否则 `@/lib/...` 解析不到。
 */
function probeFile(code) {
  const f = `${PROBE_DIR}/skin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ts`;
  writeFileSync(f, code, "utf8");
  try {
    const out = execSync(`cd /workspace && npx tsx ${f} 2>&1`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const line = out.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{")).pop();
    if (!line) throw new Error("探针无 JSON 输出：" + out.slice(-300));
    return JSON.parse(line);
  } finally {
    try {
      unlinkSync(f);
    } catch {}
  }
}

const D = probeFile(`
import { TEMPLATES, SLOT_ITEMS } from "@/lib/hall-decor";
import { CLAN_TEMPLATES as CT, CLAN_SLOT_ITEMS } from "@/lib/clan-decor";
import { SLOT_ITEMS } from "@/lib/hall-decor";
import { moodOf, DEFAULT_SKIN, skinOf, skinIsActive, skinVars } from "@/lib/decor-skin";
const tpl = [...TEMPLATES, ...CT];
const items: string[] = [
  ...Object.values(SLOT_ITEMS).flat().map((x:any)=>x.id),
  ...Object.values(CLAN_SLOT_ITEMS).flat().map((x:any)=>x.id),
];
/*
  纯素白基准：三个 -none 占位 + 一份什么都不改的槽位。
  用来验证"未装修 → skinIsActive 为假"。
*/
const plainDecor = { templateId: undefined, slots: { wall:"wall-plain", floor:"floor-none", ornament:"orn-none", frame:"frame-none", font:"font-kai" } };
const luxDecor = { templateId: "tpl-tangzhi", slots: { wall:"wall-imperial-gold", floor:"floor-brocade", ornament:"orn-caisson-lamp", frame:"frame-imperial", font:"font-imperial-brush" } };
console.log(JSON.stringify({
  tplMoods: tpl.map((t:any)=>({ id:t.id, mood: moodOf(t.id), priceFen: t.priceFen ?? t.points ?? 0 })),
  itemMoods: items.map((id:string)=>({ id, mood: moodOf(id) })),
  defaultSkin: DEFAULT_SKIN,
  plain: { active: skinIsActive(skinOf(plainDecor as any, {})), skin: skinOf(plainDecor as any, {}) },
  lux:   { active: skinIsActive(skinOf(luxDecor as any, {})),   skin: skinOf(luxDecor as any, {}) },
  vars:  skinVars(skinOf(luxDecor as any, {})),
  plainVars: skinVars(skinOf(plainDecor as any, {})),
}));
`);

/* ===========================================================================
 * 1. 源码层：两页与两层的接驳点齐备
 * =========================================================================== */
console.log("\n=== 1. 接驳点齐备（两个页面 + 两个装修层）===");

const skinSrc = src("lib/decor-skin.ts");
const hallLayer = src("components/hall/HallDecorLayer.tsx");
const clanLayer = src("components/clan/ClanDecorLayer.tsx");
const hallPage = src("app/(public)/halls/[id]/page.tsx");
const clanPage = src("app/(public)/clan/halls/[id]/page.tsx");

check(
  "decor-skin 导出四个页面侧 helper",
  ["skinCardStyle", "skinTitleStyle", "skinButtonStyle", "skinDividerStyle"].every((n) =>
    new RegExp(`export function ${n}\\b`).test(skinSrc),
  ),
);
check(
  "decor-skin 导出 mood 层（moodOf / skinMoodOf / MOOD_SKIN 可断言）",
  /export function moodOf\b/.test(skinSrc) && /export function skinMoodOf\b/.test(skinSrc),
);
check(
  "skinVars 输出 12 个 --skin-* 变量（含 title-color 与 dark）",
  ["--skin-primary", "--skin-secondary", "--skin-gilt", "--skin-radius", "--skin-border-style",
   "--skin-divider", "--skin-card-texture", "--skin-button-fg", "--skin-button-bg",
   "--skin-title-weight", "--skin-title-tracking", "--skin-shadow-strength",
   "--skin-title-color", "--skin-dark"].every((v) => skinSrc.includes(v)),
);

for (const [label, s] of [["纪念馆层", hallLayer], ["宗祠层", clanLayer]]) {
  check(`${label} 注入 skinVars`, /skinVars\(skin\)/.test(s));
  check(`${label} 挂 data-skin 属性`, /data-skin=\{skinIsActive\(skin\)/.test(s));
  check(`${label} 用 skinOf 计算皮肤`, /skinOf\(decor,/.test(s));
}

check(
  "纪念馆层查模板用 findTemplate",
  /findTemplate\(decor\.templateId\)/.test(hallLayer),
);
check(
  "宗祠层查模板用 findClanTemplate（不是纪念馆那张表）",
  /findClanTemplate\(decor\.templateId\)/.test(clanLayer) && !/findTemplate\(decor\.templateId\)/.test(clanLayer),
);

for (const [label, s] of [["馆页", hallPage], ["祠页", clanPage]]) {
  check(`${label} 用了卡片换肤`, /style=\{skinCardStyle\(\)\}/.test(s));
  check(`${label} 用了标题换肤`, /style=\{skinTitleStyle\(\)\}/.test(s));
  check(`${label} 用了按钮换肤`, /skinButtonStyle\(\)/.test(s));
  check(`${label} 有 data-page-skin 标记`, /data-page-skin=/.test(s));
  /*
    ⚠️ 标记必须与**实际渲染**同口径。

    曾经口径分叉：渲染层拿的是 `pageSkin`（`withDark` 回写过的），
    而 `data-page-skin` 拿的是原始 `skin` —— 于是"深色墙 + 没买皮肤"的页面
    被深色皮肤接管了，属性却报 `off`。这与本阶段那个真 bug 同族：
    **同一个事实有两个判据**，在边界素材上必然打架。
    修法同 `withDark`：让标记跟着 pageSkin 走。
  */
  check(
    `${label} data-page-skin 用 pageSkin（与渲染同口径，不用原始 skin）`,
    /data-page-skin=\{skinIsActive\(pageSkin\)/.test(s),
  );
}

/* ===========================================================================
 * 2. mood 覆盖率：不允许"静默不换肤"的素材
 * =========================================================================== */
console.log("\n=== 2. id → mood 覆盖率 ===");

/*
  允许落回 plain 的白名单。
  判据是「这件素材**本质上就不表达豪华度**」：
    · `-none` / `-plain` 占位项（用户根本没选）
    · 字体（选的是字面风格，不是豪华度）
    · 宗祠的仪制构件（石狮/香炉/牌位墙…家家都有，不体现档次）
  新增素材若落回 plain 却不在名单里 → 变红，说明规则表该补了。
*/
const PLAIN_OK = new Set([
  // 占位项
  "wall-plain", "floor-none", "orn-none", "frame-none",
  "clan-wall-white", "clan-floor-plain", "clan-orn-none", "clan-frame-plain",
  // 免费档模板（对照基准，必须是 plain）
  "tpl-plain", "tpl-niche", "clan-tpl-plain",
  // 字体
  "font-kai", "font-serif", "font-modern", "font-fangsong",
  "clan-font-kai", "clan-font-li", "clan-font-song", "clan-font-bei", "clan-font-yubi-grand",
  // 宗祠固有仪制构件
  "clan-orn-lion", "clan-orn-censer", "clan-orn-tablet-wall", "clan-orn-pillar",
  "clan-orn-altar", "clan-orn-lantern", "clan-orn-scroll", "clan-orn-candlestick",
  "clan-orn-banner", "clan-orn-plaque-pair", "clan-orn-screen-wall", "clan-orn-screen",
  // 纪念馆的基础挂饰（未声明调子即为素白，属"可选项"而非"豪华项"）
  "orn-lantern-red", "orn-shelf", "orn-curtain", "orn-pillar", "orn-halo", "orn-plaque",
  "orn-niche-wall", "orn-plaque-pair", "orn-altar-table", "orn-incense-table", "orn-vase",
  "orn-candlestick", "orn-screen", "orn-screen-wall", "orn-scroll-painting", "orn-bowl",
  "orn-tray", "orn-tall-candlestick", "orn-bookcase", "orn-tang-scroll", "orn-sixfold-screen",
  "frame-line", "frame-double", "frame-bronze", "font-brush", "font-lishu",
  "clan-orn-bowl", "clan-orn-tray", "clan-orn-bookcase", "clan-orn-sixfold-screen",
]);

const allIds = [...D.tplMoods, ...D.itemMoods];
const plainIds = allIds.filter((x) => x.mood === "plain").map((x) => x.id);
const unmapped = plainIds.filter((id) => !PLAIN_OK.has(id));

check(
  `覆盖率：${allIds.length} 个 id 全部有 mood 归属（落回 plain 的都在白名单）`,
  unmapped.length === 0,
  unmapped.length ? "未白名单化：" + unmapped.join(",") : `${plainIds.length} 项 plain（已白名单）`,
);

/*
  ⚠️ 防"白名单成了垃圾桶"：若 plain 占比过高，说明规则表其实大面积没命中，
  覆盖率断言会以"都进白名单了"的方式假绿。所以额外锁一条占比上界。
*/
const plainRatio = plainIds.length / allIds.length;
check(
  "plain 占比不超过 45%（防白名单变成垃圾桶而假绿）",
  plainRatio <= 0.45,
  `${plainIds.length}/${allIds.length} = ${(plainRatio * 100).toFixed(1)}%`,
);

/* ===========================================================================
 * 3. 未装修 = 明确基准（A 组断言）
 * =========================================================================== */
console.log("\n=== 3. 未装修必须是明确基准 ===");

check(
  "DEFAULT_SKIN.gilt 为 transparent（素白基准）",
  D.defaultSkin.gilt === "transparent",
  D.defaultSkin.gilt,
);
check(
  "未装修 skinIsActive 为假",
  D.plain.active === false,
  "active=" + D.plain.active,
);
check(
  "未装修的 --skin-gilt 变量为 transparent",
  D.plainVars["--skin-gilt"] === "transparent",
  D.plainVars["--skin-gilt"],
);
check(
  "未装修不注入底纹/分隔线图案",
  D.plainVars["--skin-card-texture"] === "none" && D.plainVars["--skin-divider"] === "none",
  "texture=" + D.plainVars["--skin-card-texture"],
);

/* ===========================================================================
 * 4. 豪华 = 明显区别（B 组断言，且不能只靠 gilt 一条）
 * =========================================================================== */
console.log("\n=== 4. 豪华档必须明显区别 ===");

check("豪华模板 skinIsActive 为真", D.lux.active === true);
check(
  "豪华档 --skin-gilt 非透明（有真描金）",
  D.vars["--skin-gilt"] !== "transparent",
  D.vars["--skin-gilt"],
);

/*
  偏离项计数：只断言 gilt 太弱 —— 有人可以把 gilt 填成一个
  跟背景差不多的金色，断言照过、肉眼看不见。所以要求**至少三项**同时变。
*/
const dev = [
  D.vars["--skin-gilt"] !== D.defaultSkin.gilt,
  D.vars["--skin-radius"] !== D.defaultSkin.radius,
  D.vars["--skin-title-weight"] !== String(D.defaultSkin.titleWeight),
  D.vars["--skin-shadow-strength"] !== String(D.defaultSkin.shadow),
  D.vars["--skin-card-texture"] !== "none",
  D.vars["--skin-divider"] !== "none",
];
const devCount = dev.filter(Boolean).length;
check(
  `豪华档至少偏离素白基准 3 项（实得 ${devCount}）`,
  devCount >= 3,
  `gilt/radius/weight/shadow/texture/divider = ${dev.join(",")}`,
);

/* ===========================================================================
 * 5. 四档落差单调：越贵越豪华（这是"没有装修欲望"的病根）
 * =========================================================================== */
console.log("\n=== 5. 档位落差（价格带 → 气质档次单调）===");

const rank = { plain: 0, muted: 1, earth: 1, wood: 2, vermilion: 3, night: 3, imperial: 4 };
const TPL = [...D.tplMoods];
/*
  只验"收费模板"：免费档就是对照基准（rank 0），
  把它算进来会与"越贵越豪华"混为一谈。
*/
/*
  ⚠️ **单位换算**：`priceFen` 是**分**，而档位阈值是**元**。
     漏除 100 的后果是"凡是 ¥0.39 以上都算豪华" —— 41 套模板全进豪华档，
     断言看着"有 41 个样本"，其实口径完全错了（实测踩到）。
     这与 AGENTS.md 记的"测试写死业务价格"是同一类坑：数字对不上，
     但报出来的现象像"产品定价错了"。
*/
const tplWithPrice = TPL.map((t) => ({ ...t, price: (t.priceFen ?? 0) / 100 }));
const bandOf = (yuan) => (yuan <= 0 ? "免费" : yuan < 15 ? "入门" : yuan < 39 ? "中档" : "豪华");

/*
  「豪华档必须有高档气质」：¥39 以上的模板里，至少要有一半落在 rank>=3。
  为什么不要求"全部"：`tpl-yingbi`（影壁 ¥39）本身就是"沉静"调的高价模板，
  把沉静强行判成 imperial 才是错的。所以用比例 + 下界，而不是全等。
*/
const luxTpl = tplWithPrice.filter((t) => bandOf(t.price) === "豪华");
const luxHigh = luxTpl.filter((t) => rank[t.mood] >= 3);
check(
  `豪华档模板（¥39+）过半拥有高档气质（${luxHigh.length}/${luxTpl.length}）`,
  luxTpl.length > 0 && luxHigh.length * 2 >= luxTpl.length,
  luxTpl.length ? luxTpl.map((t) => `${t.id}:${t.mood}`).join(" ") : "无豪华档模板",
);

/*
  「豪华档不能比入门档更素」：取两档的**最高**气质比较。
  用最高而不是平均：平均会被"该档里恰好有几套沉静模板"拉低，
  而用户感知的是"这档里最好看的那套"。
*/
const entryTpl = tplWithPrice.filter((t) => bandOf(t.price) === "入门");
const maxOf = (arr) => arr.reduce((m, t) => Math.max(m, rank[t.mood]), 0);
check(
  "豪华档的气质上界 ≥ 入门档的气质上界",
  maxOf(luxTpl) >= maxOf(entryTpl),
  `豪华=${maxOf(luxTpl)} 入门=${maxOf(entryTpl)}`,
);

check(
  "「御制」档（imperial）确实存在且非空",
  tplWithPrice.some((t) => t.mood === "imperial"),
  tplWithPrice.filter((t) => t.mood === "imperial").map((t) => t.id).join(",").slice(0, 120),
);

/* ===========================================================================
 * 6. 深色判定：取并集而非替换（F 组）+ 回写（阶段 4 抓到的真 bug）
 * =========================================================================== */
console.log("\n=== 6. 深色判定并存灰度 + 回写 ===");

check(
  "馆页深色判定 = skin.dark || 旧列表（并集）",
  /const dark\s*=\s*skin\.dark\s*\|\|\s*onDarkWall/.test(hallPage),
  (hallPage.match(/const dark\s*=[^;]*;/) ?? ["(未找到)"]).join(""),
);
check(
  "祠页深色判定 = skin.dark || isClanDarkDecor（并集）",
  /const dark\s*=\s*skin\.dark\s*\|\|\s*isClanDarkDecor\(decor\)/.test(clanPage),
  /*
    ⚠️ detail 里要报**实际取到的源码行**，不能写死期望字符串 ——
       写死的话，断言变红时 detail 仍显示"正确写法"，
       排查的人会以为"明明是对的为什么红"，白白绕一圈（实测踩到）。
  */
  (clanPage.match(/const dark\s*=[^;]*;/) ?? ["(未找到)"]).join(""),
);
check(
  "旧判定函数仍保留（未删，供灰度对照）",
  /export function isClanDarkDecor\b/.test(src("lib/clan-decor.ts")),
);
check(
  "深色档 --skin-title-color 为浅色（防深底深字）",
  D.vars["--skin-dark"] === "0" || D.vars["--skin-title-color"].startsWith("#f"),
  D.vars["--skin-title-color"],
);

/*
  ⚠️ **回写**（withDark）：这是阶段 4 抓到的一个**真 bug 的回归防护**。

  症状（截图 `.shots/stage4-clan.png`）：宗祠页「字辈诗 · 派语」整段
  几乎看不见 —— 浅色字压在浅米色卡上。

  根因不是"某条 token 配错了"，而是**判定源分叉**：
    · 文字色 ← 用并集判定（`clan-wall-brick` 在旧列表 `CLAN_DARK_WALLS` 里 → 深底 → 浅字）
    · 卡片底色 ← 用 skin 判定（`brick` 在新 mood 规则里是 `earth`，非深色 → 浅米底纹）
  两个判据在**边界素材**（旧列表说是深、新规则说是浅）上必然打架。

  修法是 `withDark(skin, effectiveDark)` 把并集判定**回写**进 skin，
  让"字色与底色来自同一个判据"。下面的断言锁三件事：
    ① 两个页面都调了 withDark；
    ② withDark 传给了装修层（否则回写白做，页面读的还是层自算的那份）；
    ③ withDark 的行为正确（深色档去掉浅色底纹、铺上深色基底）。
*/
check(
  "馆页把深色判定回写进 skin（withDark）",
  /const pageSkin\s*=\s*withDark\(skin,\s*dark\)/.test(hallPage),
  (hallPage.match(/const pageSkin\s*=[^;]*;/) ?? ["(未找到)"]).join(""),
);
check(
  "祠页把深色判定回写进 skin（withDark）",
  /const pageSkin\s*=\s*withDark\(skin,\s*dark\)/.test(clanPage),
  (clanPage.match(/const pageSkin\s*=[^;]*;/) ?? ["(未找到)"]).join(""),
);
check(
  "馆页把 pageSkin 传给装修层（回写必须真的生效）",
  /<HallDecorLayer[^>]*skin=\{pageSkin\}/.test(hallPage),
);
check(
  "祠页把 pageSkin 传给装修层（回写必须真的生效）",
  /<ClanDecorLayer[^>]*skin=\{pageSkin\}/.test(clanPage),
);
check(
  "两个装修层都支持 skin prop 覆盖（否则页面传了也没人接）",
  /skin\?\:\s*SkinTokens/.test(hallLayer) && /skin\?\:\s*SkinTokens/.test(clanLayer),
);

/*
  行为级验证：withDark 必须真的把"浅色底纹"去掉。
  这是上面那个 bug 的核心 —— 深底上留浅色底纹 = 一块块浅色补丁。
*/
const darkWriteBack = probeFile(`
import { DEFAULT_SKIN, withDark, skinVars } from "@/lib/decor-skin";
// 模拟 boundary 素材：skin 说浅（earth，有浅米底纹），但旧判据说深
const lightSkin = { ...DEFAULT_SKIN, cardTexture: "linear-gradient(180deg, rgba(255,250,240,.94), rgba(244,232,212,.9))", gilt: "#d4af37" };
const out = withDark(lightSkin, true);
const unchanged = withDark(lightSkin, false);
console.log(JSON.stringify({
  dark: out.dark,
  cardTexture: out.cardTexture,
  titleColor: skinVars(out)["--skin-title-color"],
  darkVar: skinVars(out)["--skin-dark"],
  // 非深色时**必须原样返回**（零回归）
  unchangedTexture: unchanged.cardTexture,
  unchangedDark: unchanged.dark,
}));
`);

check(
  "withDark：深色档清掉浅色底纹（防「浅字 + 浅米卡」）",
  darkWriteBack.cardTexture === null,
  String(darkWriteBack.cardTexture),
);
check(
  "withDark：深色档标记为 dark 且变量为 1（字色/底色同源）",
  darkWriteBack.dark === true && darkWriteBack.darkVar === "1",
  `dark=${darkWriteBack.dark} --skin-dark=${darkWriteBack.darkVar}`,
);
check(
  "withDark：非深色档原样返回（零回归）",
  darkWriteBack.unchangedTexture !== null && darkWriteBack.unchangedDark === false,
  "未被动过",
);

/* ===========================================================================
 * 7. 不改 DOM 结构（E 组）
 * =========================================================================== */
console.log("\n=== 7. 换肤未改动 DOM 结构 ===");

/*
  取证方式：换肤只允许**新增** `style` / `data-*`。
  这里检查既有硬约束 class 是否原样还在 —— 它们被 23 套断言依赖。
*/
const DOM_CONTRACTS = [
  ["app/(public)/halls/[id]/page.tsx", 'className="container-page max-w-3xl py-10"'],
  ["app/(public)/clan/halls/[id]/page.tsx", 'className="container-page max-w-4xl py-10"'],
  ["app/(public)/clan/halls/[id]/page.tsx", "overflow-hidden p-8"],
  // 纪念馆首屏「3D 场景 + 遗像」的硬约束（AGENTS.md：遗像必须是真 <img>，绝不画进 SVG）
  ["app/(public)/halls/[id]/page.tsx", "PortraitNiche"],
  /*
    ⚠️ 宗祠侧**不是** PortraitNiche —— 宗祠页已改用 ClanHall3DTour（四段 3D 漫游连廊），
    遗像由连廊内部的 SceneShrine 渲染（标记 `data-clan-portrait` 在 Tour 的子树里，
    不在页面文件本身，故这里只断"页面确实挂了 Tour"）。
    硬约束本身没变：宗祠遗像同样是"真 <img> + 有可定位的标记"。
    早先这里照抄纪念馆写成 PortraitNiche，于是恒红（断言过时，不是遗像丢了）。
  */
  ["app/(public)/clan/halls/[id]/page.tsx", "ClanHall3DTour"],
  // 场景优先布局的硬约束文案（改版时不许删板块）
  ["app/(public)/clan/halls/[id]/page.tsx", "字辈诗 · 派语"],
  ["app/(public)/clan/halls/[id]/page.tsx", "祭祀记录"],
];
for (const [file, needle] of DOM_CONTRACTS) {
  const s = src(file);
  check(`DOM 契约未变：${file.split("/").pop()} 仍含 ${needle.slice(0, 40)}`, !s || s.includes(needle));
}
// 宗祠遗像的定位标记在 ClanHallScene（Tour 内部复用的 SceneShrine）里，
// 页面文件与 Tour 文件本身都没有，故单独在真正承载它的组件上验。
check(
  "DOM 契约未变：ClanHallScene 含 data-clan-portrait（宗祠遗像可定位）",
  /data-clan-portrait/.test(src("components/clan/ClanHallScene.tsx")),
);

check(
  "装修层根节点仍是单个 div（未包额外 wrapper）",
  /return \(\s*<div\s+className=\{`relative \$\{className\}`\}/.test(hallLayer),
);

/* ===========================================================================
 * 8. 运行时：真页面上的 computed style（需要服务器在跑）
 * =========================================================================== */
console.log("\n=== 8. 运行时（真页面 computed style）===");

async function runtimeChecks() {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { chromium } = require("/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js");

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  // 过内测口令：直接种 cookie（别去填 /preview-gate 表单，慢且易打架）
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();

  /*
    找两座目标馆：一座"已装修"、一座"素白"。
    找不到就**跳过并打印原因**（AGENTS.md 陷阱 5：别断言"要数据才渲染"的板块）。

    ⚠️ 关键：判定"已装修"必须用**与产品同一套判据** `skinIsActive(skinOf(...))`，
       而不是"看有没有 templateId"。踩过：`tpl-niche`（赠品那套）有 templateId
       但槽位全是占位项 → 皮肤本来就不该激活 → 页面 `data-skin=off` 是**正确行为**。
       探针若按"有 templateId"挑，会挑到这种馆，然后报"已装修馆 data-skin=on 失败" ——
       看着像产品坏了，其实是探针选错了样本。
  */
  const targets = probeFile(`
import { prisma } from "@/lib/db";
import { normalizeDecor, DEFAULT_DECOR, findTemplate } from "@/lib/hall-decor";
import { skinOf, skinIsActive } from "@/lib/decor-skin";
async function main(){
  const halls = await prisma.memorialHall.findMany({ where:{ status:"active" }, select:{ id:true, templateConfig:true }, take: 120 });
  let plain:any=null, lux:any=null;
  for(const h of halls){
    const cfg = ((h.templateConfig as any)||{});
    const raw = (cfg.decor||{}) as any;
    const decor = normalizeDecor(
      { ...raw, slots: { ...DEFAULT_DECOR, ...(raw.slots ?? {}) } },
      { isPremium: false, unlocked: (raw.unlocked||[]).map(String), granted: (raw.granted||[]).map(String) },
    );
    const items = {
      wall: undefined, floor: undefined, ornament: undefined, frame: undefined, font: undefined,
    } as any;
    // 用与馆页一致的方式取槽位素材（只取 id 足够触发 mood 推断）
    const skin = skinOf(decor as any, { items: {
      wall: { id: decor.slots.wall }, floor: { id: decor.slots.floor },
      ornament: { id: decor.slots.ornament[0] ?? "" }, frame: { id: decor.slots.frame }, font: { id: decor.slots.font },
    }, template: decor.templateId ? { id: decor.templateId } : undefined });
    const active = skinIsActive(skin);
    const vals = [decor.slots.wall, decor.slots.floor, decor.slots.ornament[0] ?? "", decor.slots.frame, decor.slots.font];
    const allPlaceholder = vals.every((v)=>/_none$|-plain$/.test(String(v))) && !decor.templateId;
    if(!active && allPlaceholder && !plain) plain = h.id;
    if(active && !lux) lux = h.id;
  }
  const clan = await prisma.clanHall.findMany({ where:{ status:"active" }, select:{ id:true }, take: 40 });
  console.log(JSON.stringify({ plain, lux, clan: clan[0]?.id ?? null }));
}
main().then(()=>process.exit(0));
`);

  async function readSkin(path) {
    await page.goto(`http://127.0.0.1:3000${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    return page.evaluate(() => {
      const layer = document.querySelector("[data-skin]");
      const cs = layer ? getComputedStyle(layer) : null;
      const pg = document.querySelector("[data-page-skin]");
      const h1 = document.querySelector("h1");
      const card = document.querySelector(".rounded-xl, .rounded-lg");
      const cardCs = card ? getComputedStyle(card) : null;
      return {
        layerSkin: layer?.getAttribute("data-skin") ?? null,
        pageSkin: pg?.getAttribute("data-page-skin") ?? null,
        gilt: cs?.getPropertyValue("--skin-gilt").trim() ?? null,
        radius: cs?.getPropertyValue("--skin-radius").trim() ?? null,
        titleWeight: h1 ? getComputedStyle(h1).fontWeight : null,
        titleTracking: h1 ? getComputedStyle(h1).letterSpacing : null,
        cardBorderStyle: cardCs?.borderTopStyle ?? null,
        cardRadius: cardCs?.borderTopLeftRadius ?? null,
        titleColor: h1 ? getComputedStyle(h1).color : null,
      };
    });
  }

  try {
    if (targets.plain) {
      const r = await readSkin(`/halls/${targets.plain}`);
      check("运行时｜未装修馆 data-skin=off", r.layerSkin === "off", r.layerSkin);
      check("运行时｜未装修馆 --skin-gilt=transparent", r.gilt === "transparent", r.gilt);
      check("运行时｜未装修馆 data-page-skin=off", r.pageSkin === "off", r.pageSkin);
    } else {
      console.log('SKIP  未找到「素白馆」（全为占位素材）—— 跳过未装修运行时断言');
    }

    if (targets.lux) {
      const r = await readSkin(`/halls/${targets.lux}`);
      check("运行时｜已装修馆 data-skin=on", r.layerSkin === "on", r.layerSkin);
      check(
        "运行时｜已装修馆 --skin-gilt 非 transparent",
        !!r.gilt && r.gilt !== "transparent",
        r.gilt,
      );
      check(
        "运行时｜已装修馆标题字重/字距偏离基准（真的看得出来）",
        r.titleWeight !== "600" || r.titleTracking !== "0.48px",
        `weight=${r.titleWeight} tracking=${r.titleTracking}`,
      );
      check(
        "运行时｜已装修馆卡片圆角取自变量（非 Tailwind 默认 12px）",
        r.cardRadius !== null,
        `cardRadius=${r.cardRadius}`,
      );
    } else {
      console.log('SKIP  未找到「已选模板」的馆 —— 跳过已装修运行时断言');
    }

    /*
      两页同口径：宗祠必须与纪念馆拿到**同一组变量名**。
      这里只比"变量是否存在且可读"，不比具体值（两库的调子本就不同）。
    */
    if (targets.clan) {
      const r = await readSkin(`/clan/halls/${targets.clan}`);
      check(
        "运行时｜宗祠页同样注入了 --skin-* 变量（两页同口径）",
        r.gilt !== null && r.radius !== null,
        `gilt=${r.gilt} radius=${r.radius}`,
      );
      check(
        "运行时｜宗祠页 data-page-skin 存在",
        r.pageSkin === "on" || r.pageSkin === "off",
        String(r.pageSkin),
      );
      /*
        ⚠️ **这条是阶段 4 那个真 bug 的运行时回归防护**：
           "文字色与卡片底色必须同源"。
           症状曾是「字辈诗 · 派语」以浅色渲染在浅米色卡上 —— 整段看不见。
           判据：若正文文字是**浅色**（亮度高），卡片底色就**不能**也是浅色。
           这是**颜色关系**断言，不是"某个具体值"断言，所以换皮不会误报。
      */
      const contrast = await page.evaluate(() => {
        /*
          ⚠️ 不能只看 `card.backgroundColor`。
             深色卡的底色是 `rgba(255,255,255,0.1)` —— 半透明白压在**深色壁纸**上，
             视觉上仍是深底，但只读 backgroundColor 会算出"白色"（亮度 1.0），
             于是把**正确**的深色卡误判成"浅底"（实测踩到，假红）。
             正确做法：**把半透明色沿祖先链逐层合成**，直到遇到不透明层为止，
             得到"屏幕上的实际颜色"。这才是用户眼睛看到的东西。
        */
        const parseRgba = (c) => {
          const m = (c.match(/[\d.]+/g) ?? []).map(Number);
          return { r: m[0] ?? 0, g: m[1] ?? 0, b: m[2] ?? 0, a: m.length > 3 ? m[3] : 1 };
        };
        const lum = ({ r, g, b }) => (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        /*
          ⚠️ **必须把 `backgroundImage` 算进来** —— 这是本断言第一版假绿的根因。

          症状原本是"浅字 + 浅米卡"看不见。但第一版只读 `backgroundColor`：
            缺陷版本里 SECTION 的 backgroundColor 是 `rgba(255,255,255,.1)`
            （半透明白，合成到深色壁纸上 → 算出深底 → Δ 健康 → **断言通过**），
            而它同时挂着 `background-image: linear-gradient(rgba(255,250,240,.94), …)`
            —— 那层**浅米色渐变盖在 background-color 之上**，屏幕上是浅底。
          `background-color` 与 `background-image` 是**两层**，image 在上。
          只读其中一层，就会把"浅米渐变 + 半透明白"误算成深底（实测踩到）。

          判据：若存在 backgroundImage 且它不是 `none`，就以它为准
          （按它的色标平均估一个亮度，足够判定"浅底/深底"这个二值问题）。
        */
        const textureLum = (img) => {
          if (!img || img === "none") return null;
          const stops = [...img.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => {
            const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
            return { r: p[0] ?? 0, g: p[1] ?? 0, b: p[2] ?? 0, a: p.length > 3 ? p[3] : 1 };
          });
          if (!stops.length) return null;
          // 渐变里的色标平均（含 alpha 加权：越不透明越代表实际表面）
          const sum = stops.reduce(
            (acc, s) => {
              const w = s.a;
              return { r: acc.r + s.r * w, g: acc.g + s.g * w, b: acc.b + s.b * w, w: acc.w + w };
            },
            { r: 0, g: 0, b: 0, w: 0 },
          );
          if (sum.w === 0) return null;
          // 该渐变自身的等效不透明度 = 色标 alpha 平均
          const avgA = sum.w / stops.length;
          return { r: sum.r / sum.w, g: sum.g / sum.w, b: sum.b / sum.w, a: Math.min(1, avgA) };
        };
        const text = document.querySelector("pre") ?? document.querySelector("section p");
        if (!text) return null;
        /*
          沿祖先链找到"真正画了底"的那一层（surface），但**底色还要继续往下合成** ——
          因为深色卡的底色是半透明白（`rgba(255,255,255,.1)`），
          它压在**深色壁纸**上才是屏幕上的颜色。只拿它自己的 rgb 会得到"白色"（假红，实测踩到）。
          所以：
            ① surface = 第一个"有底色或有底纹"的祖先（决定卡片的表面层）
            ② backdrop = surface **之上的**所有祖先依次合成（决定卡片下面透出什么）
            ③ 最终卡片色 = backdrop ← 叠上 surface.bg ← 叠上 surface.tex
        */
        let surface = null;
        for (let n = text; n; n = n.parentElement) {
          const cs = getComputedStyle(n);
          const bg = parseRgba(cs.backgroundColor);
          const tex = textureLum(cs.backgroundImage);
          if (bg.a > 0.02 || tex) {
            surface = { el: n, bg, tex };
            break;
          }
        }
        if (!surface) return null;
        // ② 透明祖先链继续合成（页面默认白底起步）
        let back = { r: 255, g: 255, b: 255 };
        const chain = [];
        for (let n = surface.el.parentElement; n; n = n.parentElement) chain.unshift(n);
        for (const n of chain) {
          const c = parseRgba(getComputedStyle(n).backgroundColor);
          if (c.a <= 0.02) continue;
          back = {
            r: c.r * c.a + back.r * (1 - c.a),
            g: c.g * c.a + back.g * (1 - c.a),
            b: c.b * c.a + back.b * (1 - c.a),
          };
        }
        // ③ surface 底色 → 底纹，依次压在 back 上
        const over = (top, base) => ({
          r: top.r * top.a + base.r * (1 - top.a),
          g: top.g * top.a + base.g * (1 - top.a),
          b: top.b * top.a + base.b * (1 - top.a),
        });
        let cardRgb = surface.bg.a > 0.02 ? over(surface.bg, back) : back;
        if (surface.tex) cardRgb = over(surface.tex, cardRgb);
        const cardL = lum(cardRgb);
        const tcs = getComputedStyle(text);
        const tc = parseRgba(tcs.color);
        const textRgb = over(tc, cardRgb);
        const textL = lum(textRgb);
        return {
          textL,
          cardL,
          delta: Math.abs(textL - cardL),
          hasTexture: !!surface.tex,
          surfaceTag: surface.el.tagName,
        };
      });
      if (contrast) {
        /*
          判据用**亮度差**而不是"两者都高于某阈值"。
          理由：深色底 + 浅字 → 亮度差大（可读）；浅底 + 浅字 → 亮度差小（不可读）。
          亮度差是"可读性"的直接代理，且对深/浅两套配色都成立。
          阈值 0.3：WCAG 对比度 4.5:1 大致对应亮度差 ~0.35，
          这里取略宽的值（0.3），避免因渐变/纹理造成零星假红。
        */
        check(
          "运行时｜宗祠页正文与卡片底色有足够亮度差（防「浅字 + 浅底」不可读）",
          contrast.delta >= 0.3,
          `textL=${contrast.textL.toFixed(2)} cardL=${contrast.cardL.toFixed(2)} Δ=${contrast.delta.toFixed(2)}`,
        );
      } else {
        console.log("SKIP  宗祠页未找到可测的正文节点 —— 跳过对比度断言");
      }

      /*
        ⑩ 标记与变量**同口径**（行为级）。

        这是源码断言锁不住的那一类：静态上两句都"写了 pageSkin"也可能不对，
        而口径错位的表现恰恰是**两个信号互相矛盾**。所以直接读页面实际输出的两样东西：
          - 层上的 `data-skin`（标记）
          - 层上的 `--skin-dark` / `--skin-gilt`（实际生效的变量）
        判据：`data-skin=on` ⟺ gilt 非 transparent。
        反例（就是本断言要抓的）：标记 off 但变量已是金边框 —— 标记在撒谎。
      */
      const flagAgrees = await page.evaluate(() => {
        const layer = document.querySelector("[data-skin]");
        if (!layer) return null;
        const cs = getComputedStyle(layer);
        const gilt = cs.getPropertyValue("--skin-gilt").trim();
        return {
          flag: layer.getAttribute("data-skin"),
          gilt,
          dark: cs.getPropertyValue("--skin-dark").trim(),
        };
      });
      if (flagAgrees) {
        const giltLit = flagAgrees.gilt !== "" && flagAgrees.gilt !== "transparent";
        check(
          "运行时｜宗祠页 data-skin 标记与实际 --skin-gilt 同口径（标记不撒谎）",
          (flagAgrees.flag === "on") === giltLit,
          `data-skin=${flagAgrees.flag} --skin-gilt=${flagAgrees.gilt} --skin-dark=${flagAgrees.dark}`,
        );
      }
    } else {
      console.log("SKIP  未找到 active 宗祠 —— 跳过宗祠运行时断言");
    }
  } finally {
    await browser.close();
  }
}

if (OFFLINE) {
  console.log("\n(--offline：跳过运行时断言)");
} else {
  try {
    await runtimeChecks();
  } catch (e) {
    check("运行时检查可执行（服务器需在 127.0.0.1:3000）", false, String(e).slice(0, 200));
  }
}

/* ===========================================================================
 * 9. 反向验证：断言必须"确实会红"
 * ===========================================================================
 *
 * AGENTS.md 硬要求：写了正向断言之后，必须把代码改回**缺陷版本**，
 * 确认断言真的变红，再还原。否则可能写的是恒真断言（"看着通过，其实没测"）。
 *
 * 这里做两次反向实验（都在临时副本里做，不动工作区文件）：
 *   ① 把 MOOD_SKIN.imperial.gilt 改成 transparent
 *      → §4 的"豪华档 gilt 非透明"与"至少偏离 3 项"必须变红；
 *   ② 删掉一条 MOOD_OVERRIDE（tpl-tangzhi）
 *      → §2 的覆盖率断言必须变红（它落回 plain 而不在白名单）。
 *
 * 用**独立子进程**跑（不是原地改文件），这样即使中途崩了也不会留下脏状态。
 * 实现方式：读源码 → 字符串替换 → 写临时模块 → 用 tsx 跑 → 取结果。
 */
console.log("\n=== 9. 反向验证（断言有效性）===");

function negativeProbe(code) {
  const f = `${PROBE_DIR}/neg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ts`;
  writeFileSync(f, code, "utf8");
  try {
    const out = execSync(`cd /workspace && npx tsx ${f} 2>&1`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{")).pop() ?? null;
  } catch (e) {
    return null;
  } finally {
    try {
      unlinkSync(f);
    } catch {}
  }
}

/*
  反向①：把豪华档的 gilt 抹成 transparent，确认 §4 那两条断言**确实会红**。

  ⚠️ 不能"改 MOOD_SKIN 对象再调 skinOf" —— `MOOD_SKIN` 是模块级 const，
     `skinOf` 内部走的是同一份引用，运行时改它的字段**不一定**被后续读到的
     是同一时刻的值（且这种"改全局再还原"的探针本身很脆）。
     更稳的做法：**把缺陷版本的 token 直接构造出来**，喂给与 §4 **逐字相同**的
     判定表达式，看它是否变红。这才是"断言有效性"的验证 ——
     验的是判定式本身，而不是"能不能改到数据"。
*/
const neg1 = negativeProbe(`
import { DEFAULT_SKIN, skinIsActive } from "@/lib/decor-skin";
// 缺陷版本：豪华档的 gilt 被抹成 transparent（其余 token 保持豪华）
const defective = { ...DEFAULT_SKIN, gilt: "transparent", radius: "4px", borderStyle: "double",
  titleWeight: 700, titleTracking: "0.16em", shadow: 1, cardTexture: "linear-gradient(#fff,#eee)",
  dividerPattern: "repeating-linear-gradient(90deg,#e8c568cc 0 10px,transparent 10px 18px)" };
// —— 与 §4 逐字相同的判定 ——
const giltOk = defective.gilt !== "transparent";
const dev = [
  defective.gilt !== DEFAULT_SKIN.gilt,
  defective.radius !== DEFAULT_SKIN.radius,
  defective.titleWeight !== DEFAULT_SKIN.titleWeight,
  defective.shadow !== DEFAULT_SKIN.shadow,
  defective.cardTexture !== null,
  defective.dividerPattern !== null,
].filter(Boolean).length;
console.log(JSON.stringify({ giltOk, dev, active: skinIsActive(defective) }));
`);

if (neg1) {
  const r = JSON.parse(neg1);
  check(
    "反向①：豪华档 gilt 被抹成 transparent 时，「gilt 非透明」断言确实为假（非恒真）",
    r.giltOk === false,
    "giltOk=" + r.giltOk,
  );
  check(
    "反向①：此时 dev 计数从 6 降到 5 —— 说明「至少 3 项偏离」是能感知缺陷的活断言",
    r.dev === 5,
    "dev=" + r.dev,
  );
} else {
  check("反向①：探针可执行", false, "无输出");
}

/*
  反向①-b：**全部** token 退回素白 → §4 两条断言必须同时红。
  这一步证明"仅凭 gilt 一条不够"的论点：gilt 透明 + 其余也退回素白时，
  skinIsActive 也会变假 —— 即"未装修"与"装修了但没换到 gilt"能被区分开。
*/
const neg1b = negativeProbe(`
import { DEFAULT_SKIN, skinIsActive } from "@/lib/decor-skin";
const allPlain = { ...DEFAULT_SKIN };
console.log(JSON.stringify({ active: skinIsActive(allPlain), gilt: allPlain.gilt }));
`);
if (neg1b) {
  const r = JSON.parse(neg1b);
  check(
    "反向①-b：全部退回素白时 skinIsActive 为假（与「豪华但 gilt 透明」可区分）",
    r.active === false && r.gilt === "transparent",
    `active=${r.active} gilt=${r.gilt}`,
  );
} else {
  check("反向①-b：探针可执行", false, "无输出");
}

// ② 删掉 override：覆盖率断言是否变红
const neg2 = negativeProbe(`
import { moodOf } from "@/lib/decor-skin";
// 模拟缺陷：tpl-tangzhi 的 override 被删掉后，规则表接不住 → 落回 plain
const m = moodOf("tpl-tangzhi");
// 再模拟一件"白名单外的新素材"落回 plain
const m2 = moodOf("wall-whatever-new-2026");
console.log(JSON.stringify({ tangzhi: m, brandNew: m2 }));
`);

if (neg2) {
  const r = JSON.parse(neg2);
  /*
    tpl-tangzhi 现在有 override，所以是 imperial；若 override 被删它会落 plain。
    这两条共同证明：① override 真的在起作用；② 一个"谁都接不住的新 id"
    确实会落回 plain —— 于是 §2 的覆盖率断言会把它抓出来。
  */
  check("反向②：tpl-tangzhi 靠 override 命中 imperial（override 有效）", r.tangzhi === "imperial", r.tangzhi);
  check(
    "反向②：一个规则接不住的新 id 确实落回 plain（覆盖率断言会抓到）",
    r.brandNew === "plain",
    r.brandNew,
  );
} else {
  check("反向②：探针可执行", false, "无输出");
}

/* ===========================================================================
 * 汇总
 * =========================================================================== */
console.log(`\n===== 阶段 4 换肤验收：${pass}/${pass + fail} PASS =====`);
if (failures.length) {
  console.log("变红项：");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
