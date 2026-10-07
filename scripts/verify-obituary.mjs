/**
 * 电子讣告发布 验收套件
 *
 * 需求（用户）：
 *   「用户支付了『电子讣告发布』后，在哪里发布电子讣告？」→ 按方案 2 补齐完整闭环：
 *   支付/积分兑换 → 发放发布配额 → 控制台发布 → 公开缅怀页（可分享/可设密码）→ 管理。
 *
 * 已确认的产品决策：
 *   1. 访问方式：公开链接可分享；发布时**可选**设访问密码。
 *   2. 归属：**可选**挂在用户名下某座纪念馆下；不挂则为独立讣告。
 *   3. 审核：**发布即生效**，无需人工审核。
 *
 * 本套件要守住的核心不变量：
 *   §0 迁移落地：三表存在、ObituaryQuota.userId 唯一
 *   §1 商品契约 + 源码层：pay.ts 与 points/actions.ts 调用**同名** grantObituaryQuota
 *   §2 支付履约：买一次 → ObituaryQuota.purchased +1（买别的 memorial_service 不发放）
 *   §3 积分兑换：页面列出卡片；提交兑换 → 配额 +1、积分 -2900（链路端到端打通）
 *   §4 发布扣配额：控制台提交 → used +1（新 id 从跳转 URL 抓，不自拼）
 *   §5 公开页：免登录可看，<title> 含逝者名（不看状态码，notFound 返 200）
 *   §6 密码档：无 cookie → 密码门且看不到正文；错密码仍拦；对密码放行
 *               （等 [data-obituary-view] 锚点，不等固定毫秒）
 *   §7 未购不可发布：无配额用户提交被拒，Obituary 行数 = 0
 *   §8 下架：status=unpublished；匿名 <title> 不含逝者名；used 不变；重新发布不再扣
 *
 * 前置：Next 已在 127.0.0.1:3000 运行。
 *
 * ⚠️ 本脚本**会写数据**（造配额、发布讣告、兑换），收尾删除测试数据 ——
 *    与兄弟套件共享 user@test.com，必须自清理。
 *
 * ============================================================================
 * 历史缺陷（已于 2026-10 后按「日上限 5 万 + 单次不设上限」决策修复）
 *
 * 原 `lib/points.ts` 的 `REDEEM_SINGLE_LIMIT = 1000` 与 49 个在售商品冲突：
 * `app/(public)/points/actions.ts` 拦掉一切 `pointsPrice > 1000` 的商品，
 * 而 DB 实测超限的有：
 *     memorial_service  7/7   （含 e-obituary 2900）
 *     storage           4/4   （2900 / 9900 / 29900 / 59900）
 *     cloud_worship     1/1   （5850）
 *     decor            32/49
 *     tribute_item      5/45
 * 三份文档均写明这些商品"开放积分兑换"，但代码一句都兑不了。
 * 根因：该常量按"礼器最高 ¥8 = 800 分"定，之后新增的模板 / 存储包 /
 * 纪念服务从未纳入这条口径。
 *
 * → 已修复：删除单次上限拦截，日上限提至 50000（详见 lib/points.ts 注释）。
 *   §3 的「配额 +1 / 积分 -2900」现为正向断言；3a-2 源码锚点改为
 *   「单次拦截已移除 + 日上限 ≥2900」。
 * ============================================================================
 * 反向验证记录（证明断言有效，不是"恒真"）
 *
 * D1 `lib/pay.ts` 删掉 memorial_service 履约分支
 *    → §2「支付后配额 +1」精确变红
 * D2 `app/(public)/points/actions.ts` 删掉分支
 *    → §1「points/actions.ts 调用 grantObituaryQuota」精确变红
 *      （§3「兑换后配额 +1」亦随之变红，但 §1 才是精确判据）
 * D3 发布 Action 去掉 consumeObituaryQuota（不扣配额）
 *    → §4「发布后 used +1」+ §7「无配额也能发」精确变红
 * D4 公开页去掉 passwordHash 校验
 *    → §6「无 cookie 见密码门」精确变红
 * D5 公开页去掉 `status !== "published"` 检查（下架也能看）
 *    → §8「下架后 title 不含逝者名」精确变红
 * D6 公开页 `<article>` 去掉 `data-obituary-view`
 *    → §5「渲染讣告正文容器」+ §6「对密码后放行」精确变红
 *
 * 还原判据：与备份逐字相同。
 * ============================================================================
 */
import { execFileSync } from "node:child_process";
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";

const { chromium } = pkg;
const BASE = "http://127.0.0.1:3000";
const OWNER = { email: "user@test.com", password: "user123456" };

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
    // ⚠️ 绝不静默：SQL 出错必须炸出来。
    //    这个 try/catch 是踩坑加的 —— 初版 execFileSync 不检查退出码，
    //    一条主键冲突的兜底 INSERT 静默失败，导致"配额没补上"被误读成
    //    "应用不扣配额/按钮禁用"，排查了很久。
    const msg = String(e.stderr || e.message || e);
    throw new Error(`psql 失败: ${msg.trim().split("\n")[0]}\n  SQL: ${sql.replace(/\s+/g, " ").slice(0, 200)}`);
  }
}

function q(s) {
  return String(s).replace(/'/g, "''");
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

// ---------------------------------------------------------------- 测试用户

const uid = psql(`SELECT id FROM "User" WHERE email='${q(OWNER.email)}'`);
if (!uid) {
  console.log("❌ 找不到 user@test.com，请先 npm run seed");
  process.exit(1);
}

const obitCount = () => Number(psql(`SELECT count(*) FROM "Obituary" WHERE "ownerUserId"='${uid}'`));
const quotaRow = () =>
  psql(`SELECT purchased || '/' || used FROM "ObituaryQuota" WHERE "userId"='${uid}'`) || "0/0";
const pointsOf = () => Number(psql(`SELECT points FROM "User" WHERE id='${uid}'`));

/**
 * 兜底：确保该用户至少有 1 份**未使用**配额可发布。
 *
 * ⚠️ 必须用 `INSERT ... ON CONFLICT ("userId") DO UPDATE`，且 id 每次**唯一**。
 *    踩过的坑：初版写了固定 id `${uid}-pub`，第二次运行就主键冲突
 *    —— 而 `ON CONFLICT ("userId")` 只吞 userId 唯一约束的冲突，
 *    **主键冲突不在它的覆盖范围**，于是整条语句报错。
 *    配合当时 psql() 不检查退出码 → 静默失败 → 配额没补上 →
 *    §4 点按钮时按钮是 disabled（剩余 0），测试崩在 click 上。
 *    现在 psql() 会抛错，且 id 带时间戳，两个问题都堵住了。
 */
function ensureQuota(userId, n = 1) {
  const id = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  psql(
    `INSERT INTO "ObituaryQuota" (id,"userId",purchased,used,"createdAt","updatedAt")
     VALUES ('${q(id)}','${q(userId)}',${n},0,now(),now())
     ON CONFLICT ("userId") DO UPDATE
       SET purchased = "ObituaryQuota".purchased + ${n}, "updatedAt" = now()`,
  );
}

async function main() {
  const browser = await chromium.launch();

  // ============================================================ §0 迁移落地
  console.log("\n=== §0 迁移落地 ===");
  for (const t of ["Obituary", "ObituaryQuota", "ObituaryMessage"]) {
    const exists = psql(
      `SELECT count(*) FROM information_schema.tables WHERE table_name='${t}'`,
    );
    check(`§0 表 ${t} 存在`, exists === "1", `count=${exists}`);
  }
  const uniq = psql(
    `SELECT count(*) FROM pg_indexes WHERE tablename='ObituaryQuota' AND indexdef LIKE '%UNIQUE%userId%'`,
  );
  check("§0 ObituaryQuota.userId 有唯一约束", Number(uniq) >= 1, `count=${uniq}`);

  // ============================================================ §1 商品契约 + 源码层
  console.log("\n=== §1 商品契约 + 源码层 ===");
  const prod = psql(
    `SELECT type || '|' || price || '|' || COALESCE("pointsPrice",-1) || '|' || status FROM "Product" WHERE slug='e-obituary'`,
  );
  const [ptype, pprice, ppts, pstatus] = prod.split("|");
  check("§1 e-obituary type=memorial_service", ptype === "memorial_service", ptype);
  check("§1 e-obituary price=2900", pprice === "2900", pprice);
  check("§1 e-obituary pointsPrice=2900", ppts === "2900", ppts);
  check("§1 e-obituary status=active", pstatus === "active", pstatus);

  const paySrc = execFileSync("cat", ["lib/pay.ts"], { encoding: "utf8" });
  const pointsSrc = execFileSync("cat", ["app/(public)/points/actions.ts"], { encoding: "utf8" });
  // 源码层：两条履约路都调用同一个函数名 grantObituaryQuota（期望函数名手抄）
  //
  // ⚠️ **必须数"真实调用"，不能数"字符串出现次数"。**
  //    初版写的是 `(src.match(/grantObituaryQuota/g)||[]).length >= 2` ——
  //    这条在把履约分支整段删掉后**依然为真**，因为剩下的两次是
  //    `import { grantObituaryQuota }` 和一行注释里提到的函数名。
  //    反向验证 D2 因此没能变红，暴露了这个假绿。
  //    修法：剥掉注释与 import，再数调用形态 `grantObituaryQuota(`。
  function stripCommentsAndImports(src) {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "") // 块注释
      .replace(/^\s*\/\/.*$/gm, "") // 行注释
      .replace(/^\s*import\s[\s\S]*?from\s+["'][^"']+["'];?/gm, ""); // import
  }
  const payCalls = (stripCommentsAndImports(paySrc).match(/grantObituaryQuota\s*\(/g) || []).length;
  const ptsCalls = (stripCommentsAndImports(pointsSrc).match(/grantObituaryQuota\s*\(/g) || []).length;
  check("§1 pay.ts 真实调用 grantObituaryQuota", payCalls >= 1, `调用 ${payCalls} 次`);
  check("§1 points/actions.ts 真实调用 grantObituaryQuota", ptsCalls >= 1, `调用 ${ptsCalls} 次`);
  check("§1 两条路调用同一函数名", payCalls >= 1 && ptsCalls >= 1);
  // 必须同时判 slug（只判 type 会错发）
  check(
    "§1 pay.ts 以 slug 精确匹配 e-obituary（防错发）",
    /slug\s*===\s*["']e-obituary["']/.test(paySrc),
  );
  check(
    "§1 points/actions.ts 以 slug 精确匹配 e-obituary（防错发）",
    /slug\s*===\s*["']e-obituary["']/.test(pointsSrc),
  );

  // ============================================================ §2 支付履约
  console.log("\n=== §2 支付履约 ===");
  // 基线（清零，避免兄弟数据干扰）
  psql(`DELETE FROM "ObituaryQuota" WHERE "userId"='${uid}'`);
  const before2 = quotaRow();

  const ctx = await authedContext(browser);
  const page = await ctx.newPage();
  await login(page, OWNER.email, OWNER.password);

  // 走真实商城下单：点详情页真实"立即购买"按钮 → /pay/[orderNo] → 点"模拟支付"。
  // orderNo 从**跳转后的 URL** 抓，不自拼。
  await page.goto(`${BASE}/mall/e-obituary`, { waitUntil: "domcontentloaded" });
  await page.click('button:has-text("立即购买")');
  await page.waitForURL(/\/pay\/[A-Za-z0-9-]+$/, { timeout: 20000 });
  const orderNo2 = page.url().split("/").pop();
  check("§2 下单跳转到支付页（orderNo 从 URL 抓）", !!orderNo2, `orderNo=${orderNo2}`);
  // 点模拟支付
  const payBtn = page.locator('button:has-text("模拟支付"), button:has-text("确认支付"), button:has-text("立即支付")');
  if (await payBtn.count()) {
    await payBtn.first().click();
  } else {
    // 兜底：直接调 API
    await page.evaluate(async (no) => {
      await fetch(`/api/payments/simulate/${no}`, { method: "POST" });
    }, orderNo2);
  }
  await page.waitForTimeout(2000);
  const paidStatus = psql(`SELECT status FROM "Order" WHERE "orderNo"='${q(orderNo2)}'`);
  check("§2 订单状态变为 paid", paidStatus === "paid", paidStatus);

  const after2 = quotaRow();
  const before2n = before2.split("/").map(Number);
  const after2n = after2.split("/").map(Number);
  check(
    "§2 支付后配额 +1",
    after2n[0] - before2n[0] === 1,
    `purchased ${before2n[0]} → ${after2n[0]}`,
  );

  // 反证：买同类型别的商品不发放（bio-writing）—— 同样走真实页面点击
  const otherSlug = psql(
    `SELECT slug FROM "Product" WHERE type='memorial_service' AND slug<>'e-obituary' AND status='active' LIMIT 1`,
  );
  if (otherSlug) {
    await page.goto(`${BASE}/mall/${otherSlug}`, { waitUntil: "domcontentloaded" });
    const buyBtn = page.locator('button:has-text("立即购买")');
    if (await buyBtn.count()) {
      await buyBtn.first().click();
      await page.waitForURL(/\/pay\/[A-Za-z0-9-]+$/, { timeout: 20000 }).catch(() => {});
      const no2 = page.url().split("/").pop();
      const payBtn2 = page.locator('button:has-text("模拟支付"), button:has-text("确认支付"), button:has-text("立即支付")');
      if (await payBtn2.count()) await payBtn2.first().click();
      else await page.evaluate(async (no) => { await fetch(`/api/payments/simulate/${no}`, { method: "POST" }); }, no2);
      await page.waitForTimeout(1500);
    }
    const after2b = quotaRow().split("/").map(Number);
    check(
      `§2 买 ${otherSlug}（同 type）不发放配额`,
      after2b[0] === after2n[0],
      `purchased 仍为 ${after2b[0]}`,
    );
  }

  // ============================================================ §3 积分兑换
  //
  // 历史上 `REDEEM_SINGLE_LIMIT = 1000` 把 49 个高积分价在售商品（含电子讣告）
  // 永远挡在积分兑换之外。已按决策修复：单次不设上限（按商品自身价判定），
  // 日上限提至 50000（详见 lib/points.ts 注释）。本节由此验证「兑换链路端到端打通」：
  //   3a   兑换卡片在积分页可见（商品在售、有积分价）
  //   3a-2 源码层：单次上限拦截已移除 + 日上限已提至 5 万（修复锚点）
  //   3b   端到端：提交兑换 → 配额 +1、积分 -2900（电子讣告 pointsPrice）
  console.log("\n=== §3 积分兑换 ===");

  // ---- 3a. 兑换卡片可见（商品在售、有积分价） ----
  // ⚠️ 这里刻意**不**造配额来自证链路 —— 那是自产自销的恒真断言。
  //    配额发放本身已由 §2 用**真实支付**证明；扣减与拒绝由 §4 / §7 证明。
  const ptsBefore = pointsOf();
  if (ptsBefore < 2900) {
    psql(`UPDATE "User" SET points=20000 WHERE id='${uid}'`);
  }
  await page.goto(`${BASE}/points`, { waitUntil: "networkidle" });
  const redeemPid = await page.evaluate(() => {
    const h3 = [...document.querySelectorAll("h3")].find(
      (x) => x.textContent.trim() === "电子讣告发布",
    );
    const form = h3?.parentElement?.querySelector("form");
    return form?.querySelector('input[name="productId"]')?.value || null;
  });
  check("§3 积分页列出电子讣告兑换卡片", !!redeemPid, `pid=${redeemPid}`);

  // ---- 3a-2. 源码层：验证「单次上限拦截已移除 + 日上限已提至 5 万」 ----
  // 这是修复的锚点：若有人又把单次上限写死（或把日上限调回 1000 以内），
  // 下列断言会变红，提醒同步回归。
  const redeemSrc3 = execFileSync("cat", ["app/(public)/points/actions.ts"], { encoding: "utf8" });
  check(
    "§3 源码：单次兑换上限拦截已移除（无 pointsPrice > REDEEM_SINGLE_LIMIT）",
    !/pointsPrice\s*>\s*REDEEM_SINGLE_LIMIT/.test(redeemSrc3),
  );
  const dailyLimit3 = Number(
    (
      execFileSync("cat", ["lib/points.ts"], { encoding: "utf8" }).match(
        /REDEEM_DAILY_LIMIT\s*=\s*(\d+)/,
      ) || []
    )[1],
  );
  check(
    "§3 源码：日兑换上限已提至 ≥2900（电子讣告可一次兑出）",
    dailyLimit3 >= 2900,
    `REDEEM_DAILY_LIMIT=${dailyLimit3}`,
  );

  const qBefore3 = quotaRow().split("/").map(Number);
  const ptsBefore3 = pointsOf();
  let redeemErrText = "";
  // 清掉该用户当日的积分兑换记录，避免多次运行累计触发日上限（50000）误判。
  psql(`DELETE FROM "PointRedemption" WHERE "userId"='${uid}' AND "createdAt" >= current_date`);
  if (redeemPid) {
    await page
      .locator('h3:text-is("电子讣告发布")')
      .locator('xpath=following-sibling::form//button[@type="submit"]')
      .first()
      .click({ timeout: 10000 });
    // 等错误/成功态出现（RSC 回填），而非固定毫秒
    await page.waitForTimeout(2500);
    redeemErrText = await page.locator("body").innerText();
  }
  const qAfter3 = quotaRow().split("/").map(Number);
  const ptsAfter3 = pointsOf();

  // 3b. 端到端：提交兑换 → 配额 +1、积分 -2900（电子讣告 pointsPrice）。
  check(
    "§3 兑换后配额 +1",
    qAfter3[0] - qBefore3[0] === 1,
    `purchased ${qBefore3[0]} → ${qAfter3[0]}；页面提示：${/超出[^）]*上限[^）]*）/.exec(redeemErrText)?.[0] ?? "（无）"}`,
  );
  check(
    "§3 兑换后积分 -2900",
    ptsBefore3 - ptsAfter3 === 2900,
    `points ${ptsBefore3} → ${ptsAfter3}`,
  );

  // ============================================================ §4 发布扣配额
  console.log("\n=== §4 发布扣配额 ===");
  // 把配额重置为「恰好 1 份可用」，使 §4 的 `used +1` 判据不受上一步残留影响。
  // ⚠️ 不用"if 不足才补"的写法：那种写法下 used 可能已经 >0，
  //    一旦 §4 发布失败就看不出是"没扣"还是"本来就不够"。
  //    直接重置为 purchased=1, used=0 —— 状态确定，判据才干净。
  psql(`DELETE FROM "ObituaryQuota" WHERE "userId"='${uid}'`);
  ensureQuota(uid, 1);
  const usedBefore4 = quotaRow().split("/").map(Number)[1];
  await page.goto(`${BASE}/console/obituaries/new`, { waitUntil: "networkidle" });
  const hasForm = await page.locator("form[data-obituary-form]").count();
  check("§4 发布页渲染表单", hasForm === 1);
  if (hasForm) {
    // 先确认提交按钮可用（配额已就位）。
    // ⚠️ 不做这一步的话，配额异常会表现为"click 超时"这种看不懂的崩溃，
    //    而不是一条明确的失败断言。
    const submitEnabled = !(await page
      .locator('form[data-obituary-form] button[type="submit"]')
      .isDisabled()
      .catch(() => true));
    check("§4 有配额时提交按钮可用", submitEnabled, `剩余配额 ${quotaRow()}`);

    const NAME = `验收逝者${Date.now() % 100000}`;
    await page.fill('input[name="deceasedName"]', NAME);
    await page.fill('textarea[name="biography"]', `验收生平内容-${NAME}。`);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/console\/obituaries\/[a-z0-9]{20,}$/, { timeout: 20000 });
    const oid = page.url().split("/").pop();
    check("§4 发布后跳转到详情页（id 从 URL 抓）", /^[a-z0-9]{20,}$/.test(oid), `id=${oid}`);

    const usedAfter4 = quotaRow().split("/").map(Number)[1];
    check("§4 发布后 used +1", usedAfter4 - usedBefore4 === 1, `used ${usedBefore4} → ${usedAfter4}`);
    const dbRow = psql(`SELECT "deceasedName" || '|' || status FROM "Obituary" WHERE id='${q(oid)}'`);
    check("§4 讣告落库且 status=published", dbRow === `${NAME}|published`, dbRow);

    // ============================================================ §5 公开页可见
    console.log("\n=== §5 公开页可见 ===");
    const anon = await authedContext(browser);
    const ap = await anon.newPage();
    const resp = await ap.goto(`${BASE}/obituary/${oid}`, { waitUntil: "networkidle" });
    const title = await ap.title();
    check("§5 免登录访问返回 200", resp.status() === 200, `status=${resp.status()}`);
    check("§5 <title> 含逝者名", title.includes(NAME), `title=${title}`);
    // 正文区锚点存在（未设密码，应直接放行）
    check("§5 渲染讣告正文容器", (await ap.locator("[data-obituary-view]").count()) === 1);
    const body = await ap.locator("body").innerText();
    check("§5 页面渲染生平正文", body.includes(`验收生平内容-${NAME}`));
    check("§5 页面含分享条", (await ap.locator('[data-share-bar]').count()) > 0);
    await anon.close();

    // ============================================================ §6 密码档
    console.log("\n=== §6 密码档拦截 + 解锁 ===");
    // 再发一份带密码的（若配额不足则临时补配额，避免影响其它断言）
    ensureQuota(uid, 1);
    const PWNAME = `密码逝者${Date.now() % 100000}`;
    await page.goto(`${BASE}/console/obituaries/new`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="deceasedName"]', PWNAME);
    await page.fill('textarea[name="biography"]', `加密正文-${PWNAME}-SECRET` );
    await page.fill('input[name="password"]', "pw123");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/console\/obituaries\/[a-z0-9]{20,}$/, { timeout: 20000 });
    const oidPw = page.url().split("/").pop();

    const anon2 = await authedContext(browser);
    const gp = await anon2.newPage();
    await gp.goto(`${BASE}/obituary/${oidPw}`, { waitUntil: "networkidle" });
    const gatePw = await gp.locator('input[type="password"]').count();
    const gateBody = await gp.locator("body").innerText();
    check("§6 无 cookie：出现密码门", gatePw === 1, `输入框=${gatePw}`);
    check("§6 无 cookie：看不到加密正文", !gateBody.includes(`SECRET`));

    // ⚠️ 密码门不存在时**不再往下走**：后续每一步都依赖那个输入框，
    //    硬走只会 `page.fill` 超时把整个脚本崩掉，全量回归里会显示成
    //    "未产出汇总行"（看着像崩溃，其实是明确的缺陷）。
    //    这里显式跳过并如实记录，让反向验证 D4 的输出干净可读。
    if (gatePw !== 1) {
      check("§6 错密码仍被拦", false, "跳过：无密码门");
      check("§6 对密码：unlock 接口返回 ok", false, "跳过：无密码门");
      check("§6 对密码后放行（见正文）", false, "跳过：无密码门");
    } else {
    // 错密码
    await gp.fill('input[type="password"]', "wrong");
    await gp.click('button[type="submit"]');
    await gp.waitForTimeout(1500);
    check("§6 错密码仍被拦", (await gp.locator('input[type="password"]').count()) === 1);
    // 对密码。
    //
    // ⚠️ 这一段出过两次 flaky，教训记在这里：
    //    初版 `waitForTimeout(2500)` 抓正文 —— 时序猜时长，偶发假红。
    //    二版改等 `[data-obituary-view]` —— 更好了，但在"生产构建 + 服务刚重启
    //    首次编译该路由"的场景下，`router.refresh()` 触发的 RSC 重取仍可能 >15s。
    //
    //    现在拆成**两个独立判据**，各自确定：
    //      (a) 接口层：unlock POST 返回 ok:true（证明密码校验与令牌签发正确）
    //      (b) 页面层：cookie 生效后，服务端确实放行正文
    //    (b) 不依赖 router.refresh 的客户端时序 —— 直接重新导航该 URL。
    //    这同样是**真实用户路径**（解锁后刷新/重开页面），且判据是确定性的。
    await gp.fill('input[type="password"]', "pw123");
    const [unlockResp] = await Promise.all([
      gp.waitForResponse((r) => /\/api\/obituary\/.*\/unlock$/.test(r.url()), { timeout: 15000 }).catch(() => null),
      gp.click('button[type="submit"]'),
    ]);
    let unlockOk = false;
    if (unlockResp) {
      const j = await unlockResp.json().catch(() => ({}));
      unlockOk = unlockResp.status() === 200 && j?.ok === true;
    }
    check("§6 对密码：unlock 接口返回 ok", unlockOk, `status=${unlockResp?.status() ?? "无响应"}`);

    // 先给 router.refresh 一点时间走完（这是用户的即时体验路径）
    await gp.waitForSelector("[data-obituary-view]", { timeout: 8000 }).catch(() => {});
    let viaRefresh = (await gp.locator("[data-obituary-view]").count()) > 0;
    if (!viaRefresh) {
      // 回退：重新导航（等 cookie 已种下，服务端必放行）
      await gp.goto(`${BASE}/obituary/${oidPw}`, { waitUntil: "networkidle" });
      viaRefresh = (await gp.locator("[data-obituary-view]").count()) > 0;
    }
    const unlockedBody = await gp.locator("body").innerText();
    check(
      "§6 对密码后放行（见正文）",
      viaRefresh && unlockedBody.includes(`SECRET`),
      viaRefresh ? "已渲染正文" : "刷新后仍未放行",
    );
    await anon2.close();
    } // end else（密码门存在才走的解锁链路）

    // ============================================================ §8 下架
    console.log("\n=== §8 下架 ===");
    const usedBefore8 = quotaRow().split("/").map(Number)[1];
    // 通过控制台管理页下架
    await page.goto(`${BASE}/console/obituaries/${oid}`, { waitUntil: "domcontentloaded" });
    const downBtn = page.locator('[data-obituary-manage] button:has-text("下架")');
    if (await downBtn.count()) {
      await downBtn.first().click();
      await page.waitForTimeout(1500);
    }
    const status8 = psql(`SELECT status FROM "Obituary" WHERE id='${q(oid)}'`);
    check("§8 下架后 status=unpublished", status8 === "unpublished", status8);

    const anon3 = await authedContext(browser);
    const dp = await anon3.newPage();
    await dp.goto(`${BASE}/obituary/${oid}`, { waitUntil: "networkidle" });
    const downTitle = await dp.title();
    const downBody = await dp.locator("body").innerText();
    check("§8 下架后匿名 <title> 不含逝者名", !downTitle.includes(NAME), `title=${downTitle}`);
    // ⚠️ 必须同时验**正文也不可见** —— 只验 title 会漏掉一个真实缺陷：
    //    `generateMetadata` 里有**自己那道** status 检查，所以即便页面主体
    //    漏掉了 status 判断（下架仍能看正文），title 依然是泛化的、断言照绿。
    //    反向验证 D5（删掉主体那道检查）最初就是因此没能变红。
    check("§8 下架后匿名看不到正文", !downBody.includes(`验收生平内容-${NAME}`));
    check("§8 下架后匿名无正文容器", (await dp.locator("[data-obituary-view]").count()) === 0);
    await anon3.close();

    const usedAfter8 = quotaRow().split("/").map(Number)[1];
    check("§8 下架不退还配额（used 不变）", usedAfter8 === usedBefore8, `used ${usedBefore8} → ${usedAfter8}`);

    // 重新发布：不再扣配额
    await page.goto(`${BASE}/console/obituaries/${oid}`, { waitUntil: "domcontentloaded" });
    const upBtn = page.locator('[data-obituary-manage] button:has-text("重新发布")');
    if (await upBtn.count()) {
      await upBtn.first().click();
      await page.waitForTimeout(1500);
    }
    const status8b = psql(`SELECT status FROM "Obituary" WHERE id='${q(oid)}'`);
    const usedAfter8b = quotaRow().split("/").map(Number)[1];
    check("§8 重新发布恢复 published", status8b === "published", status8b);
    check("§8 重新发布不再扣配额", usedAfter8b === usedBefore8, `used 仍为 ${usedAfter8b}`);
  } else {
    check("§4 发布流程", false, "发布页无表单");
  }

  // ============================================================ §7 未购不可发布
  console.log("\n=== §7 未购不可发布 ===");
  // 用一个无配额的独立用户（user 已有配额，改用 admin 账号并清空其配额）
  const adminId = psql(`SELECT id FROM "User" WHERE email='admin@test.com'`);
  const adminObitsBefore = Number(psql(`SELECT count(*) FROM "Obituary" WHERE "ownerUserId"='${adminId}'`));
  psql(`DELETE FROM "ObituaryQuota" WHERE "userId"='${adminId}'`);
  const ctx3 = await authedContext(browser);
  const np = await ctx3.newPage();
  await login(np, "admin@test.com", "admin123456");
  await np.goto(`${BASE}/console/obituaries/new`, { waitUntil: "domcontentloaded" });
  // 按钮应因无配额而禁用，或提交后被拒
  const submitDisabled = await np.locator('form[data-obituary-form] button[type="submit"]').isDisabled().catch(() => false);
  let rejected = submitDisabled;
  if (!submitDisabled) {
    await np.fill('input[name="deceasedName"]', "无配额测试");
    await np.click('button[type="submit"]');
    await np.waitForTimeout(2000);
    rejected = /暂无发布配额|配额不足/.test(await np.locator("body").innerText());
  }
  const adminObitsAfter = Number(psql(`SELECT count(*) FROM "Obituary" WHERE "ownerUserId"='${adminId}'`));
  check("§7 无配额用户无法发布", rejected, submitDisabled ? "按钮禁用" : "提交被拒");
  check("§7 无配额用户 Obituary 行数不变", adminObitsAfter === adminObitsBefore, `${adminObitsBefore} → ${adminObitsAfter}`);
  await ctx3.close();

  await browser.close();

  // ============================================================ 清理
  console.log("\n=== 清理测试数据 ===");
  psql(`DELETE FROM "Obituary" WHERE "ownerUserId"='${uid}'`);
  psql(`DELETE FROM "ObituaryQuota" WHERE "userId"='${uid}'`);
  psql(`DELETE FROM "ObituaryQuota" WHERE "userId"='${adminId}'`);
  // 清理测试订单
  psql(`DELETE FROM "Payment" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "userId"='${uid}' AND "orderNo" LIKE 'O%' AND "payChannel"='simulate')`);
  psql(`DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "userId"='${uid}' AND "payChannel"='simulate')`);
  psql(`DELETE FROM "Order" WHERE "userId"='${uid}' AND "payChannel"='simulate'`);
  psql(`DELETE FROM "PointRedemption" WHERE "userId"='${uid}' AND "productId" IN (SELECT id FROM "Product" WHERE slug='e-obituary')`);
}

await main();

// ---------------------------------------------------------------- 汇总
const total = pass + fail;
console.log(`\n===== 电子讣告：${pass}/${total} PASS${fail ? `，失败 ${fail} 项` : ""} =====`);
if (fail) {
  console.log("失败项：");
  for (const f of failures) console.log(`  ❌ ${f}`);
}
process.exit(fail ? 1 : 0);
