// 「祭文用尽 → 灰显」的现场验证：把 free-poem 库存清 0，看两颗入口是否都变灰且不可点
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { mkdirSync } from "node:fs";
/* 库操作统一走 scripts/_db.mjs：withRestore 保证崩溃也会还原（见该文件顶部注释的事故记录） */
import { sql, withRestore } from "./_db.mjs";

const BASE = "http://localhost:3000";
const OUT = "/workspace/docs/验收截图";
mkdirSync(OUT, { recursive: true });
const CLAN = process.env.CLAN_ID || "cmulkwa570001ly4yzf6p5xls";

const browser = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);
await page.fill('input[name="identifier"]', "user@test.com");
await page.fill('input[name="password"]', "user123456");
await page.click('button[type="submit"]');
for (let t = 0; t < 24; t++) {
  if (!page.url().includes("/login")) break;
  await page.waitForTimeout(500);
}

async function probe(tag) {
  await page.goto(`${BASE}/clan/halls/${CLAN}?t=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);

  const card = page.locator('button[title^="献上祭文"]');
  const textBtn = page.locator('button:has-text("写一段祭文")');
  const r = {
    tag,
    cardCount: await card.count(),
    textBtnCount: await textBtn.count(),
  };
  if (r.cardCount) {
    r.cardDisabled = await card.first().isDisabled();
    r.cardTitle = await card.first().getAttribute("title");
    r.cardText = (await card.first().innerText()).replace(/\s+/g, " ");
    r.cardOpacity = await card.first().evaluate((el) => getComputedStyle(el).opacity);
  }
  if (r.textBtnCount) {
    r.textBtnDisabled = await textBtn.first().isDisabled();
    r.textBtnText = (await textBtn.first().innerText()).replace(/\s+/g, " ");
    r.textBtnColor = await textBtn.first().evaluate((el) => getComputedStyle(el).color);
  }

  /*
    补货入口必须**长在提醒它的地方**。
    用户看到的是一颗灰掉的「祭文 已用尽」，此刻他需要的是"去哪儿补"，
    而不是自己往下找到面板底部那行小小的「去商城补充供品 →」。
    所以断言两件事：耗尽时入口存在、有货时**不出现**（否则会与主操作抢焦点）。
  */
  const topUp = page.locator('a:has-text("去补充祭文")');
  r.topUpCount = await topUp.count();
  if (r.topUpCount) r.topUpHref = await topUp.first().getAttribute("href");
  console.log(tag, JSON.stringify(r, null, 0));

  // boundingBox 是视口坐标、screenshot.clip 要整页绝对坐标 —— 先滚进视口再截
  if ((await card.count()) > 0) {
    await card.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }
  const box = (await card.count()) > 0 ? await card.first().boundingBox() : null;
  if (box) {
    await page.screenshot({
      path: `${OUT}/${tag}.png`,
      clip: { x: Math.max(0, box.x - 400), y: Math.max(0, box.y - 40), width: 800, height: box.height + 200 },
    });
  }
  return r;
}

const poemId = sql(`select id from "Product" where slug='free-poem';`);
const userId = sql(`select id from "User" where email='user@test.com';`);
const before = sql(`select coalesce(quantity,-1) from "OfferingHolding" where "userId"='${userId}' and "productId"='${poemId}';`);
console.log("原始库存：", before || "(无此行)");

/*
  ⚠️ 造状态必须用 **upsert**，不能只 update。
  祭文是**收费礼器** —— 进馆补货只补免费品，不会给它补行。
  用户从没买过祭文时 `OfferingHolding` 里根本没有这一行，
  此时 `update ... set quantity=0` 是**静默 no-op**（0 行受影响、不报错），
  于是"清 0 → 灰显"看似成立（因为本来就没有 → 卡片不渲染），
  但接下来的"补 3 → 点亮"同样 no-op，场景永远拿不到库存 → 断言飘红。
  这个失败极具误导性：看起来像"补货点亮"功能坏了，其实是脚本没造出前置数据。
  同类坑见 AGENTS.md「断言别依赖上一步的残留状态」。
*/
const setPoemQty = (n) => {
  sql(
    `insert into "OfferingHolding" ("id","userId","productId","quantity","freeTopUpDate","updatedAt") ` +
      `select gen_random_uuid()::text, u.id, p.id, ${n}, null, now() ` +
      `from "User" u, "Product" p where u.id='${userId}' and p.id='${poemId}' ` +
      `on conflict ("userId","productId") do update set quantity=${n}, "updatedAt"=now();`,
  );
};

// 场景 1：库存清 0 → 应当灰显
setPoemQty(0);
const emptyState = await probe("祭文用尽-灰显");

// 场景 2：补货 → 应当恢复可点
setPoemQty(3);
const readyState = await probe("祭文有货-恢复点亮");

/*
  ── 兜底验证：入口目标必须跟随库里的真实 slug，而不是写死的 "free-poem" ──
  1) 改 slug → 入口 href 跟着变（否则商品改名后入口就指向 404）；
  2) 商品下架/查不到 → 退回 /mall 且文案切换到"暂未上架"（而不是谎称"已用尽"）。
  两条都必须回滚，否则会污染其它套件（商品按 slug 硬查找，见 verify-clan-tribute-e2e）。
*/
const originalSlug = sql(`select slug from "Product" where id='${poemId}';`);

/*
  改库的断言必须放在 try/finally 里 —— 这是**血的教训**：
  上一版没有保护，probe 在"改 slug"阶段抛了 TimeoutError，
  于是 slug 就永久卡在 free-poem-renamed 上，后续所有按 slug 硬查找的套件
  （verify-clan-tribute-e2e 的祭文段）都会因为查不到商品而连锁失败。
  一次测试崩溃污染了全局数据，排查成本远高于加这几行 try/finally。
*/
let renamed = {};
let soldOut = {};
/*
  改库断言统一用 withRestore：它先快照、finally 里无条件还原、并打印还原后的实际值。
  原先这里是手写 try/finally —— 能工作，但每加一个改库场景就得再写一遍，
  少写一处就是一个新的"崩溃即污染"。现在收敛成一个 wrapper。
*/
await withRestore(
  [
    { table: '"Product"', where: `id='${poemId}'`, cols: ["slug", "status"] },
    {
      table: '"OfferingHolding"',
      where: `"userId"='${userId}' and "productId"='${poemId}'`,
      cols: ["quantity"],
    },
  ],
  async () => {
    sql(`update "Product" set slug='free-poem-renamed' where id='${poemId}';`);
    renamed = await probe("祭文改名-退商城首页");

    sql(`update "Product" set status='inactive' where id='${poemId}';`);
    soldOut = await probe("祭文下架-退回商城");
  },
);
const originalSlugRestored = sql(`select slug||'|'||status from "Product" where id='${poemId}';`);
console.log("  商品最终状态：", originalSlugRestored);

const ok =
  emptyState.cardDisabled === true &&
  /已用尽/.test(emptyState.cardText || "") &&
  emptyState.textBtnDisabled === true &&
  // 耗尽 → 补货入口出现在提醒旁边，且深链指向祭文商品页
  emptyState.topUpCount === 1 &&
  /\/mall\/free-poem/.test(emptyState.topUpHref || "") &&
  readyState.cardDisabled === false &&
  readyState.textBtnDisabled === false &&
  // 有货 → 补货入口收起（不抢主操作焦点）
  readyState.topUpCount === 0 &&
  /*
    slug 被改掉 → 页面按约定标识（free-poem）查不到商品，
    此时必须退到 /mall 而不是拼出一个指向 404 的深链。
    注意：这里断言的是"退首页"而**不是**"跟随新 slug" ——
    free-poem 是全站约定标识（lib/ritual.ts 的图标/动效表以它为主键），
    真改名要连 ritual.ts 一起改，所以"查不到就退首页"才是正确行为。
  */
  renamed.topUpHref === "/mall" &&
  // 商品下架 → 退回 /mall，且文案不再谎称"已用尽"
  soldOut.topUpHref === "/mall" &&
  /暂未上架/.test(soldOut.textBtnText || "");
console.log(ok ? "\n✅ 祭文库存联动：耗尽灰显 / 补货点亮" : "\n❌ 祭文库存联动仍有问题");

await browser.close();
process.exit(ok ? 0 : 1);
