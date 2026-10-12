/**
 * 无遗像分支验收：馆主未上传遗像时，
 * 场景必须**仍然渲染**（不画破图、不出现 undefined/null），
 * 且访客看不到任何引导、馆主看到上传引导。
 *
 * ⚠️ 架构演进说明（别改回去）：
 *   本套件早先断言平面 SVG 壁龛墙（NicheWallHero）的 45 个格。该组件已被
 *   **Hall3DStage**（CSS 3D 全貌厅堂）取代，`NicheWallHero` 已无任何页面引用。
 *   于是 `svg[aria-label="壁龛纪念墙"]` 恒为 null → "场景仍然渲染" 恒红，
 *   那是**断言过时**而非产品回归。现改断言真实结构：`[data-hall3d-stage="1"]`。
 *   守的东西没变：没遗像时场景照样立得起来、不崩、不画破图、访客无引导。
 *
 * 本套件**自带前置与善后**：用 withRestore 在 finally 里无条件还原
 * （archive.portrait + templateConfig.decor.slots.ornament），
 * 崩溃也不会把库留在脏状态（见 scripts/_db.mjs）。
 *
 * ⚠️ 前提：`isNicheWall` 的判定是 `!!portraitUrl || orn.kind === "niche-wall"`（见馆页）。
 *   所以"摘掉遗像"之后要仍然落在场景模式，就必须**再有一条腿** —— 挂饰得是
 *   `orn-niche-wall`。本套件开局显式设置它，不赌库里的状态。
 *   这条路本身就是产品既定行为（"没遗像时回退到挂饰条件 —— 老页面零回归"），
 *   故断言没有被弱化，只是把前提补全了。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { sql, withRestore } from "./_db.mjs";
const { chromium } = pkg;

const BASE = "http://127.0.0.1:3000";
const HALL_ID = process.env.HALL_ID || "cmulk2q7l000211vlj3xpjpwi";

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

const browser = await chromium.launch();
const errors = [];

await withRestore(
  [{ table: '"MemorialHall"', where: `id='${HALL_ID}'`, cols: ["archive", "templateConfig"] }],
  async () => {
    // ---- 前置：摘掉遗像 + 撑住"场景模式"这条腿 ----
    sql(`UPDATE "MemorialHall" SET archive = archive - 'portrait' WHERE id='${HALL_ID}';`);
    sql(
      `UPDATE "MemorialHall" SET "templateConfig" = jsonb_set(coalesce("templateConfig",'{}'), '{decor,slots,ornament}', '"orn-niche-wall"'::jsonb, true) WHERE id='${HALL_ID}';`,
    );
    console.log("[setup] 已临时摘除遗像，并设挂饰 = orn-niche-wall");

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
      await page.waitForTimeout(600);

      const info = await page.evaluate(() => {
        const scene = document.querySelector('[data-hall3d-stage="1"]');
        /*
          只检查**场景自身**的渲染结果。
          不能说"全页 HTML 不含 undefined/null" —— Next.js 的 RSC payload 本身就大量
          使用 `$undefined` / `null` 作为占位（任何页面都有），拿它当判据会永远失败。
        */
        const sceneHtml = scene ? scene.outerHTML : "";
        return {
          scene: !!scene,
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
      check("无遗像：遗像壁龛容器不渲染（没图就不留空龛）", !info.sceneHtml.includes("data-portrait-niche"), "");
      check("无遗像：访客看不到上传引导", !info.text.includes("上传"), "");

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
      await page.waitForTimeout(600);

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
  },
);

check("无控制台错误、无 4xx/5xx 请求", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log("");
console.log(`通过 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
