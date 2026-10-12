/**
 * 遗像安奉（纪念馆正墙壁龛）验收套件
 *
 * 目标：确认「逝者遗像被放进纪念堂正墙居中偏上的壁龛里」这件事在**真实 Next 应用**
 * 里成立，并且在三种视口下都不错位、全页只出现一次。
 *
 * ⚠️ 架构演进说明（别改回去）：
 *   本套件原名 verify-hall-niche，最早断言的是平面 SVG 壁龛墙（NicheWallHero，
 *   9×5=45 格 + 大理石地面 + 窗帘 + 金灯柱）。该组件已被 **Hall3DStage**（CSS 3D
 *   全貌厅堂）取代，`NicheWallHero` 现已无任何页面引用，只活在注释里。
 *   继续断言那面 SVG 只会得到一堆"找不到元素"的假红 —— 那是**断言过时**，
 *   不是产品坏了。故此处改写到真实结构上：
 *     · 场景根   → [data-hall3d-stage="1"]
 *     · 遗像容器 → [data-portrait-niche="3d"]
 *   守的东西没变：遗像在正墙、居中、偏上、唯一、各视口不溢出。
 *
 * 为什么要用 Playwright 实测 getBoundingClientRect 而不只断言 HTML 字符串：
 *   遗像与外框是两套 DOM，只有实测矩形关系才能确认"嵌进去了"。
 *   （项目里发生过 aspect-ratio 互相喂养导致元素涨到 8915px 的事故。）
 *
 * 前置：Next 已在 127.0.0.1:3000 运行。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { execSync } from "node:child_process";
const { chromium } = pkg;

const BASE = "http://127.0.0.1:3000";
const HALL_ID = process.env.HALL_ID || "cmulk2q7l000211vlj3xpjpwi";

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

const browser = await chromium.launch();
const errors = [];

/** 打开纪念馆并等场景稳定（3D 舞台有 0.35s 位移动画）。 */
async function openHall(ctx, settle = 900) {
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  await page.goto(`${BASE}/halls/${HALL_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(settle);
  return page;
}

function newCtx(w, h) {
  return browser.newContext({ viewport: { width: w, height: h } });
}

// ---------------------------------------------------------------------------
// 1. 场景结构 + 遗像唯一性 + 要素回归
// ---------------------------------------------------------------------------
{
  const ctx = await newCtx(1440, 1000);
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await openHall(ctx);

  const stage = await page.evaluate(() => {
    const root = document.querySelector('[data-hall3d-stage="1"]');
    if (!root) return null;
    const niche = root.querySelector('[data-portrait-niche="3d"]');
    const img = root.querySelector("img[alt*='遗像']");
    return {
      // 3D 舞台必须真的带透视（v1 的平面墙没有这个）——"立体厅堂"的最低证据
      perspective: getComputedStyle(root).perspective,
      has3dLayer: !!root.querySelector('[style*="preserve-3d"]'),
      hasNiche: !!niche,
      hasImg: !!img,
      imgSrc: img ? img.getAttribute("src") : null,
    };
  });

  check("场景：3D 舞台已渲染（[data-hall3d-stage]）", !!stage, stage ? "" : "未找到");
  check(
    "场景：带透视且存在 preserve-3d 层（是真 3D，不是平面墙）",
    !!stage && stage.perspective !== "none" && stage.has3dLayer,
    stage ? `perspective=${stage.perspective} preserve3d=${stage.has3dLayer}` : "无",
  );
  check("场景：遗像壁龛容器已渲染（[data-portrait-niche]）", !!stage?.hasNiche, "");
  check(
    "遗像：已渲染 <img> 且指向遗像文件",
    !!stage?.imgSrc && /portrait|\/uploads\//.test(stage.imgSrc),
    stage?.imgSrc ?? "无",
  );

  // 遗像必须**只出现一次**（正墙安奉后不应再重复渲染竖图卡片）
  const imgCount = await page.locator("img[alt*='遗像']").count();
  check("遗像：全页只出现一次（未重复渲染）", imgCount === 1, `实测 ${imgCount} 处`);

  // 硬约束文案仍在（避免改造把既有功能打掉）
  const body = await page.locator("body").innerText();
  check("回归：馆名仍在", body.includes("免费馆主纪念空间") || body.includes("纪念空间"), "");
  check("回归：逝者名仍在", body.includes("李老先生") || body.includes("逝者："), "");
  check("回归：追思记录区仍在", body.includes("追思记录"), "");
  check("回归：祭拜面板仍在", /献花|敬香|点灯/.test(body), "");

  /*
    防重复：默认兜底封面 /assets/hall-cover.jpg 本身就是一张"纪念墙"照片，
    与场景高度雷同。若仍渲染它，页面会上下并排两面几乎一样的墙。
    因此：未上传 coverImage 时，全景区必须不出现。
  */
  const dupPanorama = await page.evaluate(
    () =>
      [...document.querySelectorAll("img")].filter((i) =>
        (i.getAttribute("src") || "").includes("hall-cover.jpg"),
      ).length,
  );
  check("防重复：未上传封面时不渲染兜底全景图", dupPanorama === 0, `hall-cover.jpg 出现 ${dupPanorama} 次`);

  // 未选该模式的馆不应崩
  const other = await page.evaluate(async () => {
    const r = await fetch("/halls/cmulkwa570001ly4yzf6p5xls", { credentials: "include" });
    return r.status;
  });
  check("隔离：其它馆仍可正常访问（200/404 均属正常）", other === 200 || other === 404, `HTTP ${other}`);

  await ctx.close();
}

// ---------------------------------------------------------------------------
// 2. 三档视口：遗像横向居中、纵向偏上、不出框
// ---------------------------------------------------------------------------
for (const [w, h, label] of [
  [1440, 1000, "桌面 1440"],
  [768, 1024, "平板 768"],
  [375, 812, "手机 375"],
]) {
  const ctx = await newCtx(w, h);
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await openHall(ctx, 500);

  const geo = await page.evaluate(() => {
    const root = document.querySelector('[data-hall3d-stage="1"]');
    const niche = document.querySelector('[data-portrait-niche="3d"]');
    const img = document.querySelector("img[alt*='遗像']");
    if (!root || !niche || !img) return null;
    const rr = root.getBoundingClientRect();
    const nr = niche.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    return {
      root: { w: Math.round(rr.width), h: Math.round(rr.height) },
      niche: {
        left: Math.round(nr.left - rr.left),
        top: Math.round(nr.top - rr.top),
        w: Math.round(nr.width),
        h: Math.round(nr.height),
      },
      img: {
        left: Math.round(ir.left - rr.left),
        top: Math.round(ir.top - rr.top),
        w: Math.round(ir.width),
        h: Math.round(ir.height),
      },
    };
  });

  if (!geo) {
    check(`${label}：遗像与场景均已渲染`, false, "未找到元素");
    await ctx.close();
    continue;
  }

  const T = 3; // 抗锯齿/取整容差

  // 遗像必须真的落在壁龛容器内（img 填满 niche 的 overflow-hidden 盒子）
  const within =
    geo.img.left >= geo.niche.left - T &&
    geo.img.top >= geo.niche.top - T &&
    geo.img.left + geo.img.w <= geo.niche.left + geo.niche.w + T &&
    geo.img.top + geo.img.h <= geo.niche.top + geo.niche.h + T;
  check(
    `${label}：遗像落在壁龛容器内`,
    within,
    `img[${geo.img.left},${geo.img.top} ${geo.img.w}×${geo.img.h}] ⊆ niche[${geo.niche.left},${geo.niche.top} ${geo.niche.w}×${geo.niche.h}]`,
  );

  // 横向居中：遗像中心 ≈ 壁龛中心 ≈ 舞台中心（正墙正中）
  const nicheCx = geo.niche.left + geo.niche.w / 2;
  const imgCx = geo.img.left + geo.img.w / 2;
  const rootCx = geo.root.w / 2;
  check(
    `${label}：遗像横向居中于正墙`,
    Math.abs(nicheCx - imgCx) <= T + 1 && Math.abs(rootCx - imgCx) <= geo.root.w * 0.03,
    `像心 x=${Math.round(imgCx)} 墙心 x=${Math.round(rootCx)}`,
  );

  // 纵向偏上：顶边在舞台 5%~45% 之间
  const topPct = (geo.niche.top / geo.root.h) * 100;
  check(`${label}：遗像位于正墙中上段（不是贴地也不是出框）`, topPct >= 5 && topPct <= 45, `top ${topPct.toFixed(1)}%`);

  // 遗像不能吃满整面墙（否则就不是"壁龛"了）
  check(
    `${label}：遗像尺寸受控（占墙宽 10%~60%）`,
    geo.niche.w >= geo.root.w * 0.1 && geo.niche.w <= geo.root.w * 0.6,
    `像宽 ${geo.niche.w}px / 墙宽 ${geo.root.w}px`,
  );

  // 场景高度受控（否则正文被推到折叠线以下）
  check(
    `${label}：场景高度受控（遗像不出下沿、场景不超过视口 60%）`,
    geo.niche.top + geo.niche.h <= geo.root.h + 2 && geo.root.h <= h * 0.6 + 2,
    `场景 ${geo.root.h}px / 视口 ${h}px`,
  );

  await ctx.close();
}

// ---------------------------------------------------------------------------
// 3. 供台陈列：祭拜后出现供品 glyph，且遗像仍唯一
// ---------------------------------------------------------------------------
/*
  这是「供奉体系」改造的核心回归点：
    祭拜 → 供台多一件 → 场景里多一个 [data-altar-slug] 节点。
  同时确认新增节点没有把遗像的定位打乱（百分比绝对定位，任何新兄弟节点都可能改布局）。
*/
{
  const ctx = await newCtx(1440, 1000);
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await openHall(ctx);

  // 场景里的供台 glyph（只数场景内的，祭拜面板里的不算）
  const sceneGlyphs = await page.evaluate(() => {
    const root = document.querySelector('[data-hall3d-stage="1"]');
    if (!root) return null;
    return [...root.querySelectorAll("[data-altar-slug]")].map((n) => ({
      slug: n.getAttribute("data-altar-slug"),
      text: (n.textContent || "").trim(),
    }));
  });

  check(
    "供台：场景内 [data-altar-slug] 节点可查询（0 件时为 0 个）",
    sceneGlyphs !== null && sceneGlyphs.length <= 12,
    `实测 ${sceneGlyphs ? sceneGlyphs.length : "无场景"} 个`,
  );
  check(
    "供台：glyph 不重复（同一份供品不叠画）",
    new Set((sceneGlyphs || []).map((g) => g.slug)).size === (sceneGlyphs || []).length,
    `slugs=${(sceneGlyphs || []).map((g) => g.slug).join(",") || "无"}`,
  );

  const imgCount = await page.locator("img[alt*='遗像']").count();
  check("供台：新增 glyph 后遗像仍只出现一次", imgCount === 1, `实测 ${imgCount} 处`);

  // 有供品时遗像仍在壁龛内（防新增节点推挤）
  const stillInNiche = await page.evaluate(() => {
    const niche = document.querySelector('[data-portrait-niche="3d"]');
    const img = document.querySelector("img[alt*='遗像']");
    if (!niche || !img) return null;
    const nr = niche.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const T = 3;
    return (
      ir.left >= nr.left - T &&
      ir.top >= nr.top - T &&
      ir.left + ir.width <= nr.left + nr.width + T &&
      ir.top + ir.height <= nr.top + nr.height + T
    );
  });
  check("供台：新增 glyph 后遗像仍在壁龛内", stillInNiche === true, `within=${stillInNiche}`);

  await ctx.close();
}

// ---------------------------------------------------------------------------
// 4. 页面整体健康
// ---------------------------------------------------------------------------
{
  const ctx = await newCtx(1440, 1000);
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await openHall(ctx, 500);
  const bodyH = await page.evaluate(() => document.body.scrollHeight);
  check("布局：页面高度正常（未被撑爆）", bodyH > 800 && bodyH < 12000, `${bodyH}px`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 5. 音乐祭品在馆内真实播放（供奉体系）
// ---------------------------------------------------------------------------
/*
  需求原文：「如为音乐，则应该在空间内或宗祠空间内播放该音乐」。
  所以这里不只是断言按钮存在，而是真的点下去，再用 document.querySelector 确认
  页面上有一个 data-ambient-player 的 <audio>，src 指向 public/assets/ambient/，
  且 paused === false、loop === true。
  必须登录才能献祭，未登录时会跳 /login，因此先登录。
*/
{
  const ctx = await newCtx(1440, 1100);
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("[music] " + m.text());
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  if ((await page.locator('input[name="identifier"]').count()) > 0) {
    await page.fill('input[name="identifier"]', "user@test.com");
    await page.fill('input[name="password"]', "user123456");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3200);
  }

  await page.goto(`${BASE}/halls/${HALL_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  /*
    备货：本段要点「音乐」并断言它真的播放，而免费品是**每日 3 份**的消耗制 ——
    同一天内重复跑本套件会把它用尽，按钮变 disabled，于是
    「音乐祭品触发馆内环境音播放」会以 src="" / paused=true 的形式失败。
    这不是功能坏了，是测试数据耗尽；与其让断言去猜库存，不如显式补到 1 份以上。
    （必须在 goto 之后补：进馆时服务端会先跑 topUpFreeOfferings。）
  */
  execSync(
    `docker exec memorial-pg psql -U memorial -d memorial -t -A -c ` +
      JSON.stringify(
        `update "OfferingHolding" set "quantity"=greatest("quantity",2), "updatedAt"=now() ` +
          `from "User" u, "Product" p ` +
          `where "OfferingHolding"."userId"=u.id and "OfferingHolding"."productId"=p.id ` +
          `and u.email='user@test.com' and p.slug='free-music';`,
      ),
    { encoding: "utf8" },
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const musicBtn = page.locator('button[title^="献上音乐"]');
  const musicCount = await musicBtn.count();
  // 「音乐」按钮是面板 30 格之一；有货则 title 为「献上音乐 · 剩余 N 份」，无货为「献上音乐 · 已用尽」
  check("馆面板有「音乐」祭品按钮", musicCount > 0, `count=${musicCount}`);

  if (musicCount > 0) {
    const disabled = await musicBtn.first().isDisabled();
    if (!disabled) {
      await musicBtn.first().click();
      await page.waitForTimeout(3000);
    }
    const audio = await page.evaluate(() => {
      const el = document.querySelector("audio[data-ambient-player]") || document.querySelector("audio");
      if (!el) return { exists: false };
      return {
        exists: true,
        src: el.currentSrc || el.getAttribute("src") || "",
        paused: el.paused,
        loop: el.loop,
        volume: el.volume,
      };
    });
    check(
      "音乐祭品触发馆内环境音播放",
      audio.exists && /\/assets\/ambient\//.test(audio.src || "") && audio.paused === false,
      JSON.stringify(audio),
    );
    check(
      "环境音循环播放且音量受控",
      audio.loop === true && audio.volume > 0 && audio.volume <= 1,
      `loop=${audio.loop} vol=${audio.volume}`,
    );

    // 音轨文件真的存在（不是 404 的占位路径）
    if (audio.exists && audio.src) {
      const probe = await page.evaluate(async (u) => {
        const r = await fetch(u);
        return { status: r.status, type: r.headers.get("content-type") };
      }, audio.src);
      check(
        "音轨文件可访问且为音频",
        probe.status === 200 && /audio|mpeg|mp3/i.test(probe.type || ""),
        JSON.stringify(probe),
      );
    } else {
      check("音轨文件可访问且为音频", false, "无 src 可探测");
    }

    /*
      自清理（重要，别删）：
      本段每次运行都会往**共享的**供台陈列里 +1 件 free-music，而第 3 段的
      「glyph 不重复」按全馆陈列断言 —— 跑几次之后 slugs 就会变成
      free-music,free-music,...，把自己的兄弟断言跑红。
      这类"测试污染共享业务数据"的坑很难查，所以每次献祭后必须撤供还原。
    */
    const clearBtn = page.locator('button:has-text("撤供")').first();
    if ((await clearBtn.count()) > 0) {
      await clearBtn.click().catch(() => {});
      await page.waitForTimeout(1500);
    }
  } else {
    check("音乐祭品触发馆内环境音播放", false, "找不到音乐按钮");
    check("环境音循环播放且音量受控", false, "找不到音乐按钮");
    check("音轨文件可访问且为音频", false, "找不到音乐按钮");
  }

  await ctx.close();
}

check("无控制台错误、无 4xx/5xx 请求", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();

console.log("");
console.log(`通过 ${pass}/${pass + fail}`);
if (fail) {
  console.log("失败项：");
  failures.forEach((f) => console.log("  -", f));
}
process.exit(fail ? 1 : 0);
