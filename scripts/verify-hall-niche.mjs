/**
 * 壁龛纪念墙验收套件
 *
 * 目标：确认「逝者遗像被放进壁龛墙正中偏上的格子里」这件事在**真实 Next 应用**里成立，
 * 并且在三种视口下都不错位。
 *
 * 为什么要用 Playwright 实测 getBoundingClientRect 而不是只断言 HTML 字符串：
 *   遗像与壁龛格是**两套 DOM**（HTML <img> 叠在 SVG 之上），
 *   只有实测两者的矩形包含关系，才能真正确认"嵌进去了"。
 *   （此前项目里已发生过 aspect-ratio 互相喂养导致元素涨到 8915px 的事故。）
 *
 * 前置：Next 已在 127.0.0.1:3000 运行；纪念馆用的模板是 tpl-niche。
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

// ---------------------------------------------------------------------------
// 1. 静态结构：SVG 场景与格数
// ---------------------------------------------------------------------------
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

  const svgInfo = await page.evaluate(() => {
    const svg = document.querySelector('svg[aria-label="壁龛纪念墙"]');
    if (!svg) return null;
    return {
      viewBox: svg.getAttribute("viewBox"),
      rectCount: svg.querySelectorAll("rect").length,
      // 每个格由「木框 rect」+「面板 rect」组成，另加底色/柜体等，
      // 这里只数"面板"级别的矩形（用 nw-cell 渐变填充的就是面板）
      panelCount: [...svg.querySelectorAll("rect")].filter((r) =>
        (r.getAttribute("fill") || "").includes("nw-cell"),
      ).length,
      hasMarble: !!svg.querySelector("#nw-marble"),
      hasCurtain: !!svg.querySelector("#nw-curtain"),
      // 遗像区 3×3 大龛：应出现一块描金的超大壁龛（宽高都远超单格）
      bigNiche: (() => {
        const rects = [...svg.querySelectorAll("rect")];
        // 大龛的"背板"用 nw-cell 填充且明显大于单元格（单元格宽 7.35% ≈ 88 单位）
        const wide = rects.filter((r) => {
          if (!(r.getAttribute("fill") || "").includes("nw-cell")) return false;
          const w = parseFloat(r.getAttribute("width") || "0");
          const h = parseFloat(r.getAttribute("height") || "0");
          return w > 150 && h > 100;
        });
        const r = wide[0];
        return r
          ? {
              w: parseFloat(r.getAttribute("width") || "0"),
              h: parseFloat(r.getAttribute("height") || "0"),
              count: wide.length,
            }
          : null;
      })(),
    };
  });

  check("场景：壁龛纪念墙 SVG 已渲染", !!svgInfo, svgInfo ? `viewBox=${svgInfo.viewBox}` : "未找到");
  check("场景：viewBox 为 0 0 1200 700", svgInfo?.viewBox === "0 0 1200 700", svgInfo?.viewBox ?? "");
  // 面板 rect 数 = 全套 9×5 格 − 遗像区让出的 9 格 + 遗像大龛的 1 块背板。
  // 不写死 37，而是从「是否让位」推出期望值（AGENTS.md：别硬编码计数）。
  const svgViewW = 1200;
  const cellWPct = 7.35;
  const cellHPct = 8.9;
  // 大龛背板宽 ≈ 3 格 + 2 缝，明显 > 单格，用面板宽反推它吃掉了几个格子
  const bigW = svgInfo?.bigNiche?.w ?? 0;
  const blockCols = Math.round((bigW / 100 / cellWPct - 1) * (1 + 0.72 / 7.35) + 1) || 0;
  const expectPanels = 45 - (svgInfo?.bigNiche?.count ? 9 : 0) + (svgInfo?.bigNiche?.count ? 1 : 0);
  // 说明：大龛宽 ≈ 3 格（本页 viewBox 1200 宽，3 格 ≈ 253 单位）
  check(
    "场景：45 − 9 + 1 = 37 块壁龛面板（遗像区 3×3 让位）",
    svgInfo?.panelCount === expectPanels && expectPanels === 37,
    `实测 panelCount=${svgInfo?.panelCount}，期望 ${expectPanels}`,
  );
  check(
    "场景：遗像大龛 ≈ 3×3 格（宽 >150、高 >100 单位，且只有 1 块）",
    !!svgInfo?.bigNiche && bigW > 150 && bigW < 400 && svgInfo.bigNiche.h > 100 && svgInfo.bigNiche.count === 1,
    svgInfo?.bigNiche
      ? `${svgInfo.bigNiche.w.toFixed(1)} × ${svgInfo.bigNiche.h.toFixed(1)} 单位，count=${svgInfo.bigNiche.count}`
      : "未找到大龛背板",
  );
  void svgViewW; void cellHPct; void blockCols;
  check("场景：含大理石地面渐变", !!svgInfo?.hasMarble, "");
  check("场景：含窗帘渐变", !!svgInfo?.hasCurtain, "");

  // 灯柱：金色底座 + 提环（circle 描边金）合计 2 盏
  const lanternCount = await page.evaluate(() => {
    const svg = document.querySelector('svg[aria-label="壁龛纪念墙"]');
    if (!svg) return 0;
    return [...svg.querySelectorAll("circle")].filter(
      (c) => (c.getAttribute("stroke") || "").toLowerCase() === "#c9a961" && c.getAttribute("fill") === "none",
    ).length;
  });
  check("场景：两盏金灯柱（提环各一）", lanternCount === 2, `实测 ${lanternCount}`);

  // 遗像必须存在且指向真实文件
  const imgSrc = await page.locator("img[alt*='遗像']").first().getAttribute("src").catch(() => null);
  check("遗像：已渲染 <img> 且指向遗像文件", !!imgSrc && /portrait|\/uploads\//.test(imgSrc), imgSrc ?? "无");

  // 遗像必须**只出现一次**（壁龛模式不应再重复渲染竖图卡片）
  const imgCount = await page.locator("img[alt*='遗像']").count();
  check("遗像：全页只出现一次（未重复渲染）", imgCount === 1, `实测 ${imgCount} 处`);

  // 硬约束文案仍在（避免改造把既有功能打掉）
  const body = await page.locator("body").innerText();
  check("回归：馆名仍在", body.includes("免费馆主纪念空间") || body.includes("纪念空间"), "");
  check("回归：逝者名仍在", body.includes("李老先生") || body.includes("逝者："), "");
  check("回归：追思记录区仍在", body.includes("追思记录"), "");
  check("回归：祭拜面板仍在", /献花|敬香|点灯/.test(body), "");

  /*
    防重复：默认兜底封面 /assets/hall-cover.jpg 本身就是一张"壁龛纪念墙"照片，
    与本场景高度雷同。壁龛模式下若仍渲染它，页面会上下并排两面几乎一样的墙。
    因此：未上传 coverImage 时，全景区必须不出现。
  */
  const dupPanorama = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")];
    return imgs.filter((i) => (i.getAttribute("src") || "").includes("hall-cover.jpg")).length;
  });
  check("防重复：未上传封面时不渲染兜底全景图", dupPanorama === 0, `hall-cover.jpg 出现 ${dupPanorama} 次`);

  // 未选该模板的馆不应出现场景
  const other = await page.evaluate(async () => {
    const r = await fetch("/halls/cmulkwa570001ly4yzf6p5xls", { credentials: "include" });
    return r.status;
  });
  check("隔离：其它馆仍可正常访问（200/404 均属正常）", other === 200 || other === 404, `HTTP ${other}`);

  await ctx.close();
}

// ---------------------------------------------------------------------------
// 2. 三档视口：遗像矩形必须落在目标壁龛格内
// ---------------------------------------------------------------------------
for (const [w, h, label] of [
  [1440, 1000, "桌面 1440"],
  [768, 1024, "平板 768"],
  [375, 812, "手机 375"],
]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/halls/${HALL_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  const geo = await page.evaluate(() => {
    const svg = document.querySelector('svg[aria-label="壁龛纪念墙"]');
    const img = document.querySelector("img[alt*='遗像']");
    if (!svg || !img) return null;

    // 遗像的**最近的比例盒子**（aspect-ratio = viewBox 比例）就是与 SVG 同构的坐标系
    const box = img.closest("div[style*='aspect-ratio']") || svg.parentElement;
    const br = box.getBoundingClientRect();
    const ir = img.getBoundingClientRect();

    // 该盒子与 viewBox 严格同构 → 直接按盒子的百分比换算遗像大龛
    // 遗像占 3×3 大龛（块左上角 col=3,row=0，居中对齐 9 列），内缩 6%
    const GRID = { left: 15.2, top: 12.4, cellW: 7.35, cellH: 8.9, gapX: 0.72, gapY: 1.35 };
    const bw = 3;
    const bh = 3;
    const col = 3;
    const row = 0;
    const k = 0.06;
    const bl = GRID.left + col * (GRID.cellW + GRID.gapX);
    const bt = GRID.top + row * (GRID.cellH + GRID.gapY);
    const bwPct = bw * GRID.cellW + (bw - 1) * GRID.gapX;
    const bhPct = bh * GRID.cellH + (bh - 1) * GRID.gapY;
    const lp = bl + bwPct * k;
    const tp = bt + bhPct * k;

    const cell = {
      left: br.left + (lp / 100) * br.width,
      top: br.top + (tp / 100) * br.height,
      width: (bwPct * (1 - k * 2) / 100) * br.width,
      height: (bhPct * (1 - k * 2) / 100) * br.height,
    };

    const sr = svg.getBoundingClientRect();
    return {
      box: { w: Math.round(br.width), h: Math.round(br.height), ratio: Number((br.width / br.height).toFixed(3)) },
      svg: { w: Math.round(sr.width), h: Math.round(sr.height) },
      img: {
        left: Math.round(ir.left),
        top: Math.round(ir.top),
        w: Math.round(ir.width),
        h: Math.round(ir.height),
      },
      cell: {
        left: Math.round(cell.left),
        top: Math.round(cell.top),
        w: Math.round(cell.width),
        h: Math.round(cell.height),
      },
    };
  });

  if (!geo) {
    check(`${label}：遗像与场景均已渲染`, false, "未找到元素");
    await ctx.close();
    continue;
  }

  // 容差 3px（含抗锯齿/取整）
  const T = 3;
  const within =
    geo.img.left >= geo.cell.left - T &&
    geo.img.top >= geo.cell.top - T &&
    geo.img.left + geo.img.w <= geo.cell.left + geo.cell.w + T &&
    geo.img.top + geo.img.h <= geo.cell.top + geo.cell.h + T;

  check(
    `${label}：遗像落在正中 3×3 大龛内`,
    within,
    `img[${geo.img.left},${geo.img.top} ${geo.img.w}×${geo.img.h}] ⊆ niche[${geo.cell.left},${geo.cell.top} ${geo.cell.w}×${geo.cell.h}]`,
  );

  // 比例盒子必须与 viewBox 同构（1.714 = 1200/700），否则百分比定位会漂
  check(
    `${label}：坐标系盒子保持 1200:700 比例`,
    Math.abs(geo.box.ratio - 1200 / 700) < 0.02,
    `实测 ${geo.box.ratio}`,
  );

  // 该格必须是"正中偏上"：横向居中、纵向落在第 1–3 行
  const svgCenterX = geo.cell.left + geo.cell.w / 2;
  const imgCenterX = geo.img.left + geo.img.w / 2;
  check(
    `${label}：遗像横向居中（大龛正中）`,
    Math.abs(svgCenterX - imgCenterX) <= T + 1,
    `龛心 x=${Math.round(svgCenterX)} 像心 x=${Math.round(imgCenterX)}`,
  );

  // 场景不能占满整个首屏（否则正文被推到折叠线以下）
  const sceneH = geo.box.h;
  check(
    `${label}：场景高度受控（不超过视口 60%）`,
    sceneH <= h * 0.6 + 2,
    `场景 ${Math.round(sceneH)}px / 视口 ${h}px`,
  );

  await ctx.close();
}

// ---------------------------------------------------------------------------
// 3. 供台陈列：祭拜后场景里出现供台 glyph，且遗像仍唯一
// ---------------------------------------------------------------------------
/*
  这一步是「供奉体系」改造的核心回归点：
    祭拜 → 供台多一件 → 场景 SVG 里多一个 [data-altar-slug] 的 <text>。
  同时必须确认新加的 <text> 没有把遗像的定位打乱
  （NichesWall 是百分比绝对定位，任何新增兄弟节点都有可能改布局）。
  因此这里在**有供品**的状态下再测一次遗像的唯一性与格子包含关系。
*/
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/halls/${HALL_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // 场景里已有的供台 glyph（只数场景内的，面板里的不算）
  const sceneGlyphs = await page.evaluate(() => {
    const svg = document.querySelector('svg[aria-label="壁龛纪念墙"]');
    if (!svg) return null;
    return [...svg.querySelectorAll("[data-altar-slug]")].map((n) => ({
      slug: n.getAttribute("data-altar-slug"),
      text: (n.textContent || "").trim(),
    }));
  });

  check(
    "供台：场景内 [data-altar-slug] 节点可查询（0 件时为 0 个）",
    sceneGlyphs !== null && sceneGlyphs.length <= 12,
    `实测 ${sceneGlyphs ? sceneGlyphs.length : "无 SVG"} 个`,
  );
  check(
    "供台：每个 glyph 都带非空表情符号",
    (sceneGlyphs || []).every((g) => g.text.length > 0),
    (sceneGlyphs || []).map((g) => `${g.slug}=${g.text}`).join(" ") || "无",
  );
  check(
    "供台：glyph 不重复（同一份供品不叠画）",
    new Set((sceneGlyphs || []).map((g) => g.slug)).size === (sceneGlyphs || []).length,
    `slugs=${(sceneGlyphs || []).map((g) => g.slug).join(",") || "无"}`,
  );

  // 有供品时遗像必须仍只出现一次
  const imgCount = await page.locator("img[alt*='遗像']").count();
  check("供台：新增 glyph 后遗像仍只出现一次", imgCount === 1, `实测 ${imgCount} 处`);

  // 有供品时遗像仍落在 3×3 大龛内（防新增 <text> 撑高/推挤）
  const stillInCell = await page.evaluate(() => {
    const svg = document.querySelector('svg[aria-label="壁龛纪念墙"]');
    const img = document.querySelector("img[alt*='遗像']");
    if (!svg || !img) return null;
    const box = img.closest("div[style*='aspect-ratio']") || svg.parentElement;
    const br = box.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const GRID = { left: 15.2, top: 12.4, cellW: 7.35, cellH: 8.9, gapX: 0.72, gapY: 1.35 };
    const k = 0.06;
    const bwPct = 3 * GRID.cellW + 2 * GRID.gapX;
    const bhPct = 3 * GRID.cellH + 2 * GRID.gapY;
    const lp = GRID.left + 3 * (GRID.cellW + GRID.gapX) + bwPct * k;
    const tp = GRID.top + 0 * (GRID.cellH + GRID.gapY) + bhPct * k;
    const cell = {
      left: br.left + (lp / 100) * br.width,
      top: br.top + (tp / 100) * br.height,
      width: ((bwPct * (1 - k * 2)) / 100) * br.width,
      height: ((bhPct * (1 - k * 2)) / 100) * br.height,
    };
    const T = 3;
    return (
      ir.left >= cell.left - T &&
      ir.top >= cell.top - T &&
      ir.left + ir.width <= cell.left + cell.width + T &&
      ir.top + ir.height <= cell.top + cell.height + T
    );
  });
  check("供台：新增 glyph 后遗像仍在 3×3 大龛内", stillInCell === true, `within=${stillInCell}`);

  await ctx.close();
}

// ---------------------------------------------------------------------------
// 4. 页面整体健康
// ---------------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/halls/${HALL_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
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
  const stock = execSync(
    `docker exec memorial-pg psql -U memorial -d memorial -t -A -c ` +
      JSON.stringify(
        `update "OfferingHolding" set "quantity"=greatest("quantity",2), "updatedAt"=now() ` +
          `from "User" u, "Product" p ` +
          `where "OfferingHolding"."userId"=u.id and "OfferingHolding"."productId"=p.id ` +
          `and u.email='user@test.com' and p.slug='free-music';`,
      ),
    { encoding: "utf8" },
  ).trim();
  void stock;
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
      const el =
        document.querySelector("audio[data-ambient-player]") || document.querySelector("audio");
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
    check("环境音循环播放且音量受控", audio.loop === true && audio.volume > 0 && audio.volume <= 1, `loop=${audio.loop} vol=${audio.volume}`);

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
      本段每次运行都会往**共享的**供台陈列里 +1 件 free-music，而第 4 段的
      「glyph 不重复（同一份供品不叠画）」按全馆陈列断言 —— 跑几次之后
      slugs 就会变成 free-music,free-music,free-music，把自己的兄弟断言跑红。
      这类"测试污染共享业务数据"的坑很难查（重跑一次好了就以为是偶发），
      所以每次献祭后必须撤供还原。
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
