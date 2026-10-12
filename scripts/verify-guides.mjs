/**
 * 指引体系验收（建馆指引 / 建宗祠指引 / 装修指引 / 创建流程条）
 *
 * 用户需求：纪念馆与宗祠设计一个建馆或建宗祠指引，装修也设计一个装修指引，
 * 装修体系再设计一个装修预览，装修完了点保存即完成装修。
 *
 * 本套件覆盖「指引 + 流程条」（预览与保存见 verify-decor-draft-save.mjs）。
 *
 * 为什么要用浏览器而不是 fetch：
 *  - `HallBuyButton` 是客户端组件，流程条只在**弹窗打开后**才进 DOM，
 *    服务端 HTML 里根本没有 `data-create-flow` —— 用 fetch 断言必然误判为"没做"。
 *  - `/clan/halls/new` 未登录时走的是另一条分支。
 *  所以：一律真登录 + 真点击，再看 DOM。
 *
 * 断言策略（踩过的坑）：
 *  - 文案要照页面真实标题写。建宗祠指引的 <h1> 是「宗祠设立指引」，
 *    写「建宗祠」会假红 —— 这不是功能缺失，是断言写错了名字。
 *  - 不用 `indexOf(a) < indexOf(b)`（数据为空时 -1 < N 恒真）。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;

const BASE = "http://127.0.0.1:3000";

let pass = 0;
let fail = 0;
const check = (n, ok, d = "") => {
  if (ok) {
    pass++;
    console.log(`PASS  ${n}${d ? `  (${d})` : ""}`);
  } else {
    fail++;
    console.log(`FAIL  ${n}${d ? `  (${d})` : ""}`);
  }
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
// 内测口令：直接种 cookie，别去填 /preview-gate 表单（见 AGENTS.md）
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

console.log("===== 指引体系验收 =====\n");

// ── 匿名可读的三份指引 ─────────────────────────────────────────────
console.log("── ① 纪念馆创建指引 /halls/guide ──");
{
  const res = await page.goto(BASE + "/halls/guide", { waitUntil: "domcontentloaded" });
  check("建馆指引 可访问", res.status() === 200, `HTTP ${res.status()}`);
  const html = await page.content();
  for (const t of ["创建纪念馆", "实名认证"]) {
    const idx = html.indexOf(t);
    check(`建馆指引 含「${t}」`, idx >= 0, idx >= 0 ? `@${idx}` : "未找到");
  }
  check("建馆指引 链到装修指引", html.includes('href="/guide/decor"'));
  check("建馆指引 链到建宗祠指引", html.includes('href="/clan/halls/guide"'));
}

console.log("\n── ② 宗祠设立指引 /clan/halls/guide ──");
{
  const res = await page.goto(BASE + "/clan/halls/guide", { waitUntil: "domcontentloaded" });
  check("建宗祠指引 可访问", res.status() === 200, `HTTP ${res.status()}`);
  const html = await page.content();
  // 注意：页面真实 <h1> 是「宗祠设立指引」
  for (const t of ["宗祠设立指引", "实名认证", "堂号"]) {
    const idx = html.indexOf(t);
    check(`建宗祠指引 含「${t}」`, idx >= 0, idx >= 0 ? `@${idx}` : "未找到");
  }
  check(
    "建宗祠指引 链到装修指引",
    html.includes('href="/guide/decor"') || html.includes('href="/clan/guide/decor"'),
  );
  check("建宗祠指引 链到建馆指引", html.includes('href="/halls/guide"'));
}

console.log("\n── ③ 空间装修指引 /guide/decor ──");
{
  const res = await page.goto(BASE + "/guide/decor", { waitUntil: "domcontentloaded" });
  check("装修指引 可访问", res.status() === 200, `HTTP ${res.status()}`);
  const html = await page.content();
  for (const t of ["装修", "模板", "套件", "保存", "积分"]) {
    const idx = html.indexOf(t);
    check(`装修指引 含「${t}」`, idx >= 0, idx >= 0 ? `@${idx}` : "未找到");
  }
}

console.log("\n── ③b 云直播操作指引 /live/guide ──");
{
  const res = await page.goto(BASE + "/live/guide", { waitUntil: "domcontentloaded" });
  check("云直播指引 可访问", res.status() === 200, `HTTP ${res.status()}`);
  const html = await page.content();
  for (const t of ["云直播大厅", "如何观看", "发起直播", "回放档案"]) {
    const idx = html.indexOf(t);
    check(`云直播指引 含「${t}」`, idx >= 0, idx >= 0 ? `@${idx}` : "未找到");
  }
  check("云直播指引 链到大厅", html.includes('href="/live"'));
}

console.log("\n── ③c 云直播大厅入口链接 ──");
{
  await page.goto(BASE + "/live", { waitUntil: "domcontentloaded" });
  const html = await page.content();
  check("云直播大厅 链到操作指引", html.includes('href="/live/guide"'));
}

// ── 登录（流程条那块必须登录才看得到）─────────────────────────────
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.fill('input[name="identifier"]', "user@test.com");
await page.fill('input[name="password"]', "user123456");
await page.click('button[type="submit"]');
await page.waitForTimeout(4500);

// ── ④ 建宗祠页的流程条 ────────────────────────────────────────────
console.log("\n── ④ 建宗祠页流程条 ──");
{
  await page.goto(BASE + "/clan/halls/new", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const html = await page.content();
  const flow = await page.locator('[data-create-flow="clan"]').count();
  check("建宗祠页 有流程条 data-create-flow=clan", flow >= 1, `命中 ${flow} 个`);
  check("建宗祠页 流程条含「装修宗祠」", html.includes("装修宗祠"));
  check("建宗祠页 流程条含「实名认证」", html.includes("实名认证"));
  check(
    "建宗祠页 链到指引",
    html.includes('href="/clan/halls/guide"'),
    html.includes('href="/clan/halls/guide"') ? "" : "缺少指引链接",
  );
}

// ── ⑤ 免费建馆页流程条（2026-10 商业模式调整：建馆免费，入口从商城迁到 /halls/new）──
console.log("\n── ⑤ 免费建馆页流程条 ──");
{
  // 旧付费通道：商城 ¥98 商品已下架，详情页对 inactive 商品 notFound，
  // 不得再出现「申请建馆」按钮（否则等于免费通道与付费通道并存）。
  const res = await page.goto(BASE + "/mall/digital-memorial-hall", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const deadHtml = await page.content();
  check(
    "商城建馆商品已下架（无申请建馆按钮）",
    !(await page.locator("button", { hasText: "申请建馆" }).count()),
    `HTTP ${res.status()}`,
  );
  check("商城建馆商品页不再提供付费开通", !deadHtml.includes("提交并支付"));

  // 新免费通道：流程条由 server component SSR 直出，无需点弹窗。
  await page.goto(BASE + "/halls/new", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const html = await page.content();
  const flow = await page.locator('[data-create-flow="hall"]').count();
  check("免费建馆页 有流程条 data-create-flow=hall", flow >= 1, `命中 ${flow} 个`);
  for (const s of ["实名认证", "提交材料", "审核开通", "装修纪念馆"]) {
    check(`免费建馆页 流程条含「${s}」`, html.includes(s));
  }
  check("免费建馆页 链到建馆指引", html.includes('href="/halls/guide"'));
  check("免费建馆页 标注免费", /免费建立|免费提交|永久保存/.test(html));
  check("免费建馆页 有 MZ/T 173 材料表单", html.includes("火化证明"));
  check("免费建馆页 有经办人身份证字段", html.includes("经办人身份证"));
}

// ── ⑥ 装修工坊里的指引块（回到草稿套件已覆盖的同一入口）──────────
console.log("\n── ⑥ 装修工坊指引块 ──");
{
  const hallId = await page.evaluate(async () => {
    const r = await fetch("/console");
    const t = await r.text();
    const m = t.match(/\/console\/halls\/([a-z0-9]{20,})/);
    return m ? m[1] : null;
  });
  if (!hallId) {
    console.log("SKIP  控制台未解析到纪念馆 id");
  } else {
    await page.goto(BASE + "/console/halls/" + hallId, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const html = await page.content();
    check("装修工坊 有指引块", /data-decor-guide/.test(html));
    check("装修工坊 指引链接指向 /guide/decor", html.includes('href="/guide/decor"'));
    check("装修工坊 有「全屏预览」按钮", html.includes("全屏预览"));
  }
}

await b.close();
console.log(`\n通过 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
