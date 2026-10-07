// 宗祠祭祀 / 消费记录（消费人名称展示）端到端验证
//
// 覆盖范围：
//   1. 前台献祭面板与「祭祀记录」板块渲染
//   2. 免费献祭 → 写入记录、displayName 脱敏、amountFen=0、+2 积分
//   3. 前台页面**绝不出现完整实名**（安全断言）
//   4. 祭文留言落库
//   5. 无实名用户的回退分支（邮箱脱敏 us***@test.com）
//   6. 积分供奉扣减积分并计入记录
//   7. 消耗式库存：扣减、每日补货、用尽拒绝、供台陈列与撤供
//   8. 馆主管理台可见完整实名 + 联系方式
//
// 运行前置：服务已在 3000 端口以生产构建运行；Docker 容器 memorial-pg 存活。
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { execSync } from "node:child_process";
const { chromium } = pkg;

const BASE = "http://localhost:3000";
const HALL_ID = process.env.HALL_ID || null; // 不传则自动取第一个 active 宗祠

function sql(q) {
  return execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`, {
    encoding: "utf8",
  }).trim();
}
function sqlCount(q) {
  return Number(sql(q) || "0");
}

/*
确保某个 slug 至少有 n 份库存。
消耗制改造后，「进祠自动补当日免费配额」这一动作发生在页面服务端渲染时，
而本脚本在首个断言（免费献祭）之前尚未触发过补货；
另外积分供奉扣分后若余额不足还需要回滚，这些都会让库存状态变得难以预测。
与其让断言去猜，不如在需要时显式备货 —— 语义上等价于「用户刚买/刚领到」。
*/
function ensureStock(slug, n = 3) {
  // 注意：updatedAt 没有数据库级默认值（Prisma 在应用层维护），裸 SQL 必须显式给值。
  sql(
    `insert into "OfferingHolding" ("id","userId","productId","quantity","freeTopUpDate","updatedAt") ` +
      `select gen_random_uuid()::text, u.id, p.id, ${n}, null, now() ` +
      `from "User" u, "Product" p where u.email='user@test.com' and p.slug='${slug}' ` +
      `on conflict ("userId","productId") do nothing;`,
  );
  sql(
    `update "OfferingHolding" h set "quantity" = greatest(h."quantity", ${n}), "updatedAt" = now() ` +
      `from "User" u, "Product" p ` +
      `where h."userId"=u.id and h."productId"=p.id and u.email='user@test.com' and p.slug='${slug}';`,
  );
}

const results = [];
const consoleErrors = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok: !!ok, extra: String(extra).slice(0, 160).replace(/\n/g, " ") });
};

// ---------------------------------------------------------------- 准备数据
// 测试用户：清空实名/手机号，仅留邮箱（验证邮箱脱敏回退分支）
sql(`update "User" set "realName" = null, phone = null, points = 2000 where email='user@test.com';`);

/*
  库存必须清空重来：本套件会反复祭拜同一批免费祭品，
  若不重置，第二次运行时库存已被上轮跑测试消耗到 0、按钮全变「已用尽」，
  断言会以"找不到按钮"的形式随机失败（flaky）。清掉后由页面访问自动补当日配额。
*/
sql(`delete from "OfferingHolding" h using "User" u where h."userId"=u.id and u.email='user@test.com';`);
sql(`delete from "OfferingOnAltar" a using "User" u where a."userId"=u.id and u.email='user@test.com';`);

const hallId =
  HALL_ID ||
  sql(`select id from "ClanHall" where status='active' order by "createdAt" limit 1;`);
if (!hallId) {
  console.error("找不到 active 状态的宗祠，无法继续");
  process.exit(1);
}
const hallName = sql(`select "hallName" from "ClanHall" where id='${hallId}';`);

// 祭品准入看 isRitual（能不能献祭），不看 isFree（收不收费）：
// 产品体系重构后 free-poem 已从免费转收费（¥5），但它仍是礼器，宗祠侧照样可献。
const freeIncense = sql(
  `select id from "Product" where slug='free-incense' and "isRitual"=true and status='active' limit 1;`,
);
const freePoem = sql(
  `select id from "Product" where slug='free-poem' and "isRitual"=true and status='active' limit 1;`,
);
// 找一个积分价较低、买得起的供品（测试用户 2000 分）
const paidProduct = sql(
  `select id||'|'||"pointsPrice" from "Product" where "isRitual"=true and "isFree"=false and status='active' and "pointsPrice" between 1 and 1000 order by "pointsPrice" limit 1;`,
);
const [paidId, paidPriceRaw] = paidProduct.split("|");
const paidPrice = Number(paidPriceRaw || 0);

// 清理该宗祠历史记录，保证断言可复现
sql(`delete from "ClanTribute" where "clanHallId"='${hallId}';`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

// ---------------------------------------------------------------- 1. 登录
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
if ((await page.locator('input[name="identifier"]').count()) > 0) {
  await page.fill('input[name="identifier"]', "user@test.com");
  await page.fill('input[name="password"]', "user123456");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3200);
}
check("普通用户登录成功", !/\/login/.test(page.url()), page.url());

// ---------------------------------------------------------------- 2. 前台页面结构
await page.goto(`${BASE}/clan/halls/${hallId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
const bodyText = await page.locator("body").innerText();
check("宗祠详情页可访问", page.url().includes(`/clan/halls/${hallId}`), page.url());
check("存在「献祭」板块标题", /献祭/.test(bodyText), "献祭 · 敬奉先祖");
check("存在「祭祀记录」板块", /祭祀记录/.test(bodyText), "");
check("免费祭品提示「每次 +2 积分」", /\+2 积分/.test(bodyText), "");
check("显示当前积分", /我的积分\s*\d+/.test(bodyText), (bodyText.match(/我的积分\s*\d+/) || [""])[0]);

// ---------------------------------------------------------------- 3. 免费献祭（上香）
ensureStock("free-incense", 3); // 消耗制：先有货才能献
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
const beforePoints = sqlCount(`select points from "User" where email='user@test.com';`);
const incenseBtn = page.locator('button[title="献上上香"]');
check("「上香」按钮渲染", (await incenseBtn.count()) > 0, `count=${await incenseBtn.count()}`);
if ((await incenseBtn.count()) > 0) {
  await incenseBtn.first().click();
  await page.waitForTimeout(2500);
}
const afterPoints = sqlCount(`select points from "User" where email='user@test.com';`);
check("免费献祭 +2 积分", afterPoints === beforePoints + 2, `${beforePoints} → ${afterPoints}`);

const row1 = sql(
  `select "displayName"||'|'||"amountFen"||'|'||"pointsCost"||'|'||coalesce(type::text,'') from "ClanTribute" where "clanHallId"='${hallId}' order by "createdAt" desc limit 1;`,
);
check(
  "记录写入且金额为 0、类型为 incense",
  row1 === "us***@test.com|0|0|incense",
  row1,
);

// ---------------------------------------------------------------- 4. 祭文留言
/*
顺序很关键：`ensureStock` 改的是数据库，而页面上那颗「献上」按钮的 disabled
由**服务端渲染时冻结的** poemProduct.qty 决定。
所以必须先备货 → 再 reload → 再打开弹窗，否则按钮永远停在 disabled。
（这一点在改造前不存在：那时祭文有独立冷却，不看库存。）
*/
ensureStock("free-poem", 3);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

const msgBtn = page.locator("text=写一段祭文");
check("祭文入口渲染", (await msgBtn.count()) > 0, `count=${await msgBtn.count()}`);
if ((await msgBtn.count()) > 0) {
  await msgBtn.first().click();
  await page.waitForTimeout(800);
  await page.fill("textarea", "伏惟尚飨，子孙永念。");
  await page.waitForTimeout(400);
  const poemSubmit = page.locator('button:has-text("献上")').last();
  await poemSubmit.waitFor({ state: "visible", timeout: 5000 });
  let poemClicked = false;
  for (let i = 0; i < 20; i++) {
    if (!(await poemSubmit.isDisabled())) {
      await poemSubmit.click();
      poemClicked = true;
      break;
    }
    await page.waitForTimeout(300);
  }
  check("祭文「献上」按钮可点（库存充足时）", poemClicked, `clicked=${poemClicked}`);
  await page.waitForTimeout(2800);
}
const poemRow = sql(
  `select coalesce(message,'') from "ClanTribute" where "clanHallId"='${hallId}' and message is not null order by "createdAt" desc limit 1;`,
);
check("祭文留言落库", poemRow === "伏惟尚飨，子孙永念。", poemRow);

// ---------------------------------------------------------------- 5. 前台脱敏安全断言
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
const publicText = await page.locator("body").innerText();
check("前台展示脱敏名号", /us\*\*\*@test\.com/.test(publicText), "");
check("前台展示祭文内容", publicText.includes("伏惟尚飨"), "");
// 安全断言：只检查「祭祀记录」板块本身，避免把页面导航/登录态里的邮箱误判为泄露
const recordSection = publicText.slice(publicText.indexOf("祭祀记录"));
check(
  "祭祀记录板块不出现完整联系方式",
  !/13812345678/.test(recordSection) && !/\buser@test\.com\b/.test(recordSection),
  recordSection.slice(0, 90),
);

// ---------------------------------------------------------------- 6. 积分供奉
let payOk = true;
let payDetail = "无可用积分供品";
if (paidId && paidPrice > 0 && paidPrice <= 1000) {
  ensureStock(
    sql(`select slug from "Product" where id='${paidId}';`),
    3,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);
  const pBefore = sqlCount(`select points from "User" where email='user@test.com';`);
  // 直接调用 Server Action 不可行（Next 内部协议），改用页面按钮
  const payBtn = page.locator(`button:has-text("${paidPrice} 积分")`).first();
  if ((await payBtn.count()) > 0) {
    await payBtn.click();
    await page.waitForTimeout(2800);
    const pAfter = sqlCount(`select points from "User" where email='user@test.com';`);
    payOk = pAfter === pBefore - paidPrice;
    payDetail = `${pBefore} → ${pAfter}（应扣 ${paidPrice}）`;
  } else {
    payOk = false;
    payDetail = "找不到积分供品按钮";
  }
} else {
  payOk = false;
}
check("积分供奉扣减积分", payOk, payDetail);

// ---------------------------------------------------------------- 7. 消耗式库存
/*
  30 秒防刷冷却已被库存扣减取代（冷却与消耗两套机制并存会让行为无法解释）。
  现在断言的是真正的消耗语义：每件免费祭品每日 3 份，连点第 4 次被拒。
*/
await new Promise((r) => setTimeout(r, 500));

const qtyOf = (slug) =>
  sqlCount(
    `select coalesce((select h."quantity" from "OfferingHolding" h join "User" u on u.id=h."userId" join "Product" p on p.id=h."productId" where u.email='user@test.com' and p.slug='${slug}' limit 1), -1);`,
  );

/*
先清掉「上香/献花」的当日补货标记，让接下来的断言从确定的初始态出发。
前面第 3、6 段已经各自消耗过一份，若不重置，这里的断言就变成"依赖前面跑了几次"。
clearFreeTopUp 只清标记不删行，语义等价于"昨天补过、今天还没进馆"。
*/
function clearFreeTopUp(slug) {
  sql(
    `update "OfferingHolding" h set "freeTopUpDate"=null, "quantity"=0, "updatedAt"=now() ` +
      `from "User" u, "Product" p ` +
      `where h."userId"=u.id and h."productId"=p.id and u.email='user@test.com' and p.slug='${slug}';`,
  );
}
clearFreeTopUp("free-incense");
clearFreeTopUp("free-flower");

// 访问宗祠页触发当日补货
await page.goto(`${BASE}/clan/halls/${hallId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const incenseQty = qtyOf("free-incense");
check("进祠自动补当日免费配额（上香 = 3 份）", incenseQty === 3, `quantity=${incenseQty}`);

// 再访问一次：同日不应重复补货（幂等）
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
check("同日重复进入不叠加库存", qtyOf("free-incense") === 3, `quantity=${qtyOf("free-incense")}`);

// 连点 4 次「献花」（该 slug 此前未被消耗过，起始 3 份）
const flowerSlug = "free-flower";
sql(`delete from "ClanTribute" where "clanHallId"='${hallId}';`); // 便于数条数
const flowerStart = qtyOf(flowerSlug);
let clicks = 0;
for (let i = 0; i < 4; i++) {
  const btn = page.locator('button[title^="献上献花"]');
  if ((await btn.count()) === 0) break;
  const b = btn.first();
  if (await b.isDisabled()) break; // 用尽后是 disabled，点了也没用
  await b.click();
  clicks++;
  /*
    等待「这次扣减真的落库」再进入下一轮。
    固定 1500ms 不够：Server Action 往返 + revalidatePath + router.refresh 三件事叠在一起，
    在弱一点的机器上会超时，导致第 2、3 次点击打在"还没刷新的旧 DOM"上 —— 表现就是
    明明点了 4 次却只扣了 1、2 份。改成轮询库存变化，快则快走、慢则最多等 6 秒。
  */
  const expect = flowerStart - clicks;
  for (let t = 0; t < 24; t++) {
    if (qtyOf(flowerSlug) <= expect) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(350); // 让 DOM 完成 refresh
}
const flowerEnd = qtyOf(flowerSlug);
const flowerRows = sqlCount(`select count(*) from "ClanTribute" where "clanHallId"='${hallId}';`);
check(
  "库存按次扣减（3 份 → 0 份）",
  flowerStart === 3 && flowerEnd === 0,
  `${flowerStart} → ${flowerEnd}（点击 ${clicks} 次）`,
);
check("用尽后不再写入祭祀记录（只成交 3 次）", flowerRows === 3, `ClanTribute 行数=${flowerRows}`);

// 用尽后按钮仍在 DOM 但不可点（灰显而非消失 —— 布局稳定）
const flowerBtnAfter = page.locator('button[title^="献上献花"]');
const stillThere = (await flowerBtnAfter.count()) > 0;
const isDisabled = stillThere ? await flowerBtnAfter.first().isDisabled() : false;
check("用尽后按钮灰显不消失且不可点", stillThere && isDisabled, `存在=${stillThere} 禁用=${isDisabled}`);

// ---------------------------------------------------------------- 8. 供台陈列与撤供
/*
修一下断言的基线：到这一步为止，本次运行已经产生了 3 次献花 + 次数不定的早期献祭
（上香、积分供奉…），所以"未撤供条数"必然 > 3。
正确做法是**先把历史供台撤掉再跑**，让接下来的 3 次献祭成为唯一来源。

用「点烛」而不是「献花」：献花刚在第 7 段被连点到 0，且页面上那颗按钮的 disabled
由 SSR 时的 qty 决定，存在窗口期；点烛在本套件里完全没被碰过，是干净的 slug。
*/
sql(
  `update "OfferingOnAltar" a set "clearedAt"=now() from "User" u where a."userId"=u.id and u.email='user@test.com' and a."clanHallId"='${hallId}' and a."clearedAt" is null;`,
);
const altarSlug = "free-candle";
ensureStock(altarSlug, 3);
// 备货后必须自证"库里真有 3 份"——否则一旦某次 ensureStock 静默没生效，
// 后面就会以 locator.click 超时的形式报错，看不出根因。
const altarStockReady = qtyOf(altarSlug);
check("供台段：备货到位（点烛 3 份）", altarStockReady >= 3, `quantity=${altarStockReady}`);
/*
用 goto 而不是 reload。
前面几次 router.refresh() 之后，Next 的客户端路由缓存里可能还留着上一份 RSC payload，
reload 在部分情况下会命中它、把旧的 qty（0）重新渲进去 —— 表现就是"库里明明有 3 份，
按钮却还是 disabled"。带 cache-buster 的整页 goto 一定会向服务端重新取数。
*/
await page.goto(`${BASE}/clan/halls/${hallId}?cb=${Date.now()}&stage=altar`, {
  waitUntil: "networkidle",
});
await page.waitForTimeout(1600);
const candleBtnReady = await page
  .locator('button[title^="献上点烛"]')
  .first()
  .isDisabled()
  .catch(() => true);
check("供台段：点烛按钮渲染为可点", candleBtnReady === false, `disabled=${candleBtnReady}`);
let altarClicks = 0;
for (let i = 0; i < 3; i++) {
  const b = page.locator('button[title^="献上点烛"]').first();
  if ((await b.count()) === 0 || (await b.isDisabled())) break;
  await b.click();
  altarClicks++;
  /*
    这里必须等 **DOM**，不能只等数据库。
    Server Action 落库 → revalidatePath → router.refresh() 推 RSC 流是三段式，
    数据库先变、DOM 后变。只轮询 DB 会在"库里已经 3 条、页面上还挂着旧快照"时提前放行，
    于是后面数 [data-altar-slug] 就是 0。
  */
  for (let t = 0; t < 32; t++) {
    const glyphs = await page.locator("[data-altar-slug]").count();
    if (glyphs > 0) {
      const txt = await page.locator("body").innerText();
      const m = txt.match(/供台 · (\d+) 件/);
      if (m && Number(m[1]) >= altarClicks) break;
    }
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(400);
}
// 让 RSC 流彻底落定，再读最终 DOM
await page.waitForTimeout(1200);
const altarOpen = sqlCount(
  `select count(*) from "OfferingOnAltar" a join "User" u on u.id=a."userId" where u.email='user@test.com' and a."clanHallId"='${hallId}' and a."clearedAt" is null;`,
);
check(
  "献祭后供台有陈列记录（每次献祭各一条）",
  altarOpen === altarClicks && altarOpen === 3,
  `未撤供条数=${altarOpen} / 献祭 ${altarClicks} 次`,
);

const altarGlyphs = await page.locator("[data-altar-slug]").count();
check("页面渲染出供台图标", altarGlyphs > 0, `[data-altar-slug] 出现 ${altarGlyphs} 次`);

// 记录撤供前的总行数，用来证明"撤供是软删除、行没丢"
const altarTotalBefore = sqlCount(
  `select count(*) from "OfferingOnAltar" a join "User" u on u.id=a."userId" where u.email='user@test.com' and a."clanHallId"='${hallId}';`,
);

// 点「撤供」
const clearBtn = page.locator('button:has-text("撤供")').first();
if ((await clearBtn.count()) > 0) {
  await clearBtn.click();
  await page.waitForTimeout(2400);
}
const altarCleared = sqlCount(
  `select count(*) from "OfferingOnAltar" a join "User" u on u.id=a."userId" where u.email='user@test.com' and a."clanHallId"='${hallId}' and a."clearedAt" is null;`,
);
check("撤供后供台清空（未撤供归零）", altarCleared === 0, `未撤供条数=${altarCleared}`);

const altarSoftDeleted = sqlCount(
  `select count(*) from "OfferingOnAltar" a join "User" u on u.id=a."userId" where u.email='user@test.com' and a."clanHallId"='${hallId}' and a."clearedAt" is not null;`,
);
const altarTotalAfter = sqlCount(
  `select count(*) from "OfferingOnAltar" a join "User" u on u.id=a."userId" where u.email='user@test.com' and a."clanHallId"='${hallId}';`,
);
check(
  "撤供是软删除（行数不减、只置 clearedAt）",
  altarTotalAfter === altarTotalBefore && altarSoftDeleted === altarTotalBefore,
  `总行数 ${altarTotalBefore} → ${altarTotalAfter}，其中已撤供 ${altarSoftDeleted}`,
);

// ---------------------------------------------------------------- 9. 音乐祭品播放环境音
/*
宗祠面板的固定 8 格是礼仪位（上香/献花/点烛…），音乐类不占位 ——
它通过「我的其它供品」那一行出现（qty > 0 才渲染）。
所以这里要先备货，再刷新页面让那一行出现。
*/
ensureStock("free-music", 3);
await page.goto(`${BASE}/clan/halls/${hallId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1600);

const musicBtn = page.locator('button[title^="献上音乐"]');
const musicCount = await musicBtn.count();
check("音乐类供品在「我的其它供品」里可达", musicCount > 0, `按钮数=${musicCount}`);
if (musicCount > 0) {
  await musicBtn.first().click();
  await page.waitForTimeout(2800);
}
const audioState = await page.evaluate(() => {
  const el = document.querySelector("audio[data-ambient-player]") || document.querySelector("audio");
  if (!el) return { exists: false, count: 0 };
  return {
    exists: true,
    count: document.querySelectorAll("audio").length,
    src: el.currentSrc || el.getAttribute("src") || "",
    paused: el.paused,
    loop: el.loop,
  };
});
check(
  "音乐祭品触发环境音播放",
  audioState.exists && /\/assets\/ambient\//.test(audioState.src || "") && audioState.paused === false,
  JSON.stringify(audioState),
);
check("环境音为循环播放", audioState.loop === true, `loop=${audioState.loop}`);

// 播放的是真实存在的音轨文件（不是 404 的占位路径）
if (audioState.exists && audioState.src) {
  const probe = await page.evaluate(async (u) => {
    const r = await fetch(u, { method: "GET" });
    return { status: r.status, type: r.headers.get("content-type"), len: r.headers.get("content-length") };
  }, audioState.src);
  check(
    "音轨文件可访问且为音频",
    probe.status === 200 && /audio|mpeg|mp3/i.test(probe.type || ""),
    JSON.stringify(probe),
  );
} else {
  check("音轨文件可访问且为音频", false, "无 audio src 可探测");
}

// 撤供后应停止播放。
// 注意：第 8 段已经撤过一次供，此时供台大概率是空的 → 那条「撤供」按钮根本没渲染
// （供台条只有在「有供品」或「正在放音乐」时才显示）。
// 所以这里先补一次献祭（音乐），确保按钮存在，再做"撤供 → 停播"的因果验证。
let musicReoffered = false;
const musicBtn2 = page.locator('button[title^="献上音乐"]');
if ((await musicBtn2.count()) > 0 && !(await musicBtn2.first().isDisabled())) {
  await musicBtn2.first().click();
  await page.waitForTimeout(2800);
  musicReoffered = true;
}
check("为验证停播重新献上一份音乐", musicReoffered, `reoffered=${musicReoffered}`);

// 撤供按钮依赖 SSR 传来的供台行（altarItems.length > 0，见 ClanWorshipPanel §撤供分支），
// 要等献祭 action 的 router.refresh() RSC 落地才进 DOM —— **固定等待在负载下会竞态**
// （实测：重献音乐后 2800ms 内按钮未落地 → 间歇性「找不到撤供按钮」）。
// 与 §8 的「等 DOM 不能只等 DB」同一族坑，这里同样改为轮询（最长 10s）。
let clearBtn2Ready = false;
for (let t = 0; t < 40; t++) {
  if ((await page.locator('button:has-text("撤供")').count()) > 0) {
    clearBtn2Ready = true;
    break;
  }
  await page.waitForTimeout(250);
}
if (clearBtn2Ready) {
  await page.locator('button:has-text("撤供")').first().click();
  await page.waitForTimeout(2600);
  const afterStop = await page.evaluate(() => {
    const el = document.querySelector("audio[data-ambient-player]") || document.querySelector("audio");
    if (!el) return { exists: false };
    return { exists: true, paused: el.paused, src: el.currentSrc || el.getAttribute("src") || "" };
  });
  check(
    "撤供后环境音停止（不再自动续播）",
    !afterStop.exists || afterStop.paused === true,
    JSON.stringify(afterStop),
  );
} else {
  // 诊断信息：库侧行数（证明献祭落库了）+ 面板文案（看是「供台空空」还是整块没渲染）
  const diagRows = sqlCount(
    `select count(*) from "OfferingOnAltar" a join "User" u on u.id=a."userId" where u.email='user@test.com' and a."clanHallId"='${hallId}' and a."clearedAt" is null;`,
  );
  const bodyTxt = await page.locator("body").innerText();
  const altarLine = (bodyTxt.match(/供台[^\n]*/) || ["(供台块未渲染)"])[0];
  check(
    "撤供后环境音停止（不再自动续播）",
    false,
    `找不到撤供按钮（轮询10s） · 库内未撤供行=${diagRows} · 「${altarLine}」`,
  );
}

// ---------------------------------------------------------------- 10. 匿名回退（走 TS 单元套件）
// Node 无法直接 import .ts，因此委托给专项单元套件 verify-clan-tribute.mts，
// 该套件覆盖 1/2/3/4/6 字中文、拉丁名、手机号、邮箱、优先级与「全空 → 匿名宗亲」。
let unitOk = false;
let unitOut = "";
try {
  unitOut = execSync("npx tsx scripts/verify-clan-tribute.mts 2>&1", {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 120000,
  });
  unitOk = /27\/27|全部通过|PASS/.test(unitOut) && !/\bFAIL\b|❌/.test(unitOut);
} catch (e) {
  unitOut = String(e.stdout || e.message || "").slice(-300);
}
check(
  "脱敏规则单元套件全通过（含匿名宗亲回退）",
  unitOk,
  (unitOut.match(/\d+\/\d+[^\n]*/) || [unitOut.slice(-80)])[0],
);

// ---------------------------------------------------------------- 11. 馆主后台可见完整实名
// 关键：先设置实名，再**新建一条**记录 —— 快照是写入时冻结的，
// 旧记录不会因用户后来补实名而改变（这正是快照设计的意图）。
sql(`update "User" set "realName"='李明华', phone='13812345678', email='user@test.com' where email='user@test.com';`);
const ownerEmail = sql(
  `select u.email from "User" u join "ClanHall" h on h."ownerUserId"=u.id where h.id='${hallId}';`,
);
console.log(`[info] 宗祠 "${hallName}" 馆主: ${ownerEmail || "(无)"}`);

// 用测试用户在前台再献一次，产生一条「带完整实名快照」的新记录。
// 用「供果」：第 7 段烧的是献花、第 8 段烧的是点烛，供果在本套件里没被碰过。
ensureStock("free-fruit", 3);
await page.goto(`${BASE}/clan/halls/${hallId}?cb=${Date.now()}&stage=snap`, {
  waitUntil: "networkidle",
});
await page.waitForTimeout(1500);
const flower2 = page.locator('button[title^="献上供果"]');
const snapClickable = (await flower2.count()) > 0 && !(await flower2.first().isDisabled());
check("实名快照段：供果可献（库存充足）", snapClickable, `clickable=${snapClickable}`);
if (snapClickable) {
  await flower2.first().click();
  await page.waitForTimeout(2800);
}
const snap = sql(
  `select coalesce("realNameSnap",'')||'|'||coalesce("contactSnap",'')||'|'||"displayName" from "ClanTribute" where "clanHallId"='${hallId}' order by "createdAt" desc limit 1;`,
);
check("新记录冻结完整实名快照", snap === "李明华|13812345678|李*华", snap);

// 用管理员账号登录管理台（管理员即种子宗祠馆主，可访问该管理台）
await ctx.clearCookies();
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const adminPage = await ctx.newPage();
adminPage.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push("[console] " + m.text());
});
await adminPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
if ((await adminPage.locator('input[name="identifier"]').count()) > 0) {
  await adminPage.fill('input[name="identifier"]', "admin@test.com");
  await adminPage.fill('input[name="password"]', "admin123456");
  await adminPage.click('button[type="submit"]');
  await adminPage.waitForTimeout(3200);
}
await adminPage.goto(`${BASE}/console/clan-halls/${hallId}`, { waitUntil: "domcontentloaded" });
await adminPage.waitForTimeout(1400);
const consoleText = await adminPage.locator("body").innerText();
check("馆主管理台可访问", adminPage.url().includes(`/console/clan-halls/${hallId}`), adminPage.url());
check("管理台存在「祭祀 / 消费记录」板块", /祭祀 \/ 消费记录/.test(consoleText), "");
check("管理台显示完整实名", /李明华/.test(consoleText), "");
check("管理台显示完整联系方式", /13812345678/.test(consoleText), "");
check("管理台同时展示脱敏名号", /李\*华/.test(consoleText), "");
check("管理台显示积分合计", /累计积分供奉/.test(consoleText), "");

// ---------------------------------------------------------------- 输出报告
console.log("\n================ 宗祠祭祀 E2E 验证 ================");
let pass = 0;
for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.extra ? "  — " + r.extra : ""}`);
  if (r.ok) pass++;
}
console.log(`\n结果: ${pass}/${results.length} 通过`);
if (consoleErrors.length) {
  console.log("\n⚠️ 控制台/网络错误:");
  [...new Set(consoleErrors)].slice(0, 12).forEach((e) => console.log("  - " + e.slice(0, 180)));
} else {
  console.log("控制台无错误 ✅");
}

await browser.close();
process.exit(pass === results.length ? 0 : 1);
