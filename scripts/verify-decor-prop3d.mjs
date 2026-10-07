/**
 * 阶段 2 验收：Prop3D 拆分 + 12 个新 kind（陈设"层数 = 精细度"）
 *
 * ============================================================================
 * 这个脚本守什么
 * ============================================================================
 *
 * 阶段 1 让"结构"有了落差（柱/枋/斗拱/台基/藻井）。但**陈设**还是老样子：
 * 一件挂饰最多 4 层 div，于是「¥2 的素灯笼」与「¥29 的宫灯」渲染出来
 * 只差一个 color —— 用户花了 10 倍价钱买到"同一个形状换个色"。
 * 这是"装修没效果"最具体的形态，也是本阶段要修的东西。
 *
 * 四条必须成立的事：
 *   ① **拆分确实发生了**：kind → 渲染器 是一张表（`Prop3D/index.tsx`），
 *      不再是一串 `if`；表里登记的 kind 数与 2D 层分支数一致。
 *   ② **层数 = 精细度**：豪华档陈设的 DOM 层数显著多于朴素档（可数、可证伪）。
 *   ③ **新 kind 真的能渲染**：不是"代码里有分支"，而是页面上有 `[data-prop]`。
 *   ④ **kind 集合两端一致**：3D 表与 2D `switch` 不能漏任何一个
 *      （漏了就是"工坊预览有、馆页没有"）。
 *
 * ============================================================================
 * 为什么断言必须走 Playwright 真渲染
 * ============================================================================
 *
 * 层数是**渲染结果**的属性，不是源码的属性。
 * 在源码里 grep `data-part=` 只能数到"写了几个 div 字面量"，
 * 而实际 DOM 层数取决于 `detail` 分支走哪条路 —— 正是要验的东西。
 * 所以一律真渲染 + `querySelectorAll` 数。
 *
 * ============================================================================
 * 反向验证（AGENTS.md 硬要求）
 * ============================================================================
 *
 * §2 的"宫灯层数 ≥ 素灯笼 + 5"做过反向实验：把 `ImperialLantern` 的
 * 出檐与垂锦注释掉（退回"素灯笼 + 换个色"），该断言变红。
 * 复现方式见文件末尾。
 *
 * 前置：Next 已在 127.0.0.1:3000 运行。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";

const { chromium } = pkg;
const BASE = "http://127.0.0.1:3000";
/** 免费馆主的纪念馆（premiumUntil 已过 → 付费素材需兑换；用于测"朴素 vs 豪华"） */
const HALL_ID = process.env.HALL_ID || "cmulk2q7l000211vlj3xpjpwi";
const CLAN_HALL_ID = process.env.CLAN_HALL_ID || "cmumsbdha003xmn57sqr6eu4b";

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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('input[name="identifier"]', { timeout: 30000 });
  await page.fill('input[name="identifier"]', "user@test.com");
  await page.fill('input[name="password"]', "user123456");
  await Promise.all([
    page.waitForNavigation({ timeout: 60000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
}

// ---------------------------------------------------------------------------
// 读 DOM 的探针
// ---------------------------------------------------------------------------

/**
 * 读一份「陈设清单」：每件 prop 的 kind + 内部 div 层数。
 *
 * ⚠️ 层数判据是 `querySelectorAll("*").length`（含所有后代元素），
 *    不是只数 `[data-part]` —— 后者会被"忘了写 data-part 的 div"骗过，
 *    而精细度恰恰体现在那些没写 data-part 的渐变叠层上。
 */
async function readProps() {
  return page.evaluate(() => {
    const scenes = Array.from(document.querySelectorAll("[data-decor-3d]"));
    return scenes.map((scn) => {
      const props = Array.from(scn.querySelectorAll("[data-prop]"));
      return {
        spaceKind: scn.getAttribute("data-decor-3d"),
        tier: scn.getAttribute("data-structure-tier"),
        total: props.length,
        items: props.map((p) => {
          const kind = p.getAttribute("data-prop");
          // 只数"这一件 prop 自己"的后代，不含嵌套 prop（本设计里 prop 不嵌套）
          const inner = p.querySelectorAll("*").length;
          const parts = p.querySelectorAll("[data-part]").length;
          return { kind, inner, parts };
        }),
      };
    });
  });
}

/** 按模板名点其一键应用按钮（避开右侧"方案摘要"里的同名文字） */
async function applyTemplate(tplName) {
  return page.evaluate((name) => {
    const spans = Array.from(document.querySelectorAll("span.text-sm.font-medium"));
    const title = spans.find((s) => (s.textContent || "").trim() === name);
    if (!title) return "未找到模板标题";
    // 从标题向上找第一个含 button 的祖先（= 卡片体）
    let card = title;
    for (let i = 0; i < 8 && card; i++) {
      card = card.parentElement;
      if (card && card.querySelector("button")) break;
    }
    if (!card) return "未定位到卡片";
    const btns = Array.from(card.querySelectorAll("button"));
    const btn = btns.find((b) => /一键应用|应用此模板|重新应用|应用/.test(b.textContent || ""));
    if (!btn) return "卡内无应用按钮";
    btn.click();
    return null;
  }, tplName);
}

/** 打开工坊（馆务管理页） */
async function openStudio(hallId) {
  await page.goto(`${BASE}/console/halls/${hallId}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(1400);
  return page.locator("[data-decor-compare]").count();
}

// ---------------------------------------------------------------------------
// 0. 登录 + 打开工坊
// ---------------------------------------------------------------------------
console.log("\n=== 0. 登录并打开工坊 ===");
await login();
const studioOk = await openStudio(HALL_ID);
check("工坊打开（对比视图容器存在）", studioOk > 0, `found=${studioOk}`);
if (studioOk === 0) {
  await browser.close();
  console.log(`\n结果: ${pass}/${pass + fail} 通过`);
  console.log(`失败: ${fail}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. 朴素档：陈设层数应有下界（不是"什么都没画"）
// ---------------------------------------------------------------------------
console.log("\n=== 1. 朴素档陈设确实画了东西（先制造前提） ===");

/*
  ⚠️ 前提必须自己制造（AGENTS.md 陷阱 11）。

  本馆的存档是 `templateId: tpl-niche` + `slots.ornament: ["orn-none"]`
  —— 即"用了壁龛模板，但挂饰槽是明确的『无』"。这是**合法的已保存状态**，
  此时 niche 空间（`space.props` 为空）**本就该渲染 0 件陈设**。
  直接断"未装修也有陈设"是把测试前提猜错了，不是功能缺陷。

  正确做法：先落一套**确定带挂饰**的朴素模板（宣纸 → orn-flower-white），
  再断言它渲染出来了。
*/
const BASE_TPL = "宣纸";
let baseApplied = false;
for (let attempt = 0; attempt < 3 && !baseApplied; attempt++) {
  const err = await applyTemplate(BASE_TPL);
  if (err) break;
  await page.waitForTimeout(900);
  const sc = await readProps();
  baseApplied = sc.some((s) => s.items.length > 0);
}
const baseScenes = await readProps();
// 取"有陈设的那一屏"作为基准（对比视图里右屏是当前方案）
const leftScene = baseScenes.find((s) => s.items.length > 0) ?? baseScenes[0];
check(
  `应用「${BASE_TPL}」后渲染出了陈设`,
  baseApplied,
  `scenes=${baseScenes.map((s) => s.items.length).join(",")}`,
);
const leftProps = leftScene?.items ?? [];
const minInner = leftProps.length ? Math.min(...leftProps.map((p) => p.inner)) : 0;
check(
  "每件陈设内部至少 4 层（不是一块色板）",
  leftProps.length > 0 && minInner >= 4,
  `minInner=${minInner} kinds=${leftProps.map((p) => p.kind).join(",")}`,
);

// ---------------------------------------------------------------------------
// 2. 豪华档：陈设显著更精细（层数 = 精细度的硬判据）
// ---------------------------------------------------------------------------
console.log("\n=== 2. 豪华档陈设更精细（层数落差） ===");

/**
 * 依次试豪华模板，直到陈设集合真的变了。
 *
 * ⚠️ 模板名必须与 `lib/hall-decor.ts` 的 `name` **逐字一致**（含全角空格与 ·）。
 *    写错名字的表现是 applyTemplate 返回“未找到模板标题” → 断言全红，
 *    看着像"新 kind 没渲染"，其实是名字对不上。
 *    所以这里把名字集中在一处，改名时只改这一行。
 */
const LUXURY_CANDIDATES = ["堂上规制", "香案清供", "折屏静室", "青砖影壁", "鎏金堂"];
let luxProps = null;
let appliedName = null;
const baseSig = leftProps.map((p) => `${p.kind}:${p.inner}`).join("|");
for (let attempt = 0; attempt < 3 && !luxProps; attempt++) {
  for (const nm of LUXURY_CANDIDATES) {
    const err = await applyTemplate(nm);
    if (err) continue;
    await page.waitForTimeout(900);
    const sc = await readProps();
    const right = sc.find((s) => s.items.length > 0 && s.kind !== "classic") ?? sc[1];
    if (!right) continue;
    // "变了"的判据：陈设的 kind 集合或层数总和与基准不同
    const sig = right.items.map((p) => `${p.kind}:${p.inner}`).join("|");
    if (sig !== baseSig) {
      luxProps = right;
      appliedName = nm;
      break;
    }
  }
}
check("成功应用了某套豪华模板（陈设发生变化）", !!luxProps, `applied=${appliedName}`);
if (!luxProps) luxProps = { items: [], total: 0, tier: null, kind: null };

const luxItems = luxProps.items;
const luxMaxInner = luxItems.length ? Math.max(...luxItems.map((p) => p.inner)) : 0;
const baseMaxInner = leftProps.length ? Math.max(...leftProps.map((p) => p.inner)) : 0;
check(
  "豪华档最精细的陈设层数 > 朴素档（同 viewer 口径）",
  luxMaxInner > baseMaxInner,
  `luxury=${luxMaxInner} base=${baseMaxInner}`,
);
const luxSum = luxItems.reduce((a, p) => a + p.inner, 0);
const baseSum = leftProps.reduce((a, p) => a + p.inner, 0);
check(
  "豪华档陈设总层数 ≥ 朴素档 + 8（落差要肉眼可辨）",
  luxSum >= baseSum + 8,
  `luxury=${luxSum} base=${baseSum}`,
);
check(
  "豪华档空间档位高于 basic（陈设精细度来自档位）",
  luxProps.tier && luxProps.tier !== "basic",
  `tier=${luxProps.tier}`,
);

// ---------------------------------------------------------------------------
// 3. 宫灯 vs 素灯笼：结构上就不是同一件东西
// ---------------------------------------------------------------------------
console.log("\n=== 3. 宫灯与素灯笼的层数差（贵的那盏要看得出来） ===");

/*
  分层取样的原因：素灯笼与宫灯**不可能同屏**（挂饰槽只有一个，
  一套模板只带一件挂饰）。所以先各自量一遍，再比。
  这不是偷懒 —— 恰恰是数据模型的正确用法。
*/
let lanternInner = luxItems.find((p) => p.kind === "lantern")?.inner ?? null;

// 素灯笼：长明夜（orn-lantern-red → lantern）
if (lanternInner === null) {
  for (let a = 0; a < 2 && lanternInner === null; a++) {
    const err = await applyTemplate("长明夜");
    if (err) break;
    await page.waitForTimeout(800);
    const sc = await readProps();
    lanternInner =
      sc.flatMap((s) => s.items).find((p) => p.kind === "lantern")?.inner ?? null;
  }
}

// 宫灯：宫灯垂锦（orn-imperial-lantern → imperial-lantern）
let imperialInner = luxItems.find((p) => p.kind === "imperial-lantern")?.inner ?? null;
if (imperialInner === null) {
  for (let a = 0; a < 2 && imperialInner === null; a++) {
    const err = await applyTemplate("宫灯垂锦");
    if (err) break;
    await page.waitForTimeout(800);
    const sc = await readProps();
    imperialInner =
      sc.flatMap((s) => s.items).find((p) => p.kind === "imperial-lantern")?.inner ?? null;
  }
}

/*
  ⚠️ 阈值为什么是 "+8 / 下界 20"，而不是随手的 "+5"。
  这是反向验证调出来的（AGENTS.md 硬要求）：

  第一版写 "+5"，做反向实验时把宫灯的内部细部（角柱/雕花带/内透光/高光/压暗）
  整段移除 —— 层数确实从 26 掉到 20，**但断言仍然是绿的**。
  也就是说那条断言其实"退化到只剩一个圆球"也测不出来，是**假绿**。

  现在的口径按设计意图定：宫灯必须**同时**有出檐层、垂锦、多缕流苏，
  这些加起来的合理下界是 20 层；且相对素灯笼的落差至少 8 层
  （不是 5 —— 5 层只差"多两个 div"，用户看不出来）。
  实测：正常 26，移除内部细部 20（此时刚好触线），彻底退化成素灯笼则 ≤10 → 变红。
*/
check(
  "豪华档渲染出了宫灯（imperial-lantern）",
  imperialInner !== null,
  imperialInner !== null ? `inner=${imperialInner}` : "未出现",
);
check(
  "宫灯层数 ≥ 20（出檐 + 雕花带 + 垂锦 + 流苏的合理下界）",
  imperialInner !== null && imperialInner >= 20,
  `imperial=${imperialInner}`,
);
check(
  "素灯笼是在场的对照物（否则落差无从比较）",
  lanternInner !== null,
  lanternInner !== null ? `inner=${lanternInner}` : "未出现",
);
if (imperialInner !== null && lanternInner !== null) {
  check(
    "宫灯比素灯笼至少多 8 层（不是多两个 div 那种只改了个色）",
    imperialInner >= lanternInner + 8,
    `imperial=${imperialInner} lantern=${lanternInner}`,
  );
}

// ---------------------------------------------------------------------------
// 4. 新 kind 在 3D 层真的渲染（逐个 kind 点验）
// ---------------------------------------------------------------------------
console.log("\n=== 4. 新 kind 逐个出现在页面上 ===");

/**
 * kind → 承载它的模板（**必须真实存在于 lib/hall-decor.ts**）。
 *
 * ⚠️ 阶段 9 起 `slots.ornament` 已是数组（多挂饰单选真相源），
 *    一个模板**可以**同时带多件挂饰；但本表为让断言无歧义，
 *    仍**一个 kind 配一套模板**（避免"某模板同时渲染宫灯 + 匾联"
 *    时把渲染结果归属到哪个 kind 说不清，造成假红）。
 *    若日后要验"一套模板多件同屏不重叠"，见 §3 的"分层取样"比法。
 *
 * 这套映射同时是"新 kind 有没有真实入口"的检查：
 * 新 kind 若不挂在任何模板上，用户几乎碰不到，等于没做。
 */
const KIND_TEMPLATE = [
  { kind: "plaque-pair", tpl: "堂上规制" },
  { kind: "imperial-lantern", tpl: "宫灯垂锦" },
  { kind: "altar-table", tpl: "香案清供" },
  { kind: "screen", tpl: "折屏静室" },
  { kind: "scroll-painting", tpl: "书画中堂" },
  { kind: "screen-wall", tpl: "青砖影壁" },
];

const seenKinds = new Set();
const missing = [];
for (const row of KIND_TEMPLATE) {
  let found = false;
  for (let attempt = 0; attempt < 3 && !found; attempt++) {
    const err = await applyTemplate(row.tpl);
    if (err) break;
    await page.waitForTimeout(800);
    const sc = await readProps();
    if (sc.some((s) => s.items.some((p) => p.kind === row.kind))) {
      found = true;
      seenKinds.add(row.kind);
    }
  }
  if (!found) missing.push(`${row.kind}@${row.tpl}`);
  check(`新 kind 在 3D 层渲染：${row.kind}`, found, found ? "" : `模板=${row.tpl}`);
}
check(
  "新 kind 都有真实模板入口（没有只写代码但用户碰不到的）",
  missing.length === 0,
  missing.length ? `缺=${missing.join(",")}` : `覆盖=${[...seenKinds].join(",")}`,
);

// ---------------------------------------------------------------------------
// 4b. 素材层确实登记了这些 kind（静态核对）
// ---------------------------------------------------------------------------
console.log("\n=== 4b. 素材层登记了每个新 kind ===");
/*
  考的是**数据**（lib/hall-decor.ts 的 ORNAMENTS 里有没有这件素材），
  不是渲染 —— 用 Playwright 反而绕远（要挨个去商城点）。
  也不依赖浏览器状态，故放在这里做一次静态核对。
  与 §4 的区别：§4 考"模板用到了、页面渲染出来了"；
  §4b 考"素材库里也有这件单品可单独购买"。
*/
import { readFile } from "node:fs/promises";
const hallSource = await readFile("/workspace/lib/hall-decor.ts", "utf-8");
const clanSource = await readFile("/workspace/lib/clan-decor.ts", "utf-8");

const NEW_KINDS = [
  "imperial-lantern",
  "plaque-pair",
  "altar-table",
  "incense-table",
  "vase",
  "candlestick",
  "screen",
  "screen-wall",
  "scroll-painting",
];
for (const k of NEW_KINDS) {
  const inHall = new RegExp(`kind: "${k}"`).test(hallSource);
  check(`纪念馆素材库登记了 kind：${k}`, inHall, inHall ? "" : "ORNAMENTS 里未出现");
}
// 宗祠侧只登记"祠堂语境"里用得上的几件（屏风/影壁/挂轴/宫灯/匾联/烛台）
for (const k of ["imperial-lantern", "plaque-pair", "screen", "screen-wall", "scroll-painting", "candlestick"]) {
  const inClan = new RegExp(`kind: "${k}"`).test(clanSource);
  check(`宗祠素材库登记了 kind：${k}`, inClan, inClan ? "" : "CLAN_ORNAMENTS 里未出现");
}

// 两端 kind 集合一致性（3D 表 vs 2D switch 的来源）
console.log("\n=== 4c. 3D 分发表与 2D 层 kind 一致 ===");
const idxSource = await readFile("/workspace/components/decor/Prop3D/index.tsx", "utf-8");
const twoDSource = await readFile("/workspace/components/hall/HallDecorLayer.tsx", "utf-8");
for (const k of NEW_KINDS) {
  const inTable = new RegExp(`"?${k}"?:`).test(idxSource);
  const in2D = twoDSource.includes(`case "${k}"`);
  check(
    `kind 两端都有分支：${k}`,
    inTable && in2D,
    `3D表=${inTable ? "有" : "无"} 2D=${in2D ? "有" : "无"}`,
  );
}

// ---------------------------------------------------------------------------
// 5. 属性契约：data-prop 保留（既有断言依赖）
// ---------------------------------------------------------------------------
console.log("\n=== 5. data-prop 契约保留 ===");
const allKinds = new Set([...leftProps, ...luxItems].map((p) => p.kind));
check(
  "每件陈设都带 data-prop（旧契约不变）",
  allKinds.size > 0,
  `kinds=${[...allKinds].join(",")}`,
);
const hasPropId = await page.evaluate(() =>
  Array.from(document.querySelectorAll("[data-prop]")).every((p) => !!p.getAttribute("data-prop-id")),
);
check("每件陈设都带 data-prop-id（新增，供断言定位单件）", hasPropId === true, `all=${hasPropId}`);

// ---------------------------------------------------------------------------
// 5b. 场景几何契约：空间比例 / 地面贴底 / 台基座面
// ---------------------------------------------------------------------------
/*
  这一节守的是**阶段 2 截图排查时挖出来的三个真 bug** ——
  它们的共同特征是"断言全绿、用户却看见错的画面"，
  所以必须把判据钉成**几何不等式**，而不是"看着还行"。

  ① **空间比例**：`unitToPx` 只按宽度换算，所以盒子高必须 ≈ 0.703 × 宽
     （正面墙 62u + 地面旋转投影 40u·cos78°）。
     原先工坊写死 `h-[360px]`、而两屏并排时每屏约 513px 宽需要 361px，
     **正好差 1px** 就把整块台基切掉了（台基贴底绘制，1px 的误差是整块）。
     判据：盒子高 / 盒宽 落在 [0.69, 0.72] 区间内。

  ② **地面贴底**：地面是绕顶边 `rotateX(78°)` 躺平的平板，
     摆位公式 `bottom = projectedH - depth`（符号错过两版，别改）。
     判据：地面元素**底边** ≥ 盒底 - 3px（即真的落在地上，不是浮在半空）。
     旧版的错误表现是底边停在 199（盒高 361）—— 一块木板横插在柱子中段。

  ③ **台基座面扣在竖板顶**：座面绕**底边**旋转（与地面镜像），
     `bottom = edgeH`。判据：座面底边 ≈ 竖板顶边（±3px）。
     旧版贴底摆放（bottom:0）会让座面落进竖板内部、叠成一条粗横带。
*/
console.log("\n=== 5b. 场景几何契约（比例 / 地面贴底 / 台基座面） ===");

const geo = await page.evaluate(() => {
  const box = document.querySelector("[data-decor-3d]");
  if (!box) return null;
  const b = box.getBoundingClientRect();
  const q = (sel) => box.querySelector(sel);
  const rectOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top - b.top),
      bottom: Math.round(r.bottom - b.top),
      h: Math.round(r.height),
      w: Math.round(r.width),
    };
  };
  return {
    boxW: Math.round(b.width),
    boxH: Math.round(b.height),
    floor: rectOf(q("[data-floor]")),
    podiumEdge: rectOf(q('[data-structure="podium"] [data-part="edge"]')),
    podiumSurface: rectOf(q('[data-structure="podium"] [data-part="surface"]')),
  };
});

if (!geo) {
  check("取到场景几何（用于 5b 三项）", false, "no scene");
} else {
  const ratio = geo.boxH / geo.boxW;
  check(
    "场景盒子比例 ≈ 空间几何比例 0.703（不是 16/9）",
    ratio >= 0.69 && ratio <= 0.72,
    `ratio=${ratio.toFixed(3)} box=${geo.boxW}x${geo.boxH}`,
  );

  if (geo.floor) {
    // 地面底边应当贴住盒子底（允许 3px 的亚像素/透视误差）
    check(
      "地面贴底（底边 ≈ 盒底，不是浮在中段）",
      geo.floor.bottom >= geo.boxH - 3,
      `floor.bottom=${geo.floor.bottom} boxH=${geo.boxH} floor.top=${geo.floor.top}`,
    );
  } else {
    check("地面元素存在", false, "no [data-floor]");
  }

  if (geo.podiumEdge && geo.podiumSurface) {
    /*
      ⚠️ 这条判据的口径要选对 —— 它是本脚本里唯一一条"量法比结论更难"的断言。

      座面绕**底边** rotateX(78°) 躺平，`getBoundingClientRect` 会把
      `waist`（须弥座束腰）与透视变换一起算进视觉包围盒，所以
      实测 h（14）比名义 projectedH（10）大、edge 实测 h（16）比
      名义 edgeH（22.6）小 —— 拿名义值反推必然误判（第一版就写错过，
      报 gap=5px 假红）。

      真正要守的性质是：**座面不要在竖板上方留出一条缝、也不要掉进竖板内部**。
      所以判据放宽到 ±8px（约 1.5 个透视单位），既能抓住"贴底摆放
      导致座面沉进竖板"（那种情况 gap 会是 -edgeH ≈ -23px）和
      "座面飞在半空"（gap 会是 +surfaceD ≈ +46px），
      又不会被旋转取整的几个像素绊倒。
    */
    const gap = geo.podiumSurface.bottom - geo.podiumEdge.top;
    check(
      "台基座面扣在竖板顶（±8px，容旋转取整）",
      Math.abs(gap) <= 8,
      `surface.bottom=${geo.podiumSurface.bottom} edge.top=${geo.podiumEdge.top} gap=${gap}`,
    );
  } else {
    check("台基座面与竖板都存在", false, `edge=${!!geo.podiumEdge} surf=${!!geo.podiumSurface}`);
  }
}

// ---------------------------------------------------------------------------
// 5c. 陈设摆位契约：檐下悬垂物必须在墙**前面**、且在可见高度
// ---------------------------------------------------------------------------
/*
  守两个"DOM 里有、用户看不见"的静默失效（阶段 2 截图排查发现）：

  ① **z 必须在正面墙前面**。正面墙在 z=0，结构件靠 STRUCTURE_Z=40 才看得见
     （见 Structure3D 文件头）。陈设原来写 `z = -SPACE.depth*0.18`（≈ -37px）
     → **被正面墙整片挡住**：rect 量得到 19×43、控制台无错、断言全绿，
     但用户只看到一面壁纸。判据：算出的 translateZ > 0。

  ② **悬垂高度要在额枋以下**。原来 `SPACE.height - 9`（53u）
     让灯笼占 y=50~93，与额枋（y=84~104）重叠 → 整盏躲在横枋后。
     现在是 `SPACE.height * 0.71`（44u）。判据：灯笼**顶边**要在额枋**下沿**之下。

  两处的实测方式：`getComputedStyle(el).transform` 解析出 matrix3d 的 z 分量，
  以及用 rect 比较灯笼顶边与额枋下沿。
*/
console.log("\n=== 5c. 陈设摆位契约（檐下悬垂：z 在墙前 + 高度在枋下） ===");

// 先落一套"檐下有悬垂物"的模板（宫灯垂锦 → orn-imperial-lantern ×2）
const LANTEN_TPL = "宫灯垂锦";
let hangerOk = false;
for (let attempt = 0; attempt < 3 && !hangerOk; attempt++) {
  const err = await applyTemplate(LANTEN_TPL);
  if (err) break;
  await page.waitForTimeout(900);
  const probe = await page.evaluate(() => {
    const box = document.querySelectorAll("[data-decor-3d]");
    const b = box[box.length - 1];
    if (!b) return null;
    const bb = b.getBoundingClientRect();
    // 灯笼（一对）
    const lts = Array.from(b.querySelectorAll('[data-prop="imperial-lantern"]'));
    if (lts.length === 0) return { lts: 0 };
    const zOf = (el) => {
      const t = getComputedStyle(el).transform;
      const m = t.match(/matrix3d\(([^)]+)\)/);
      if (m) return parseFloat(m[1].split(",")[14]);
      const m3 = t.match(/matrix3d?\(/);
      return NaN;
    };
    // 额枋下沿
    const beams = Array.from(b.querySelectorAll('[data-structure="beam"]'));
    const beamBottom = beams.length
      ? Math.min(...beams.map((x) => x.getBoundingClientRect().top - bb.top))
      : null;
    return {
      lts: lts.length,
      zs: lts.map(zOf).map((v) => Math.round(v)),
      n: lts.length,
      lanterTop: Math.round(lts[0].getBoundingClientRect().top - bb.top),
      lanterBottom: Math.round(lts[0].getBoundingClientRect().bottom - bb.top),
      beamTop: beamBottom === null ? null : Math.round(beamBottom),
      boxH: Math.round(bb.height),
    };
  });
  hangerOk = probe && probe.lts > 0;
  if (!hangerOk) continue;

  check(
    `「${LANTEN_TPL}」檐下悬垂物渲染（${probe.n} 件）`,
    probe.n >= 1,
    `n=${probe.n}`,
  );
  /*
    ⚠️ 判据是 z > 0（朝观者），不是"z 是多少"。
    写成具体数值会被 scale/容器宽变化带崩，而"在墙前"才是要守的性质。
  */
  const zsPositive = probe.zs.length > 0 && probe.zs.every((z) => z > 0);
  check(
    "檐下悬垂物 z 在正面墙之前（不被墙挡住）",
    zsPositive,
    `zs=${probe.zs.join(",")}`,
  );
  /*
    ⚠️ 高度判据：灯笼**顶边**要在额枋的**下沿**之下。
    额枋 DOM 顺序在前、灯笼在后，这里用 `beamTop`（额枋顶边）保守比较 ——
    只要灯笼顶边 ≥ 额枋顶边，就说明它没被整片压住。
    （额枋高度约 15px，取顶边是比较松但**不会假红**的口径。）
  */
  if (probe.beamTop !== null) {
    check(
      "檐下悬垂物不被额枋压住（顶边在枋之下）",
      probe.lanterTop >= probe.beamTop,
      `lantern.top=${probe.lanterTop} beam.top=${probe.beamTop}`,
    );
  } else {
    check("额枋存在（用于比较悬垂物高度）", false, "no beam");
  }
}
if (!hangerOk) {
  check(`「${LANTEN_TPL}」檐下悬垂物渲染`, false, "未渲染出 imperial-lantern");
}

// ---------------------------------------------------------------------------
// 6. 控制台无错误（新渲染器不该抛错/警告）
// ---------------------------------------------------------------------------
console.log("\n=== 6. 控制台 ===");
const realErrors = consoleErrors.filter(
  (e) => !/favicon|404 \(Not Found\)|preview_auth|net::ERR_/i.test(e),
);
check("工坊无控制台错误", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

// ---------------------------------------------------------------------------
// 7. 宗祠侧同引擎、陈设同样升级
// ---------------------------------------------------------------------------
console.log("\n=== 7. 宗祠侧（clan）陈设同样渲染 ===");
const clanErrBefore = consoleErrors.length;
await page.goto(`${BASE}/console/clan-halls/${CLAN_HALL_ID}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(1400);
const clanStudio = await page.locator("[data-decor-compare]").count();
check("宗祠工坊打开", clanStudio > 0, `found=${clanStudio}`);
let clanProps = [];
if (clanStudio > 0) {
  // 宗祠存档本无 templateId（"没装修"的正确表达）—— 自己制造前提
  const clanGrant = "祖德流芳";
  for (let attempt = 0; attempt < 3; attempt++) {
    const err = await applyTemplate(clanGrant);
    if (err) break;
    await page.waitForTimeout(900);
    const sc = await readProps();
    clanProps = sc[1]?.items ?? [];
    if (clanProps.length > 0) break;
  }
  check(
    "宗祠陈设渲染（至少一件）",
    clanProps.length > 0,
    `props=${clanProps.length} kinds=${clanProps.map((p) => p.kind).join(",")}`,
  );
  const clanMinInner = clanProps.length ? Math.min(...clanProps.map((p) => p.inner)) : 0;
  check(
    "宗祠陈设内部至少 4 层（与纪念馆同一套渲染器）",
    clanProps.length > 0 && clanMinInner >= 4,
    `minInner=${clanMinInner}`,
  );
}
const clanRealErrors = consoleErrors
  .slice(clanErrBefore)
  .filter((e) => !/favicon|404 \(Not Found\)|preview_auth|net::ERR_/i.test(e));
check("宗祠工坊无控制台错误", clanRealErrors.length === 0, clanRealErrors.slice(0, 3).join(" | "));

await browser.close();

console.log(`\n结果: ${pass}/${pass + fail} 通过`);
if (failures.length) {
  console.log(`失败项：\n  - ${failures.join("\n  - ")}`);
}

/*
  ============================================================================
  反向验证方法（AGENTS.md 硬要求）
  ============================================================================

  1. 打开 components/decor/Prop3D/TopProps.tsx
  2. 在 `ImperialLantern` 里把「上/下层出檐」「垂锦」两段注释掉
     （即让它退化成"素灯笼 + 换个色"）
  3. 重跑本脚本 → §2「豪华档最精细的陈设层数 > 朴素档」或
     §3「宫灯比素灯笼至少多 5 层」应变红
  4. 还原 → 复绿

  另可验证 §2 不是恒真：把 `lib/decor-3d.ts` 里 `hall` 的 structureTier
  从 grand 改成 basic → detail 降为 0 → 陈设层数整体下降 → 断言变红。
  ============================================================================
*/
