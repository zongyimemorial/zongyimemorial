/**
 * 无遗像分支验收：壁龛模式下馆主未上传遗像时，
 * 该格必须**保持空白**（不画破图、不出现 undefined/null），
 * 且访客看不到任何引导、馆主看到上传引导。
 *
 * 本套件**自带前置与善后**：先把该馆的 archive.portrait 临时摘掉，
 * 跑完再恢复原值 —— 否则它依赖上一个套件的副作用，非常脆。
 *
 * ⚠️ 2026-10 修复：本套件早先只摘遗像，**没有自己保证"壁龛墙模式"这个前提**。
 *
 * `isNicheWall` 的判定是 `!!portraitUrl || orn.kind === "niche-wall"`（见馆页）。
 * 所以"摘掉遗像"之后要仍然落在壁龛模式，就必须**再有一条腿**：
 * 挂饰得是 `orn-niche-wall`。而这座馆的挂饰是 `orn-none` ——
 * 于是两条腿同时断掉，壁龛墙整个不渲染，
 * 「场景仍然渲染」「45 个壁龛格仍在」双双变红。
 * 看着像套件抓到了回归，其实是**套件自己的前提没搭起来**
 * （AGENTS.md：断言前显式备货，别赌库里的状态）。
 *
 * 修法：开局显式把挂饰设成 `orn-niche-wall` 并**一并备份原值**，收尾恢复。
 * 这条路本身就是产品既定行为之一（"没遗像时回退到挂饰条件 —— 老页面零回归"），
 * 所以断言并没有被弱化，只是把前提补全了。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { execSync } from "node:child_process";

const BASE = "http://127.0.0.1:3000";
const HALL_ID = "cmulk2q7l000211vlj3xpjpwi";

const psql = (q) =>
  execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`, {
    encoding: "utf8",
  }).trim();

// ---- 前置：备份并摘掉遗像 ----
const backup = psql(
  `SELECT coalesce(archive->>'portrait','') FROM "MemorialHall" WHERE id='${HALL_ID}'`,
);
psql(`UPDATE "MemorialHall" SET archive = archive - 'portrait' WHERE id='${HALL_ID}'`);
console.log(`[setup] 原遗像 = ${backup || "(无)"}，已临时摘除`);

/*
  前置（二）：显式把挂饰设成 orn-niche-wall，撑住"壁龛墙模式"这个前提。
  同时备份原挂饰值 —— 它可能是别的套件跑完留下的状态，不能假定是默认值。
*/
const ornBackup = psql(
  `SELECT coalesce("templateConfig"->'decor'->'slots'->>'ornament','') FROM "MemorialHall" WHERE id='${HALL_ID}'`,
);
psql(
  `UPDATE "MemorialHall" SET "templateConfig" = jsonb_set(coalesce("templateConfig",'{}'), '{decor,slots,ornament}', '"orn-niche-wall"'::jsonb, true) WHERE id='${HALL_ID}'`,
);
console.log(`[setup] 原挂饰 = ${ornBackup || "(无)"}，已临时设为 orn-niche-wall`);

function restore() {
  if (backup) {
    psql(
      `UPDATE "MemorialHall" SET archive = jsonb_set(archive, '{portrait}', '"${backup}"'::jsonb, true) WHERE id='${HALL_ID}'`,
    );
    console.log(`[teardown] 已恢复遗像 = ${backup}`);
  } else {
    console.log("[teardown] 原本无遗像，无需恢复");
  }
  const ornNow = psql(
    `SELECT coalesce("templateConfig"->'decor'->'slots'->>'ornament','') FROM "MemorialHall" WHERE id='${HALL_ID}'`,
  );
  if (ornNow !== ornBackup) {
    psql(
      `UPDATE "MemorialHall" SET "templateConfig" = jsonb_set(coalesce("templateConfig",'{}'), '{decor,slots,ornament}', ${ornBackup ? `'"${ornBackup}"'` : `'"orn-none"'`}::jsonb, true) WHERE id='${HALL_ID}'`,
    );
    console.log(`[teardown] 已恢复挂饰 = ${ornBackup || "orn-none"}`);
  }
}

process.on("exit", restore);
process.on("uncaughtException", (e) => {
  restore();
  console.error(e);
  process.exit(1);
});

let pass = 0,
  fail = 0;
const check = (n, ok, d = "") => {
  if (ok) {
    pass++;
    console.log(`PASS  ${n}${d ? `  (${d})` : ""}`);
  } else {
    fail++;
    console.log(`FAIL  ${n}${d ? `  (${d})` : ""}`);
  }
};

const browser = await chromium.launch();
const errors = [];

// ---- 访客（未登录） ----
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  await page.goto(`${BASE}/halls/${HALL_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const info = await page.evaluate(() => {
    const svg = document.querySelector('svg[aria-label="壁龛纪念墙"]');
    /*
      只检查**场景自身**的渲染结果。
      不能说"全页 HTML 不含 undefined/null" —— Next.js 的 RSC payload 本身就大量
      使用 `$undefined` / `null` 作为占位（任何页面都有），拿它当判据会永远失败。
    */
    const sceneHtml = svg ? svg.parentElement.outerHTML : "";
    return {
      scene: !!svg,
      sceneHtml,
      portraitImgs: document.querySelectorAll("img[alt*='遗像']").length,
      text: document.body.innerText,
    };
  });

  check("无遗像：场景仍然渲染", info.scene, "");
  check("无遗像：不渲染任何遗像 <img>", info.portraitImgs === 0, `${info.portraitImgs} 处`);
  check(
    "无遗像：场景内无 undefined/null 字样",
    !/\bundefined\b|\bnull\b|NaN/.test(info.sceneHtml),
    info.sceneHtml.match(/undefined|null|NaN/g)?.slice(0, 3).join(",") ?? "",
  );
  check("无遗像：访客看不到上传引导", !info.text.includes("上传"), "");
  check("无遗像：45 个壁龛格仍在", (await page.locator('svg[aria-label="壁龛纪念墙"] rect[fill*="nw-cell"]').count()) === 45, "");

  await ctx.close();
}

// ---- 馆主（登录）应看到引导 ----
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login?cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
  const f = page.locator('input[name="identifier"]');
  if ((await f.count()) > 0) {
    // 该馆的 ownerUserId 是 user@test.com（非 admin），必须用馆主本人登录
    await f.fill("user@test.com");
    await page.fill('input[name="password"]', "user123456");
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle");
  }
  await page.goto(`${BASE}/halls/${HALL_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const text = await page.locator("body").innerText();
  check("无遗像·馆主：看到「上传」引导", text.includes("上传"), "");

  const href = await page
    .locator('a:has-text("上传")')
    .first()
    .getAttribute("href")
    .catch(() => null);
  check("无遗像·馆主：引导链到馆务管理", !!href && href.includes("/console/halls/"), href ?? "无");

  await ctx.close();
}

check("无控制台错误、无 4xx/5xx 请求", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log("");
console.log(`通过 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
