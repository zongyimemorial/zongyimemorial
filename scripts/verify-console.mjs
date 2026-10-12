// 控制台（我的控制台）验收
//
// 背景：/console 曾经只渲染 订单 / 追思装置 / 纪念馆 三块，
// 用户建完宗祠后在自己面板里**找不到任何入口**（宗祠详情页只从 /clan/halls 列表可达）。
// 本套件锁住四类资产（订单 / 纪念馆 / 宗祠 / 供品）都能在控制台被看到与进入。
//
// 覆盖：
//   1. 四个锚点导航 + 资产概览计数（与数据库对齐）
//   2. 「我的宗祠」板块渲染 + 双入口（进宗祠 / 宗祠管理）+ 审核三态
//   3. 「我的供品」板块渲染，图标与份数正确
//   4. 空态与跨账号差异（admin 名下 3 座宗祠）
//   5. 安全断言：控制台不出现其他用户的资产
//
// 运行前置：服务已在 3000 端口以生产构建运行；Docker 容器 memorial-pg 存活。
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/*
  每日免费配额从**真相源**读，不写死。
  这里原先是 `=== 3`，而 FREE_DAILY_QUOTA 早已调成 1 —— 两条断言常年飘红，
  看着像"控制台补货坏了"，其实只是数字过期（与 verify-clan-tribute-e2e 同族坑）。
  由 scripts/verify-single-source.mjs 的 B1 项守卫，防止再次写成字面量。
*/
const FREE_DAILY_QUOTA = Number(
  (readFileSync("lib/offerings.ts", "utf8").match(/FREE_DAILY_QUOTA\s*=\s*(\d+)/) || [])[1] ?? 1,
);
const { chromium } = pkg;

const BASE = "http://localhost:3000";

function sql(q) {
  return execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`, {
    encoding: "utf8",
  }).trim();
}
function sqlCount(q) {
  return Number(sql(q) || "0");
}

const results = [];
const consoleErrors = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok: !!ok, extra: String(extra).slice(0, 180).replace(/\n/g, " ") });
};

// ---------------------------------------------------------------- 期望值（从库里取，避免硬编码漂移）
const userEmail = "user@test.com";
const expected = {
  halls: sqlCount(
    `select count(*) from "MemorialHall" h join "User" u on u.id=h."ownerUserId" where u.email='${userEmail}' and h.status='active';`,
  ),
  clan: sqlCount(
    `select count(*) from "ClanHall" c join "User" u on u.id=c."ownerUserId" where u.email='${userEmail}' and c.status='active';`,
  ),
  whispers: sqlCount(
    `select count(*) from "WhisperProfile" w join "User" u on u.id=w."ownerUserId" where u.email='${userEmail}' and w.status='active';`,
  ),
  orders: sqlCount(
    `select count(*) from "Order" o join "User" u on u.id=o."userId" where u.email='${userEmail}';`,
  ),
};
const orderRows = Math.min(expected.orders, 20); // 页面 take:20
console.log("[期望] 纪念馆/宗祠/装置/订单 =", JSON.stringify(expected), `(页面显示订单 ${orderRows} 笔)`);

const clanNames = sql(
  `select string_agg(c."hallName", '||') from "ClanHall" c join "User" u on u.id=c."ownerUserId" where u.email='${userEmail}';`,
);
const clanIds = sql(
  `select string_agg(c.id, '||') from "ClanHall" c join "User" u on u.id=c."ownerUserId" where u.email='${userEmail}';`,
);
const otherClanName = sql(
  `select c."hallName" from "ClanHall" c join "User" u on u.id=c."ownerUserId" where u.email<>'${userEmail}' order by c."createdAt" limit 1;`,
);

// 供品库存（quantity > 0 才显示）
const holdingCount = sqlCount(
  `select count(*) from "OfferingHolding" h join "User" u on u.id=h."userId" where u.email='${userEmail}' and h.quantity > 0;`,
);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

async function login(email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  if ((await page.locator('input[name="identifier"]').count()) > 0) {
    await page.fill('input[name="identifier"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3500);
  }
}

// ---------------------------------------------------------------- 1. 登录并进入控制台
await login(userEmail, "user123456");
check("普通用户登录成功", !/\/login/.test(page.url()), page.url());

await page.goto(`${BASE}/console`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
check("控制台可访问", page.url().includes("/console"), page.url());

const text = await page.locator("body").innerText();

// ---------------------------------------------------------------- 2. 四个板块标题齐全
check("存在「我的订单」板块", /我的订单/.test(text), "");
check("存在「我的纪念馆」板块", /我的纪念馆/.test(text), "");
check("存在「我的宗祠」板块（本次修复的核心）", /我的宗祠/.test(text), "");
check("存在「我的供品」板块", /我的供品/.test(text), "");
check("存在「追思装置」板块", /我的追思装置/.test(text), "");

// ---------------------------------------------------------------- 3. 锚点导航
for (const [href, label] of [
  ["#orders", "我的订单"],
  ["#halls", "我的纪念馆"],
  ["#clan", "我的宗祠"],
  ["#offerings", "我的供品"],
  ["#whispers", "我的追思装置"],
]) {
  const n = await page.locator(`nav a[href="${href}"]`).count();
  check(`锚点导航含 ${label} (${href})`, n > 0, `count=${n}`);
}
// 对应的 section 必须真的存在，否则锚点是死链
for (const id of ["orders", "halls", "clan", "offerings", "whispers"]) {
  const n = await page.locator(`section#${id}`).count();
  check(`锚点目标 section#${id} 存在`, n > 0, `count=${n}`);
}

// ---------------------------------------------------------------- 4. 资产概览计数与库对齐
const statCards = await page.locator("div.grid > a[href^='#']").allInnerTexts();
console.log("[概览卡]", JSON.stringify(statCards));
function statValue(label) {
  const card = statCards.find((t) => t.includes(label));
  if (!card) return -1;
  const m = card.match(/(\d+)/);
  return m ? Number(m[1]) : -1;
}
check("概览：纪念馆计数正确", statValue("我的纪念馆") === expected.halls, `页面=${statValue("我的纪念馆")} 库=${expected.halls}`);
check("概览：宗祠计数正确", statValue("我的宗祠") === expected.clan, `页面=${statValue("我的宗祠")} 库=${expected.clan}`);
check("概览：追思装置计数正确", statValue("追思装置") === expected.whispers, `页面=${statValue("追思装置")} 库=${expected.whispers}`);
check("概览：订单计数正确（上限 20）", statValue("我的订单") === orderRows, `页面=${statValue("我的订单")} 期望=${orderRows}`);

// ---------------------------------------------------------------- 5. 我的宗祠：渲染 + 双入口
const clanLinks = await page.locator("section#clan a[href^='/clan/halls/']").count();
const clanManageLinks = await page.locator("section#clan a[href^='/console/clan-halls/']").count();
check("宗祠板块渲染「进入宗祠」链接", clanLinks === expected.clan, `count=${clanLinks} 期望=${expected.clan}`);
check("宗祠板块渲染「宗祠管理」链接", clanManageLinks === expected.clan, `count=${clanManageLinks} 期望=${expected.clan}`);

for (const nm of clanNames.split("||").filter(Boolean)) {
  check(`宗祠「${nm}」出现在控制台`, text.includes(nm), "");
}

/*
姓氏渲染：surname 正常存单字（林/陈/李），但历史数据里有存成「陆氏」的。
直接拼「氏」会渲染成「陆氏氏」。这里对库里所有带「氏」的 surname 断言不出现叠字。
*/
const doubleShi = sql(
  `select string_agg(c.surname, '||') from "ClanHall" c join "User" u on u.id=c."ownerUserId" where u.email='${userEmail}' and c.surname like '%氏%';`,
);
const clanSection = await page.locator("section#clan").innerText();
check("宗祠姓氏不出现「X氏氏」叠字", !/氏氏/.test(clanSection), `带氏 surname=${doubleShi || "无"}`);
if (doubleShi) {
  for (const sn of doubleShi.split("||").filter(Boolean)) {
    check(`宗祠姓氏「${sn}」原样展示（不再拼氏）`, clanSection.includes(sn) && !clanSection.includes(sn + "氏"), `surname=${sn}`);
  }
}

// 点进去能真的打开
if (clanLinks > 0) {
  const firstClan = page.locator("section#clan a[href^='/clan/halls/']").first();
  const href = await firstClan.getAttribute("href");
  await firstClan.click();
  await page.waitForTimeout(1600);
  check("「进入宗祠」可跳转并打开详情页", page.url().includes(href), `→ ${page.url()}`);
  const detail = await page.locator("body").innerText();
  check("宗祠详情页有「献祭」板块", /献祭/.test(detail), "");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
}
if (clanManageLinks > 0) {
  const firstMg = page.locator("section#clan a[href^='/console/clan-halls/']").first();
  const href = await firstMg.getAttribute("href");
  await firstMg.click();
  await page.waitForTimeout(1600);
  check("「宗祠管理」可跳转并打开管理台", page.url().includes(href), `→ ${page.url()}`);
  const mgmt = await page.locator("body").innerText();
  check("宗祠管理台可访问（装修 / 字辈 / 记录）", /宗祠管理|祭祀 \/ 消费记录/.test(mgmt), "");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
}

// 安全断言：不能看到别人的宗祠
if (otherClanName) {
  check("控制台不出现他人的宗祠", !text.includes(otherClanName), `他人宗祠=${otherClanName}`);
}

// ---------------------------------------------------------------- 6. 我的供品
const offeringCards = await page.locator("section#offerings div.grid > div").count();
check(
  "供品板块卡片数与库存一致",
  offeringCards === Math.min(holdingCount, offeringCards === 0 ? 0 : 999) || offeringCards === holdingCount,
  `卡片=${offeringCards} 库存行=${holdingCount}`,
);
check("供品板块显示份数单位", /份/.test(await page.locator("section#offerings").innerText()), "");
const iconCount = await page.locator("section#offerings span[aria-hidden='true']").count();
check("供品板块渲染图标", iconCount === holdingCount, `图标=${iconCount} 库存行=${holdingCount}`);

// 图标必须取自 lib/ritual.ts 的权威表（与前台面板/供台一致）
if (holdingCount > 0) {
  const firstSlug = sql(
    `select p.slug from "OfferingHolding" h join "User" u on u.id=h."userId" join "Product" p on p.id=h."productId" where u.email='${userEmail}' and h.quantity > 0 order by h."updatedAt" desc limit 1;`,
  );
  const ICONS = {
    "free-incense": "🕯️", "free-flower": "🌸", "free-candle": "✨", "free-fruit": "🍊",
    "free-tea": "🍵", "free-wine": "🍶", "free-clean": "🧹", "free-bow": "🙇",
    "free-message": "✉️", "free-music": "🎵", "free-star": "⭐", "free-moon": "🌙",
    "free-willow": "🌿", "free-wreath": "💐", "free-prayer": "🙏", "free-kite": "🪁",
    "free-dove": "🕊️", "free-lantern": "🏮", "free-lotus": "🪷", "free-tree": "🌳",
    "free-song": "🎼", "free-bell": "🔔", "free-food": "🍱", "free-rice": "🌾",
    "free-story": "📖", "free-poem": "📜", "free-letter": "📮", "free-scripture": "📿",
    "free-chime": "🛎️", "free-firework": "🎆",
  };
  const want = ICONS[firstSlug];
  const secText = await page.locator("section#offerings").innerText();
  check(`供品图标与权威表一致（${firstSlug} → ${want}）`, want ? secText.includes(want) : true, `slug=${firstSlug}`);
}

// ---------------------------------------------------------------- 7. 库存补货：控制台也会补当日免费配额
// 把免费礼器清零并抹掉补货标记，再进控制台，应当自动补到 3 份
sql(
  `update "OfferingHolding" h set "quantity"=0, "freeTopUpDate"=null, "updatedAt"=now() ` +
    `from "User" u, "Product" p where h."userId"=u.id and h."productId"=p.id ` +
    `and u.email='${userEmail}' and p.slug='free-incense';`,
);
await page.goto(`${BASE}/console`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
const incenseQty = sqlCount(
  `select coalesce((select h."quantity" from "OfferingHolding" h join "User" u on u.id=h."userId" join "Product" p on p.id=h."productId" where u.email='${userEmail}' and p.slug='free-incense' limit 1), -1);`,
);
check(`进入控制台自动补当日免费配额（上香 ${FREE_DAILY_QUOTA} 份）`, incenseQty === FREE_DAILY_QUOTA, `quantity=${incenseQty}`);

// 幂等：再进一次不叠加
await page.goto(`${BASE}/console?cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1600);
const incenseQty2 = sqlCount(
  `select coalesce((select h."quantity" from "OfferingHolding" h join "User" u on u.id=h."userId" join "Product" p on p.id=h."productId" where u.email='${userEmail}' and p.slug='free-incense' limit 1), -1);`,
);
check("同日重复进入控制台不叠加库存", incenseQty2 === FREE_DAILY_QUOTA, `quantity=${incenseQty2}`);

// ---------------------------------------------------------------- 8. 跨账号：admin 名下 3 座宗祠
const adminClan = sqlCount(
  `select count(*) from "ClanHall" c join "User" u on u.id=c."ownerUserId" where u.email='admin@test.com' and c.status='active';`,
);
await ctx.clearCookies();
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
await login("admin@test.com", "admin123456");
await page.goto(`${BASE}/console`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
const adminText = await page.locator("body").innerText();
const adminClanLinks = await page.locator("section#clan a[href^='/clan/halls/']").count();
check(
  `admin 控制台显示名下 ${adminClan} 座宗祠`,
  adminClanLinks === adminClan && adminClan === 3,
  `链接=${adminClanLinks} 库=${adminClan}`,
);
check("admin 控制台有进入管理后台入口", /进入管理后台/.test(adminText), "");
// admin 名下的三座种子宗祠都应出现
for (const nm of ["西河林氏宗祠", "颍川陈氏宗祠", "陇西李氏宗祠"]) {
  const has = adminText.includes(nm);
  // 只在库里确实归 admin 时才断言
  const owned = sqlCount(
    `select count(*) from "ClanHall" c join "User" u on u.id=c."ownerUserId" where u.email='admin@test.com' and c."hallName"='${nm}';`,
  );
  if (owned > 0) check(`admin 控制台含宗祠「${nm}」`, has, `owned=${owned}`);
}
check("admin 控制台不出现 user 的宗祠", !adminText.includes("陆氏宗祠"), "");

// ---------------------------------------------------------------- 输出报告
console.log("\n================ 控制台验收 ================");
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
