/**
 * 阶段 5 验收：套件升级（applies）+ 工坊重做（档次阶梯 / 整页预览）
 *
 * ============================================================================
 * 这个脚本守什么
 * ============================================================================
 *
 * 阶段 4 守的是"全页换肤真的生效"（66 项，见 verify-decor-skin.mjs）。
 * 阶段 5 守的是**工坊里的消费体验**，三件事：
 *
 *   ① **整店套餐的 `applies` 真的被消费**（数据里有、组件真的读）
 *   ② **档次阶梯**让用户看到"我在哪一档、升一档差多少"
 *   ③ **整页预览**让用户在工坊里看到"馆页整页会变成什么样"（换肤效果）
 *
 * ============================================================================
 * ⚠️ 本脚本最关键的设计：§2 断言三轮演进（每轮都比上轮强，前两轮都假绿）
 * ============================================================================
 *
 * ① **第一版：查"值非空"** —— `afterSummary["壁纸"].length > 0`。
 *    **恒真**：应用前摘要里本来就有壁纸。这条什么都没测。
 *
 * ② **第二版：查"变了没有"** —— `before["壁纸"] !== after["壁纸"]`。
 *    仍然能被蒙混：改造前 `kitSlots()` 靠 id 前缀推断 `includes`，
 *    三个套餐的素材命名都很规范 → **碰巧推出与 `applies` 相同的结果**。
 *    教训：**断言"变没变"只守得住"接没接上"，守不住"接对了没有"。**
 *
 * ③ **第三版（现在）：闭环比对，期望值不硬编码、也不自产自销**。
 *    组件把套件的 `applies` 声明渲染成 `data-kit-slots`（素材 id）；
 *    素材卡带 `data-decor-item-id`；脚本在页面里建立"显示名 ⇄ id"映射，
 *    把摘要里显示的素材名换算回 id，与声明逐字比对五个槽位。
 *
 * ============================================================================
 * ⚠️ 第三版踩的新坑：**期望值不能由被测逻辑自己产出**（"自产自销"假绿）
 * ============================================================================
 *
 * `data-kit-slots` 最初写成 `JSON.stringify(kitSlots(kit))` ——
 * 而 `kitSlots()` 正是被验收的那段逻辑。于是缺陷版下：
 *   · "实际应用"错（走了前缀推断）
 *   · "声明"也错（同一个 `kitSlots()` 产出）
 *   → **两边同错、彼此自洽 → 断言绿着通过**（实测确认：注释掉 applies 分支后仍 28/28 全绿）。
 *
 * 修法：声明**直接取数据层的 `kit.applies` 原值**，绕开 `kitSlots()`：
 *   `data-kit-slots={JSON.stringify(kit.applies ?? kitSlots(kit))}`
 * —— `kitSlots()` 仍作兜底（旧套件没 applies 时），但**兜底结果不用于断言**。
 *
 * 规矩：**断言的期望值必须来自独立于被测逻辑的真相**（数据层原值），
 * 被测逻辑的产物只能作为"实际行为"被比对。这与 AGENTS.md
 * "测业务规则时别在测试里重写一份口径"是同一件事的两面：
 *   一份在测试里重写口径 → 测的是测试自己的理解；
 *   一份在生产码里自产自销 → 缺陷跟着期望值一起走。
 *
 * ============================================================================
 * 反向验证记录（AGENTS.md 硬要求，已做，均确认精确变红后还原）
 * ============================================================================
 *
 * ① §2 applies 被消费：注释掉 `kitSlots` 的 applies 分支
 *    **并**把 `kit-scholar-retreat.applies.floor` 临时改成 `includes` 之外的
 *    真实素材 `floor-marble-veined`（否则前缀推断碰巧推对、测不出来），
 *    → 变红 1 条，报 `地纹 显示「金丝楠木」(floor-wood) ≠ applies 的 floor-marble-veined`。
 *
 * ② §4 阶梯档位：把 `TIER_BANDS` 的 min/max 从**元**改回**分**（500/1500/3900）
 *    → 变红 2 条，报 `各档=[1,0,0,0] 合计=1 模板数=25` 与 `free → entry`。
 *    这条 bug 是本组件里**第二次**踩同一个单位坑（第一次是"当前档"判定），
 *    所以断言做成**合计守恒**而不是"某档 > 0"：单位错 / 边界漏 / 区间重叠
 *    都会让合计 ≠ 模板总数，比绝对值断言敏感得多。
 *
 * ============================================================================
 * 为什么必须 Playwright 真渲染
 * ============================================================================
 *
 * 套件卡、阶梯、整页预览全部是**客户端 state 驱动**的：
 * 服务端 HTML 里没有 `data-kit-applies` 的点击结果、没有 `data-tier-current`、
 * 没有 `data-decor-pagepreview`（后者要点开全屏再切 tab 才进 DOM）。
 * 用 fetch 读 HTML 必然 0 命中，会把"做了"误判成"没做"（AGENTS.md 陷阱 12）。
 *
 * 前置：Next 已在 127.0.0.1:3000 运行。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";

const { chromium } = pkg;
const BASE = "http://127.0.0.1:3000";
/** 免费馆主的纪念馆（工坊可切换任意模板） */
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
 * 读「当前装修方案」摘要里的槽位文本。
 *
 * 摘要卡的结构是：<span>壁纸</span><span>北京…</span>（槽位名 + 值）。
 * 用 closest 在 DOM 层级里就近向上找，不用 `xpath=ancestor::div[...]` ——
 * 后者是"文档序第一个匹配"不是"最近的祖先"，会跨层跑到别的容器上（AGENTS.md 陷阱 7）。
 */
async function readSummary() {
  return page.evaluate(() => {
    const out = {};
    const labels = ["壁纸", "地纹", "挂饰", "相框", "字体", "模板"];
    // 找到含"当前装修方案"标题的那张卡
    const heads = Array.from(document.querySelectorAll("div")).filter(
      (d) => d.textContent?.trim() === "当前装修方案",
    );
    const card = heads[0]?.closest("div.rounded-lg") ?? null;
    if (!card) return null;
    for (const lab of labels) {
      // 该卡内所有 span，配对找"标签 + 值"
      const spans = Array.from(card.querySelectorAll("span"));
      for (let i = 0; i < spans.length; i++) {
        if (spans[i].textContent?.trim() === lab && spans[i + 1]) {
          out[lab] = spans[i + 1].textContent?.trim() ?? "";
          break;
        }
      }
    }
    return out;
  });
}

/** 点某张套件卡片的按钮（按 data-kit-applies 定位，避开文案匹配的坑） */
async function clickKitButton(kind) {
  const card = page.locator(`[data-kit-applies="${kind}"]`).first();
  if ((await card.count()) === 0) return false;
  const btn = card.locator("button");
  if ((await btn.count()) === 0) return false;
  await btn.first().click();
  // 等 React 重渲染
  await page.waitForTimeout(400);
  return true;
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
check("馆务管理页打开了装修工坊", studioOk > 0, `found=${studioOk}`);

// ---------------------------------------------------------------------------
// 1. 套件卡片标记（applies 真的透传到工坊）
// ---------------------------------------------------------------------------
console.log("\n=== 1. 套件卡片标记（applies 透传） ===");

// 切到「装饰套件」分类
const kitTab = page.locator("button", { hasText: "装饰套件" }).first();
if ((await kitTab.count()) > 0) {
  await kitTab.click();
  await page.waitForTimeout(300);
}

const fullCount = await page.locator('[data-kit-applies="full"]').count();
const decorCount = await page.locator('[data-kit-applies="decor"]').count();
check(
  "存在「整店套餐」卡片（data-kit-applies=full）",
  fullCount >= 1,
  `full=${fullCount} decor=${decorCount}`,
);
check(
  "存在「普通套件」卡片（data-kit-applies=decor）—— 防止全被标成 full",
  decorCount >= 1,
  `decor=${decorCount}`,
);

/*
  文案分叉：整店套餐卡必须写「含墙与地」，不能再是写死那句
  "只换挂饰/相框/字体，保留你挑好的墙与地"（那对整店套餐是错的）。
*/
const fullCardText = await page
  .locator('[data-kit-applies="full"]')
  .first()
  .innerText()
  .catch(() => "");
check(
  "整店套餐卡片文案说明「含墙与地」（不再误导为只换装饰）",
  /含墙与地|一键换整套/.test(fullCardText),
  fullCardText.split("\n").find((l) => /含墙与地|一键换整套/.test(l)) ?? fullCardText.slice(0, 60),
);
check(
  "整店套餐按钮是「一键整装」（与普通套件的「应用套件」区分）",
  /一键整装/.test(fullCardText),
  fullCardText.split("\n").find((l) => /整装|套件/.test(l)) ?? "-",
);

/*
  【本阶段修的显示缺陷】模板卡必须显示货币价（"¥N"）。
  根因：`tierBadge(tpl.tier, locked, tpl.points)` **漏传第 4 个参数 priceFen**，
  于是徽章只有积分、没有价格 —— 用户看不到"这个模板多少钱"，
  而套件卡那处一直传着（两处调用口径不一致）。
  判据：随便一张模板卡的 innerText 里应出现 `¥` 或"积分"字样。
  反向验证：把参数改回漏传 → 本断言在**仅有积分价**的卡上仍会通过，
  所以额外断言"至少一张卡同时出现 ¥ 与数字"（付费模板必然有 priceFen）。
*/
const tplTabEarly = page.locator("button", { hasText: "整套模板" }).first();
if ((await tplTabEarly.count()) > 0) {
  await tplTabEarly.click();
  await page.waitForTimeout(400);
}
/*
  ⚠️ 币种改造（2026-10）后卡片价签从「¥N」改为「**N 福币**」
  （`tierBadge` 走 `fubOnly(fubFromFen(priceFen))`）。
  这条断言的本意是「**卡片上确实看得到价格**」（早先 `locked===false` 时整块不渲染价格
  → 用户不知道这东西值多少钱、也不知道自己省了多少），
  所以判据跟着币种走，但仍保留「同时也不能写成 ¥N」的反向检查 ——
  需求是「全平台以福币计价」，出现 ¥N 说明有页面漏改。

  这里仍兼容 `¥N` 的写法（两种都算"有价格"），因为本套件要守的是
  "价格有没有被漏传"，而不是"文案长什么样"（那是 verify-fortune-wallet §7 的活）。
  但**若只显示 ¥N、一个福币都没有**，说明整页漏改，另加一条断言兜住。
*/
const priceShown = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button")).filter((b) =>
    /一键应用|重新应用/.test(b.textContent || ""),
  );
  const cards = btns.map((b) => b.closest("div.overflow-hidden")?.innerText ?? "");
  const withPrice = cards.filter((t) => /(¥\s*\d|\d+(\.\d)?\s*福币)/.test(t)).length;
  const withFub = cards.filter((t) => /\d+(\.\d)?\s*福币/.test(t)).length;
  return { total: cards.length, withPrice, withFub };
});
check(
  "模板卡显示货币价（tierBadge 未漏传 priceFen）",
  priceShown.withPrice >= 1,
  `${priceShown.withPrice}/${priceShown.total} 张显示价格`,
);
check(
  "模板卡价签已改为福币口径（不是 ¥N）",
  priceShown.withFub >= 1,
  `${priceShown.withFub}/${priceShown.total} 张显示「N 福币」`,
);

// 回到套件分类，供后续断言使用
if ((await kitTab.count()) > 0) {
  await kitTab.click();
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// 2. 【核心】applies 真的被消费 —— 断言具体素材名，不是"变没变"
// ---------------------------------------------------------------------------
console.log("\n=== 2. 【核心】整店套餐 applies 真的被消费 ===");

/*
  找一个价格最低的整店套餐来点（避免误触发购买弹窗）。
  当前只有 kit-scholar-retreat(¥22) / kit-imperial-hall(¥59) 两个（纪念馆侧），
  两者在测试馆里应当已解锁或可直接用积分兑换。
  这里挑「金殿整装包」对应的 applies：wall=wall-brocade-gold（"缂丝金龙满壁"）。
*/
const beforeSummary = await readSummary();
check("能读到「当前装修方案」摘要", !!beforeSummary, JSON.stringify(beforeSummary));

/*
  ============================================================================
  ⚠️ 【本脚本最重要的设计】§2 断言的是"变成了**哪个素材**"，而且是**闭环**取期望值
  ============================================================================

  这个断言改了三版，前两版都是**假绿**，值得完整记下来：

  ① 第一版：`afterSummary["壁纸"].length > 0`
     → **恒真**。应用前摘要里就有壁纸，这条什么都没测。

  ② 第二版：`beforeSummary["壁纸"] !== afterSummary["壁纸"]`（"变了"）
     → 仍可被蒙混：改造前 `kitSlots()` 靠 id 前缀推断 includes，
       三个套餐命名规范 → **碰巧推出与 applies 相同的结果** → 绿着通过。
       断言"变没变"只守得住"接没接上"，守不住"接对了没有"。

  ③ 第三版（现在）：**期望值从页面自己读**，不硬编码。
     · 组件把套件的 applies 渲染成 `data-kit-slots`（id）；
     · 素材卡带 `data-decor-item-id` → 可在页面里建立"显示名 ⇄ id"双向映射；
     · 于是"摘要里的显示名"能换算回 id，与 `data-kit-slots` 的声明逐字比对。
     **脚本读页面的值、断言页面的行为** —— 素材改名、换套餐、调文案都不会误报，
     而"applies 没被消费"一定会红。

  ⚠️ 反向验证的坑（本轮踩到）：只注释掉 `kitSlots()` 的 applies 分支**测不出来** ——
     因为三个套餐的 includes 与 applies 恰好同值，前缀推出来的结果一样。
     必须**同时把 applies 改成 includes 之外的真实素材**（如 floor 从 `floor-wood`
     改成 `floor-marble-veined`），两条路径的结果才分叉，断言才会红。
     这一步做完确认变红（报 `地纹=金丝楠木（期望 汉白玉地）`），再还原。
*/
const clicked = await clickKitButton("full");
check("点到了整店套餐的应用按钮", clicked);

/** 读被点击那张 full 套件卡声明的 applies（素材 id） */
async function readKitDeclaredSlots() {
  return page.evaluate(() => {
    const card = document.querySelector('[data-kit-applies="full"]');
    try {
      return JSON.parse(card?.getAttribute("data-kit-slots") ?? "{}");
    } catch {
      return {};
    }
  });
}

/**
 * 建立"素材显示名 → 素材 id"映射。
 *
 * ⚠️ 必须**逐槽位切换分类再读** —— 素材卡只渲染当前分类，
 * 停在套件分类去读 `[data-decor-item-id]` 会得到空映射。
 * 这与 AGENTS.md 陷阱 12 同源：**想读的东西没渲染时，不是"不存在"而是"没切过去"**。
 *
 * ⚠️ 分类按钮的文案是「背景壁纸 / 地面地纹 / …」（不是槽位名"壁纸"），
 * 用错词会点不中 → 映射全空（本轮实测踩到）。
 */
const CAT_LABEL_OF_SLOT = {
  wall: "背景壁纸",
  floor: "地面地纹",
  ornament: "挂饰陈设",
  frame: "遗像相框",
  font: "字体风格",
};
async function readNameToIdMap() {
  const map = {};
  for (const catLabel of Object.values(CAT_LABEL_OF_SLOT)) {
    // 精确匹配分类按钮（避开卡片里的同名文字）
    const tabBtn = page.locator("button", { hasText: catLabel }).first();
    if ((await tabBtn.count()) === 0) continue;
    await tabBtn.click();
    await page.waitForTimeout(260);
    const pairs = await page.evaluate(() =>
      [...document.querySelectorAll("[data-decor-item-id]")].map((el) => ({
        id: el.getAttribute("data-decor-item-id"),
        /*
          ⚠️ 名字要从**专门的标记**里取（`[data-decor-item-name]`），
          不能拿卡片的 innerText 第一行 —— 那是
          「◻素白¥1 · 已解锁使用中纯净留白…」一长串（图标+价签+状态+描述混在一起），
          与摘要里显示的干净名字「素白」对不上，映射会全空（本轮实测踩到）。
        */
        name: (el.querySelector("[data-decor-item-name]")?.textContent ?? "").trim(),
      })),
    );
    for (const { id, name } of pairs) if (id && name) map[name] = id;
  }
  // 读完切回套件分类，供后续 §3 使用
  const kitTabBack = page.locator("button", { hasText: "装饰套件" }).first();
  if ((await kitTabBack.count()) > 0) {
    await kitTabBack.click();
    await page.waitForTimeout(260);
  }
  return map;
}

const afterSummary = await readSummary();
if (afterSummary) {
  const declared = await readKitDeclaredSlots();
  const nameToId = await readNameToIdMap();
  /*
    逐槽位比对：摘要里每个槽位显示的素材名，换算成 id 后
    必须等于该套件 `applies` 声明的那个 id。
  */
  const SLOT_LABEL = { wall: "壁纸", floor: "地纹", ornament: "挂饰", frame: "相框", font: "字体" };
  const mismatches = [];
  let compared = 0;
  for (const [slot, label] of Object.entries(SLOT_LABEL)) {
    const wantId = declared[slot];
    if (!wantId) continue; // 该套件没声明这个槽位 → 不参与比对
    const shownName = afterSummary[label];
    const gotId = nameToId[shownName];
    compared++;
    if (gotId !== wantId) {
      mismatches.push(`${label} 显示「${shownName}」(${gotId ?? "未识别"}) ≠ applies 的 ${wantId}`);
    }
  }
  check(
    "整店套餐应用后，五个槽位 = 该套件 applies 声明的素材（闭环比对，无硬编码）",
    compared > 0 && mismatches.length === 0,
    compared === 0
      ? "页面未渲染 data-kit-slots（取不到声明）"
      : `比对 ${compared} 个槽位${mismatches.length ? "：" + mismatches.join("；") : "全部一致"} 声明=${JSON.stringify(declared)}`,
  );
  /*
    单独钉"地纹"这条 —— 它是 `applies` 与 `includes` 最容易分叉的槽位，
    也是"前缀推断碰巧推对"最容易漏掉的地方。
  */
  check(
    "整店套餐确实换了地纹（含墙与地，不是只换挂饰）",
    !!beforeSummary && beforeSummary["地纹"] !== afterSummary["地纹"] && !!afterSummary["地纹"],
    `前=${beforeSummary?.["地纹"]} 后=${afterSummary["地纹"]}`,
  );
  check(
    "整店套餐应用后壁纸确实改变了（含墙地）",
    !!beforeSummary && beforeSummary["壁纸"] !== afterSummary["壁纸"],
    `前=${beforeSummary?.["壁纸"]} 后=${afterSummary["壁纸"]}`,
  );
}

/*
  §2b 普通套件的多挂饰清单：includes 里的**全部**挂饰都要装上（阶段 9 多选语义）。

  ⚠️ 这条守的是用户报障"装饰套件点不开，没反应"的真凶：
  旧 kitSlots() 用 `out[slot] = id` 前缀推断，多件挂饰**互相覆盖只剩最后一件**
  （香火供奉套件含香炉+供桌+灯笼 3 件，应用后只剩灯笼）。用户当前挂饰恰好是
  灯笼时（很常见），点击 = 彻底 no-op —— 而普通套件又没有任何点击反馈
  （ring 只给整店套餐、卡上无「使用中」标记），观感就是按钮失灵。

  断言三件事：
  ① 声明层：多挂饰普通套件的 data-kit-slots.ornament 必须是**数组**且 ≥2 件
    （若是 string = 覆盖 bug 回归）；
  ② 行为层：点击后摘要「挂饰」显示的名字集合 = 声明数组（经 nameToId 换算）；
  ③ 反馈层：点击后该卡出现「使用中」标记、按钮变「重新应用」。
*/
{
  const beforeKit = await readSummary();
  const ornKit = await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-kit-applies="decor"]')) {
      let slots;
      try {
        slots = JSON.parse(el.getAttribute("data-kit-slots") ?? "{}");
      } catch {
        continue;
      }
      const orn = slots.ornament;
      if (Array.isArray(orn) && orn.length > 1) {
        const btn = [...el.querySelectorAll("button")].find((b) => /应用套件|重新应用/.test(b.textContent || ""));
        if (btn) {
          btn.click();
          return { orn, btnText: btn.textContent.trim(), decl: el.getAttribute("data-kit-slots") };
        }
      }
    }
    return null;
  });
  check(
    "§2b 找到含多件挂饰的普通套件且其声明是数组（覆盖 bug 回归哨）",
    !!ornKit,
    ornKit ? `声明挂饰=${JSON.stringify(ornKit.orn)} 按钮=${ornKit.btnText}` : "没有声明多挂饰的普通套件卡（或声明仍是 string）",
  );
  if (ornKit) {
    await page.waitForTimeout(600);
    const afterKit = await readSummary();
    const nameToId2 = await readNameToIdMap();
    const shownIds = (afterKit?.["挂饰"] ?? "")
      .split("、")
      .map((n) => nameToId2[n.trim()])
      .filter(Boolean);
    const want = [...ornKit.orn].sort();
    const got = [...shownIds].sort();
    check(
      "§2b 应用后清单 = 声明的全部挂饰（不覆盖、不丢件）",
      got.length === want.length && want.every((id, i) => got[i] === id),
      `摘要=[${afterKit?.["挂饰"]}] ids=${JSON.stringify(got)} 声明=${JSON.stringify(want)}`,
    );
    const marked = await page.evaluate((decl) => {
      for (const el of document.querySelectorAll('[data-kit-applies="decor"]')) {
        if (el.getAttribute("data-kit-slots") !== decl) continue;
        return [...el.querySelectorAll(".text-accent-600")].some((s) => s.textContent?.includes("使用中"));
      }
      return false;
    }, ornKit.decl);
    check("§2b 应用后套件卡出现「使用中」标记（点击有可见反馈）", marked);
  }
}

/*
  ⚠️ 另一条关键断言：整店套餐**保留 templateId**（不置空）。
  置空会让空间骨架退回 classic（2柱1枋），用户花 ¥59 观感反而"越买越朴素"。
  判据：摘要里「模板」不应变成"自定义搭配"。
*/
if (afterSummary) {
  check(
    "整店套餐保留模板（不置空 templateId，避免空间骨架退化）",
    afterSummary["模板"] !== "自定义搭配",
    `模板=${afterSummary["模板"]}`,
  );
}

// ---------------------------------------------------------------------------
// 3. 普通套件仍只换装饰（对照，防"全被当成整店套餐"）
// ---------------------------------------------------------------------------
console.log("\n=== 3. 普通套件只换装饰（对照） ===");

const before3 = await readSummary();
const clicked3 = await clickKitButton("decor");
if (clicked3 && before3) {
  const after3 = await readSummary();
  check(
    "普通套件应用后，壁纸与地纹保持不变（保留用户挑好的墙地）",
    !!after3 &&
      after3["壁纸"] === before3["壁纸"] &&
      after3["地纹"] === before3["地纹"],
    `壁纸 ${before3["壁纸"]}→${after3?.["壁纸"]} · 地纹 ${before3["地纹"]}→${after3?.["地纹"]}`,
  );
} else {
  console.log("SKIP  未找到普通套件卡片 —— 跳过对照断言");
}

// ---------------------------------------------------------------------------
// 4. 档次阶梯
// ---------------------------------------------------------------------------
console.log("\n=== 4. 档次阶梯 ===");

const ladderCount = await page.locator("[data-tier-ladder]").count();
check("档次阶梯存在（data-tier-ladder）", ladderCount === 1, `count=${ladderCount}`);

const levels = await page.locator("[data-tier-level]").count();
check("阶梯共 4 档", levels === 4, `count=${levels}`);

const currentCount = await page.locator('[data-tier-current="true"]').count();
check(
  "恰好 1 档被标为「当前」（判定接上了；0 或 4 都说明没接上）",
  currentCount === 1,
  `current=${currentCount}`,
);

/*
  ⚠️ 【核心】各档「可选套数」之和必须等于模板总数。

  这条断言是**为"单位写错"这个病**加的 —— 它在本文件对应的组件里踩了**两次**：
    ① 判「当前档」时手写 `curPrice < 1500`（`priceYuan()` 是元、阈值是分）→
       ¥99 恒落"入门档"；
    ② 修了 ① 之后**统计各档套数那处没改**（`y >= d.min` 同样是元比分）→
       "可选套数"长期显示 `entry:0 mid:0 lux:0`，
       而当时 v3 只断言"阶梯存在 / 有 4 档 / 恰好 1 个 current"——
       **三条全绿**，这个 bug 就这么从断言网眼里漏过去了。

  为什么不用"每个档 > 0"这种更弱的写法：
    · 它测不出"区间边界写错"（比如 mid 写成 `[15,39)` 少了 39 → 落进 lux，
      各档仍都 > 0，但计数错了）；
    · 也测不出"某档被判空"以外的静默错误。
  而**合计守恒**对任何区间错误都敏感：单位错、边界漏、区间重叠、区间有缝，
  合计都会 ≠ 总数。这是"用守恒量做断言"比"用绝对值做断言"更稳的典型。
*/
const rungTexts = await page.locator("[data-tier-level]").allInnerTexts();
const rungCounts = rungTexts
  .map((t) => (t.match(/(\d+)\s*套可选/) ?? [])[1])
  .map((n) => (n === undefined ? null : Number(n)));
const sumRungs = rungCounts.every((n) => n !== null)
  ? rungCounts.reduce((a, b) => a + b, 0)
  : null;

/*
  模板总数从「整套模板」分类的卡片数现读 —— 不写死数字（AGENTS.md 陷阱 3：
  硬编码种子数量，用户加一套模板就变红）。
  先切到模板分类再数，数完由后面的流程负责切走。
*/
const tplTabForCount = page.locator("button", { hasText: "整套模板" }).first();
if ((await tplTabForCount.count()) > 0) {
  await tplTabForCount.click();
  await page.waitForTimeout(400);
}
const tplCardCount = await page.evaluate(() => {
  // 模板卡 = 含「一键应用/重新应用」按钮的卡片（与下面选卡逻辑同一判据）
  const btns = Array.from(document.querySelectorAll("button")).filter((b) =>
    /一键应用|重新应用/.test(b.textContent || ""),
  );
  const set = new Set();
  for (const b of btns) {
    const card = b.closest("div.overflow-hidden");
    if (card) set.add(card);
  }
  return set.size;
});

check(
  "各档「可选套数」之和 = 模板总数（区间无重叠/无缝/无单位错误）",
  sumRungs !== null && tplCardCount > 0 && sumRungs === tplCardCount,
  `各档=${JSON.stringify(rungCounts)} 合计=${sumRungs} 模板数=${tplCardCount}`,
);
/*
  再钉一条"不全是 0"—— 合计守恒在"总数也是 0 个"时会假绿（0 === 0）。
  模板卡数从 DOM 读，若 UI 改版导致数不到卡，上面那条会变成 `0/0 通过`。
  所以显式要求"至少有一档非 0"，把这种"两边都空"的假绿堵掉。
*/
check(
  "至少有一档有可选模板（防「合计=总数=0」的假绿）",
  rungCounts.some((n) => (n ?? 0) > 0),
  `各档=${JSON.stringify(rungCounts)}`,
);

/*
  当前档随所选模板变化 —— 防止阶梯读死数据。
  切成一个「豪华档」模板（堂上规制 ¥99），当前档应从原档变成 lux。
*/
const cur0 = await page
  .locator('[data-tier-current="true"]')
  .first()
  .getAttribute("data-tier-level")
  .catch(() => null);

const tplTab = page.locator("button", { hasText: "整套模板" }).first();
if ((await tplTab.count()) > 0) {
  await tplTab.click();
  await page.waitForTimeout(400);
}
/*
  ⚠️ 定位模板卡要避开"方案摘要"里的同名文字（AGENTS.md 陷阱 8）：
     模板名会出现两次 —— 卡片标题一次、右侧方案摘要一次。
     用 `hasText` 过滤容器会先撞上摘要，拿到的"卡片"其实不含按钮。
     稳妥做法：跟探针同一套取法 —— 遍历 `[data-decor-compare]` 之外的
     `div.overflow-hidden` 卡片，用 innerText 匹配，再点卡内按钮。

  选一个**豪华档**模板（¥99「堂上规制」），点它之后当前档应从原档变成 lux。
*/
let switched = false;
const clickedName = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button")).filter((b) =>
    /一键应用|重新应用/.test(b.textContent || ""),
  );
  /*
    按**模板名**精确匹配卡片标题（`div.overflow-hidden` 里第 2 行是名字），
    不靠价格文本 —— 早先按 /¥99/ 找，而模板卡当时**没显示价格**
    （`tierBadge` 漏传 `priceFen`，已修），于是匹配落空、点到别的卡，
    当前档从 free → entry，看着"通过了"其实测的不是豪华模板。
  */
  const want = /堂上规制|鎏金堂|星河长明|莲开九品/;
  for (let i = btns.length - 1; i >= 0; i--) {
    const card = btns[i].closest("div.overflow-hidden");
    const lines = (card?.innerText ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
    const name = lines[1] ?? "";
    if (want.test(name)) {
      btns[i].click();
      return name;
    }
  }
  return null;
});
if (clickedName) {
  await page.waitForTimeout(500);
  switched = true;
}
if (switched) {
  const cur1 = await page
    .locator('[data-tier-current="true"]')
    .first()
    .getAttribute("data-tier-level")
    .catch(() => null);
  /*
    ⚠️ 断的是"**落到了 lux**"，不是"变了"。
    早先只断言 `cur0 !== cur1` —— 那是**弱断言**：正是它让上面那个单位 bug
    蒙混过关（bug 版本下点 ¥99 得到 entry，与 cur0=free 相比"确实变了"，
    于是绿着通过）。**断言"变成了什么"才守得住口径，断言"变没变"只守得住"接没接上"。**
  */
  check(
    "切豪华模板（¥99）后「当前档」= 豪华（不是仅仅「变了」）",
    cur1 === "lux",
    `${cur0} → ${cur1}（点了 ${clickedName}）`,
  );
} else {
  console.log("SKIP  未找到可点击的模板卡 —— 跳过「当前档随模板变化」断言");
}

// ---------------------------------------------------------------------------
// 5. 整页预览（换肤骨架）
// ---------------------------------------------------------------------------
console.log("\n=== 5. 整页预览 ===");

// 打开全屏预览
const fullBtn = page.locator("button", { hasText: "全屏预览" }).first();
if ((await fullBtn.count()) > 0) {
  await fullBtn.click();
  await page.waitForTimeout(500);
}
const fpOpen = await page.locator("[data-decor-fullpreview]").count();
check("全屏预览层打开了", fpOpen === 1, `count=${fpOpen}`);

// 切到「整页效果」tab
const pageTab = page.locator('[data-decor-fullpreview-tab="page"]').first();
if ((await pageTab.count()) > 0) {
  await pageTab.click();
  await page.waitForTimeout(500);
}
const pagePreview = await page.locator("[data-decor-pagepreview]").count();
check("整页预览渲染（data-decor-pagepreview）", pagePreview === 1, `count=${pagePreview}`);

/*
  换肤注入证据：预览里的装修层必须挂 data-skin，且注入 --skin-* 变量。
  判据是"实际输出的内联 style 里有 --skin-gilt"（不是只看属性存在）。
*/
const skinProbe = await page.evaluate(() => {
  const root = document.querySelector("[data-decor-pagepreview]");
  if (!root) return null;
  const layer = root.querySelector("[data-skin]");
  const target = layer ?? root;
  const style = (target).getAttribute("style") ?? "";
  // 在预览子树里找第一个带 --skin 的节点
  let host = target;
  if (!/--skin/.test(style)) {
    const cand = Array.from(root.querySelectorAll("*")).find((e) =>
      /--skin/.test(e.getAttribute("style") ?? ""),
    );
    if (cand) host = cand;
  }
  const s = host.getAttribute("style") ?? "";
  return {
    hasDataSkin: !!layer,
    skinFlag: layer?.getAttribute("data-skin") ?? null,
    hasVars: /--skin-gilt/.test(s),
    gilt: (s.match(/--skin-gilt:\s*([^;]+)/) ?? [])[1] ?? null,
    dark: (s.match(/--skin-dark:\s*([^;]+)/) ?? [])[1] ?? null,
  };
});
check(
  "整页预览里装修层挂了 data-skin（换肤接驳成功）",
  !!skinProbe?.hasDataSkin,
  `flag=${skinProbe?.skinFlag}`,
);
check(
  "整页预览注入了 --skin-* CSS 变量",
  !!skinProbe?.hasVars,
  `gilt=${skinProbe?.gilt} dark=${skinProbe?.dark}`,
);

/*
  隐私硬约束：预览里**不得出现逝者照片**。
  反向验证要点：本断言必须自己制造前提（若预览容器本身没渲染，
  `!html.includes("遗像")` 会恒为 true）。所以先断言"预览确实渲染了"，
  再断言"里面没有遗像 img"（上一条 data-decor-pagepreview === 1 已保证渲染）。
*/
const portraitInPreview = await page.evaluate(() => {
  const root = document.querySelector("[data-decor-pagepreview]");
  if (!root) return -1;
  return root.querySelectorAll('img[alt*="遗像"]').length;
});
check(
  "整页预览里不出现逝者照片（隐私硬约束）",
  portraitInPreview === 0,
  `img[alt*=遗像]=${portraitInPreview}`,
);

// 关掉全屏预览（Esc）
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
const fpClosed = await page.locator("[data-decor-fullpreview]").count();
check("Esc 能关闭全屏预览", fpClosed === 0, `count=${fpClosed}`);

// ---------------------------------------------------------------------------
// 6. 对比视图未被破坏（回归）
// ---------------------------------------------------------------------------
console.log("\n=== 6. 对比视图回归 ===");

const cmpState = await page
  .locator("[data-decor-compare]")
  .first()
  .getAttribute("data-decor-compare");
if (cmpState === "on") {
  const scenes = await page.locator("[data-decor-3d]").count();
  check("对比开启时正好 2 个 3D 场景（未被新节点污染）", scenes === 2, `scenes=${scenes}`);
}
const paneBefore = await page.locator('[data-decor-compare-pane="before"]').count();
const paneAfter = await page.locator('[data-decor-compare-pane="after"]').count();
check("对比两屏都在", paneBefore === 1 && paneAfter === 1, `before=${paneBefore} after=${paneAfter}`);

// ---------------------------------------------------------------------------
// 7. 控制台零错误
// ---------------------------------------------------------------------------
console.log("\n=== 7. 控制台 ===");
const realErrors = consoleErrors.filter(
  (e) => !/favicon|404|net::ERR|Failed to load resource/i.test(e),
);
check("工坊全程无控制台错误", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

await browser.close();

// ---------------------------------------------------------------------------
console.log(`\n===== 阶段 5 工坊验收：${pass}/${pass + fail} PASS =====`);
if (failures.length) {
  console.log("变红项：");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
