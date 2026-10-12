// 无头浏览器验证：商城列表页展示 AI 生成的精美封面图（不再被 Lottie 盖住），
// 商品详情页头部仍保留墨金 Lottie 微动图且真正绘制出来。
//
// 2026-10 设计变更：用户反馈列表页被墨金 Lottie 盖住的卡片"太难看"，
// 列表页（/mall 免费+付费卡）改为直接展示 AI 实拍封面图；Lottie 仅保留
// 在商品详情页。本脚本断言随设计同步更新：
//   - /mall：渲染出 ≥10 张 /assets/free-* 封面图（免费区 10 件套）
//   - /mall/virtual-flower：Lottie SVG 仍绘制（div[role=img] 内有 svg）
//   - **public/assets/lottie/*.json 全部能真画出图形**（多帧采样，见下方长注释）
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";

const { chromium } = pkg;

const BASE = "http://localhost:3000";
const PASS = "neibu1234";

async function unlock(ctx) {
  const r = await ctx.request.post(`${BASE}/api/preview-unlock`, {
    form: { pass: PASS },
  });
  if (!r.ok()) throw new Error("unlock failed: " + r.status());
}

async function main() {
  const browser = await chromium.launch();
  // shots/ 在 .gitignore 里，新检出时不存在 —— 不兜底会在截图那一步崩
  mkdirSync("shots", { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await unlock(ctx);

  const page = await ctx.newPage();
  const lottieRequests = new Set();
  page.on("request", (req) => {
    if (req.url().includes("/assets/lottie/")) lottieRequests.add(req.url());
  });

  let fails = 0;
  let passes = 0;
  const check = (name, ok, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
    if (ok) passes++;
    else fails++;
  };

  // ---- 商城列表页：免费区封面图直接可见 ----
  await page.goto(`${BASE}/mall`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);

  const mall = await page.evaluate(() => {
    // next/image fill 渲染的 src 是优化 URL（/_next/image?url=%2Fassets%2Ffree-…），
    // 斜杠被编码 —— 所以按 "free-" 基名匹配，不能带 "/assets/" 前缀
    const covers = Array.from(document.querySelectorAll('img[src*="free-"]'));
    const loaded = covers.filter((i) => i.complete && i.naturalWidth > 50);
    return { covers: covers.length, loaded: loaded.length };
  });
  await page.screenshot({ path: "shots/mall-covers.png", fullPage: false });
  check("列表页渲染出免费祭品封面图 ≥10", mall.covers >= 10, `实得 ${mall.covers}`);
  check("封面图真实加载（naturalWidth>50）≥10", mall.loaded >= 10, `实得 ${mall.loaded}`);

  // ---- 商品详情页：Lottie 微动图保留并绘制 ----
  await page.goto(`${BASE}/mall/virtual-flower`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const detail = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('div[role="img"]'));
    let drawn = 0;
    for (const d of imgs) {
      const svg = d.querySelector("svg");
      if (svg && svg.querySelectorAll("path,g,ellipse,rect").length > 0) drawn++;
    }
    return { total: imgs.length, drawn };
  });
  await page.screenshot({ path: "shots/mall-detail-lottie.png", fullPage: false });
  check("详情页 Lottie SVG 已绘制", detail.drawn > 0, JSON.stringify(detail));
  check("Lottie JSON 有网络请求", lottieRequests.size > 0, `请求数 ${lottieRequests.size}`);

  // ---- 全部 Lottie 文件必须真的画出图形（多帧采样） ----
  /*
    为什么这条断言非立不可：
    `sr`（星形/多边形）的 `sy` 与 `ir` 一旦不自洽，lottie-web **不报错、不告警**，
    只产出一个空的 `<g>` —— 页面上是"一块空白"，JSON 里看不出任何毛病
    （该有的配色、透明度动画、图层结构全都在）。
    2026-10 实测：star / moon / music / service / cloud / firework / decor 共 7 个
    文件整层渲染管线静默中止（详见 scripts/gen-lottie-offerings.py 的 star() 注释）。
    教训：只断言"DOM 里存在 svg"抓不到这种空壳（空壳也有 svg），
    必须数**真正画出来的 path**（`d` 属性非空）。

    多帧采样：有些元素在第 0 帧本就透明（如烟花射线 opacity 从 0 起），
    只测第 0 帧会把正常文件误判成空。
  */
  const lottieDir = "public/assets/lottie";
  const lottieFiles = readdirSync(lottieDir).filter((f) => f.endsWith(".json")).sort();
  const FRAMES = [0, 30, 45, 60, 80];
  const blank = [];
  const lpage = await ctx.newPage();
  await lpage.setContent("<html><body></body></html>");
  await lpage.addScriptTag({ path: "node_modules/lottie-web/build/player/lottie.min.js" });
  for (const f of lottieFiles) {
    const anim = JSON.parse(readFileSync(`${lottieDir}/${f}`, "utf8"));
    const best = await lpage.evaluate(
      ({ a, frames }) => {
        const host = document.body;
        let bestPainted = 0;
        for (const fr of frames) {
          host.innerHTML = "";
          const div = document.createElement("div");
          div.style.width = "200px";
          div.style.height = "200px";
          host.appendChild(div);
          const item = window.lottie.loadAnimation({
            container: div,
            renderer: "svg",
            loop: false,
            autoplay: false,
            animationData: JSON.parse(JSON.stringify(a)),
          });
          item.goToAndStop(fr, true);
          const defs = Array.from(div.querySelectorAll("defs *"));
          const leaves = Array.from(div.querySelectorAll("path,rect,circle,ellipse,polygon")).filter(
            (el) => !defs.some((d) => d === el || d.contains(el)),
          );
          const painted = leaves.filter((el) => {
            if (el.tagName.toLowerCase() !== "path") return true;
            return (el.getAttribute("d") || "").trim().length > 1;
          }).length;
          if (painted > bestPainted) bestPainted = painted;
          item.destroy();
        }
        return bestPainted;
      },
      { a: anim, frames: FRAMES },
    );
    if (best === 0) blank.push(f);
  }
  check(
    `全部 Lottie 均能画出图形（共 ${lottieFiles.length} 个文件，多帧采样）`,
    blank.length === 0,
    blank.length ? `渲染为空的：${blank.join(", ")}` : `${lottieFiles.length}/${lottieFiles.length}`,
  );

  console.log(fails === 0 ? "✅ 验证通过" : `❌ ${fails} 项失败`);
  console.log(`结果: ${passes}/${passes + fails} 通过`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
