/**
 * 阶段 1 验收：结构层 + 光影层在工坊里**真的渲染出来了**（M1 第一眼证据）
 *
 * ============================================================================
 * 这个脚本守什么
 * ============================================================================
 *
 * 阶段 0 测的是「数据结构齐备」（纯函数层，不用起服务）。
 * 阶段 1 测的是**渲染链路真的通**：用户在工坊里能不能看见
 * 「未装修 vs 豪华」的落差。这是整条收益路径的地基 ——
 * 如果落差看不见，用户就没有装修动机，后面所有定价/素材都是空的。
 *
 * 三件必须成立的事：
 *   ① **对比视图真的渲染了两屏**（左素白基准 / 右当前方案）
 *   ② **豪华档的结构节点数显著多于未装修**（≥8，防止"换汤不换药"）
 *   ③ **光影层真的接上了**（data-light-layer 存在、无控制台错误）
 *
 * ============================================================================
 * 为什么断言必须走 Playwright 真渲染，不能 fetch 读 HTML
 * ============================================================================
 *
 * 对比视图是 **客户端 state 驱动** 的（`compare` 开关、`current` 草稿都活在
 * React state 里）。服务端 HTML 里既没有 `data-decor-compare`，也没有
 * 「未装修」那一屏 —— 用 fetch 断言必然 0 命中，会把"做了"误判成"没做"
 * （AGENTS.md 陷阱 12 点过名）。
 *
 * ============================================================================
 * 反向验证（AGENTS.md 硬要求）
 * ============================================================================
 *
 * §3 的「落差 ≥8」做过反向实验：把 `hall` 的 `structureTier` 从 `grand`
 * 改成 `basic` → 该断言变红（22 → 4，差 0）。不是恒真断言。
 * 复现方式见文件末尾「反向验证方法」注释。
 *
 * 前置：Next 已在 127.0.0.1:3000 运行。
 */
import { execSync } from "node:child_process";
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";

const { chromium } = pkg;
const BASE = "http://127.0.0.1:3000";
/** 免费馆主的纪念馆（有建馆赠品 tpl-niche，工坊可切换任意模板） */
const HALL_ID = process.env.HALL_ID || "cmulk2q7l000211vlj3xpjpwi";
/** 免费馆主的 active 宗祠（河南堂） */
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
/*
  内测口令：直接种 cookie，别去填 /preview-gate 表单。
  门页靠客户端 JS 做整页跳转，脚本里既慢又容易和后续导航打架（AGENTS.md 陷阱 4）。
*/
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

/** 登录（馆务管理页要求 owner） */
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

/**
 * 从工坊页读一份「3D 场景清单」。
 *
 * ⚠️ 用 page.evaluate 读 DOM，不用 fetch —— 场景是客户端渲染的。
 * 每个 `[data-decor-3d]` 是一个 Decor3DScene 实例（对比视图会有 2 个）。
 */
async function readScenes() {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("[data-decor-3d]"));
    return nodes.map((n) => {
      const el = n;
      const structureLayer = el.querySelector("[data-structure-layer]");
      const lightLayer = el.querySelector("[data-light-layer]");
      // 结构节点：所有带 data-structure 的元素（柱/枋/斗拱/台基/天花/分隔）
      const structureNodes = el.querySelectorAll("[data-structure]").length;
      return {
        engine: el.getAttribute("data-engine"),
        spaceKind: el.getAttribute("data-decor-3d"),
        tier: el.getAttribute("data-structure-tier"),
        structureCount: Number(el.getAttribute("data-structure") || "0"),
        structureNodes,
        hasStructureLayer: !!structureLayer,
        hasLightLayer: !!lightLayer,
        lightKey: lightLayer?.getAttribute("data-light-key") ?? null,
        lightTemp: lightLayer?.getAttribute("data-light-temp") ?? null,
        shafts: lightLayer?.querySelector("[data-light-shafts]")?.getAttribute("data-light-shafts") ?? null,
        fog: lightLayer?.querySelector("[data-light-fog]")?.getAttribute("data-light-fog") ?? null,
        specular: lightLayer?.querySelector('[data-light-specular="1"]') ? 1 : 0,
        parts: {
          column: el.querySelectorAll('[data-structure="column"]').length,
          beam: el.querySelectorAll('[data-structure="beam"]').length,
          dougong: el.querySelectorAll('[data-structure="dougong"]').length,
          podium: el.querySelectorAll('[data-structure="podium"]').length,
          ceiling: el.querySelectorAll('[data-structure="ceiling"]').length,
          divider: el.querySelectorAll('[data-structure="divider"]').length,
        },
      };
    });
  });
}

// ---------------------------------------------------------------------------
// 0. 登录 + 打开工坊
// ---------------------------------------------------------------------------
console.log("\n=== 0. 登录并打开馆务管理（工坊） ===");
await login();
await page.goto(`${BASE}/console/halls/${HALL_ID}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
const studioOk = await page.locator("[data-decor-compare]").count();
check("馆务管理页打开了装修工坊（对比视图容器存在）", studioOk > 0, `found=${studioOk}`);

if (studioOk === 0) {
  console.log("\n工坊没打开（可能是权限/数据前提不对）—— 后续断言跳过，直接报失败");
  await browser.close();
  console.log(`\n结果: ${pass}/${pass + fail} 通过`);
  console.log(`失败: ${fail}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. 对比视图：两屏都在，左素白 / 右当前
// ---------------------------------------------------------------------------
console.log("\n=== 1. 对比视图：两屏并排 ===");
const compareState = await page.getAttribute("[data-decor-compare]", "data-decor-compare");
check("对比视图默认开启", compareState === "on", `state=${compareState}`);

const paneBefore = await page.locator('[data-decor-compare-pane="before"]').count();
const paneAfter = await page.locator('[data-decor-compare-pane="after"]').count();
check("左屏「未装修」渲染", paneBefore === 1, `count=${paneBefore}`);
check("右屏「当前方案」渲染", paneAfter === 1, `count=${paneAfter}`);

const scenes0 = await readScenes();
check("对比视图下正好 2 个 3D 场景实例", scenes0.length === 2, `scenes=${scenes0.length}`);

// 左屏必须是素白基准（classic 空间，不随用户当前方案变化）
const beforeScene = scenes0[0];
const afterScene = scenes0[1];
check(
  "左屏走 classic（未装修基准，不受当前模板污染）",
  beforeScene?.spaceKind === "classic",
  `spaceKind=${beforeScene?.spaceKind}`,
);
check(
  "左屏档位为 basic（未装修 = 无豪华构件）",
  beforeScene?.tier === "basic",
  `tier=${beforeScene?.tier}`,
);

// ---------------------------------------------------------------------------
// 2. 引擎开关：工坊真的走 v2
// ---------------------------------------------------------------------------
console.log("\n=== 2. 引擎开关（工坊 = v2） ===");
check(
  "两个实例都走 v2 引擎",
  scenes0.every((s) => s.engine === "v2"),
  scenes0.map((s) => s.engine).join(","),
);
check(
  "两个实例都渲染了结构层容器",
  scenes0.every((s) => s.hasStructureLayer),
  scenes0.map((s) => s.hasStructureLayer).join(","),
);
check(
  "两个实例都渲染了光影层",
  scenes0.every((s) => s.hasLightLayer),
  scenes0.map((s) => s.hasLightLayer).join(","),
);

// ---------------------------------------------------------------------------
// 3. 核心：豪华 vs 未装修的结构落差 ≥ 8（M1 第一眼证据）
// ---------------------------------------------------------------------------
console.log("\n=== 3. 结构落差（第一眼证据） ===");
check(
  "未装修基准的结构节点数落在朴素区（≤6）",
  beforeScene.structureNodes <= 6,
  `nodes=${beforeScene.structureNodes}`,
);

/**
 * 切到「豪华档」模板，量落差。
 *
 * ⚠️ 三轮踩坑记录（都是定位问题，不是产品缺陷 —— 看着像功能坏了，其实按钮就在那儿）：
 *
 *   ① 不能按模板名 `hasText` 定位卡片：模板名在工坊里出现**两次**
 *      （卡片标题 span + 右侧方案摘要），`hasText` 会先撞上摘要（AGENTS.md 陷阱 8）。
 *   ② 不能用 `s.closest("div")` 取卡片体：标题 span 的**直接父级**才是卡片体，
 *      但 `closest` 从元素自身开始找，对 span 而言等价于 parentElement ——
 *      偏偏早期版本用了一个过滤条件把「· 立体」全滤掉了，拿到空 btns，
 *      于是脚本报"没点到按钮"，实际卡片好好的。
 *   ③ 不能用 `page.locator("button", { hasText })`：会命中**全页第一个**
 *      同名按钮（别的卡片），点了错的卡。必须限定在目标卡片内。
 *
 * 稳妥做法：`page.evaluate` 里按标题 span 向上走，找到**第一个含 button 的祖先**
 * （即卡片体），把该卡片在"所有模板卡片"里的下标算出来，再用 Playwright
 * 的 `nth(i)` 在**同一个 DOM 序列**里点它内部的按钮 —— 保证点的是同一张卡。
 */

/** 读出所有模板卡片的 {name, buttons}（模板名 → 卡片体） */
async function readTemplateCards() {
  return page.evaluate(() => {
    const out = [];
    const spans = Array.from(document.querySelectorAll("span.text-sm.font-medium"));
    for (const s of spans) {
      const name = (s.textContent || "").trim();
      let el = s.parentElement;
      let card = null;
      while (el) {
        if (el.querySelector("button") || el.querySelector("a")) {
          card = el;
          break;
        }
        el = el.parentElement;
      }
      if (!card) continue;
      const buttons = Array.from(card.querySelectorAll("button")).map((b) =>
        (b.textContent || "").trim(),
      );
      out.push({ name, buttons });
    }
    return out;
  });
}

/**
 * 点某张模板卡里的按钮（按整页模板卡片下标定位）。
 *
 * ⚠️ `.nth(i)` 的 i 用 `page.locator("button", ...)` 的全页序会漂，
 * 所以这里换一种**最稳**的做法：用 `evaluate` 直接点击目标卡片内的按钮。
 * Playwright 的 click 有 actionability 检查（更适合真人流程），
 * 但这张卡片可能落在视口外、且元素上叠了 preview 层 ——
 * 用 DOM click 绕过这些干扰，只关心"点了这个按钮之后 state 变没变"。
 * 代价：不会触发 hover/focus 类副作用，本断言不依赖它们，可接受。
 */
async function clickTemplateButton(tplName, btnPattern) {
  return page.evaluate(
    ({ tplName, btnPattern }) => {
      const re = new RegExp(btnPattern);
      const spans = Array.from(document.querySelectorAll("span.text-sm.font-medium"));
      for (const s of spans) {
        if ((s.textContent || "").trim() !== tplName) continue;
        let el = s.parentElement;
        let card = null;
        while (el) {
          if (el.querySelector("button")) {
            card = el;
            break;
          }
          el = el.parentElement;
        }
        if (!card) continue;
        const btn = Array.from(card.querySelectorAll("button")).find((b) =>
          re.test((b.textContent || "").trim()),
        );
        if (!btn) return { ok: false, why: "卡片内无匹配按钮", btns: Array.from(card.querySelectorAll("button")).map((b) => b.textContent.trim()) };
        btn.click();
        return { ok: true, clicked: (btn.textContent || "").trim() };
      }
      return { ok: false, why: "找不到模板卡片" };
    },
    { tplName, btnPattern },
  );
}

// 直接点「莲开九品 · 立体」—— 它映射 pond... 不，那只有 basic。
// 用「鎏金织锦 · 立体」：映射 hall（structureCount=22，grand 档），落差最大、最稳。
// 退路：朱漆门庭 · 立体（也是 hall）。
const cards0 = await readTemplateCards();
const LUXURY_CANDIDATES = ["鎏金织锦 · 立体", "朱漆门庭 · 立体", "水墨山房 · 立体"];
let applied = null;
let applyDetail = "";

/*
  同宗祠段：**判据是读回 DOM 确认落差真的出现**，不是"点到了"。
  应用模板要做 setCurrent → useMemo 重算 → 两屏重渲染，隧道下这一拍会漂，
  所以最多重试 3 轮（重复应用同一模板是幂等的）。
*/
for (let attempt = 0; attempt < 3 && applied === null; attempt++) {
  for (const nm of LUXURY_CANDIDATES) {
    if (!cards0.some((c) => c.name === nm)) {
      applyDetail = `模板「${nm}」不在当前分类（当前 tab 可能不是"整套模板"）`;
      continue;
    }
    const r = await clickTemplateButton(nm, "一键应用|重新应用|应用中");
    if (!r.ok) {
      applyDetail = `${nm} → ${r.why ?? "unknown"}`;
      continue;
    }
    await page.waitForTimeout(800);
    const probe = await readScenes();
    const changed = probe.find((s) => s.spaceKind !== "classic");
    applyDetail = `attempt${attempt} ${nm} clicked=${r.clicked} space=${changed?.spaceKind ?? "classic"}`;
    if (changed && changed.structureNodes >= 8) {
      applied = nm;
      break;
    }
  }
}
await page.waitForTimeout(300);

const scenes1 = await readScenes();
// 右屏 = 非 classic 那一屏；若两屏都不是 classic 则取第二个
const afterScene2 =
  scenes1.find((s) => s.spaceKind !== "classic") ?? scenes1[1] ?? scenes1[0];
const gap = (afterScene2?.structureNodes ?? 0) - (beforeScene?.structureNodes ?? 0);
check(
  "切到豪华模板后结构节点落差 ≥ 8",
  gap >= 8,
  `before=${beforeScene.structureNodes} after=${afterScene2?.structureNodes} gap=${gap} space=${afterScene2?.spaceKind} applied=${applied ?? "尝试失败"} ${applyDetail}`,
);

// ---------------------------------------------------------------------------
// 4. 光影层真的接上（v2 六层）
// ---------------------------------------------------------------------------
console.log("\n=== 4. 光影层接线 ===");
check(
  "右屏光影层带 data-light-key（六层光的锚点）",
  !!afterScene2?.lightKey,
  `key=${afterScene2?.lightKey}`,
);
check(
  "右屏光影层带 data-light-temp",
  !!afterScene2?.lightTemp,
  `temp=${afterScene2?.lightTemp}`,
);
// 豪华档（detail≥1）才会画光柱；hall 的 shafts.count=3
if (afterScene2?.tier === "grand") {
  check(
    "豪华档渲染了体积光柱（shafts ≥ 1）",
    Number(afterScene2?.shafts ?? 0) >= 1,
    `shafts=${afterScene2?.shafts}`,
  );
}

// ---------------------------------------------------------------------------
// 5. 结构构件种类齐备（豪华档不该只有一根柱）
// ---------------------------------------------------------------------------
console.log("\n=== 5. 豪华档构件种类 ===");
if (afterScene2?.tier === "grand") {
  const p = afterScene2.parts;
  const kinds = Object.entries(p).filter(([, n]) => n > 0).map(([k]) => k);
  check("豪华档至少含 3 种结构构件", kinds.length >= 3, `kinds=${kinds.join(",")}`);
  check("豪华档有立柱", p.column >= 2, `column=${p.column}`);
  check("豪华档有梁枋", p.beam >= 1, `beam=${p.beam}`);
  check("豪华档有斗拱", p.dougong >= 1, `dougong=${p.dougong}`);
  check("豪华档有台基", p.podium >= 1, `podium=${p.podium}`);
}

// ---------------------------------------------------------------------------
// 6. 对比开关能关（不带残留）
// ---------------------------------------------------------------------------
console.log("\n=== 6. 对比开关 ===");
const toggle = page.locator("[data-decor-compare-toggle]");
check("对比开关按钮存在", (await toggle.count()) === 1);
await toggle.click().catch(() => null);
await page.waitForTimeout(400);
const stateOff = await page.getAttribute("[data-decor-compare]", "data-decor-compare");
check("点开关后对比关闭", stateOff === "off", `state=${stateOff}`);
const scenesOff = await readScenes();
check("关闭对比后只剩 1 个场景实例", scenesOff.length === 1, `scenes=${scenesOff.length}`);
// 还原（下次跑仍是默认开）
await toggle.click().catch(() => null);
await page.waitForTimeout(300);

// ---------------------------------------------------------------------------
// 7. 控制台零错误
// ---------------------------------------------------------------------------
console.log("\n=== 7. 控制台 ===");
const realErrors = consoleErrors.filter(
  (e) => !/favicon|404 \(Not Found\)|preview_auth|net::ERR_/i.test(e),
);
check("工坊全程无控制台错误", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

// ---------------------------------------------------------------------------
// 8. 宗祠工坊同样生效（同一套引擎，两个入口）
// ---------------------------------------------------------------------------
console.log("\n=== 8. 宗祠工坊（同一引擎） ===");
const clanErrorsBefore = consoleErrors.length;
await page.goto(`${BASE}/console/clan-halls/${CLAN_HALL_ID}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
const clanStudio = await page.locator("[data-decor-compare]").count();
check("宗祠工坊也渲染了对比视图", clanStudio > 0, `found=${clanStudio}`);
if (clanStudio > 0) {
  const clanScenes0 = await readScenes();
  check(
    "宗祠对比视图也是 2 个 v2 实例",
    clanScenes0.length === 2 && clanScenes0.every((s) => s.engine === "v2"),
    `scenes=${clanScenes0.length}`,
  );

  /*
    ⚠️ 宗祠的默认存档**没有 templateId**（用户没装修过），所以右屏天然是
       classic —— 这不是缺陷，是"没装修"的正确表达。
       要让"落差 > 0"这条断言成立，必须**自己制造前提**：先应用宗祠的
       赠品模板「祖德流芳」（clan-tpl-ancestral → shrine，grand，count 15）。
       这正是 AGENTS.md 陷阱 11 的教训：断言别依赖上一步的残留状态，
       要自己把前提摆好（否则复跑 / 换账号就翻车，且翻得像功能缺陷）。
  */
  const clanCards = await readTemplateCards();
  let clanApplied = null;
  let clanApplyWhy = "";
  const CLAN_TPL = "祖德流芳";
  const clanHas = clanCards.some((c) => c.name === CLAN_TPL);

  /*
    ⚠️ 重试最多 3 轮。
    实测：同一个点击，独立跑必然生效（classic 4 → shrine 15），
    但在本脚本里偶发"点了按钮、state 没动" —— 这是**客户端 React 更新与
    page.evaluate 的时机竞争**（应用模板要做一次 setCurrent + useMemo 重算 +
    两屏重渲染，隧道环境下这一拍可能被推迟）。
    所以判据不能是"点到了就通过"，必须是**读回 DOM 确认空间真的变了**；
    没变就再点一次（对同一模板重复应用是幂等的）。
  */
  for (let attempt = 0; attempt < 3 && clanHas; attempt++) {
    const r = await clickTemplateButton(CLAN_TPL, "一键应用|重新应用");
    if (!r.ok) {
      clanApplyWhy = `attempt${attempt} → ${r.why ?? "unknown"}`;
      continue;
    }
    clanApplied = CLAN_TPL;
    await page.waitForTimeout(900);
    const probe = await readScenes();
    const changed = probe.some((s) => s.spaceKind !== "classic");
    clanApplyWhy = `attempt${attempt} clicked=${r.clicked} changed=${changed}`;
    if (changed) break;
  }
  await page.waitForTimeout(400);

  let clanScenes = await readScenes();
  let clanBase = clanScenes.find((s) => s.spaceKind === "classic") ?? clanScenes[0];
  let clanAfter =
    clanScenes.filter((s) => s.spaceKind !== "classic").pop() ?? clanScenes[1];
  let clanGap = (clanAfter?.structureNodes ?? 0) - (clanBase?.structureNodes ?? 0);
  check(
    "宗祠：赠品/豪华模板 vs 素白基准有结构落差（>0）",
    clanGap > 0,
    `gap=${clanGap} space=${clanAfter?.spaceKind} tier=${clanAfter?.tier} applied=${clanApplied ?? "未应用"} ${clanApplyWhy} cards=${clanCards.length} has祖德流芳=${clanHas}`,
  );
}
const clanRealErrors = consoleErrors
  .slice(clanErrorsBefore)
  .filter((e) => !/favicon|404 \(Not Found\)|preview_auth|net::ERR_/i.test(e));
check("宗祠工坊无控制台错误", clanRealErrors.length === 0, clanRealErrors.slice(0, 3).join(" | "));

// ---------------------------------------------------------------------------
// 9. 结构件「真的可见」——不被正面墙盖住（像素判据）
// ---------------------------------------------------------------------------
console.log("\n=== 9. 结构件可见性（防被墙遮挡） ===");
await page.goto(`${BASE}/console/halls/${HALL_ID}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(1200);
await page.locator("[data-decor-compare]").scrollIntoViewIfNeeded().catch(() => null);
await page.waitForTimeout(600);

/*
  ⚠️ 这一节是为了守住一个**测得到 rect、却看不见**的静默 bug：

  结构件与正面墙原先都在 z=0 共面，而 DOM 上墙排在 Structure3D **之后**
  → 墙把柱子整片盖住。此时：
    · `data-structure="column"` 还在，结构计数断言全绿；
    · `getBoundingClientRect()` 也量得到 17×271；
    · 控制台无任何错误 —— 但用户只看到一面墙，感受是"买了豪华装修什么都没变"。

  **`document.elementFromPoint` 在这里帮不上忙**：结构层全部 `pointerEvents:none`，
  会被 elementFromPoint 直接跳过（实测它返回的是 `[data-wall]`，误导成"墙在上面"）。

  ★ 判据设计：**断言结构件的 z 平移量为正**。
    共面（z=0）正是"会被墙盖"的充要条件；z>0 就脱离了共面、稳定压在墙前。
    这个判据直接读 inline transform，稳定、不依赖截图管线，
    而且**反向验证很干脆**：把 STRUCTURE_Z 改回 0 → 立刻变红。
*/
const zShift = await page.evaluate(() => {
  const scn = document.querySelectorAll("[data-decor-3d]")[0];
  const wrap = scn?.querySelector('[data-part="shaft"]')?.parentElement;
  if (!wrap) return null;
  const m = (wrap.style.transform || "").match(/translate3d\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
  return parts[2]; // z
});

check(
  "结构件的 Z 平移量为正（脱离与正面墙的共面，防被整片遮住）",
  typeof zShift === "number" && zShift > 0,
  `z=${zShift}`,
);

await browser.close();

console.log(`\n结果: ${pass}/${pass + fail} 通过`);
if (failures.length) {
  console.log(`失败项：\n  - ${failures.join("\n  - ")}`);
}

/*
  ============================================================================
  反向验证方法（AGENTS.md 硬要求：写"够不够豪华"的断言必须能变红）
  ============================================================================

  1. 把 lib/decor-3d.ts 里 `hall` 的 `structureTier: "grand"` 临时改成 `"basic"`
  2. 重跑本脚本 → §3「结构节点落差 ≥8」应变红（22→4，gap=0）
  3. 还原 `"grand"` → 复绿

  另可验证 §3 不是恒真：把 `classic` 的 columns 清空、
  同时 hall 保持 grand → gap 会**变大**（不是变小），说明断言真的在读数据。
  ============================================================================
*/
