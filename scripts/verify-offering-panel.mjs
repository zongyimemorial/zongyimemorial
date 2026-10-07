/**
 * 供奉面板验收：「只显示我已持有的供品」+ 遗像安奉
 *
 * 覆盖用户明确提出的四条需求：
 *   1. 面板只渲染持有的供品 —— 未购收费祭品**不在 DOM**（连价格牌都没有）
 *   2. 献祭后该件**灰显**（disabled 仍在 DOM），不是消失
 *   3. **重新购买后恢复点亮** —— 这是「供品献祭后即被灰色，重新购买后即恢复点亮」的直接验证
 *   4. 免费祭器按日补货：清掉当日标记 + 库存归零 → 进页回满 3 份并点亮
 *   5. 宗祠与纪念馆行为一致（同一份库存，两页面板态相同）
 *   6. 遗像安奉：纪念馆落壁龛格（NICHE_PORTRAIT_SLOT）；宗祠在牌位墙正中的龛里（香案正上方）
 *
 * 运行：node scripts/verify-offering-panel.mjs
 * （本文件是 .mjs，必须用 node；用 npx tsx 也行但没必要）
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { execSync } from "node:child_process";

const { chromium } = pkg;

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const USER = { email: "user@test.com", password: "user123456" };

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

/** 走 psql 直查数据库（读多写少，够用） */
function sql(q) {
  try {
    return execSync(
      `docker exec memorial-pg psql -U memorial -d memorial -tAc "${q.replace(/"/g, '\\"')}"`,
      { encoding: "utf8" },
    ).trim();
  } catch (e) {
    console.error("   SQL 失败:", q, e.message);
    return "";
  }
}

/** 供品面板里是否有某个 slug 的按钮（面板按钮都带 title^="献上"） */
const hasSlugButton = (slugLabel) =>
  `(() => {
     const btns = Array.from(document.querySelectorAll("button"));
     return btns.some((b) => (b.getAttribute("title") ?? "").startsWith("献上${slugLabel}"));
   })()`;

const btnStateOf = (slugLabel) =>
  `(() => {
     const btns = Array.from(document.querySelectorAll("button"));
     const b = btns.find((x) => (x.getAttribute("title") ?? "").startsWith("献上${slugLabel}"));
     if (!b) return "absent";
     return b.disabled ? "disabled" : "enabled";
   })()`;

async function main() {
  const userId = sql(`select id from "User" where email='${USER.email}';`);
  if (!userId) throw new Error("找不到测试用户 user@test.com");

  /*
    测试用纪念馆：优先挑**有遗像**的那座（遗像安奉断言需要它），
    没有就退回任意一座。绝不能写死 id —— 用户随时会新建馆/祠。
  */
  const hallId =
    sql(
      `select id from "MemorialHall"
       where "ownerUserId"='${userId}' and status='active'
         and coalesce(archive->>'portrait','') <> ''
       order by "createdAt" limit 1;`,
    ) ||
    sql(
      `select id from "MemorialHall" where "ownerUserId"='${userId}' and status='active'
       order by "createdAt" limit 1;`,
    );
  const clanId = sql(`select id from "ClanHall" where status='active' order by "createdAt" limit 1;`);
  if (!hallId) throw new Error("测试用户名下没有纪念馆");
  if (!clanId) throw new Error("库里没有 active 宗祠");

  console.log(`纪念馆=${hallId}\n宗祠=${clanId}\n用户=${userId}\n`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();

  // ---- 过内测口令 ----
  /*
    直接给上下文种 preview_auth cookie，与其他套件一致。
    走 /preview-gate 真填表单也行，但那个流程依赖客户端 JS 的整页跳转，
    在验收脚本里既慢又容易与后续导航打架 —— 中间件只认这个 cookie，直接种最稳。
  */
  await ctx.addCookies([
    { name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" },
  ]);

  // ---- 登录 ----
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('input[name="identifier"]', { timeout: 30000 });
  await page.fill('input[name="identifier"]', USER.email);
  await page.fill('input[name="password"]', USER.password);
  await Promise.all([
    page.waitForNavigation({ timeout: 60000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  const loggedIn = await page.locator('input[name="identifier"]').count();
  check("登录成功", loggedIn === 0);

  // =========================================================================
  console.log("\n=== 1. 面板只渲染「我持有的」供品 ===");
  // =========================================================================

  /*
    先确保有一个「从未购买」的收费祭品作为反例。
    选 free-firework（数字烟花，¥8）—— 它在 BUTTON_DEFS 里，且是收费礼器。
  */
  const fireworkId = sql(`select id from "Product" where slug='free-firework';`);
  check("测试用商品 free-firework 存在", !!fireworkId);

  const fpName = sql(`select name from "Product" where slug='free-firework';`);
  // 找到它在面板里的短标签（BUTTON_DEFS 里叫「烟花」）
  const FIREWORK_LABEL = "烟花";

  // 记录并清除该用户的烟花持有行 → 制造"从未购买"
  const savedQty = sql(
    `select coalesce(quantity,0) from "OfferingHolding" where "userId"='${userId}' and "productId"='${fireworkId}';`,
  );
  sql(
    `delete from "OfferingHolding" where "userId"='${userId}' and "productId"='${fireworkId}';`,
  );

  const gotoHallFresh = async () => {
    await page.goto(`${BASE}/halls/${hallId}?t=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForSelector("text=10 套免费动效", { timeout: 30000 });
  };

  await gotoHallFresh();
  let hallText = await page.innerText("body");

  check(
    "未购收费祭品不出现在面板（无 ¥8 价格牌）",
    !/¥8/.test(hallText),
    `页面里的 ¥8 计数=${(hallText.match(/¥8/g) || []).length}`,
  );
  check(
    `未购收费祭品「${FIREWORK_LABEL}」不在面板 DOM`,
    (await page.evaluate(hasSlugButton(FIREWORK_LABEL))) === false,
  );
  check("面板不再出现「可解锁 20 项」", !/可解锁\s*20\s*项/.test(hallText));
  check("保留「10 套免费动效」角标", hallText.includes("10 套免费动效"));
  check("面板统计改为「已持有 N 件」", /已持有\s*\d+\s*件/.test(hallText), (hallText.match(/已持有[^·\n]*/) || [""])[0].trim());
  check("面板提供补货入口「去商城补充供品」", hallText.includes("去商城补充供品"));
  check("面板无「即将上线」", !hallText.includes("即将上线"));

  /*
    免费 10 个必须仍然全在（topUpFreeOfferings 保证「免费恒持有」）。
    注意：这份名单要**照 DB 的 isFree=true & isRitual=true 来**，不能照按钮定义表抄 ——
    BUTTON_DEFS 是 30 个 slug 的**全集**，其中「天堂信箱」(free-letter) 早已转收费。
    写错一个字就会误判成"面板漏渲染"（本套件第一版就踩了：把 free-letter 当免费）。
  */
  const freeSlugs = sql(
    `select slug from "Product" where "isFree"=true and "isRitual"=true and status='active';`,
  )
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  check("免费礼器共 10 件（配额口径）", freeSlugs.length === 10, `实际 ${freeSlugs.length}`);
  // slug → 面板短标签（取自 BUTTON_DEFS）
  const LABEL_OF = {
    "free-incense": "上香",
    "free-flower": "献花",
    "free-candle": "点烛",
    "free-fruit": "供果",
    "free-wine": "祭酒",
    "free-tea": "清茶",
    "free-clean": "擦拭",
    "free-music": "音乐",
    "free-message": "留言",
    "free-bow": "三鞠躬",
  };
  const freePresent = [];
  for (const s of freeSlugs) {
    const label = LABEL_OF[s];
    if (!label) continue; // 免费名录里若有未进面板的定义外 slug，跳过
    freePresent.push(await page.evaluate(hasSlugButton(label)));
  }
  check(
    "10 个免费祭品全部渲染（免费按日补货 → 恒持有）",
    freePresent.every(Boolean),
    `${freePresent.filter(Boolean).length}/${freePresent.length}`,
  );

  // =========================================================================
  console.log("\n=== 2. 献祭 → 灰显；重新购买 → 恢复点亮 ===");
  // =========================================================================

  // 备货 2 件烟花（模拟"购买"）
  sql(
    `insert into "OfferingHolding" (id,"userId","productId",quantity,"createdAt","updatedAt")
     values (gen_random_uuid()::text,'${userId}','${fireworkId}',2,now(),now())
     on conflict ("userId","productId") do update set quantity=2, "updatedAt"=now();`,
  );

  await gotoHallFresh();
  check(
    "购买后：烟花出现在面板",
    await page.evaluate(hasSlugButton(FIREWORK_LABEL)),
  );
  check(
    "购买后：烟花可点（点亮）",
    (await page.evaluate(btnStateOf(FIREWORK_LABEL))) === "enabled",
  );

  // 直接扣到 0，模拟"献祭至用尽"
  sql(
    `update "OfferingHolding" set quantity=0 where "userId"='${userId}' and "productId"='${fireworkId}';`,
  );
  await gotoHallFresh();
  check(
    "用尽后：烟花仍在 DOM（不消失）",
    await page.evaluate(hasSlugButton(FIREWORK_LABEL)),
  );
  check(
    "用尽后：烟花灰显（disabled）",
    (await page.evaluate(btnStateOf(FIREWORK_LABEL))) === "disabled",
  );
  const spentText = await page.innerText("body");
  check("用尽后：出现「已用尽」标记", spentText.includes("已用尽"));
  check("用尽后：统计里出现「用尽 N 件」", /用尽\s*\d+\s*件/.test(spentText));

  // 重新购买 1 件 → 恢复点亮
  sql(
    `update "OfferingHolding" set quantity=1 where "userId"='${userId}' and "productId"='${fireworkId}';`,
  );
  await gotoHallFresh();
  check(
    "重新购买后：烟花恢复点亮（可点）",
    (await page.evaluate(btnStateOf(FIREWORK_LABEL))) === "enabled",
  );
  check(
    "重新购买后：角标显示 ×1",
    await page.evaluate(`(() => {
      const b = Array.from(document.querySelectorAll("button"))
        .find((x) => (x.getAttribute("title") ?? "").startsWith("献上${FIREWORK_LABEL}"));
      return !!b && /[×x]\\s*1/.test(b.textContent ?? "");
    })()`),
  );

  // =========================================================================
  console.log("\n=== 3. 免费祭器按日补货（用尽 → 进页回满）===");
  // =========================================================================

  const incenseId = sql(`select id from "Product" where slug='free-incense';`);
  sql(
    `update "OfferingHolding" set quantity=0, "freeTopUpDate"=null
     where "userId"='${userId}' and "productId"='${incenseId}';`,
  );
  await gotoHallFresh();
  const incenseQty = sql(
    `select quantity from "OfferingHolding" where "userId"='${userId}' and "productId"='${incenseId}';`,
  );
  check("进页后免费祭品回满 3 份", Number(incenseQty) === 3, `实际 ${incenseQty}`);
  check(
    "免费祭品回满后可点（点亮）",
    (await page.evaluate(btnStateOf("上香"))) === "enabled",
  );

  // 幂等：再进一次不应翻倍
  await gotoHallFresh();
  const incenseQty2 = sql(
    `select quantity from "OfferingHolding" where "userId"='${userId}' and "productId"='${incenseId}';`,
  );
  check("重复进页不翻倍（补货幂等）", Number(incenseQty2) === 3, `实际 ${incenseQty2}`);

  // =========================================================================
  console.log("\n=== 4. 宗祠面板与纪念馆口径一致 ===");
  // =========================================================================

  const gotoClanFresh = async () => {
    await page.goto(`${BASE}/clan/halls/${clanId}?t=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForSelector("text=献祭 · 敬奉先祖", { timeout: 30000 });
  };

  // 先备货 2 件烟花，确认宗祠侧也认得出"我持有的"
  sql(
    `update "OfferingHolding" set quantity=2 where "userId"='${userId}' and "productId"='${fireworkId}';`,
  );
  await gotoClanFresh();
  const clanText = await page.innerText("body");
  check("宗祠页：显示「免费祭品 · 一键献祭」", clanText.includes("免费祭品 · 一键献祭"));
  check("宗祠页：8 个常用免费按钮全在", (() => {
    const wanted = ["上香", "献花", "点烛", "供果", "祭酒", "清茶", "擦拭", "三鞠躬"];
    return wanted.every((w) => clanText.includes(w));
  })());
  check("宗祠页：有「去商城补充供品」引导", clanText.includes("去商城补充供品"));
  check(
    "宗祠页：持有的烟花出现在「我的其它供品」",
    await page.evaluate(hasSlugButton(FIREWORK_LABEL)),
  );
  check(
    "宗祠页：持有的烟花可点",
    (await page.evaluate(btnStateOf(FIREWORK_LABEL))) === "enabled",
  );

  /*
    回归防护：宗祠页**不能**用「最便宜的前 N 件」这种窗口来取收费礼器。
    旧实现是 `orderBy pointsPrice asc, take: 4`，于是用户花 800 积分买的数字烟花
    （贵，排不进前 4）在宗祠里永远看不到 —— 库存有货却无入口，静默丢功能。
    这条断言直接拿"买的是一件贵礼器"来验证：只要点价比最便宜的 4 件都高，
    旧实现必然失败。
  */
  const fwPoints = Number(sql(`select coalesce("pointsPrice",0) from "Product" where slug='free-firework';`));
  const cheapest4 = sql(
    `select string_agg(t."pointsPrice"::text, ',') from (
       select "pointsPrice" from "Product"
       where status='active' and "isFree"=false and "pointsPrice">0
         and type in ('virtual_flower','tribute_item')
       order by "pointsPrice" asc limit 4) t;`,
  );
  const maxCheapest = Math.max(...cheapest4.split(",").map(Number).filter(Number.isFinite));
  check(
    "回归防护：烟花是「贵」礼器（点价高于最便宜的 4 件）",
    fwPoints > maxCheapest,
    `烟花 ${fwPoints} 分 > 最便宜4件最高 ${maxCheapest} 分`,
  );
  check(
    "回归防护：贵礼器照样出现在宗祠面板（未被 take:4 截断）",
    await page.evaluate(hasSlugButton(FIREWORK_LABEL)),
    "旧实现（take:4 按价格升序）会在此失败",
  );

  // 同一 slug 在纪念馆也必须是可点（证明两页读同一份库存）
  await gotoHallFresh();
  check(
    "纪念馆侧同一 slug 态一致（同为可点）",
    (await page.evaluate(btnStateOf(FIREWORK_LABEL))) === "enabled",
  );

  // 宗祠侧把烟花扣到 0，纪念馆也应变灰
  sql(
    `update "OfferingHolding" set quantity=0 where "userId"='${userId}' and "productId"='${fireworkId}';`,
  );
  await gotoClanFresh();
  check(
    "宗祠扣光后：宗祠侧灰显",
    (await page.evaluate(btnStateOf(FIREWORK_LABEL))) === "disabled",
  );
  await gotoHallFresh();
  check(
    "宗祠扣光后：纪念馆侧同步灰显（共享库存）",
    (await page.evaluate(btnStateOf(FIREWORK_LABEL))) === "disabled",
  );

  // =========================================================================
  console.log("\n=== 5. 遗像安奉 ===");
  // =========================================================================

  const portrait = sql(
    `select coalesce(archive->>'portrait','') from "MemorialHall" where id='${hallId}';`,
  );
  if (portrait) {
    await gotoHallFresh();
    const niche = await page.evaluate(`(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      const p = imgs.find((i) => (i.getAttribute("alt") ?? "").includes("遗像"));
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { count: imgs.filter((i) => (i.getAttribute("alt") ?? "").includes("遗像")).length,
               top: r.top, left: r.left, w: r.width, h: r.height,
               scrollY: window.scrollY };
    })()`);
    check("纪念馆：遗像已渲染", !!niche);
    check("纪念馆：全页遗像唯一（不在名字卡里重复）", niche?.count === 1, `count=${niche?.count}`);
    check("纪念馆：遗像在首屏范围内（场景优先）", !!niche && niche.top < 1000 + niche.scrollY, `top=${Math.round(niche?.top ?? -1)}`);
    check("纪念馆：走壁龛墙（页面出现「壁龛纪念堂」）", (await page.innerText("body")).includes("壁龛纪念堂"));
  } else {
    console.log("  ⏭  测试馆无遗像，跳过纪念馆遗像断言");
  }

  /*
    宗祠遗像 —— 用户要的是「放到香案正上方」。
    库里现成的宗祠都还没有遗像（archive.portrait 为空），
    所以这里**临时**给测试宗祠挂一张遗像来验证几何，验完立刻还原。
    用一张确定存在的本地图（纪念馆那张 test-portrait.jpg），避免引入外部依赖。
  */
  const SAMPLE_PORTRAIT = sql(
    `select coalesce(archive->>'portrait','') from "MemorialHall"
     where coalesce(archive->>'portrait','') <> '' limit 1;`,
  );
  const clanOriginalPortrait = sql(
    `select coalesce(archive->>'portrait','') from "ClanHall" where id='${clanId}';`,
  );
  let injected = false;
  if (SAMPLE_PORTRAIT) {
    sql(
      `update "ClanHall"
         set archive = coalesce(archive,'{}'::jsonb) || jsonb_build_object('portrait','${SAMPLE_PORTRAIT}')
       where id='${clanId}';`,
    );
    injected = true;
  }

  await gotoClanFresh();
  const clanImg = await page.evaluate(`(() => {
    const el = document.querySelector("img[data-clan-portrait]");
    if (!el) return null;
    const wrap = el.parentElement;
    const w = wrap ? wrap.getBoundingClientRect() : null;
    const r = el.getBoundingClientRect();
    return {
      alt: el.getAttribute("alt"),
      cxPct: w ? ((r.left + r.width / 2 - w.left) / w.width) * 100 : null,
      topPct: w ? ((r.top - w.top) / w.height) * 100 : null,
    };
  })()`);
  check("宗祠：遗像已安奉（img[data-clan-portrait]）", !!clanImg, SAMPLE_PORTRAIT ? "" : "（库中无任何遗像可用作样本）");
  if (clanImg) {
    check(
      "宗祠：遗像水平居中于牌位墙（香案正上方）",
      clanImg.cxPct !== null && Math.abs(clanImg.cxPct - 50) < 3,
      `中心 ${clanImg.cxPct?.toFixed(1)}%`,
    );
    check(
      "宗祠：遗像位于牌位墙中上段（不是贴地也不是出框）",
      clanImg.topPct !== null && clanImg.topPct > 20 && clanImg.topPct < 50,
      `top ${clanImg.topPct?.toFixed(1)}%`,
    );
    check("宗祠：遗像 alt 含「遗像」", (clanImg.alt ?? "").includes("遗像"), clanImg.alt ?? "");
  }
  // 名号卡里不应再有第二张遗像（同页两次）
  check(
    "宗祠：主图卡不含遗像（避免同页出现两次）",
    await page.evaluate(`(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return !imgs.some((i) => /遗像/.test(i.getAttribute("alt") ?? "") && !i.hasAttribute("data-clan-portrait"));
    })()`),
  );
  // 场景优先：寝堂的香案排在「献祭 · 敬奉先祖」之前
  check(
    "宗祠：寝堂在献祭板块之前（场景优先）",
    await page.evaluate(`(() => {
      const y = (el) => (el ? el.getBoundingClientRect().top + window.scrollY : Infinity);
      const altar = document.querySelector("text[data-altar-slug]");
      const altarAny = altar || document.querySelector("svg");
      const worship = Array.from(document.querySelectorAll("h2"))
        .find((h) => h.textContent.includes("献祭 · 敬奉先祖"));
      return y(altarAny) < y(worship);
    })()`),
  );

  if (injected) {
    sql(
      `update "ClanHall" set archive = coalesce(archive,'{}'::jsonb) - 'portrait' where id='${clanId}';`,
    );
  }

  // =========================================================================
  console.log("\n=== 6. 布局顺序（场景优先）===");
  // =========================================================================

  await gotoHallFresh();
  const order = await page.evaluate(`(() => {
    const text = document.body.innerText;
    const iPanel = text.indexOf("祭品 · 一键祭拜");
    const iPaid  = text.indexOf("敬献祭品");
    const iArchive = text.indexOf("故人数字档案");
    const iReserve = text.indexOf("分时预约");
    const iBack = text.indexOf("返回纪念馆列表");
    return { iPanel, iPaid, iArchive, iReserve, iBack };
  })()`);
  check("纪念馆：祭拜面板在敬献祭品之前", order.iPanel > -1 && order.iPanel < order.iPaid, JSON.stringify(order));
  /*
    「故人数字档案」只在馆主填了时间线/相册时才渲染。
    用 -1 表示"本馆没有这一块"，此时应视为跳过而不是失败 ——
    否则测试会断言"空数据也该渲染空板块"，那是在考页面的健壮性而不是布局顺序。
  */
  check(
    "纪念馆：祭拜面板在档案之前（该馆有档案时）",
    order.iArchive === -1 || order.iPanel < order.iArchive,
    order.iArchive === -1 ? "本馆无档案板块，跳过" : "",
  );
  check("纪念馆：祭拜面板在预约之前", order.iPanel < order.iReserve);
  check("纪念馆：返回链接在最后", order.iBack > order.iReserve);

  // =========================================================================
  // 清理：恢复备货，避免污染后续套件
  // =========================================================================
  sql(
    `update "OfferingHolding" set quantity=${Number(savedQty) || 0} where "userId"='${userId}' and "productId"='${fireworkId}';`,
  );

  await browser.close();

  console.log("\n" + "=".repeat(60));
  console.log(`结果: ${pass}/${pass + fail} 通过`);
  if (failures.length) console.log("失败项:\n  - " + failures.join("\n  - "));
  console.log("=".repeat(60));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("套件异常:", e);
  process.exit(1);
});
