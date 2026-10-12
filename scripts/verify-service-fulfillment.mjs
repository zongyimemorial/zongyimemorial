/**
 * 服务受理体系 验收套件
 *
 * 背景（docs/产品交付审计.md）：审计发现 7 个商品付款后**无交付** ——
 *   cloud_worship（1 个）与 memorial_service 非讣告商品（6 个）在
 *   simulatePay / redeemItem 两条支付路径里被穿透、无履约分支，
 *   且全平台没有「人工服务受理」载体。
 *
 * 修复（方案甲）：新增统一的 ServiceFulfillment 受理模型 + 控制台「我的服务」
 *   + 后台「服务工单」，一次闭环这 7 个商品。
 *   核心不变量：支付/积分兑换成功后，自动建一张 `pending` 受理单，
 *   用户在控制台提交需求，管理员在后台受理/完成。
 *
 * 本套件要守住的核心不变量：
 *   §0 迁移落地：ServiceFulfillment 表存在、索引存在
 *   §1 源码层：simulatePay 与 redeemItem 均真实调用 isServiceProduct / createServiceFulfillment
 *   §2 现金支付：cloud-worship 真实下单→跳支付页（行为断言）→模拟支付→
 *      DB 出现 1 张 ServiceFulfillment(status=pending, orderId 非空)。
 *      订单号从 **DB** 取（不自拼，也不拿 URL 当数据源）
 *   §3 积分兑换：服务商品兑换→积分已扣 + 出现 1 张 ServiceFulfillment(redemptionId 非空)
 *   §4 控制台可见：#services 渲染该受理单；提交 intake 后 DB intake 更新
 *   §5 后台受理：admin 标记 done 后 DB status=done、控制台徽标更新
 *   §6 反向验证说明 + 复校源码不变量（防回归）
 *
 * 前置：Next 已在 127.0.0.1:3000 运行。
 *
 * ⚠️ 本脚本**会写数据**（造受理单、下单、兑换），收尾删除测试数据 ——
 *    与兄弟套件共享 user@test.com，必须自清理。
 *
 * ============================================================================
 * 历史缺陷（出在**本套件自己身上**，产品代码无责）
 *
 * H1 **日上限被测试自己顶爆 → §3 三条假红**
 *    日兑换上限的唯一判据是 lib/points.ts 的 dailyRedeemedPoints()：
 *      sum("PointLog".amount) where kind='redeem' and createdAt >= 当日 0 点
 *    而 §3 清场删的是 "PointRedemption" —— 那张表**不参与**上限判定，等于没清。
 *    同一天多跑几遍，5 万日名额被测试自己耗光，兑换被服务端拦下，
 *    §3「积分已扣 / redemptionId 受理单 / 受理单净增」三条一起变红。
 *    → 已改为删当日 `kind='redeem'` 的 **"PointLog"**，
 *      且时间窗口与产品同口径（Node 本地 0 点；psql 的 current_date 是
 *      DB 时区 = UTC，与 Node 的 Asia/Shanghai 差 8 小时，夜跑会错清一天）。
 *
 * H2 **吞掉导航失败 → 假绿 + 库留垃圾单**
 *    原 §2 写的是 `.waitForURL(...).catch(() => {})` + `check(!!orderNo2)`。
 *    一旦导航超时，page.url() 还停在 /mall/cloud-worship，
 *    `split("/").pop()` 取到的是 **slug**，而 `!!orderNo2` 依然为真 —— 失败被记成绿；
 *    收尾又按这个"slug"去删订单，什么也没删，库里累积 pending 垃圾单
 *    （实测一次运行残留 MJ1791797503545339995）。
 *    → 已拆成两条：导航行为单独断言（失败即红，判据清晰）；
 *      订单号改从 DB 取（权威来源，导航失败也拿得到真单号，收尾不漏删）。
 *    → 同时把"支付是否落地"从固定 waitForTimeout(2000) 改为轮询 DB（≤20s）。
 *
 * ============================================================================
 * 反向验证记录（证明断言有效，不是"恒真"）
 *
 * D1 `lib/pay.ts` 删掉 `if (isServiceProduct(item.product))` 受理分支
 *    → §2「支付后生成 pending 受理单（orderId 非空）」精确变红
 *    还原判据：与备份逐字相同。
 *
 * D2 `app/(public)/points/actions.ts` 删掉 `if (isServiceProduct(product))` 分支
 *    → §3「兑换后生成 redemptionId 受理单」精确变红
 *
 * D3 `app/console/page.tsx` 删掉 #services 分区
 *    → §4「控制台渲染该受理单」精确变红
 *
 * D4 `app/admin/services/page.tsx` 删掉 updateServiceFulfillment 表单
 *    → §5「后台标记 done 后 DB status=done」精确变红
 *
 * 还原判据：与备份逐字相同。
 * ============================================================================
 */
import { execFileSync } from "node:child_process";
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";

const { chromium } = pkg;
const BASE = "http://127.0.0.1:3000";
const OWNER = { email: "user@test.com", password: "user123456" };
const ADMIN = { email: "admin@test.com", password: "admin123456" };
const TEST_INTAKE = `验收需求-${Date.now() % 100000}`;

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
    console.log(`❌ ${name}${detail ? `  (${detail})` : ""}`);
  }
}

function psql(sql) {
  try {
    return execFileSync(
      "docker",
      ["exec", "memorial-pg", "psql", "-U", "memorial", "-d", "memorial", "-t", "-A", "-c", sql],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  } catch (e) {
    const msg = String(e.stderr || e.message || e);
    throw new Error(`psql 失败: ${msg.trim().split("\n")[0]}\n  SQL: ${sql.replace(/\s+/g, " ").slice(0, 200)}`);
  }
}

function q(s) {
  return String(s).replace(/'/g, "''");
}

/** JS Date → DB 可比的 UTC 字面量（"Order"."createdAt" 是 timestamp without time zone，按 UTC 落库） */
function utcTs(d) {
  return new Date(d).toISOString().replace("T", " ").replace("Z", "");
}

/**
 * 轮询直到回调返回真值（默认 15s）。同步 psql 也能用：每轮之间让出事件循环。
 * 用途：把"支付是否落地"这类异步结果从"固定 waitForTimeout(2000)"改成
 * "等到条件成立或明确超时" —— 固定毫秒在慢机器上必然偶发假红。
 */
async function waitFor(fn, { timeout = 15000, interval = 300 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) return null;
    await new Promise((r) => setTimeout(r, interval));
  }
}

function login(page, email, password) {
  return (async () => {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="identifier"]', email);
    await page.fill('input[name="password"]', password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
  })();
}

/** 带 preview_auth cookie 的新上下文（过内测口令页） */
async function authedContext(browser) {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  return ctx;
}

function stripCommentsAndImports(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // 块注释
    .replace(/^\s*\/\/.*$/gm, "") // 行注释
    .replace(/^\s*import\s[\s\S]*?from\s+["'][^"']+["'];?/gm, ""); // import
}

// ---------------------------------------------------------------- 测试用户
const uid = psql(`SELECT id FROM "User" WHERE email='${q(OWNER.email)}'`);
if (!uid) {
  console.log("❌ 找不到 user@test.com，请先 npm run seed");
  process.exit(1);
}
const adminId = psql(`SELECT id FROM "User" WHERE email='${q(ADMIN.email)}'`);

const pointsOf = () => Number(psql(`SELECT points FROM "User" WHERE id='${uid}'`));
const svcCount = () => Number(psql(`SELECT count(*) FROM "ServiceFulfillment" WHERE "userId"='${uid}'`));
const svcRow = (id) =>
  psql(`SELECT status || '|' || COALESCE("orderId",'') || '|' || COALESCE("redemptionId",'') || '|' || COALESCE("intake",'') FROM "ServiceFulfillment" WHERE id='${q(id)}'`);

const createdServiceIds = [];

async function main() {
  const browser = await chromium.launch();

  // ============================================================ §0 迁移落地
  console.log("\n=== §0 迁移落地 ===");
  const tableExists = psql(
    `SELECT count(*) FROM information_schema.tables WHERE table_name='ServiceFulfillment'`,
  );
  check("§0 表 ServiceFulfillment 存在", tableExists === "1", `count=${tableExists}`);
  const idxUser = psql(
    `SELECT count(*) FROM pg_indexes WHERE tablename='ServiceFulfillment' AND indexname='ServiceFulfillment_userId_createdAt_idx'`,
  );
  check("§0 索引 userId_createdAt 存在", Number(idxUser) >= 1, `count=${idxUser}`);
  const idxStatus = psql(
    `SELECT count(*) FROM pg_indexes WHERE tablename='ServiceFulfillment' AND indexname='ServiceFulfillment_status_idx'`,
  );
  check("§0 索引 status 存在", Number(idxStatus) >= 1, `count=${idxStatus}`);

  // ============================================================ §1 源码层
  console.log("\n=== §1 源码层 ===");
  const paySrc = stripCommentsAndImports(execFileSync("cat", ["lib/pay.ts"], { encoding: "utf8" }));
  const pointsSrc = stripCommentsAndImports(
    execFileSync("cat", ["app/(public)/points/actions.ts"], { encoding: "utf8" }),
  );

  const payIsSvc = (paySrc.match(/isServiceProduct\s*\(/g) || []).length;
  const payCreate = (paySrc.match(/createServiceFulfillment\s*\(/g) || []).length;
  const ptsIsSvc = (pointsSrc.match(/isServiceProduct\s*\(/g) || []).length;
  const ptsCreate = (pointsSrc.match(/createServiceFulfillment\s*\(/g) || []).length;
  check("§1 pay.ts 真实调用 isServiceProduct", payIsSvc >= 1, `调用 ${payIsSvc} 次`);
  check("§1 pay.ts 真实调用 createServiceFulfillment", payCreate >= 1, `调用 ${payCreate} 次`);
  check("§1 points/actions.ts 真实调用 isServiceProduct", ptsIsSvc >= 1, `调用 ${ptsIsSvc} 次`);
  check("§1 points/actions.ts 真实调用 createServiceFulfillment", ptsCreate >= 1, `调用 ${ptsCreate} 次`);
  // 防御：e-obituary 的 slug 精确匹配仍在，避免把讣告配额误纳入服务受理
  check(
    "§1 pay.ts 仍精确匹配 e-obituary（防错发）",
    /slug\s*===\s*["']e-obituary["']/.test(execFileSync("cat", ["lib/pay.ts"], { encoding: "utf8" })),
  );
  check(
    "§1 points/actions.ts 仍精确匹配 e-obituary（防错发）",
    /slug\s*===\s*["']e-obituary["']/.test(pointsSrc),
  );

  // ============================================================ §2 现金支付
  console.log("\n=== §2 现金支付 → 自动建受理单 ===");
  const cloudSlug = psql(
    `SELECT slug FROM "Product" WHERE type='cloud_worship' AND status='active' LIMIT 1`,
  );
  if (!cloudSlug) {
    check("§2 存在在售 cloud_worship 商品", false, "未找到");
  } else {
    const cloudPid = psql(`SELECT id FROM "Product" WHERE slug='${q(cloudSlug)}'`);
    const before2 = svcCount();
    const tStart2 = Date.now();
    const ctx = await authedContext(browser);
    const page = await ctx.newPage();
    await login(page, OWNER.email, OWNER.password);

    await page.goto(`${BASE}/mall/${cloudSlug}`, { waitUntil: "domcontentloaded" });
    await page.click('button:has-text("立即购买")');

    /*
      ⚠️ 这里**不能**写成 `.waitForURL(...).catch(() => {})` + `check(!!orderNo2)`。
      踩过的坑：catch 把导航超时吞掉后，page.url() 还停在 `/mall/cloud-worship`，
      `split("/").pop()` 拿到的是 **slug 而不是订单号**，而 `!!orderNo2` 照样为真 ——
      于是一次真实的导航失败被记成"绿"，后续 §2/§4/§5 连锁变红，
      收尾又按 slug 去删订单（什么也没删），库里留下 pending 垃圾单。

      现在的分工：
        · 「点购买 → 进支付页」这条**产品行为**单独断言，失败就是明确的红；
        · 订单号一律从 **DB**（权威记录）取，URL 只用来断言，不当数据源 ——
          导航失败也拿得到真实单号，收尾不会漏删。
    */
    const navigated = await page
      .waitForURL(/\/pay\/[A-Za-z0-9-]+$/, { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    check("§2 点击「立即购买」跳转到支付页", navigated, `URL=${page.url()}`);

    const orderNo2 = psql(
      `SELECT o."orderNo" FROM "Order" o JOIN "OrderItem" oi ON oi."orderId"=o.id ` +
        `WHERE o."userId"='${uid}' AND oi."productId"='${q(cloudPid)}' ` +
        `AND o."createdAt" >= '${utcTs(tStart2)}' ORDER BY o."createdAt" DESC LIMIT 1`,
    );
    check("§2 本次下单已落库（orderNo 取 DB，不自拼）", !!orderNo2, `orderNo=${orderNo2 || "空"}`);

    const payBtn = page.locator('button:has-text("模拟支付"), button:has-text("确认支付"), button:has-text("立即支付")');
    if (await payBtn.count()) {
      await payBtn.first().click();
    } else {
      await page.evaluate(async (no) => {
        await fetch(`/api/payments/simulate/${no}`, { method: "POST" });
      }, orderNo2);
    }

    // 等"落库为 paid"，而不是固定等 2 秒（慢机器上必然偶发假红）
    const paidStatus =
      (await waitFor(() => {
        const s = orderNo2 ? psql(`SELECT status FROM "Order" WHERE "orderNo"='${q(orderNo2)}'`) : "";
        return s === "paid" ? s : null;
      }, { timeout: 20000 })) || (orderNo2 ? psql(`SELECT status FROM "Order" WHERE "orderNo"='${q(orderNo2)}'`) : "（无订单号）");
    check("§2 订单状态变为 paid", paidStatus === "paid", paidStatus);

    const orderId = psql(`SELECT id FROM "Order" WHERE "orderNo"='${q(orderNo2)}'`);
    const svcId2 = psql(`SELECT id FROM "ServiceFulfillment" WHERE "orderId"='${q(orderId)}' LIMIT 1`);
    if (svcId2) createdServiceIds.push(svcId2);
    const row2 = svcId2 ? svcRow(svcId2) : "";
    const [status2, oid2] = row2.split("|");
    check("§2 支付后生成 pending 受理单（orderId 非空）", !!svcId2 && status2 === "pending" && !!oid2, `status=${status2} orderId=${oid2 || "空"}`);
    const after2 = svcCount();
    check("§2 受理单净增 1 张", after2 - before2 === 1, `${before2} → ${after2}`);

    // 保存给 §4 / §5 用
    globalThis.__svcId2 = svcId2;
    globalThis.__orderNo2 = orderNo2;
    await ctx.close();
  }

  // ============================================================ §3 积分兑换
  console.log("\n=== §3 积分兑换 → 自动建受理单 ===");
  // 选一个积分价最小、可兑换的服务类商品（memorial_service 非讣告），避免大额度
  const r = psql(
    `SELECT slug || '|' || name || '|' || "pointsPrice" FROM "Product" WHERE type='memorial_service' AND slug<>'e-obituary' AND status='active' AND "pointsPrice" IS NOT NULL ORDER BY "pointsPrice" ASC LIMIT 1`,
  );
  if (!r) {
    check("§3 存在可积分兑换的服务类商品", false, "未找到");
  } else {
    const [redeemSlug, redeemName, redeemPtsStr] = r.split("|");
    const redeemPts = Number(redeemPtsStr);
    const before3 = svcCount();
    const beforePts = pointsOf();
    if (beforePts < redeemPts + 100) {
      psql(`UPDATE "User" SET points=${redeemPts + 10000} WHERE id='${uid}'`);
    }

    const ctx = await authedContext(browser);
    const page = await ctx.newPage();
    await login(page, OWNER.email, OWNER.password);
    await page.goto(`${BASE}/points`, { waitUntil: "networkidle" });

    // 清掉该用户当日的积分兑换**流水**，避免同一天多次运行累计触发日上限（50000）误判。
    // ⚠️ 判据是 lib/points.ts 的 dailyRedeemedPoints()，它读 "PointLog"
    //    （kind='redeem'），**不读 "PointRedemption"** —— 删后者等于没清，
    //    同日重复运行会把日名额耗光，§3 三条断言一起假红（产品代码无责）。
    // ⚠️ 窗口与产品同口径：用 Node 本地 0 点（startOfToday 语义），
    //    不用 psql 的 current_date（DB 时区 UTC，与 Node Asia/Shanghai 差 8 小时）。
    //    列是 timestamp without time zone、按 UTC 落库，故传 UTC 字面量。
    const dayStart3 = new Date();
    dayStart3.setHours(0, 0, 0, 0);
    const dayStart3Sql = dayStart3.toISOString().replace("T", " ").replace("Z", "");
    psql(`DELETE FROM "PointLog" WHERE "userId"='${uid}' AND kind='redeem' AND "createdAt" >= '${dayStart3Sql}'`);
    console.log(`  · 兑换目标 ${redeemSlug}（${redeemPts} 分）；已重置当日兑换流水，隔离日上限干扰`);

    const pid = await page.evaluate((nm) => {
      const h3 = [...document.querySelectorAll("h3")].find((x) => x.textContent.trim() === nm);
      const form = h3?.parentElement?.querySelector("form");
      return form?.querySelector('input[name="productId"]')?.value || null;
    }, redeemName);
    check(`§3 积分页列出「${redeemName}」兑换卡片`, !!pid, `pid=${pid}`);

    if (pid) {
      await page
        .locator(`h3:text-is("${redeemName}")`)
        .locator('xpath=following-sibling::form//button[@type="submit"]')
        .first()
        .click({ timeout: 10000 });
      await page.waitForTimeout(2500);

      const afterPts = pointsOf();
      check("§3 兑换后积分已扣", beforePts - afterPts >= redeemPts, `积分 ${beforePts} → ${afterPts}（应 -=${redeemPts}）`);

      const rid = psql(
        `SELECT id FROM "PointRedemption" WHERE "userId"='${uid}' AND "productId"='${q(pid)}' ORDER BY "createdAt" DESC LIMIT 1`,
      );
      const svcId3 = rid ? psql(`SELECT id FROM "ServiceFulfillment" WHERE "redemptionId"='${q(rid)}' LIMIT 1`) : "";
      if (svcId3) createdServiceIds.push(svcId3);
      const row3 = svcId3 ? svcRow(svcId3) : "";
      const [, , rid3] = row3.split("|");
      check("§3 兑换后生成 redemptionId 受理单", !!svcId3 && !!rid3, `redemptionId=${rid3 || "空"}`);
      const after3 = svcCount();
      check("§3 受理单净增（与现金路径相互独立）", after3 - before3 === 1, `${before3} → ${after3}`);

      globalThis.__svcId3 = svcId3;
      globalThis.__rid3 = rid;
    }
    await ctx.close();
  }

  // ============================================================ §4 控制台可见
  console.log("\n=== §4 控制台「我的服务」可见 + 提交需求 ===");
  const svcId4 = globalThis.__svcId2;
  if (!svcId4) {
    check("§4 受理单存在可验证", false, "§2 未生成受理单");
  } else {
    const ctx = await authedContext(browser);
    const page = await ctx.newPage();
    await login(page, OWNER.email, OWNER.password);
    await page.goto(`${BASE}/console`, { waitUntil: "networkidle" });

    const card = page.locator(`[data-service-id="${svcId4}"]`);
    check("§4 控制台 #services 渲染该受理单", (await card.count()) === 1, `serviceId=${svcId4}`);

    const form = page.locator(`form:has(input[name="id"][value="${svcId4}"])`);
    if (await form.count()) {
      await form.locator('textarea[name="intake"]').fill(TEST_INTAKE);
      await form.locator('input[name="contact"]').fill("13800000000");
      await form.locator('button[type="submit"]').click();
      await page.waitForTimeout(2000);
      const intakeDb = psql(`SELECT COALESCE("intake",'') FROM "ServiceFulfillment" WHERE id='${q(svcId4)}'`);
      check("§4 提交需求后 DB intake 更新", intakeDb === TEST_INTAKE, `intake=${intakeDb}`);
    } else {
      check("§4 控制台渲染提交需求表单", false, "未找到表单");
    }
    await ctx.close();
  }

  // ============================================================ §5 后台受理
  console.log("\n=== §5 后台「服务工单」受理/完成 ===");
  const svcId5 = globalThis.__svcId2;
  if (!svcId5) {
    check("§5 受理单存在可验证", false, "§2 未生成受理单");
  } else {
    const ctx = await authedContext(browser);
    const page = await ctx.newPage();
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto(`${BASE}/admin/services`, { waitUntil: "domcontentloaded" });

    const row = page.locator(`tr[data-service-id="${svcId5}"]`);
    check("§5 后台工单列表渲染该受理单", (await row.count()) === 1, `serviceId=${svcId5}`);

    if (await row.count()) {
      await row.locator('select[name="status"]').selectOption("done");
      await row.locator('input[name="adminNote"]').fill("已受理并交付");
      await row.locator('form button').first().click();
      await page.waitForTimeout(2000);
      const status5 = psql(`SELECT status FROM "ServiceFulfillment" WHERE id='${q(svcId5)}'`);
      check("§5 后台标记 done 后 DB status=done", status5 === "done", status5);
    }

    // 控制台徽标应同步为「已完成」
    const cctx = await authedContext(browser);
    const cpage = await cctx.newPage();
    await login(cpage, OWNER.email, OWNER.password);
    await cpage.goto(`${BASE}/console`, { waitUntil: "networkidle" });
    const badgeText = await cpage
      .locator(`[data-service-id="${svcId5}"]`)
      .locator("body")
      .innerText()
      .catch(() => "");
    check("§5 控制台徽标同步为「已完成」", (await cpage.locator(`[data-service-id="${svcId5}"]`).innerText()).includes("已完成"));
    await cctx.close();
    await ctx.close();
  }

  // ============================================================ §6 反向验证说明 + 复校
  console.log("\n=== §6 反向验证说明 + 源码不变量复校 ===");
  console.log("  反向验证 D1（删 lib/pay.ts 的 isServiceProduct 分支）→ §2 变红；D2（删 points/actions.ts 分支）→ §3 变红；");
  console.log("  D3（删 console #services 分区）→ §4 变红；D4（删 admin/services 表单）→ §5 变红。还原后均复绿。");
  // 源码不变量复校（若分支被删，这里会先红，提示需同步回归）
  const paySrc2 = stripCommentsAndImports(execFileSync("cat", ["lib/pay.ts"], { encoding: "utf8" }));
  const ptsSrc2 = stripCommentsAndImports(
    execFileSync("cat", ["app/(public)/points/actions.ts"], { encoding: "utf8" }),
  );
  const payHas = (paySrc2.match(/isServiceProduct\s*\(/g) || []).length >= 1;
  const ptsHas = (ptsSrc2.match(/isServiceProduct\s*\(/g) || []).length >= 1;
  check("§6 复校：两条路径仍含 isServiceProduct 受理分支", payHas && ptsHas, `pay=${payHas} points=${ptsHas}`);

  await browser.close();

  // ============================================================ 清理
  console.log("\n=== 清理测试数据 ===");
  if (createdServiceIds.length) {
    psql(`DELETE FROM "ServiceFulfillment" WHERE id IN (${createdServiceIds.map((id) => `'${q(id)}'`).join(",")})`);
  }
  if (globalThis.__rid3) {
    psql(`DELETE FROM "PointRedemption" WHERE id='${q(globalThis.__rid3)}'`);
  }
  if (globalThis.__orderNo2) {
    psql(`DELETE FROM "Payment" WHERE "orderId"=(SELECT id FROM "Order" WHERE "orderNo"='${q(globalThis.__orderNo2)}')`);
    psql(`DELETE FROM "OrderItem" WHERE "orderId"=(SELECT id FROM "Order" WHERE "orderNo"='${q(globalThis.__orderNo2)}')`);
    psql(`DELETE FROM "Order" WHERE "orderNo"='${q(globalThis.__orderNo2)}'`);
  }
  // 还原共享用户积分（§3 兑换扣减），避免影响其它套件
  if (typeof globalThis.__pointsBefore === "number") {
    psql(`UPDATE "User" SET points=${globalThis.__pointsBefore} WHERE id='${uid}'`);
  }
}

// 记录基线积分（供清理还原）
globalThis.__pointsBefore = Number(psql(`SELECT points FROM "User" WHERE email='${q(OWNER.email)}'`));

await main();

// ---------------------------------------------------------------- 汇总
const total = pass + fail;
console.log(`\n===== 服务受理体系：${pass}/${total} PASS${fail ? `，失败 ${fail} 项` : ""} =====`);
if (fail) {
  console.log("失败项：");
  for (const f of failures) console.log(`  ❌ ${f}`);
}
process.exit(fail ? 1 : 0);
