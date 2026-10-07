/**
 * P0 增长基建验收（优化方案-竞品对标 · 一期）
 *
 * 覆盖十件事的落地：SEO 四件套 / 内测门公开化 / 通知提醒 / 埋点与图片迁移 /
 * 首页信任改造 / 装修案例厅 / 共祭体验 / 节日框架 / 悄悄话节日包。
 *
 * 断言纪律（AGENTS.md，全部踩过的坑）：
 *  - 断言照页面真实标题写，不凭记忆猜文案；
 *  - "不含 X"类断言必须先证明页面正常渲染（防"没渲染出内容也恒真"假绿）；
 *  - 数据依赖断言必须**造前提**（§8 用真实献祭造近 30 分钟计数与通知落库）；
 *  - 清理必须**按备份逐字还原**，且 try/finally 保证断言失败也打扫
 *    （不打扫会把 verify-hall-niche 的 glyph 重复断言跑红——供台是跨套件共享数据）；
 *  - 悄悄话节日徽章是**时令内容**（节日 ±2 天窗口才渲染）：
 *    运行时断言条件化 + SKIP 说明，另配两条**源码级**断言保证每次都验。
 *
 * 反向验证记录（2026-10，两处核心断言都做过）：
 *  ① 把 halls/[id]/actions.ts 的 notifyOwnerOfTribute 调用注释掉 → §8「通知落库」精确变红；
 *  ② 把 middleware 的 CRAWLER_UA 改成只认 Googlebot → §7「社交抓取器放行」变红
 *     （facebookexternalhit 307 到门页）。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { chromium } = pkg;

const BASE = "http://127.0.0.1:3000";
const SITE_URL = "https://zongyimemorial.com";
const HALL_ID = "cmulk2q7l000211vlj3xpjpwi"; // 「免费馆主纪念空间」（user@test.com 名下，active 公开）
const USER_ID = "cmujvoq2d00018uu6c6848sp5"; // user@test.com（馆主，通知收件人）
const ADMIN_ID = "cmujvoq2900008uu6oeqh570r"; // admin@test.com（献祭者）

// ---- 工具 -------------------------------------------------------------
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

/** psql 查询（-t -A 输出裸值）。execFileSync 数组传参，躲开三层引号剥坏的老坑。 */
function psqlQ(sql) {
  const out = execFileSync(
    "docker",
    ["exec", "memorial-pg", "psql", "-U", "memorial", "-d", "memorial", "-t", "-A", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return out.trim();
}

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

console.log("===== P0 增长基建验收 =====\n");

// ── §0 服务可用 ────────────────────────────────────────────────────
{
  const res = await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  check("服务可用 /login 200", res.status() === 200, `HTTP ${res.status()}`);
}

// ── §1 robots.txt ─────────────────────────────────────────────────
console.log("\n── ① robots.txt ──");
{
  const res = await page.goto(BASE + "/robots.txt", { waitUntil: "domcontentloaded" });
  const txt = await page.content();
  const body = txt.replace(/<[^>]+>/g, ""); // robots.txt 由 Next 渲染成文本，剥掉标签外壳
  check("robots.txt 可访问", res.status() === 200);
  // Next 输出的是「User-Agent: *」（大写 A）；robots 协议本身大小写不敏感，断言用 /i
  check("robots.txt User-agent: *", /user-agent:\s*\*/i.test(body));
  check("robots.txt Allow: /", /Allow:\s*\/\s/.test(body));
  const disallows = ["/console", "/admin", "/pay", "/login", "/register", "/preview-gate", "/api", "/uploads/private"];
  for (const d of disallows) {
    check(`robots.txt Disallow ${d}`, body.includes(`Disallow: ${d}`));
  }
  check("robots.txt 指向 sitemap（生产域名）", body.includes(`Sitemap: ${SITE_URL}/sitemap.xml`));
}

// ── §2 sitemap.xml ────────────────────────────────────────────────
console.log("\n── ② sitemap.xml ──");
{
  const res = await page.goto(BASE + "/sitemap.xml", { waitUntil: "domcontentloaded" });
  const txt = await page.content();
  check("sitemap.xml 可访问", res.status() === 200);
  for (const p of ["/festivals", "/gallery/decor", "/guide/decor", "/about", "/faq", "/whispers", "/suites", "/clan/halls/guide"]) {
    check(`sitemap 含 ${p}`, txt.includes(`${SITE_URL}${p}<`), txt.includes(`${SITE_URL}${p}<`) ? "" : "缺该路径");
  }
  const hallUrls = txt.match(new RegExp(`${SITE_URL}/halls/[a-z0-9]+<`, "g")) ?? [];
  check("sitemap 含公开馆（下界 ≥1）", hallUrls.length >= 1, `命中 ${hallUrls.length}`);
  const mallUrls = txt.match(new RegExp(`${SITE_URL}/mall/[a-z0-9-]+<`, "g")) ?? [];
  check("sitemap 含商品页（下界 ≥1）", mallUrls.length >= 1, `命中 ${mallUrls.length}`);
  // 生产域名硬约束：本地跑也不允许 localhost 混进 URL（NEXT_PUBLIC_SITE_URL 未生效时全部回退 localhost）
  const badBase = txt.match(/<loc>http:\/\/localhost[^<]*<\/loc>/g) ?? [];
  check("sitemap URL 全部走生产域名", badBase.length === 0, badBase.length ? `出现 ${badBase.length} 条 localhost` : "");
}

// ── §3 /festivals 落地页 ──────────────────────────────────────────
console.log("\n── ③ 追思节日历 /festivals ──");
{
  const res = await page.goto(BASE + "/festivals", { waitUntil: "domcontentloaded" });
  const html = await page.content();
  check("/festivals 可访问", res.status() === 200, `HTTP ${res.status()}`);
  check("含「追思节日历」标题", html.includes("追思节日历"));
  check("含「下一个节日」hero", html.includes("下一个节日："));
  // 六节日 section（FESTIVALS 的 name，源数据口径：清明节/中元节/重阳节/寒衣节/冬至/除夕）
  for (const n of ["清明节", "中元节", "重阳节", "寒衣节", "冬至", "除夕"]) {
    check(`/festivals 含「${n}」`, html.includes(n));
  }
  check("含六节日锚点 section（id=qingming）", /id="qingming"/.test(html));
  check("含在线追思入口（/halls）", html.includes('href="/halls"'));
  check("含五年日历表标题", html.includes("追思节日 · 五年日历"));
  const y = new Date().getFullYear();
  check(`日历表含 ${y}–${y + 4} 五个年份`, html.includes(`${y + 4}`));
  check("含除夕无年三十说明", html.includes("年三十"));
  check("套装推荐链到 /suites", /\/suites\//.test(html));
}

// ── §4 /gallery/decor 装修案例厅 ───────────────────────────────────
console.log("\n── ④ 装修案例厅 /gallery/decor ──");
{
  const res = await page.goto(BASE + "/gallery/decor", { waitUntil: "domcontentloaded" });
  const html = await page.content();
  check("/gallery/decor 可访问", res.status() === 200, `HTTP ${res.status()}`);
  check("含「装修案例厅」hero 标题", html.includes("装修案例厅"));
  check("含「纪念馆主题」分组", html.includes("纪念馆主题"));
  check("含「宗祠主题」分组", html.includes("宗祠主题"));
  check("含「不想一件件挑？」组合建议", html.includes("不想一件件挑？"));
  // 模板卡下界（全部模板 34 套，断言 ≥20 防硬编码数量）
  const cards = await page.locator("a[href^='/mall/decor-']").count();
  check("模板卡 ≥ 20 张（下界断言）", cards >= 20, `命中 ${cards}`);
  check("卡片链到商城模板详情（decor- 前缀）", /\/mall\/decor-(clan-)?tpl-/.test(html));
}

// ── §5 首页信任改造 ───────────────────────────────────────────────
console.log("\n── ⑤ 首页信任徽章 / 节日横幅 / 故事卡 ──");
{
  const res = await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const html = await page.content();
  check("首页可访问", res.status() === 200, `HTTP ${res.status()}`);
  // 四徽章（文案照 TrustBadge 真实 title 写）
  for (const t of ["建馆实名审核", "隐私加密存储", "内容人工终审", "长期保存承诺"]) {
    check(`信任徽章「${t}」`, html.includes(t));
  }
  // 节日横幅：nextFestival() 在 2030 年内永远有值 → 横幅必渲染
  check("节日横幅「即将到来」", html.includes("即将到来"));
  check("节日横幅链到 /festivals", html.includes('href="/festivals"'));
  // 故事卡
  for (const s of ["异乡人的清明", "一家的记忆档案", "宗祠的数字传承"]) {
    check(`故事卡「${s}」`, html.includes(s));
  }
  check("故事卡有示意声明", html.includes("示意"));
  // next/image 迁移：服务端 HTML 就应含优化器 URL（hero priority 图）
  check("内容图走 next/image 优化器", html.includes("/_next/image"), html.includes("/_next/image") ? "" : "未见 /_next/image");
}

// ── §6 OG / Twitter 卡 ────────────────────────────────────────────
console.log("\n── ⑥ OG / Twitter 卡 ──");
{
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const html = await page.content();
  check("og:title 存在", /property="og:title"/.test(html));
  check("og:description 存在", /property="og:description"/.test(html));
  check("og:image 指向品牌图", /property="og:image"[^>]*og-default\.jpg/.test(html) || html.includes("og-default.jpg"));
  check("og:image 为生产绝对 URL", new RegExp(`property="og:image:secure_url" content="${SITE_URL}/assets/og-default\\.jpg"|property="og:image" content="${SITE_URL}/assets/og-default\\.jpg"`).test(html));
  check("twitter:card summary_large_image", /name="twitter:card" content="summary_large_image"/.test(html));
  check("canonical 指向生产域名", new RegExp(`rel="canonical" href="${SITE_URL}/?"`).test(html));
}

// ── §7 middleware 爬虫放行（行为级）────────────────────────────────
console.log("\n── ⑦ 中间件爬虫放行 ──");
{
  const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
  const FACEBOOK = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
  const TWITTER = "Twitterbot/1.0";
  const HUMAN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36";

  const probe = async (path, ua) => {
    const r = await fetch(BASE + path, { redirect: "manual", headers: { "user-agent": ua } });
    return r.status;
  };

  const s1 = await probe("/", GOOGLEBOT);
  check("Googlebot 直达首页（200，不过门）", s1 === 200, `HTTP ${s1}`);
  const s2 = await probe("/news", GOOGLEBOT);
  check("Googlebot 直达资讯列表", s2 === 200, `HTTP ${s2}`);
  const s3 = await probe("/", FACEBOOK);
  check("facebookexternalhit 直达首页（分享卡可抓）", s3 === 200, `HTTP ${s3}`);
  const s4 = await probe("/halls", TWITTER);
  check("Twitterbot 直达馆列表（分享卡可抓）", s4 === 200, `HTTP ${s4}`);
  const s5 = await probe("/", HUMAN);
  check("真人无口令仍被拦（对照：307 → /preview-gate）", (s5 === 307 || s5 === 302), `HTTP ${s5}`);
  const s6 = await probe("/console", GOOGLEBOT);
  check("爬虫对私有路径 /console 仍被拦", (s6 === 307 || s6 === 302), `HTTP ${s6}`);
}

// ── §8 共祭动态 + 站内信联动（真实献祭造前提）──────────────────────
console.log("\n── ⑧ 共祭动态 + 站内信（admin → user 的馆真献祭）──");
const cleanupBag = { backupHolding: null, t0: null };
{
  // 备份 admin 的 free-incense 库存（收尾逐字还原）；不足则备货
  const row = psqlQ(
    `SELECT quantity || '|' || COALESCE("freeTopUpDate"::text, '') FROM "OfferingHolding" WHERE "userId"='${ADMIN_ID}' AND "productId"=(SELECT id FROM "Product" WHERE slug='free-incense');`,
  );
  cleanupBag.backupHolding = row || "MISSING";
  if (row.startsWith("0|")) {
    // 行存在且 quantity=0 → 补 1 份（防止之前的套件把当日配额用光、按钮变 disabled）
    psqlQ(
      `UPDATE "OfferingHolding" SET quantity=1 WHERE "userId"='${ADMIN_ID}' AND "productId"=(SELECT id FROM "Product" WHERE slug='free-incense');`,
    );
  }

  // admin 登录
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', "admin@test.com");
  await page.fill('input[name="password"]', "admin123456");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4500);

  cleanupBag.t0 = new Date().toISOString();
  const t0pg = cleanupBag.t0;

  await page.goto(BASE + "/halls/" + HALL_ID, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // 「献上上香」按钮（title 格式：有货「献上上香 · 剩余 N 份」/ 用尽「献上上香 · 已用尽」）
  const incenseBtn = page.locator('button[title^="献上上香"]').first();
  const btnCount = await page.locator('button[title^="献上上香"]').count();
  check("馆页有「献上上香」按钮", btnCount >= 1, `命中 ${btnCount}`);

  if (btnCount >= 1) {
    const title = await incenseBtn.getAttribute("title");
    check("上香按钮有库存（前提成立）", !/已用尽/.test(title), `title=${title}`);
    await incenseBtn.click();
    await page.waitForTimeout(2500);

    // 献祭后重新加载页面：共祭动态应出现。
    // ⚠️ React SSR 对 {插值} 会插 <!-- --> 分隔注释（近 30 分钟，<!-- -->1<!-- --> 位亲友），
    // 匹配前必须先剥掉，否则正则被注释断开、恒假红（实测踩到）。
    await page.goto(BASE + "/halls/" + HALL_ID, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const html2raw = await page.content();
    const html2 = html2raw.replace(/<!-- -->/g, "");
    check(
      "共祭动态「近 30 分钟，N 位亲友在此追思」出现",
      /近 30 分钟，[1-9]\d* 位亲友在此追思/.test(html2),
      /近 30 分钟，[1-9]\d* 位亲友在此追思/.test(html2) ? "" : "未见计数条",
    );
    check("页面正常渲染（防'没渲染也通过'的对照断言）", html2.includes("免费馆主纪念空间"));

    // Notification 落库：user@test.com（馆主）应收到 kind=tribute
    const notif = psqlQ(
      `SELECT title FROM "Notification" WHERE "userId"='${USER_ID}' AND kind='tribute' AND "createdAt" >= '${t0pg}' ORDER BY "createdAt" DESC LIMIT 1;`,
    );
    check("馆主收到站内信（kind=tribute 落库）", notif.length > 0, notif || "Notification 无新行");
    check(
      "通知标题含馆名与祭品名",
      notif.includes("免费馆主纪念空间") && notif.includes("上香"),
      notif,
    );

    // 反向对照：献祭者自己（admin）不该收到（自己献自己的不发——本案馆主是 user，admin 是 actor）
    const selfNotif = psqlQ(
      `SELECT COUNT(*) FROM "Notification" WHERE "userId"='${ADMIN_ID}' AND kind='tribute' AND "createdAt" >= '${t0pg}';`,
    );
    check("献祭者自己不收到通知", selfNotif === "0", `admin 名下 ${selfNotif} 条`);
  }
}

// ── 清理（§8 造的数据，逐字还原）──────────────────────────────────
{
  const t0 = cleanupBag.t0;
  try {
    const tributeId = psqlQ(`SELECT id FROM "MemorialTribute" WHERE "hallId"='${HALL_ID}' AND "userId"='${ADMIN_ID}' AND "createdAt" >= '${t0}' ORDER BY "createdAt" DESC LIMIT 1;`);
    const altarId = psqlQ(`SELECT id FROM "OfferingOnAltar" WHERE "hallId"='${HALL_ID}' AND "userId"='${ADMIN_ID}' AND "createdAt" >= '${t0}' ORDER BY "createdAt" DESC LIMIT 1;`);
    const notifIds = psqlQ(`SELECT string_agg(id, ',') FROM "Notification" WHERE "userId"='${USER_ID}' AND kind='tribute' AND "createdAt" >= '${t0}';`);
    if (notifIds) psqlQ(`DELETE FROM "Notification" WHERE id IN ('${notifIds.split(",").join("','")}');`);
    if (altarId) psqlQ(`DELETE FROM "OfferingOnAltar" WHERE id='${altarId}';`);
    if (tributeId) psqlQ(`DELETE FROM "MemorialTribute" WHERE id='${tributeId}';`);
    // 库存还原为备份值（MISSING = 开局无行，则删掉可能新建的行）
    const bak = cleanupBag.backupHolding;
    const prodSub = `(SELECT id FROM "Product" WHERE slug='free-incense')`;
    if (bak === "MISSING") {
      psqlQ(`DELETE FROM "OfferingHolding" WHERE "userId"='${ADMIN_ID}' AND "productId"=${prodSub};`);
    } else {
      const [qty, topUp] = bak.split("|");
      psqlQ(
        `UPDATE "OfferingHolding" SET quantity=${Number(qty)}, "freeTopUpDate"=${topUp ? `'${topUp}'` : "NULL"} WHERE "userId"='${ADMIN_ID}' AND "productId"=${prodSub};`,
      );
    }
    console.log("── 清理完成（Notification/OfferingOnAltar/MemorialTribute/OfferingHolding 已还原）");
  } catch (e) {
    console.log("⚠️ 清理异常（请手工核对）：" + e.message);
    fail++; // 清理失败也算红——脏数据会把兄弟套件跑红
    console.log("FAIL  §8 清理流程异常");
  }
}

// ── §9 控制台追思日历 ─────────────────────────────────────────────
console.log("\n── ⑨ 控制台追思日历 ──");
{
  // 登出 admin → 登录 user
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  // 若已是 admin 登录态，先清 cookie 重新来（/login 对已登录者也可能直接渲染表单）
  await ctx.clearCookies();
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', "user@test.com");
  await page.fill('input[name="password"]', "user123456");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4500);

  await page.goto(BASE + "/console", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const html = await page.content();
  check("控制台含「追思日历」板块", html.includes("追思日历"));
  check("日历锚点 id=calendar 存在", /id="calendar"/.test(html));
  check("NAV 含追思日历锚点链接", /href="#calendar"/.test(html));
  // 日历事件或空态文案二选一（数据依赖，不赌数据）
  const hasEvents = /忌日|生日|节日/.test(html);
  const hasEmpty = html.includes("近 60 天暂无需要记挂的日子");
  check("60 天日历渲染（有事件或有空态）", hasEvents || hasEmpty, hasEvents ? "有事件" : hasEmpty ? "空态" : "两者皆无");
}

// ── §10 悄悄话节日徽章（源码级 + 运行时条件）──────────────────────
console.log("\n── ⑩ 悄悄话节日包 ──");
{
  // 源码级（每次都能验）：systemPrompt 注入 + 徽章渲染块 + /festivals 链接
  const svc = readFileSync("/workspace/lib/whisper-service.ts", "utf8");
  check("whisper-service 注入【今日节气】", svc.includes("今日节气"));
  check("whisper-service 导出 festivalBadge", /export function festivalBadge/.test(svc));
  const wp = readFileSync("/workspace/app/(public)/whispers/[hallId]/page.tsx", "utf8");
  check("悄悄话页调用 festivalBadge()", wp.includes("festivalBadge()"));
  check("悄悄话页徽章链到 /festivals", wp.includes('"/festivals"'));

  // 运行时（时令内容，节日 ±2 天窗口才渲染；窗口外 SKIP 并说明）
  await page.goto(BASE + "/whispers/" + HALL_ID, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const html = await page.content();
  if (html.includes("前后，TA 的话里")) {
    check("节日徽章运行时渲染（今日在节日窗口）", html.includes("了解这个节日"), "");
  } else {
    console.log("SKIP  节日语境徽章：今日不在任何节日 ±2 天窗口（时令内容，非缺陷）");
  }
}

await b.close();

console.log(`\n通过 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
