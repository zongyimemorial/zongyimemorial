// 装修案例厅（/gallery/decor）及关联装修展示页统一排查：
//   ① 大五角星/占位封面（decor Lottie 空动画/星）
//   ② 价格与购买按钮是否首屏可见
//   ③ 死链 / 404
// 全程只读、不改库。
import { createRequire } from "module";
const require = createRequire("/workspace/");
const { chromium } = require("/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BASE = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let problems = 0;
function flag(cond, msg) {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) problems++;
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();

  // 记录所有 Lottie JSON 请求（判断是否有 decor 星动画被加载）
  const lottieRequests = new Set();
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("/assets/lottie/") && u.endsWith(".json")) lottieRequests.add(u);
  });

  // ---------- 1) 装修案例厅本身 ----------
  console.log("\n=== /gallery/decor ===");
  await page.goto(`${BASE}/gallery/decor`, { waitUntil: "networkidle" }).catch(() => {});
  await sleep(800);
  const gStatus = await page.evaluate(() => document.body.innerText.includes("装修案例厅"));
  flag(gStatus, "装修案例厅首页正常渲染（含标题）");

  // 取出所有指向 /mall/ 的链接（可点击的付费主题卡片）
  const galleryLinks = await page.$$eval('a[href^="/mall/"]', (as) =>
    [...new Set(as.map((a) => a.getAttribute("href")))],
  );
  console.log(`   可点击主题卡片链接数：${galleryLinks.length}`);
  flag(galleryLinks.length >= 20, "画廊含足量可点击主题（>=20）");

  // ---------- 2) 逐个装修详情页排查（来自 DB 的全量装修商品，最全） ----------
  console.log("\n=== 装修商品详情页（全量 DB 装修商品）===");
  const dbSlugs = await prisma.product.findMany({
    where: { type: "decor", status: "active" },
    select: { slug: true, name: true },
    orderBy: { slug: "asc" },
  });
  console.log(`   DB 中 active 装修商品：${dbSlugs.length} 个`);
  flag(dbSlugs.length >= 40, "装修商品数量充足（>=40）");
  // 画廊链接应全部落在 DB 装修商品内（无死链）
  const dbSet = new Set(dbSlugs.map((p) => p.slug));
  const gallerySlugs = galleryLinks.map((h) => h.replace("/mall/", ""));
  const orphan = gallerySlugs.filter((s) => !dbSet.has(s));
  flag(orphan.length === 0, `画廊链接全部命中 DB 商品（孤儿 ${orphan.length} 个：${orphan.join(",")}）`);

  const allHrefs = dbSlugs.map((s) => `/mall/${s.slug}`);
  const seen = new Set();
  let checked = 0;
  for (const href of allHrefs) {
    if (seen.has(href)) continue;
    seen.add(href);
    const url = `${BASE}${href}`;
    // 重试一次以吸收冷编译（首 hit 路由按需编译导致的竞态）
    let status = -1;
    for (let attempt = 0; attempt < 2; attempt++) {
      lottieRequests.clear();
      const resp = await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => null);
      status = resp ? resp.status() : -1;
      // 等到购买按钮或价格区出现（首屏），最多 20s
      await page
        .waitForFunction(
          () =>
            /立即购买|去纪念馆祭拜/.test(document.body.innerText) &&
            document.querySelector("h1"),
          { timeout: 20000 },
        )
        .catch(() => {});
      await sleep(400);
      if (status === 200 && (await page.$('div.aspect-\\[16\\/9\\] img'))) break;
    }

    // ① 死链
    const ok = status === 200;
    flag(ok, `详情页 ${href} 可访问（HTTP ${status}）`);
    if (!ok) { checked++; continue; }

    // ② 星封面：不应再请求 decor 星 Lottie
    const starReq = [...lottieRequests].some((u) => u.endsWith("/lottie/decor.json"));
    flag(!starReq, `详情页 ${href} 未加载 decor 星 Lottie`);

    // ②b 封面是否落回 SVG 底图（容器内有 <img>）
    const hasImgCover = await page.$$eval(
      'div.aspect-\\[16\\/9\\] img',
      (imgs) => imgs.some((i) => (i.getAttribute("src") || "").includes("prod-decor")),
    ).catch(() => false);
    flag(hasImgCover, `详情页 ${href} 封面回退为场景 SVG（prod-decor.*）`);

    // ③ 首屏价格 + 购买按钮：取“立即购买”按钮与“当前空间形态”文本的相对位置
    const layout = await page.evaluate(() => {
      const vh = window.innerHeight;
      const btn = [...document.querySelectorAll("button")].find((b) => /立即购买|去纪念馆祭拜/.test(b.textContent || ""));
      const title = document.querySelector("h1");
      const priceText = title ? title.parentElement?.parentElement?.querySelector(".text-2xl") : null;
      const spaceNote = [...document.querySelectorAll("p")].find((p) => /当前空间形态/.test(p.textContent || ""));
      const yOf = (el) => (el ? el.getBoundingClientRect().top + window.scrollY : null);
      return {
        vh,
        btnY: btn ? yOf(btn) : null,
        priceY: priceText ? yOf(priceText) : null,
        spaceY: spaceNote ? yOf(spaceNote) : null,
        btnText: btn ? (btn.textContent || "").trim() : null,
      };
    });
    const firstScreen = (y) => y != null && y < layout.vh + 50;
    flag(
      !!layout.btnText,
      `详情页 ${href} 存在购买按钮（${layout.btnText || "无"}）`,
    );
    flag(
      firstScreen(layout.btnY) && firstScreen(layout.priceY),
      `详情页 ${href} 价格(${Math.round(layout.priceY ?? -1)})与按钮(${Math.round(layout.btnY ?? -1)})在首屏（vh=${layout.vh}）`,
    );
    flag(
      layout.spaceY == null || layout.btnY == null || layout.spaceY > layout.btnY,
      `详情页 ${href} 价格/按钮在“当前空间形态”(y=${Math.round(layout.spaceY ?? -1)})之前`,
    );
    checked++;
  }
  console.log(`   已排查详情页：${checked} 个`);

  // ---------- 3) 套装目录页 /suites 与详情 ----------
  console.log("\n=== /suites 与套装详情 ===");
  await page.goto(`${BASE}/suites`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(700);
  const suiteLinks = await page.$$eval('a[href^="/suites/"]', (as) =>
    [...new Set(as.map((a) => a.getAttribute("href").split("?")[0]))].filter((h) => h !== "/suites"),
  );
  console.log(`   套装详情链接数：${suiteLinks.length}`);
  for (const href of suiteLinks.slice(0, 6)) {
    let status = -1;
    for (let attempt = 0; attempt < 2; attempt++) {
      lottieRequests.clear();
      const resp = await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" }).catch(() => null);
      status = resp ? resp.status() : -1;
      await page.waitForFunction(() => document.querySelector("h1"), { timeout: 20000 }).catch(() => {});
      await sleep(400);
      if (status === 200) break;
    }
    flag(status === 200, `套装详情 ${href} 可访问（HTTP ${status}）`);
    const starReq = [...lottieRequests].some((u) => u.endsWith("/lottie/decor.json"));
    flag(!starReq, `套装详情 ${href} 未加载 decor 星 Lottie`);
  }

  // ---------- 4) 商城页与装修指引 ----------
  console.log("\n=== /mall 与 /guide/decor ===");
  for (const p of ["/mall", "/guide/decor"]) {
    lottieRequests.clear();
    const resp = await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" }).catch(() => null);
    const status = resp ? resp.status() : -1;
    await sleep(600);
    flag(status === 200, `${p} 可访问（HTTP ${status}）`);
  }

  await browser.close();
  console.log(`\n=== 排查结束：发现 ${problems} 处问题 ===`);
  process.exit(problems === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(2);
});
