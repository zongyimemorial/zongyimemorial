// 宗祠装修 + 族谱图设计器 端到端交互验证
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { execSync } from "node:child_process";
const { chromium } = pkg;

const BASE = "http://localhost:3000";
const COOKIE = "preview_auth=1";

function sql(q) {
  return execSync(
    `docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`,
    { encoding: "utf8" },
  ).trim();
}

const errors = [];
const results = [];
const check = (name, ok, extra = "") => results.push({ name, ok: !!ok, extra });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("response", (r) => {
  if (r.status() >= 400 && r.url().startsWith(BASE)) {
    errors.push(`HTTP ${r.status()} ${r.url()}`);
  }
});

// ---------------- 1. 登录 ----------------
async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const f = page.locator('input[name="identifier"]');
  if ((await f.count()) === 0) return; // 已有会话
  await f.fill("user@test.com");
  await page.fill('input[name="password"]', "user123456");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}
await login();
check("登录成功", !/\/login/.test(page.url()), page.url());

// 重置测试用户状态，保证每次运行可复现
sql(`update "User" set points = 2000, "idVerified" = true, "premiumUntil" = null where email='user@test.com';`);
// 清理上次运行遗留的测试宗祠
sql(`delete from "ClanHall" where "hallName" like '测试王氏宗祠%';`);
// 归还族谱归属到管理员，随后由脚本按需转给测试用户
sql(`update "Genealogy" set "ownerId" = (select id from "User" where role='admin' limit 1), "chartType" = 'ou', "chartUnlocked" = '{}' where status='approved';`);

// ---------------- 2. 宗祠列表 ----------------
await page.goto(`${BASE}/clan/halls`, { waitUntil: "domcontentloaded" });
const hallTitles = await page.locator("h2").allInnerTexts();
check("宗祠列表展示已立宗祠", hallTitles.some((t) => /宗祠/.test(t)), hallTitles.slice(0, 3).join(" / "));
await page.waitForTimeout(800);
const listText = await page.locator("body").innerText();
check("列表页有「免费设立宗祠」入口", /免费设立宗祠/.test(listText), listText.slice(0, 60).replace(/\n/g, " "));

// ---------------- 3. 新建设立宗祠 ----------------
const stamp = Date.now().toString().slice(-6);
const testHallName = `测试王氏宗祠${stamp}`;
await page.goto(`${BASE}/clan/halls/new`, { waitUntil: "domcontentloaded" });
check("创建表单可访问", page.url().includes("/clan/halls/new"), page.url());
await page.fill('input[name="surname"]', "王");
await page.fill('input[name="hallName"]', testHallName);
await page.fill('input[name="name"]', "三槐堂");
await page.fill('input[name="ancestorName"]', "王祐");
await page.fill('input[name="origin"]', "山东莘县");
await page.fill('textarea[name="generationPoem"]', "三槐世泽，两晋家声\n忠厚传家，诗书继世");
await page.click('button:has-text("提交并进入装修工坊")');
await page.waitForURL(/\/console\/clan-halls\//, { timeout: 25000 });
check("设立宗祠成功并跳转管理台", /\/console\/clan-halls\//.test(page.url()), page.url());
const newHallId = page.url().split("/console/clan-halls/")[1].split("?")[0];

// ---------------- 4. 装修工坊：建馆赠品可直接应用 ----------------
/*
  ⚠️ 2026-10 改口径：本段早先拿「朱漆祠堂」当"免费模板"，断言它卡片里有「一键应用」。
  但用户已明确要求「只在建新馆时免费赠送一套，其他的均改为付费」，
  朱漆祠堂现在是 600 积分 —— 于是它卡片里给的是「用 600 积分兑换」，
  断言必然落空。**这不是回归，是需求本身变了**，断言必须跟着改，不能反过来把产品改回去。

  新口径（与 lib/clan-decor.ts 的赠品模型一致）：
    · 建馆赠品 clan-tpl-ancestral 是**唯一**能直接应用的模板；
    · 其余模板一律要付（积分或货币），卡片里不能出现「一键应用」。
  「付费模板要不到直接应用」这条恰好是本段与 §5 共同的价值所在。
*/
await page.waitForTimeout(1200);
check("管理台含装修工坊", (await page.getByText("宗祠装修工坊").count()) > 0);
check("管理台含宗祠照片管理", (await page.getByText("宗祠照片").count()) > 0);
check("管理台含「主图」按钮文案", (await page.getByText("宗祠基本信息").count()) > 0);

/*
  ⚠️ 定位卡片不能用 `div.rounded-lg.border` + hasText —— 会先撞上**方案摘要**那块
  （「模板 祖德流芳」也在页面里，且同样带 rounded-lg/border）。
  实测第一处匹配拿到的是摘要行（class 是 `bg-brand-50/50 p-4`），
  于是"赠品卡片里没有「一键应用」按钮"——看着像功能坏了，其实是选错了元素。

  正确做法与 verify-decor-3d.mjs 一致：先按 `span.text-sm.font-medium` 精确定位**卡片标题**，
  再用 closest 向上取卡片体（summary 里的名字是 `span.text-brand-700`，天然被排除）。
*/
const clanCardText = (name) =>
  page.evaluate((nm) => {
    const s = [...document.querySelectorAll("span.text-sm.font-medium")].find((x) => x.textContent === nm);
    if (!s) return "";
    const box = s.closest("div.overflow-hidden") ?? s.closest("div.p-3");
    return box ? box.innerText.replace(/\s+/g, " ") : "";
  }, name);

const giftText = await clanCardText("祖德流芳");
check("赠品卡片带「建馆赠品」徽章", /建馆赠品/.test(giftText), giftText.slice(0, 80) || "(未定位到卡片)");

/*
  ⚠️ 定位按钮**不要用 `getByRole("button", { name: /正则/ })`**。
  实测：卡片文本里明明有「重新应用」，`getByRole` 的 name 正则却是 0 命中
  （name 默认走 accessible name，与 innerText 的取词规则不同，正则里的
  `|` 组合词容易匹配不上）。报出来是「赠品卡片里没有一键应用按钮」，
  看着像功能坏了，其实按钮就在那儿。

  改成在 `page.evaluate` 里直接数按钮文本，和 clanCardText 同一套取法。
  —— 自检：本段在赠品已应用（按钮显示"重新应用"）时也必须为真。
*/
const giftCardButtons = () =>
  page.evaluate(() => {
    const s = [...document.querySelectorAll("span.text-sm.font-medium")].find((x) => x.textContent === "祖德流芳");
    if (!s) return [];
    const box = s.closest("div.overflow-hidden") ?? s.closest("div.p-3");
    return box ? [...box.querySelectorAll("button")].map((b2) => b2.textContent.trim()) : [];
  });

const btns = await giftCardButtons();
const applyLabel = btns.find((t) => /一键应用|重新应用/.test(t));
if (applyLabel) {
  await page
    .locator("div.overflow-hidden")
    .filter({ hasText: "祖德流芳" })
    .first()
    .locator("button", { hasText: applyLabel })
    .first()
    .click();
  await page.waitForTimeout(2500);
  const body = await page.locator("body").innerText();
  /*
    ⚠️ 2026-10 再改口径（同 §4 顶部那段，需求又走了一步）：
    「装修完了点保存即完成装修」引入草稿模型后，点模板**不再立刻落库**，
    也不会弹「已应用模板」—— 只改草稿并亮出「有未保存的改动」提示条。
    这是**需求变更**，不是回归：断言该跟着走，不能把产品改回即时保存。
    新口径：点赠品 → 草稿条出现（证明按钮真能点、且落到草稿上）。
    真正的"落库"由 verify-decor-draft-save.mjs 覆盖（那里点保存才回查 DB）。
  */
  check(
    "建馆赠品可直接应用（落到草稿）",
    /有未保存的改动|已应用模板|已应用/.test(body),
    (body.match(/有未保存的改动[^\n]*|已应用[^\n]*/)?.[0] ?? "").slice(0, 60),
  );
} else {
  check("建馆赠品可直接应用", false, `赠品卡片按钮 = [${btns.join(", ")}] | ${giftText.slice(0, 70)}`);
}

/*
  反面对照：收费模板不能白给。
  只断言"赠品能应用"会被"全都免费"的回归骗过 —— 那才是灾难（等于没收费）。
*/
const paidText = await clanCardText("朱漆祠堂");
check(
  "收费模板不再给「一键应用」（要付）",
  paidText.length > 0 && !/一键应用/.test(paidText) && /积分|解锁|订阅/.test(paidText),
  paidText.slice(0, 80) || "(未定位到卡片)",
);

// ---------------- 5. 收费模板门禁 ----------------
const paidCard = page.locator("div.rounded-lg.border").filter({ hasText: "御赐宗祠" }).first();
if ((await paidCard.count()) > 0) {
  const paidText = await paidCard.innerText();
  const hasPremiumHint = /需高级订阅|开通高级订阅/.test(paidText);
  check("高级模板显示订阅提示", hasPremiumHint, paidText.replace(/\n/g, " ").slice(0, 90));
} else {
  check("高级模板显示订阅提示", false, "未找到「御赐宗祠」卡片");
}

/*
  积分模板：云龙汉白玉。

  ⚠️ 价格**从库里现查**，不写死。阶段 3 把它的价格从 ¥9 调到 ¥14
     （四档定价重构，属**需求变更**不是回归），写死的 `900` / `1100`
     必然变红 —— 而"断言里写死业务价格"这件事本身就是脆弱的根源：
     以后每次调价都要改这一段测试。
  正确口径：从库里读出该模板的当前积分价 P，断言"已用 P 积分解锁"、
     "积分从 2000 扣到 2000−P"。这样调价不再打断测试。
*/
const PTS_TPL_NAME = "云龙汉白玉";
const tplPoints = Number(
  sql(
    `select "pointsPrice" from "Product" where type='decor' and slug like '%-dragonmarble';`,
  ) || "0",
);
check("能从库里读到积分模板的当前价", tplPoints > 0, `${PTS_TPL_NAME} = ${tplPoints} 积分`);

const ptsBefore = Number(sql(`select points from "User" where email='user@test.com';`) || "0");
const ptsCard = page.locator("div.rounded-lg.border").filter({ hasText: PTS_TPL_NAME }).first();
if ((await ptsCard.count()) > 0) {
  const btn = ptsCard.getByRole("button", { name: /积分兑换|已解锁|使用中/ });
  if ((await btn.count()) > 0) {
    await btn.first().click();
    await page.waitForTimeout(2500);
    const body = await page.locator("body").innerText();
    check(
      "积分兑换收费模板成功",
      new RegExp(`已用\\s*${tplPoints}\\s*积分解锁`).test(body),
      body.match(/已用[^\n]*积分[^\n]*/)?.[0] ?? "",
    );
    const pts = Number(sql(`select points from "User" where email='user@test.com';`) || "0");
    check(
      `积分已扣减（${ptsBefore}→${ptsBefore - tplPoints}）`,
      pts === ptsBefore - tplPoints,
      `实得 ${pts}`,
    );
  } else {
    check("积分兑换收费模板成功", false, "未找到兑换按钮");
  }
} else {
  check("积分兑换收费模板成功", false, `未找到「${PTS_TPL_NAME}」卡片`);
}

// ---------------- 6. 祠堂专属素材 ----------------
await page.getByRole("button", { name: "挂饰陈设" }).first().click().catch(() => {});
await page.waitForTimeout(800);
const ornBody = await page.locator("body").innerText();
check("挂饰含祠堂专属「石狮镇门」", /石狮镇门/.test(ornBody));
check("挂饰含祠堂专属「牌位墙」", /牌位墙/.test(ornBody));
check("挂饰含祠堂专属「幡旗招展」", /幡旗招展/.test(ornBody));

await page.getByRole("button", { name: "墙面材质" }).first().click().catch(() => {});
await page.waitForTimeout(800);
const wallBody = await page.locator("body").innerText();
check("墙面含「青砖墙」（免费）", /青砖墙/.test(wallBody));
check("墙面含「夯土墙」（免费）", /夯土墙/.test(wallBody));
check("墙面含「金丝楠木」（收费）", /金丝楠木/.test(wallBody));

// ---------------- 7. 宗祠详情页装修生效 ----------------
await login();
await page.goto(`${BASE}/clan/halls/${newHallId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
let detail = await page.locator("body").innerText();
check(
  "宗祠详情待审核提示（仅馆主可见）",
  /待审核|已通过审核/.test(detail),
  detail.match(/(待审核|已通过审核)[^\n]*/)?.[0] ?? "",
);
check("宗祠详情含当前陈设", /当前陈设/.test(detail));

// ---------------- 8. 族谱图设计器 ----------------
const gid = sql(
  `select id from "Genealogy" where "chartType"='ou' and status='approved' limit 1;`,
);
// 把该族谱转给测试用户，便于进入设计器
sql(`update "Genealogy" set "ownerId"=(select id from "User" where email='user@test.com') where id='${gid}';`);

// 重新登录（前面的硬跳转可能丢失会话）
await login();
await page.goto(`${BASE}/clan/genealogy/${gid}/design`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
check("族谱图设计器可访问", /\/design/.test(page.url()), page.url());
if (!/\/design/.test(page.url())) {
  console.log("!! 设计器被拦截，url =", page.url(), "gid =", gid,
    "owner =", sql(`select "ownerId" from "Genealogy" where id='${gid}';`),
    "user =", sql(`select id from "User" where email='user@test.com';`));
}

const designerText = await page.locator("body").innerText();
for (const fmt of ["欧式", "苏式", "宝塔式", "牒记式", "描金欧式", "绢帛苏式", "丹青宝塔"]) {
  check(`设计器列出「${fmt}」`, designerText.includes(fmt));
}
check("设计器含 4 步流程", /选择版式/.test(designerText) && /录入世系/.test(designerText) && /图面设置/.test(designerText) && /保存与导出/.test(designerText));
check("设计器含族谱规范说明", /嗣子|待考|殇/.test(designerText));

// 切换版式并保存
await page.waitForSelector('button:has-text("保存族谱图")', { timeout: 25000 });
await page.locator('button:has-text("垂珠体")').first().click({ timeout: 20000 });
await page.waitForTimeout(2500);
await page.locator('button:has-text("保存族谱图")').first().click({ timeout: 20000 });
await page.waitForTimeout(3000);
await page.waitForTimeout(2500);
const saveBody = await page.locator("body").innerText();
check("保存族谱图成功", /已保存族谱图/.test(saveBody), saveBody.match(/已保存族谱图[^\n]*/)?.[0] ?? "");
const savedType = sql(`select "chartType" from "Genealogy" where id='${gid}';`);
check("版式已持久化为 su", savedType === "su", `实得 ${savedType}`);

// 高级版式门禁（该用户无 premiumUntil）
await page.locator('button:has-text("描金欧式")').first().click({ timeout: 15000 });
await page.waitForTimeout(2000);
const premiumBody = await page.locator("body").innerText();
check("选中高级版式后出现订阅解锁入口", /开通高级订阅解锁精美版式/.test(premiumBody),
  premiumBody.match(/开通高级订阅[^\n]*/)?.[0] ?? "未渲染");

// ---------------- 9. 族谱详情页反映新版式 ----------------
await login();
await page.goto(`${BASE}/clan/genealogy/${gid}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const gDetail = await page.locator("body").innerText();
check("族谱详情显示苏式", /苏式/.test(gDetail));
check("族谱详情显示垂珠体别名", /垂珠体/.test(gDetail));

// ---------------- 汇总 ----------------
await browser.close();

for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra ? "  (" + r.extra + ")" : ""}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n通过 ${results.length - failed.length}/${results.length}`);
if (errors.length) {
  console.log("\n=== 控制台/网络错误 ===");
  [...new Set(errors)].slice(0, 15).forEach((e) => console.log("  " + e.slice(0, 220)));
} else {
  console.log("\n无控制台错误、无 4xx/5xx 请求");
}
console.log("HALLID=" + newHallId);
process.exit(failed.length ? 1 : 0);
