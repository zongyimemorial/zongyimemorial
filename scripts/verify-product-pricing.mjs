/**
 * 产品体系与定价验收套件
 *
 * 背景：免费祭品从 30 个收敛到 10 个，其余 20 个转收费（¥2–8），商城改为五档排版。
 *
 * 本套件要守住的核心不变量：
 *   1. 免费品**恰好 10 个**（多一个少一个都是回归）
 *   2. 免费品零价、无积分价、是礼器
 *   3. 转收费的 20 个：price 200–800 分、积分价 1:1、isRitual=true
 *   4. **老商品价格一律没被动过**（尤其 whisper 的 ¥59/¥99 —— 它与 lib/whisper.ts
 *      的 PLAN_SPECS 是双写同步关系，改一处就会两边不一致）
 *   5. 纪念馆祭拜面板：免费按钮恰好 10 个可点亮；未购的收费祭品**不是"即将上线"**
 *      而是明码标价 —— 这是"转收费"后最容易被忽略的体验回归
 *   6. 宗祠面板 8 个按钮全亮
 *   7. 商城：五档导航、免费区标"共 10 项"、无 ¥0.00 卡片
 *   8. 积分每日上限 ≥1000（否则 ¥8 商品永远兑不出来）
 *
 * 前置：Next 已在 127.0.0.1:3000 运行。
 */
import { execSync } from "node:child_process";
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";

const { chromium } = pkg;
const BASE = "http://127.0.0.1:3000";
const HALL_ID = process.env.HALL_ID || "cmulk2q7l000211vlj3xpjpwi";
const CLAN_HALL_ID = process.env.CLAN_HALL_ID || "";

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

/** psql 查询（注意：必须单行，多行会让 docker exec 传参出错） */
function psql(q) {
  return execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`, {
    encoding: "utf8",
  }).trim();
}

// ---------------------------------------------------------------------------
// 1. 数据层：免费数量与构成
// ---------------------------------------------------------------------------
console.log("\n=== 1. 数据层 ===");

const freeCount = Number(psql(`SELECT count(*) FROM "Product" WHERE "isFree"=true;`));
check("免费祭品恰好 10 个", freeCount === 10, `实际 ${freeCount}`);

const badFree = psql(
  `SELECT count(*) FROM "Product" WHERE "isFree"=true AND (price<>0 OR "pointsPrice" IS NOT NULL OR "isRitual"<>true);`,
);
check("免费品：零价 + 无积分价 + 是礼器", Number(badFree) === 0, `异常 ${badFree} 个`);

const paidRitual = psql(
  `SELECT count(*) FROM "Product" WHERE "isRitual"=true AND "isFree"=false;`,
);
check("收费礼器恰好 20 个", Number(paidRitual) === 20, `实际 ${paidRitual}`);

/*
  ⚠️ 币种改造（2026-10）：售价展示口径已改为**福币**（1 福币 = 1 人民币）。
  `price`（分）仍是**账本口径**（OrderItem.unitPrice / Payment.amount 都从它来），
  福币价由 `fubFromFen(price)` **现算** —— `Product.fubPrice` 派生列已删除。

  为什么删列：商品价需要**一位小数**精度（装修素材 14 处非整元价），
  `Int` 列装不下 → 必然沦为「同一个事实的第二个判据」。
  所以区间判据现在直接换算 `price`，不再读任何冗余列。
*/
/*
  价格区间：2026-10 价格带重构后为 **1–18 福币**（原 2–8）。
  重构依据：原先 2 元 5 款 + 3 元 9 款 = 70% 挤在一起，8 元之上断档；
  现拉成 7 个价位 1/2/3/5/8/12/18，每个价位 1–7 款、语义边界清楚。
  （改价前实测 20 款全零销量，零风险；详见 seed-product-tiers.mjs 的 PAID_RITUALS 注释。）
*/
const rangeOk = psql(
  `SELECT count(*) FROM "Product" WHERE "isRitual"=true AND "isFree"=false AND (price/100.0 < 1 OR price/100.0 > 18);`,
);
check("收费礼器价格落在 1–18 福币", Number(rangeOk) === 0, `越界 ${rangeOk} 个`);

/*
  积分价 1:1 的口径：100 积分 = ¥1 = 1 福币 → pointsPrice === price（分）。
  （改造前也是这个等式，但改读福币后口径更直白：price 的分 == 积分的个数。）
*/
const oneToOne = psql(
  `SELECT count(*) FROM "Product" WHERE "isRitual"=true AND "isFree"=false AND "pointsPrice" IS DISTINCT FROM price;`,
);
check("收费礼器积分价 1:1（100 积分=¥1=1 福币）", Number(oneToOne) === 0, `不一致 ${oneToOne} 个`);

// 免费名单必须正好是约定的那 10 个 slug
const FREE_EXPECTED = [
  "free-incense", "free-flower", "free-candle", "free-fruit", "free-tea",
  "free-wine", "free-clean", "free-bow", "free-message", "free-music",
];
const freeSlugs = psql(`SELECT slug FROM "Product" WHERE "isFree"=true ORDER BY slug;`)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
check(
  "免费名单与约定一致（基础六供+二礼仪+二互动）",
  JSON.stringify(freeSlugs) === JSON.stringify([...FREE_EXPECTED].sort()),
  `实际 ${freeSlugs.join(",")}`,
);

// ---------------------------------------------------------------------------
// 2. 老商品价格未被误伤
// ---------------------------------------------------------------------------
console.log("\n=== 2. 老商品价格未被动过 ===");

// [slug, 期望 price(分), 期望 pointsPrice]
const UNTOUCHED = [
  ["whisper-basic", 7900, null], // 与 lib/whisper.ts PLAN_SPECS 双写同步（2026-10 调价保毛利 ≥30%）
  ["whisper-premium", 19900, null], // 本轮 ¥249→¥199（视频拆出单卖）
  ["whisper-video", 4900, null], // 本轮新增：纪念短片单条加购（memorial_service）
  ["whisper-single", 600, null],
  ["whisper-clone", 1000, null],
  ["paper-car", 1000, 1000],
  ["paper-villa", 1500, 1500],
  // digital-memorial-hall 已从本表移出：2026-10 商业模式调整后它被**有意下架**
  // （建馆免费，见 §2c），"未被动过"的语义不再适用。
];

for (const [slug, price, pts] of UNTOUCHED) {
  const row = psql(
    `SELECT price || '|' || coalesce("pointsPrice"::text,'') FROM "Product" WHERE slug='${slug}';`,
  );
  const [actualPrice, actualPts] = row.split("|");
  const ok = Number(actualPrice) === price && (actualPts || "").trim() === (pts === null ? "" : String(pts));
  check(`老商品未被动过：${slug}`, ok, `实际 ${actualPrice}/${actualPts || "—"}`);
}

// ---------------------------------------------------------------------------
// 2c. 免费建馆口径（2026-10 商业模式调整：建馆免费，需实名认证）
// ---------------------------------------------------------------------------
// 免费通道：app/(public)/halls/new（实名 + MZ/T 173 材料 + pending 人工审核）。
// 付费建馆商品（¥98/¥198 建馆、¥68 续费、¥20 名为模板实为建馆的
// hall-template-elegant）**全部下架**；四件均零订单，无历史包袱。
console.log("\n=== 2c. 建馆免费：付费建馆商品全部下架 ===");
{
  const activeCount = Number(
    psql(`SELECT count(*) FROM "Product" WHERE type='memorial_hall' AND status='active';`),
  );
  const inactiveRows = psql(
    `SELECT count(*) FILTER (WHERE status='inactive') || '|' || count(*) FROM "Product" WHERE type='memorial_hall';`,
  );
  const [inactiveCount, totalCount] = inactiveRows.split("|").map(Number);
  check(
    "建馆商品全部下架（active=0 且 inactive=总数）",
    activeCount === 0 && inactiveCount === totalCount,
    `active=${activeCount} inactive=${inactiveCount}/${totalCount}`,
  );
  check(
    "下架商品覆盖四个已知 slug（≥4）",
    inactiveCount >= 4,
    `实际 ${inactiveCount}（digital/family/renew/hall-template-elegant）`,
  );
  // 下架 ≠ 可以乱改价：历史订单语义仍引用这些商品行
  const dmRow = psql(
    `SELECT price || '|' || coalesce("pointsPrice"::text,'') FROM "Product" WHERE slug='digital-memorial-hall';`,
  );
  const [dmPrice, dmPts] = dmRow.split("|");
  check(
    "下架商品价格未漂移：digital-memorial-hall 9800/19600",
    Number(dmPrice) === 9800 && (dmPts || "").trim() === "19600",
    `实际 ${dmPrice}/${dmPts || "—"}`,
  );
  // 商城列表与积分兑换页都以 status='active' 过滤，下架即从两处消失
  const mallVisible = psql(
    `SELECT count(*) FROM "Product" WHERE type='memorial_hall' AND status='active';`,
  );
  check("商城不再出售任何建馆商品", Number(mallVisible) === 0, `实际 ${mallVisible}`);
}

// ---------------------------------------------------------------------------
// 2d. 产品体系审计执行（2026-10，docs/产品体系审计.md）
// ---------------------------------------------------------------------------
// 审计结论固化：
//   a) 天堂信箱（free-letter）是**收费礼器 ¥8**，唯一定义在 seed-product-tiers 的
//      PAID_RITUALS；seed-products 的免费清单已移除该 slug（历史上两处打架）。
//   b) 风格类商品 tombstone-style / homepage-style 与装修系统（decor-*）重叠，已下架。
console.log("\n=== 2d. 产品体系审计：天堂信箱收费 & 风格类下架 ===");
{
  const letter = psql(
    `SELECT "isFree"::text || '|' || price FROM "Product" WHERE slug='free-letter';`,
  );
  const [letterFree, letterPrice] = letter.split("|");
  check(
    "天堂信箱为收费礼器（isFree=false 且 ¥8）",
    letterFree === "false" && Number(letterPrice) === 800,
    `实际 ${letterFree}/${letterPrice}`,
  );

  const styleInactive = Number(
    psql(`SELECT count(*) FROM "Product" WHERE slug IN ('tombstone-style','homepage-style') AND status='inactive';`),
  );
  check(
    "风格类商品已下架（tombstone-style / homepage-style）",
    styleInactive === 2,
    `inactive=${styleInactive}/2`,
  );

  const styleVisible = Number(
    psql(`SELECT count(*) FROM "Product" WHERE slug IN ('tombstone-style','homepage-style') AND status='active';`),
  );
  check("商城不再出售任何风格类商品", styleVisible === 0, `active=${styleVisible}`);
}

// 悄悄话商品不应变成礼器
const whisperRitual = psql(
  `SELECT count(*) FROM "Product" WHERE slug LIKE 'whisper-%' AND "isRitual"=true;`,
);
check("悄悄话商品未被标为礼器", Number(whisperRitual) === 0, `实际 ${whisperRitual}`);

// ---------------------------------------------------------------------------
// 2b. 供奉体系：消耗式库存的数据层契约
// ---------------------------------------------------------------------------
console.log("\n=== 2b. 供奉体系（消耗式库存）===");

// 两张新表存在且唯一键正确
const holdingTable = psql(
  `SELECT count(*) FROM information_schema.tables WHERE table_name='OfferingHolding';`,
);
check("库存表 OfferingHolding 已建", Number(holdingTable) === 1, `实际 ${holdingTable}`);

const altarTable = psql(
  `SELECT count(*) FROM information_schema.tables WHERE table_name='OfferingOnAltar';`,
);
check("供台表 OfferingOnAltar 已建", Number(altarTable) === 1, `实际 ${altarTable}`);

const uniqueIdx = psql(
  `SELECT count(*) FROM pg_indexes WHERE tablename='OfferingHolding' AND indexname='OfferingHolding_userId_productId_key';`,
);
check("库存唯一键 (userId, productId) 存在", Number(uniqueIdx) === 1, `实际 ${uniqueIdx}`);

// 库存不得为负（条件写保证了这点）
const negativeQty = psql(`SELECT count(*) FROM "OfferingHolding" WHERE quantity < 0;`);
check("库存无负数（条件写生效）", Number(negativeQty) === 0, `实际 ${negativeQty}`);

/*
  每日配额：**交叉验证常量与用户可见文案的口径**，而不是把数字写死在这里。
  本意是"两处别对不上"，不是"必须是某个数"——早先写死 3，后来产品把配额调成 1 份
  并同步改了面板文案（WorshipPanel「自动补足每日 1 份」），这条断言却还盯着 3，
  于是变成一条永远红、且无法通过改产品来修的假红灯。
  现在：只要常量与文案一致即通过；两者不一致才红（那才是真的口径打架）。
*/
const offeringsSrc = execSync("cat lib/offerings.ts", { encoding: "utf8" });
const quota = Number((offeringsSrc.match(/FREE_DAILY_QUOTA\s*=\s*(\d+)/) || [])[1] || 0);
const worshipSrc = execSync("cat components/hall/WorshipPanel.tsx", { encoding: "utf8" });
const quotaInCopy = Number((worshipSrc.match(/自动补足每日\s*(\d+)\s*份/) || [])[1] || 0);
check(
  "免费每日配额：常量与面板文案口径一致",
  quota > 0 && quota === quotaInCopy,
  `常量=${quota} 文案=${quotaInCopy}`,
);

const altarMax = Number((offeringsSrc.match(/ALTAR_MAX_ITEMS\s*=\s*(\d+)/) || [])[1] || 0);
check("供台陈列上限为 12", altarMax === 12, `实际 ${altarMax}`);

// 消耗必须是条件写（不能用"先查后减"的竞态写法）
check(
  "扣库存用 updateMany 条件写（无 TOCTOU）",
  /updateMany\(\{[\s\S]{0,200}quantity:\s*\{\s*gt:\s*0\s*\}/.test(offeringsSrc),
  "未找到 quantity > 0 的条件写",
);

// 获得路径必须覆盖祭品两个 type（原先会直接穿透、买完拿不到东西）
const paySrc = execSync("cat lib/pay.ts", { encoding: "utf8" });
check(
  "支付发放库存覆盖 virtual_flower / tribute_item",
  /virtual_flower/.test(paySrc) && /tribute_item/.test(paySrc) && /offeringHolding/.test(paySrc),
  "simulatePay 缺少祭品发放分支",
);

const redeemSrc = execSync('cat "app/(public)/points/actions.ts"', { encoding: "utf8" });
check("积分兑换发放库存", /grantOffering/.test(redeemSrc), "redeemItem 未发放库存");

// 冷却机制已删除（库存消耗取代了它）
const hallActSrc = execSync('cat "app/(public)/halls/[id]/actions.ts"', { encoding: "utf8" });
check("纪念馆已移除 30 秒冷却", !/tooSoon/.test(hallActSrc), "仍存在 tooSoon");

const clanActSrc = execSync('cat "app/(public)/clan/halls/[id]/actions.ts"', { encoding: "utf8" });
check(
  "宗祠已移除免费日上限与冷却判定",
  !/FREE_DAILY_CAP/.test(clanActSrc) && !/tooSoon/.test(clanActSrc) && !/COOLDOWN_MS/.test(clanActSrc),
  "仍存在 FREE_DAILY_CAP / tooSoon / COOLDOWN_MS",
);
// 消耗制取代冷却：宗祠献祭必须走 consumeOffering，且失败时要 refundOffering
check(
  "宗祠献祭走库存消耗（consumeOffering）",
  /consumeOffering/.test(clanActSrc),
  "未调用 consumeOffering",
);
check(
  "先扣库存后扣分，扣分失败回滚库存",
  /refundOffering/.test(clanActSrc),
  "未调用 refundOffering",
);

// 铁律：宗祠金额恒为 0，身份快照字段保留
check("宗祠 amountFen 仍恒为 0", /amountFen:\s*0/.test(clanActSrc), "未找到 amountFen: 0");
check(
  "宗祠身份快照字段仍在（displayName/realNameSnap/contactSnap）",
  ["displayName", "realNameSnap", "contactSnap"].every((f) => clanActSrc.includes(f)),
  "",
);

// 供台表绝不存身份字段
const altarCols = psql(
  `SELECT string_agg(column_name, ',') FROM information_schema.columns WHERE table_name='OfferingOnAltar';`,
);
check(
  "供台表不含任何身份字段",
  !/realName|contact|displayName|idCard/i.test(altarCols),
  altarCols,
);

// ---------------------------------------------------------------------------
// 3. 积分上限
// ---------------------------------------------------------------------------
console.log("\n=== 3. 积分政策 ===");

const pointsSrc = execSync("cat lib/points.ts", { encoding: "utf8" });
const m = pointsSrc.match(/REDEEM_DAILY_LIMIT\s*=\s*(\d+)/);
const dailyLimit = m ? Number(m[1]) : 0;
check("每日兑换上限 ≥1000（覆盖 ¥8 商品）", dailyLimit >= 1000, `实际 ${dailyLimit}`);

// ---------------------------------------------------------------------------
// 4. 真实应用：商城页
// ---------------------------------------------------------------------------
console.log("\n=== 4. 商城页（真实应用） ===");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 160));
});

// ---------------------------------------------------------------------------
// 首页：服务板块必须给出「宗亲文化」入口（与数字纪念馆并列）
// 回归防护：这五项曾只有四项，/clan 只能从导航栏进 —— 重排时极易再次丢掉。
// ---------------------------------------------------------------------------
{
  // 新开一个 context：确保 preview_auth cookie 在 / 上也生效
  // （直接在旧 page 上 goto 曾落到 /preview-gate，innerText 拿到空 body → 假红）
  const hctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await hctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const hp = await hctx.newPage();
  await hp.goto(`${BASE}/?cb=${Date.now()}`, { waitUntil: "networkidle", timeout: 60000 });
  await hp.waitForSelector("text=我们提供的服务", { timeout: 30000 });

  const homeText = await hp.innerText("body");
  check("首页：服务板块含「宗亲文化」", homeText.includes("宗亲文化"), "五卡之一");
  check("首页：服务板块含「数字纪念馆」", homeText.includes("数字纪念馆"), "五卡之一");
  const clanHref = await hp.locator('a[href="/clan"]').count();
  check("首页：存在指向 /clan 的入口链接", clanHref >= 1, `实得 ${clanHref} 个`);

  // 两卡必须落在同一行（视觉并列）。
  // 注意：全局 pick 会命中导航栏里的同名链接（宽度只有 70px），
  // 必须限定在「我们提供的服务」这个 section 内取卡片。
  const rows = await hp.evaluate(() => {
    const heads = [...document.querySelectorAll("h2")];
    const sec = heads.find((h) => (h.textContent || "").includes("我们提供的服务"))?.closest("section");
    if (!sec) return null;
    const links = [...sec.querySelectorAll("a")];
    const pick = (t) => links.find((a) => (a.textContent || "").includes(t));
    const mh = pick("数字纪念馆");
    const cl = pick("宗亲文化");
    if (!mh || !cl) return null;
    const r1 = mh.getBoundingClientRect();
    const r2 = cl.getBoundingClientRect();
    return {
      mhTop: Math.round(r1.top), clTop: Math.round(r2.top),
      mhW: Math.round(r1.width), clW: Math.round(r2.width),
      clanHref: cl.getAttribute("href"),
    };
  });
  check(
    "首页：宗亲文化与数字纪念馆同一行（并列）",
    !!rows && Math.abs(rows.mhTop - rows.clTop) <= 4 && rows.mhW > 200 && rows.clW > 200,
    rows ? `馆 top=${rows.mhTop} w=${rows.mhW}，宗亲 top=${rows.clTop} w=${rows.clW}` : "未找到卡片",
  );
  check("首页：宗亲文化卡片指向 /clan", rows?.clanHref === "/clan", rows?.clanHref ?? "未找到");
  await hctx.close();
}

await page.goto(`${BASE}/mall`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("text=价格阶梯", { timeout: 30000 });
const mallText = await page.innerText("body");
check("商城页渲染成功", (await page.title()).length > 0);
check("页头显示免费数量", /10\s*项免费/.test(mallText), "含「10 项免费」");
check("五档导航：免费礼器", mallText.includes("免费礼器"));
check("五档导航：基础祭品", mallText.includes("基础祭品"));
check("五档导航：进阶供品", mallText.includes("进阶供品"));
check("五档导航：仪式体验", mallText.includes("仪式体验"));
check("五档导航：场景定制", mallText.includes("场景定制"));
check("免费区标注共 10 项", /共\s*10\s*项/.test(mallText));
// 币种改造：价格已改为福币展示。既不能出现人民币零价，也不能出现「0 福币」
check("商城不出现 ¥0.00", !mallText.includes("¥0.00"));
/*
  ⚠️ 左边界必须锚定 —— 光写 `/0\s*福币/` 会把**「10 福币」的尾巴**当成「0 福币」，
  页面全是对的价格却报红（纯假红）。要抓的是"独立出现的 0 福币"。
*/
check("商城不出现「0 福币」（免费品应显示「免费」）", !/(^|[^\d.])0\s*福币/.test(mallText));
check("商城卡片以福币计价", /福币/.test(mallText));
check("展示价格阶梯", mallText.includes("价格阶梯"));

// 免费档导航可点，切过去后免费区仍在（等免费区标题落定再断言，RSC 是流式的）
await page.goto(`${BASE}/mall?tier=free`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("text=共 10 项", { timeout: 30000 });
const freeTabText = await page.innerText("body");
check("免费档：显示免费区", freeTabText.includes("免费祭品") && /共\s*10\s*项/.test(freeTabText));

// 付费档：应无免费卡片
await page.goto(`${BASE}/mall?tier=ceremony`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("h2:has-text('仪式体验')", { timeout: 30000 });
const cerText = await page.innerText("body");
check("仪式档：不混入免费区", !cerText.includes("免费祭品 · 一键祭拜"));

// ---------------------------------------------------------------------------
// 5. 免费品详情页：不应出现「立即购买」+ ¥0.00
// ---------------------------------------------------------------------------
console.log("\n=== 5. 商品详情页 ===");

// 注意：详情页是 RSC 流式渲染，domcontentloaded 时正文可能还没到位，必须等正文落定再断言。
await page.goto(`${BASE}/mall/free-incense`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("text=去纪念馆祭拜", { timeout: 30000 });
const freeDetail = await page.innerText("body");
check("免费品详情页：显示「免费」而非 0 福币", freeDetail.includes("免费") && !freeDetail.includes("¥0.00") && !/(^|[^\d.])0\s*福币/.test(freeDetail));
check("免费品详情页：无「立即购买」", !freeDetail.includes("立即购买"));
check("免费品详情页：引导去纪念馆", freeDetail.includes("去纪念馆祭拜"));

await page.goto(`${BASE}/mall/free-firework`, { waitUntil: "domcontentloaded", timeout: 60000 });
// ⚠️ 选择器用**当前真实文案**「立即购买」；早先写的「购买后如何使用」早已改名，只会等到超时（假红）。
await page.waitForSelector("text=立即购买", { timeout: 30000 });
const paidRitualDetail = await page.innerText("body");
/*
  收费礼器详情页（数字烟花，2026-10 价格带重构后为 1800 分 = **18 福币**）。

  ⚠️ 币种改造后文案由「¥8.00」变为「18 福币（¥18）」（`<Price>` 的默认格式）。
  判据同步改为**福币口径**，并额外断言**人民币括号仍在** ——
  需求是「福币为主、括号标注人民币」，只有福币、丢了人民币标注就是没做全。

  ⚠️ 价格数字写死 18 会让"调价即假红" —— 但这是**故意的**：
  本套件同时守「价格区间 1–18」，两者一起改才一致。若只改价不更断言，就该红。
*/
check("收费礼器详情页：显示福币价", paidRitualDetail.includes("18 福币"));
check("收费礼器详情页：福币价旁仍标注人民币", /18\s*福币（¥18）/.test(paidRitualDetail));
check("收费礼器详情页：说明购买后如何用", paidRitualDetail.includes("购买后如何使用"));

// ---------------------------------------------------------------------------
// 6. 纪念馆祭拜面板：三级按钮态
// ---------------------------------------------------------------------------
console.log("\n=== 6. 纪念馆祭拜面板 ===");

await page.goto(`${BASE}/halls/${HALL_ID}`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("text=10 套免费动效", { timeout: 30000 });
const hallText = await page.innerText("body");

check("面板文案：10 套免费动效", hallText.includes("10 套免费动效"));
/*
  产品规则：面板**只展示我持有的供品**。
  因此统计不再是「免费 N 项 · 可解锁 M 项」（那会把 20 个未购收费品全渲染成价格牌），
  而是「已持有 N 件 · 用尽 M 件」—— 见 scripts/verify-offering-panel.mjs 的完整覆盖。
*/
check("面板计数：已持有 N 件", /已持有\s*\d+\s*件/.test(hallText));
check("面板不再出现「可解锁 20 项」", !/可解锁\s*20\s*项/.test(hallText));
check("面板不再出现「30 套」", !hallText.includes("30 套"));

// 未购的收费祭品**不出现在面板**（下方统一改为到商城逛，而不是在馆里挂价格牌）
/*
  ⚠️ 正则左边界必须锚定 —— `!/8\s*福币/` 会**误命中「18 福币」**
  （价格带重构后数字烟花就是 18 元，面板里若出现它就会假红）。
  要抓的是"独立的 8 福币价格牌"。
*/
check("未购收费祭品不在面板（无 8 福币价格牌）", !/(^|[^\d.])8\s*福币/.test(hallText));
check("面板不再是「即将上线」", !hallText.includes("即将上线"));
check("面板提供补货入口「去商城补充供品」", hallText.includes("去商城补充供品"));

// 数一下面板里有多少个「献上X」按钮（都是持有的）
const freeBtnCount = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  return btns.filter((b) => (b.getAttribute("title") ?? "").startsWith("献上")).length;
});
check("面板按钮数量合理（≥10，含 10 个免费）", freeBtnCount >= 10, `实际 ${freeBtnCount}`);

// 供奉体系：剩余份数角标 + 用尽态不消失
const qtyBadges = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  return btns.filter((b) => /[×x]\s*\d+|已用尽/.test(b.textContent ?? "")).length;
});
check("面板显示剩余份数角标（或已用尽标记）", qtyBadges >= 10, `实际 ${qtyBadges}`);

check("面板说明消耗语义", /每份用一次/.test(hallText), "");

// ---------------------------------------------------------------------------
// 7. 宗祠祭拜面板
// ---------------------------------------------------------------------------
console.log("\n=== 7. 宗祠祭拜面板 ===");

let clanId = CLAN_HALL_ID;
if (!clanId) {
  clanId = psql(`SELECT id FROM "ClanHall" WHERE status='active' ORDER BY "createdAt" LIMIT 1;`)
    .split("\n")[0]
    .trim();
}

if (clanId) {
  await page.goto(`${BASE}/clan/halls/${clanId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(600);
  const clanText = await page.innerText("body");
  check("宗祠页：显示「免费祭品 · 一键献祭」", clanText.includes("免费祭品 · 一键献祭"));

  // 8 个按钮：上香/献花/点烛/供果/祭酒/清茶/擦拭/三鞠躬
  const wanted = ["上香", "献花", "点烛", "供果", "祭酒", "清茶", "擦拭", "三鞠躬"];
  const missing = wanted.filter((w) => !clanText.includes(w));
  check("宗祠页：8 个免费献祭按钮全在", missing.length === 0, missing.length ? `缺 ${missing.join("/")}` : "8/8");

  /*
    回归防护：祭文弹窗（free-poem）必须可提交。
    free-poem 从免费转收费后，面板若仍从 freeProducts（isFree=true）里找它，
    就会拿到 undefined → 弹窗的「献上」按钮永久 disabled，用户写不了祭文。
    这正是本次改造中新出现过的真实缺陷，必须锁住。

    注意：写祭文要求登录，故此处需先以普通用户身份登录。
  */
  // 必须显式打开登录页：此时 page 停在商品详情页，那里没有登录表单，
  // 若用「页面上有 identifier 就登录」的判断会静默跳过登录。
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const loginField = page.locator('input[name="identifier"]');
  await page.waitForSelector('input[name="identifier"]', { timeout: 30000 });
  await loginField.fill("user@test.com");
  await page.fill('input[name="password"]', "user123456");
  await Promise.all([
    page.waitForNavigation({ timeout: 60000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  /*
    消耗制下「献上」按钮的可用性 = free-poem 库存 > 0。
    但库存会被别的套件（尤其 verify-clan-tribute-e2e）消耗干净，
    于是这条断言会变成"取决于谁先跑"的随机结果。
    为了让它只检验**它自己要检验的东西**（面板能不能找到 free-poem 这个礼器），
    这里先给它备货，再刷新页面让 qty 进入 SSR。
  */
  psql(
    `INSERT INTO "OfferingHolding" ("id","userId","productId","quantity","freeTopUpDate","updatedAt") ` +
      `SELECT gen_random_uuid()::text, u.id, p.id, 3, null, now() FROM "User" u, "Product" p ` +
      `WHERE u.email='user@test.com' AND p.slug='free-poem' ` +
      `ON CONFLICT ("userId","productId") DO NOTHING;`,
  );
  psql(
    `UPDATE "OfferingHolding" h SET "quantity"=GREATEST(h."quantity",3), "updatedAt"=now() ` +
      `FROM "User" u, "Product" p WHERE h."userId"=u.id AND h."productId"=p.id ` +
      `AND u.email='user@test.com' AND p.slug='free-poem';`,
  );

  await page.goto(`${BASE}/clan/halls/${clanId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(900);

  const msgBtn = page.locator("text=写一段祭文");
  await page.waitForSelector("text=写一段祭文", { timeout: 30000 });
  await msgBtn.first().click();
  await page.waitForSelector("textarea", { timeout: 20000 });
  await page.fill("textarea", "伏惟尚飨，子孙永念。");
  await page.waitForTimeout(400);

  const submitBtn = page.locator('button:has-text("献上")').last();
  const disabled = await submitBtn.isDisabled();
  check("宗祠页：祭文弹窗「献上」按钮可点（free-poem 转收费后未失效）", !disabled);

  if (!disabled) {
    await submitBtn.click();
    await page.waitForTimeout(2600);
    const row = psql(
      `SELECT coalesce(message,'') FROM "ClanTribute" WHERE "clanHallId"='${clanId}' AND message IS NOT NULL ORDER BY "createdAt" DESC LIMIT 1;`,
    );
    check("宗祠页：祭文留言成功落库", row === "伏惟尚飨，子孙永念。", row || "(空)");
  }
} else {
  check("宗祠页：找到可测宗祠", false, "DB 中无 active 宗祠");
}

// ---------------------------------------------------------------------------
// 8. 控制台无错误
// ---------------------------------------------------------------------------
console.log("\n=== 8. 运行时健康 ===");
check("无控制台错误", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

await browser.close();

// ---------------------------------------------------------------------------
console.log(`\n通过 ${pass}/${pass + fail}`);
if (fail > 0) {
  console.log("失败项：");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
