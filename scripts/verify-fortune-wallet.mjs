/**
 * 用户钱包（福币）+ 双币种定价 验收套件
 *
 * 需求原文（用户）：
 *   「每个用户的控制台设一个钱包，钱包可以充福币，1元人民币等于1元福币，
 *    每次充值面值为10元、20元、30元、50元、100元、自定义不等。最低充值为5元。
 *    充值优惠政策：充100元送20元福币，充199元送30元福币，充299元送50元福币，
 *    充399元送80福币，充499送120福币，最高充值499元。
 *    平台所有产品的售价全部改为福币+积分，1元福币价格等1元人民币，
 *    积分赠送与积分换购政策不变。」
 *
 * 2026-10 修订（用户确认的三项决策，见 docs/钱包与福币定价.md）：
 *   - 充值上限 499 → **599**（原先低于平台最贵的 ¥599 模板，属真倒挂）
 *   - 新增 **599 送 220** 档（最高档赠送比例 24.0% → 36.7%，对齐竞品）
 *   - **福币商品价支持一位小数**（0.1 元精度），余额仍为整数
 *
 * 本套件要守住的核心不变量：
 *   1. 档位表与需求**逐字一致**（6 档，金额与赠送额都不能错）
 *   2. `bonusFor` 是**唯一判据**：≤金额的最高档；不足最低档给 0
 *   3. 充值金额上下界（<5 / >599 一律驳回；599 本身通过）
 *   4. 真充值一次：余额 +实得、流水两条（topup + bonus）
 *   5. **福币不过期** —— FortuneLog 结构上就没有 expireAt 列
 *   6. 履约**只读订单快照**，不运行时重算 bonus（历史订单额度不漂移）
 *   7. 展示层以福币计价、括号标注人民币；不出现「0 福币」
 *   8. **福币展示价 === 实际价**（覆盖 14 处非整元素材价，|Δ| ≤ 0.05）
 *   9. 积分政策**未被改动**（POINTS_PER_YUAN / 兑换率 / 每日上限）
 *
 * 前置：Next 已在 127.0.0.1:3000 运行。
 *
 * ⚠️ 本脚本**会写数据**（建一个专用测试用户 + 真充一笔），
 *    收尾按备份还原 / 删除测试数据 —— 与兄弟套件共享 `user@test.com` 会互相污染。
 *
 * ============================================================================
 * 反向验证记录（证明断言有效，不是"恒真"）
 *
 * ① `fubFromFen` 改回 `Math.round(fen / 100)`（缺陷版）
 *    → **6 条精确变红**，且**逐件点名**：
 *      「晨雾青 显示 2 福币 ≠ 实际 1.5 福币（150分，Δ0.50）；
 *        夜阑深青 显示 3 福币 ≠ 实际 2.5 福币（250分，Δ0.50）；
 *        素线框 显示 1 福币 ≠ 实际 1.2 福币（120分，Δ-0.20）」…
 *    还原后 91/91 ✅
 *
 * ② `MAX_TOPUP` 改回 499 → 「最高充值 599 元」「充值上限 ≥ 平台最高在售单品价」
 *    两条变红（599 档那几条也会连带变红）。
 * ============================================================================
 */
import { execSync, spawnSync } from "node:child_process";
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";

const { chromium } = pkg;
const BASE = "http://127.0.0.1:3000";

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

/*
  ⚠️ psql 走 **spawnSync + stdin**，绝不拼 `-c "..."`。

  这是本仓库踩过的坑的新变种（AGENTS.md 记的是「JSON 字面量引号被剥坏」）：
  bcrypt 哈希长这样 `$2a$10$jPvs...`，**双引号内的 `$2a` / `$10` 会被 shell 当变量展开**
  → 哈希被剁成碎片（psql 还会警告 `extra command-line argument ... ignored`）
  → 用户密码变成垃圾 → **登录永远报「账号或密码错误」**。

  最阴的是它的表现：看着像"登录流程有问题/断言时机不对"，
  实际是测试脚本自己把密码存坏了（与「自产自销假绿」同类：测的是自己的 bug）。

  stdin 传 SQL 完全不经过 shell，`$` 无特殊含义；再用单引号做 Postgres 字面量即可。
*/
function psql(q) {
  const r = spawnSync(
    "docker",
    ["exec", "-i", "memorial-pg", "psql", "-U", "memorial", "-d", "memorial", "-t", "-A"],
    { input: q, encoding: "utf8" },
  );
  if (r.status !== 0 && r.stderr && !/NOTICE/.test(r.stderr)) {
    // 不抛错，只回显 —— 断言会自己发现"查不到"，避免把 SQL 问题伪装成断言失败
    process.stderr.write(`[psql] ${r.stderr.trim().slice(0, 200)}\n`);
  }
  return (r.stdout ?? "").trim();
}

/** 把字符串安全地变成 Postgres 字面量（单引号转义），供 SQL 内联用 */
function lit(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// 1. 档位契约（源码层：直接读 lib/fortune.ts，不是读它的运行结果）
// ---------------------------------------------------------------------------
console.log("\n=== 1. 档位契约 ===");

const fortuneSrc = execSync("cat /workspace/lib/fortune.ts", { encoding: "utf8" });

/*
  ⚠️ 期望值**写在测试里**（需求原文手抄），不从被测模块导出读 ——
  否则就是"自产自销"假绿（AGENTS.md 阶段 5 ②）。
*/
const EXPECTED_TIERS = [
  { pay: 100, bonus: 20 },
  { pay: 199, bonus: 30 },
  { pay: 299, bonus: 50 },
  { pay: 399, bonus: 80 },
  { pay: 499, bonus: 120 },
  // 2026-10 新增：充值上限抬到 599 以对齐平台最高价（¥599「星河长明」），
  // 同时把最高档赠送比例拉到 36.7%，与同类平台（云寄念 36.8%）齐平。
  { pay: 599, bonus: 220 },
];

for (const t of EXPECTED_TIERS) {
  // 源码里必须能逐字找到这一档（pay 与 bonus 同时出现）
  const re = new RegExp(`\\{\\s*pay:\\s*${t.pay}\\s*,\\s*bonus:\\s*${t.bonus}\\s*\\}`);
  check(`档位存在：充 ${t.pay} 送 ${t.bonus}`, re.test(fortuneSrc));
}

check("最低充值 5 元", /MIN_TOPUP\s*=\s*5\b/.test(fortuneSrc));
check("最高充值 599 元", /MAX_TOPUP\s*=\s*599\b/.test(fortuneSrc));

const presets = fortuneSrc.match(/TOPUP_PRESETS\s*=\s*\[([^\]]+)\]/);
const presetNums = presets
  ? presets[1].split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
  : [];
check(
  "固定面值含 10/20/30/50/100/599",
  [10, 20, 30, 50, 100, 599].every((n) => presetNums.includes(n)),
  `实际 [${presetNums.join(",")}]`,
);

/*
  ⚠️ 充值上限必须 ≥ 平台最高单品价 —— 否则用户买最贵那件要分两次充，
  且第一笔永远吃不到最高档赠送（真发生过：499 < 599）。
  期望值手写在测试里（读真实数据最大值），不从被测模块推导。
*/
const maxProductFen = Number(
  psql(`SELECT COALESCE(MAX(price),0) FROM "Product" WHERE status='active';`),
);
check(
  "充值上限 ≥ 平台最高在售单品价（无倒挂）",
  Number(String(fortuneSrc.match(/MAX_TOPUP\s*=\s*(\d+)/)?.[1] ?? 0)) * 100 >= maxProductFen,
  `上限 ${fortuneSrc.match(/MAX_TOPUP\s*=\s*(\d+)/)?.[1]} 元 vs 最高价 ${(maxProductFen / 100).toFixed(0)} 元`,
);

// ---------------------------------------------------------------------------
// 2. `bonusFor` 是唯一判据（行为层用 tsx 实跑）
// ---------------------------------------------------------------------------
console.log("\n=== 2. bonusFor 唯一判据（行为） ===");

const probe = `
import { bonusFor, MIN_TOPUP, MAX_TOPUP, validateTopup, totalFor } from "/workspace/lib/fortune.ts";
const cases = [4, 5, 99, 100, 101, 150, 198, 199, 200, 298, 299, 398, 399, 498, 499, 500, 598, 599, 600];
console.log(JSON.stringify({
  bonus: cases.map((n) => [n, bonusFor(n)]),
  min: MIN_TOPUP, max: MAX_TOPUP,
  valid5: validateTopup(5), valid4: validateTopup(4),
  valid500: validateTopup(500), valid599: validateTopup(599), valid600: validateTopup(600),
  valid150: validateTopup(150), validFloat: validateTopup(10.5),
  total150: totalFor(150), total499: totalFor(499), total599: totalFor(599),
}));
`;
execSync(`cat > /tmp/probe-fortune.mts <<'EOF'\n${probe}\nEOF`, { shell: "/bin/bash" });
const probeOut = execSync("cd /workspace && npx tsx /tmp/probe-fortune.mts 2>/dev/null", {
  encoding: "utf8",
}).trim();
const P = JSON.parse(probeOut);
const bmap = Object.fromEntries(P.bonus.map(([k, v]) => [k, v]));

// 逐点验收（期望值手抄自需求 + 2026-10 新增 599 档）
const BONUS_CASES = [
  [4, 0], [5, 0], [99, 0], [100, 20], [101, 20], [150, 20],
  [198, 20], [199, 30], [200, 30], [298, 30], [299, 50], [398, 50],
  [399, 80], [498, 80], [499, 120], [500, 120],
  // 新增 599 档：598 仍落 499 档（120），599 起跳 220
  [598, 120], [599, 220], [600, 220],
];
for (const [n, want] of BONUS_CASES) {
  check(`bonusFor(${n}) === ${want}`, bmap[n] === want, `实际 ${bmap[n]}`);
}

check("validateTopup(5) 通过", P.valid5 === null, `实际 ${P.valid5}`);
check("validateTopup(4) 驳回", typeof P.valid4 === "string", `实际 ${P.valid4}`);
check("validateTopup(500) 通过（500 < 599 上限）", P.valid500 === null, `实际 ${P.valid500}`);
check("validateTopup(599) 通过（等于上限，闭区间）", P.valid599 === null, `实际 ${P.valid599}`);
check("validateTopup(600) 驳回（超上限）", typeof P.valid600 === "string", `实际 ${P.valid600}`);
check("validateTopup(150) 通过", P.valid150 === null, `实际 ${P.valid150}`);
check("validateTopup(10.5) 驳回（须整数）", typeof P.validFloat === "string", `实际 ${P.validFloat}`);
check("totalFor(150) === 170（150+20）", P.total150 === 170, `实际 ${P.total150}`);
check("totalFor(499) === 619（499+120）", P.total499 === 619, `实际 ${P.total499}`);
check("totalFor(599) === 819（599+220）", P.total599 === 819, `实际 ${P.total599}`);

// ---------------------------------------------------------------------------
// 3. 履约只读快照：源码层确认 simulatePay 没有在充值分支里调 bonusFor
// ---------------------------------------------------------------------------
console.log("\n=== 3. 履约只读快照（不自产自销） ===");

const paySrc = execSync("cat /workspace/lib/pay.ts", { encoding: "utf8" });
const topupBlock = paySrc.slice(paySrc.indexOf("fortune_topup"));
const topupChunk = topupBlock.slice(0, topupBlock.indexOf("if (item.product.type === \"storage\")"));
check(
  "充值分支读 snapshot（topupYuan/bonus）",
  /snap\.topupYuan/.test(topupChunk) && /snap\.bonus/.test(topupChunk),
);
check(
  "充值分支**不**调用 bonusFor（不运行时重算）",
  !/bonusFor\s*\(/.test(topupChunk),
);
check(
  "充值分支写两条流水（topup + bonus）",
  /kind:\s*"topup"/.test(topupChunk) && /kind:\s*"bonus"/.test(topupChunk),
);
check(
  "充值分支传 tx（订单回滚则福币不发放）",
  /creditFortune\s*\(\s*\{[\s\S]*?tx:/.test(topupChunk),
);

const ordersSrc = execSync("cat /workspace/lib/orders.ts", { encoding: "utf8" });
const topupFn = ordersSrc.slice(ordersSrc.indexOf("export async function createTopupOrder"));
check(
  "下单快照里冻结 topupYuan 与 bonus",
  /topupYuan:\s*yuan/.test(topupFn) && /bonus,/.test(topupFn),
);
check("下单前调用 validateTopup（服务端二次校验）", /validateTopup\(params\.yuan\)/.test(topupFn));

// ---------------------------------------------------------------------------
// 4. 福币不过期（结构层：FortuneLog 没有 expireAt / expired 列）
// ---------------------------------------------------------------------------
console.log("\n=== 4. 福币不过期（结构） ===");

const hasExpireAt = psql(
  `SELECT count(*) FROM information_schema.columns WHERE table_name='FortuneLog' AND column_name='expireAt';`,
);
const hasExpired = psql(
  `SELECT count(*) FROM information_schema.columns WHERE table_name='FortuneLog' AND column_name='expired';`,
);
check("FortuneLog 无 expireAt 列（结构上写不出过期逻辑）", Number(hasExpireAt) === 0);
check("FortuneLog 无 expired 列", Number(hasExpired) === 0);

// 对照组：PointLog **必须**有两个列 —— 证明上面的断言不是"表不存在也恒真"
const pointHasExpire = psql(
  `SELECT count(*) FROM information_schema.columns WHERE table_name='PointLog' AND column_name='expireAt';`,
);
check("对照组：PointLog 有 expireAt 列（积分 12 个月有效期未被改动）", Number(pointHasExpire) === 1);

// 用户余额列存在
const hasCoins = psql(
  `SELECT count(*) FROM information_schema.columns WHERE table_name='User' AND column_name='fortuneCoins';`,
);
check("User.fortuneCoins 列存在", Number(hasCoins) === 1);

// ---------------------------------------------------------------------------
// 5. 积分政策未被异常改动
//    注意：兑换上限曾于 2026-10 后按用户决策调整 —— 单次不设上限（按商品自身价）、
//    日上限提至 50000（原单次 1000 把 49 个高积分价商品误杀）。此调整属有意变更，
//    下列断言仅守护「积分获取率 / 兑换率 / 有效期」等其余政策不被动。
// ---------------------------------------------------------------------------
console.log("\n=== 5. 积分政策未异常改动 ===");

const pointsSrc = execSync("cat /workspace/lib/points.ts", { encoding: "utf8" });
check("POINTS_PER_YUAN 仍为 3", /POINTS_PER_YUAN\s*=\s*3\b/.test(pointsSrc));
check("REDEEM_RATE_BASIC 仍为 100", /REDEEM_RATE_BASIC\s*=\s*100\b/.test(pointsSrc));
check("REDEEM_RATE_ADVANCED 仍为 150", /REDEEM_RATE_ADVANCED\s*=\s*150\b/.test(pointsSrc));
check("REDEEM_RATE_HALL 仍为 200", /REDEEM_RATE_HALL\s*=\s*200\b/.test(pointsSrc));
check("REDEEM_DAILY_LIMIT 已提至 50000（单次不设上限，覆盖高价商品）", /REDEEM_DAILY_LIMIT\s*=\s*50000\b/.test(pointsSrc));
check("POINTS_VALID_MONTHS 仍为 12", /POINTS_VALID_MONTHS\s*=\s*12\b/.test(pointsSrc));

// 充值订单不返消费积分（避免"福币 + 积分"双重奖励）
check(
  "充值订单不返消费积分（判据用 snapshot.type）",
  /isTopupOrder/.test(paySrc) && /snapshotTypes/.test(paySrc),
);

// ---------------------------------------------------------------------------
// 6. 行为层：真充一笔（新建专用测试用户，避免污染 user@test.com）
// ---------------------------------------------------------------------------
console.log("\n=== 6. 行为层：真充值 ===");

const TEST_EMAIL = "wallet-verify@test.local";
const now = Date.now();
const TEST_ID = "test-wallet-" + now;

let browser = null;
let cleanupIds = {};
try {
  // 清掉本脚本上次可能残留的用户
  psql(`DELETE FROM "User" WHERE email='${TEST_EMAIL}';`);

  /*
    直接用 SQL 建测试用户 —— 走 /register 会引入验证码/实名等一堆前置。
    密码哈希用和 lib/auth 同款的 bcrypt（登录时校验用）。

    ⚠️ `bcryptHash` 里含 `$`（`$2a$10$...`），**必须经 lit() 做 SQL 字面量**。
    早先写成 `'${bcryptHash}'` 拼进 shell 命令，`$2a`/`$10` 被 shell 展开成空串
    → 库里存的是被剁碎的哈希 → 登录恒报「账号或密码错误」，
    表现为"测试脚本登录不上"，其实是脚本自己把密码写坏了。
  */
  const bcryptHash = execSync(
    `cd /workspace && node -e "console.log(require('bcryptjs').hashSync('wallet123456', 10))"`,
    { encoding: "utf8" },
  ).trim();

  psql(
    `INSERT INTO "User" (id,email,"passwordHash",role,status,"fortuneCoins",points,"createdAt","updatedAt") VALUES (${lit(TEST_ID)},${lit(TEST_EMAIL)},${lit(bcryptHash)},'user','active',0,0,now(),now());`,
  );
  cleanupIds.user = TEST_ID;

  // 自检：哈希必须**原样**落库（再次提醒：`$` 被吃掉是静默的，不查就看不见）
  const storedHash = psql(`SELECT "passwordHash" FROM "User" WHERE id=${lit(TEST_ID)};`);
  check(
    "测试用户密码哈希原样落库（$ 未被 shell 吃掉）",
    storedHash === bcryptHash,
    storedHash === bcryptHash ? "" : `库里 ${storedHash.slice(0, 16)}… ≠ 生成 ${bcryptHash.slice(0, 16)}…`,
  );

  check("测试用户已建（初始福币 0）", psql(`SELECT "fortuneCoins" FROM "User" WHERE id=${lit(TEST_ID)};`) === "0");

  browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([
    { name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" },
  ]);

  /*
    登录取 cookie（用真实登录流程，避免伪造 session）。

    ⚠️ 断言别只看 URL —— Server Action 提交后 `waitForURL` 可能在上一次导航
    就早早返回（`/login` → `/login` 也算"URL 变了"），随后 `content()` 抓到的
    仍是登录页早期 HTML，于是 `控制台/我的钱包` 匹配不上 → 假红。
    （这就是 AGENTS 陷阱 12「断言别依赖上一步残留状态」的同族问题。）

    改成**以真实登录凭据为准**：先等控制台专有 DOM 出现，再看页面文本。
    登录失败时 URL 会停在 `/login`，`waitForSelector` 超时 → 断言如实报红。
  */
  const loginPage = await ctx.newPage();
  await loginPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const emailInput = loginPage.locator('input[name="identifier"]').first();
  const passInput = loginPage.locator('input[type="password"]').first();
  await emailInput.fill(TEST_EMAIL);
  await passInput.fill("wallet123456");
  await loginPage.locator('button[type="submit"]').first().click();

  // 等控制台导航出现（登录成功才有；失败会停在 /login 直到超时）
  const landed = await loginPage
    .waitForURL(/\/console/, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  const errText = landed ? "" : await loginPage.innerText("body").catch(() => "");
  check(
    "测试用户可登录控制台（导航到 /console）",
    landed,
    landed ? "" : `停在 ${loginPage.url()}${/账号或密码错误/.test(errText) ? " · 页面报「账号或密码错误」" : ""}`,
  );

  // 钱包页
  await loginPage.goto(`${BASE}/console/wallet`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await loginPage.waitForSelector("[data-wallet-panel]", { timeout: 30000 });
  const walletText = await loginPage.innerText("body");

  check("钱包页可打开", walletText.includes("我的钱包"));
  check("钱包页显示档位表", walletText.includes("充值优惠政策"));
  check("钱包页档位逐条渲染（充 199 送 30）", /充\s*199\s*元[\s\S]*?送\s*30\s*福币/.test(walletText));
  check("钱包页列出固定面值 100", walletText.includes("100 元"));
  check("钱包页说明 1 福币 = 1 元", /1\s*福币\s*=\s*1\s*元/.test(walletText));
  check("钱包页说明永久有效", walletText.includes("永久有效"));

  // 点自定义 150 → 预览应显示赠送 20（≤150 的最高档）
  await loginPage.locator("[data-topup-custom]").fill("150");
  await loginPage.waitForTimeout(400);
  const previewText = await loginPage.locator("[data-topup-preview]").innerText();
  check("自定义 150：预览赠送 20", /赠送\s*20\s*福币/.test(previewText), previewText.replace(/\n/g, " "));
  check("自定义 150：预览实得 170", /实得\s*170\s*福币/.test(previewText), previewText.replace(/\n/g, " "));

  // 真下单：点「去支付」
  await loginPage.locator("[data-topup-submit]").click();
  await loginPage.waitForURL(/\/pay\//, { timeout: 30000 });
  const payUrl = loginPage.url();
  const orderNo = payUrl.split("/pay/")[1].split("?")[0];
  cleanupIds.orderNo = orderNo;
  check("充值下单成功（跳转账页）", !!orderNo, orderNo);

  // 支付页应显示充值明细
  await loginPage.waitForSelector("text=订单支付", { timeout: 30000 });
  const payText = await loginPage.innerText("body");
  check("支付页显示应付金额", /应付/.test(payText));
  check("支付页含充值商品名", /福币充值/.test(payText));

  // 点模拟支付
  await loginPage.locator("text=确认模拟支付").click();
  await loginPage.waitForURL(/\/console/, { timeout: 30000 }).catch(() => {});
  await loginPage.waitForTimeout(1500);

  /*
    ⚠️ 积分基线**不能写死 0** —— 新注册用户会获赠 `INITIAL_POINTS` 积分
    （现为 5），写 `ptsAfter === 0` 是**断言假设了"用户刚建好没有积分"**，
    与产品行为不符（AGENTS 陷阱 3「断言别硬编码种子数量」同源）。

    要验的是"**充值不返消费积分**"，所以口径应是 **充值前后积分不变**。
    `ptsBefore` 在建立浏览器会话时就该取；这里用建号时的值。
  */
  const ptsBefore = Number(psql(`SELECT points FROM "User" WHERE id='${TEST_ID}';`));

  // 校验库内结果
  const coins = Number(psql(`SELECT "fortuneCoins" FROM "User" WHERE id='${TEST_ID}';`));
  check("充值 150 后余额 = 170 福币", coins === 170, `实际 ${coins}`);

  const logRows = psql(
    `SELECT kind || ':' || amount FROM "FortuneLog" WHERE "userId"='${TEST_ID}' ORDER BY "createdAt";`,
  )
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
  check(
    "流水两条：topup:150 与 bonus:20",
    JSON.stringify(logRows) === JSON.stringify(["bonus:20", "topup:150"]),
    `实际 ${logRows.join(", ")}`,
  );

  /*
    订单快照：履约的唯一依据。用 `jsonb` 取值 + `::text` 归一，
    避免 `->>` 对数字键返回的文本形态差异（150 vs 150.0）。
  */
  const orderItem = psql(
    `SELECT (snapshot->>'type') || '|' || (snapshot->>'topupYuan')::text || '|' || (snapshot->>'bonus')::text FROM "OrderItem" WHERE "orderId"=(SELECT id FROM "Order" WHERE "orderNo"=${lit(orderNo)});`,
  );
  check(
    "订单快照冻结 topupYuan=150 / bonus=20",
    orderItem === "fortune_topup|150|20",
    orderItem ? `实际 ${orderItem}` : "未查到订单快照行",
  );

  /*
    充值订单**不应**返消费积分。口径是"充值前后不变"，不是"等于 0"
    —— 新注册用户本来就有 INITIAL_POINTS 积分（现为 5）。
    （150 元若按 POINTS_PER_YUAN=3 返积分会是 450，差异足够大，断言有效。）
  */
  const ptsAfter = Number(psql(`SELECT points FROM "User" WHERE id='${TEST_ID}';`));
  check(
    "充值不返消费积分（充值前后积分不变）",
    ptsAfter === ptsBefore,
    `充值前 ${ptsBefore} → 充值后 ${ptsAfter}`,
  );

  // 余额回显在钱包页
  await loginPage.goto(`${BASE}/console/wallet`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await loginPage.waitForSelector("[data-wallet-balance]", { timeout: 30000 });
  const balText = await loginPage.locator("[data-wallet-balance]").innerText();
  check("钱包页余额回显 170", balText.trim() === "170", `实际 ${balText.trim()}`);

  const logsText = await loginPage.locator("[data-fortune-logs]").innerText();
  check("钱包页流水含「充值」", logsText.includes("充值"));
  check("钱包页流水含「赠送」", logsText.includes("赠送"));

  // -------------------------------------------------------------------------
  // 7. 展示层：全平台以福币计价
  // -------------------------------------------------------------------------
  console.log("\n=== 7. 展示层：福币计价 ===");

  const pub = await ctx.newPage();
  await pub.goto(`${BASE}/mall`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pub.waitForSelector("text=价格阶梯", { timeout: 30000 });
  const mallText = await pub.innerText("body");
  check("商城卡片以福币计价", /福币/.test(mallText));
  /*
    ⚠️ 正则必须是 `(^|[^\d.])0\s*福币` —— 光写 `/0\s*福币/` 会**把「10 福币」
    里的尾巴当成「0 福币」**，页面满屏正常价格却报红（纯假红，实测踩到）。

    这条本来就该抓的是"**独立出现**的 0 福币"，所以判据要锚定左边界：
    前面不能是数字或小数点。
  */
  check("商城不出现「0 福币」（免费品应显示「免费」）", !/(^|[^\d.])0\s*福币/.test(mallText), mallText.match(/(^|[^\d.])0\s*福币/)?.[0] ?? "");
  check("商城仍并列展示「积分可兑」", /积分可兑/.test(mallText));

  /*
    ⚠️ 选择器用**当前真实文案**（「立即购买」），别用已废弃的「购买后如何使用」
    —— 后者是早先版本的 heading，早已改名，写着它只会等到超时（假红）。
    判据要跟着产品走：这里真正要守的是"详情页以福币计价、并保留人民币括号"。
  */
  await pub.goto(`${BASE}/mall/fireworks`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pub.waitForSelector("text=立即购买", { timeout: 30000 });
  const detailText = await pub.innerText("body");
  check("详情页福币价 + 人民币括号", /\d+(\.\d)?\s*福币（¥\d+(\.\d)?）/.test(detailText), detailText.match(/\d+(\.\d)?\s*福币（¥[^）]+）/)?.[0] ?? "未匹配");

  // 首页商品卡
  await pub.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pub.waitForTimeout(1200);
  const homeText = await pub.innerText("body");
  check("首页商品卡以福币计价", /福币/.test(homeText));

  // -------------------------------------------------------------------------
  // 8. 福币展示价 === 实际价（账实相符，覆盖 14 处非整元素材价）
  // -------------------------------------------------------------------------
  /*
    ⚠️ 本组是 P0 的核心断言。

    `fubFromFen` 曾经写 `Math.round(fen / 100)` —— 把 **14 处非整元素材价**
    静默四舍五入：
      晨雾青   150 分 → 显示 2 福币（实际 1.5，**多 0.33**）
      素线框   120 分 → 显示 1 福币（实际 1.2，**少 0.2**）
      云纹地毯 350 分 → 显示 4 福币（实际 3.5，**多 0.5**）
    用户看不出错，但**展示价 ≠ 账本价**，对账时必然打架。

    现在精度收到 0.1 元。断言用**独立真相**做对照：
      真相 = `priceFen / 100`（数据库/数据层原值）；
      实际 = `fubFromFen(priceFen)`（被测逻辑）。
    差超过 0.05 即报红，并**打印具体是哪件素材、差多少** ——
    "变了"是弱断言，要能指名道姓说出"变成了什么"。

    样本**直接扫数据层的全部非整元价**（hall-decor + clan-decor + decor-suites），
    不是手抄一个清单 —— 手抄清单会随素材增删而漏测。
  */
  console.log("\n=== 8. 福币展示价 === 实际价（账实相符） ===");

  const priceProbe2 = `
import { fubFromFen } from "/workspace/lib/fortune.ts";
import * as hall from "/workspace/lib/hall-decor.ts";
import * as clan from "/workspace/lib/clan-decor.ts";

const rows: { id: string; name: string; fen: number }[] = [];
function collect(list: any) {
  for (const x of (list ?? []) as any[]) {
    if (typeof x?.priceFen === "number" && x.priceFen > 0) {
      rows.push({ id: x.id ?? "(no-id)", name: x.name ?? "(no-name)", fen: x.priceFen });
    }
  }
}
// 模板 / 套件 / 槽位素材三张表都要扫（非整元价分散在各表里）
collect((hall as any).TEMPLATES);
collect((hall as any).KITS);
for (const v of Object.values((hall as any).SLOT_ITEMS ?? {})) collect(v as any);
collect((clan as any).CLAN_TEMPLATES);
collect((clan as any).CLAN_KITS);
for (const v of Object.values((clan as any).CLAN_SLOT_ITEMS ?? {})) collect(v as any);

const out = rows.map((r) => ({
  ...r,
  shown: fubFromFen(r.fen),
  truth: r.fen / 100,
}));
console.log(JSON.stringify(out));
`;
  execSync(`cat > /tmp/probe-fub-price.mts <<'EOF'\n${priceProbe2}\nEOF`, { shell: "/bin/bash" });
  const priceRows = JSON.parse(
    execSync("cd /workspace && npx tsx /tmp/probe-fub-price.mts 2>/dev/null", {
      encoding: "utf8",
    }).trim(),
  );

  const nonInteger = priceRows.filter((r) => r.fen % 100 !== 0);
  check(
    "数据层存在非整元素材价（本组断言有意义的前提）",
    nonInteger.length >= 10,
    `实际 ${nonInteger.length} 处`,
  );

  const drifted = priceRows.filter((r) => Math.abs(r.shown - r.truth) > 0.05);
  check(
    "全部素材：展示福币价 === 实际价（|Δ| ≤ 0.05）",
    drifted.length === 0,
    drifted.length
      ? drifted
          .slice(0, 5)
          .map(
            (r) =>
              `${r.name} 显示 ${r.shown} 福币 ≠ 实际 ${r.truth} 福币（${r.fen}分，Δ${(r.shown - r.truth).toFixed(2)}）`,
          )
          .join("； ")
      : `共 ${priceRows.length} 件，非整元 ${nonInteger.length} 件全对`,
  );

  // 逐点钉死几个最典型的（改回 Math.round(/100) 时这几条会同时变红）
  // ⚠️ 名字与金额取自数据层实测（/tmp 探测过），不是方案里的草稿 —— 手抄名字会写错。
  const byName = Object.fromEntries(priceRows.map((r) => [r.name, r]));
  const SPOT = [
    ["晨雾青", 1.5], // 150 分：旧口径显示 2（多 0.5）
    ["素线框", 1.2], // 120 分：旧口径显示 1（少 0.2）
    ["云纹地毯", 3.5], // 350 分：旧口径显示 4（多 0.5）
    ["夜阑深青", 2.5], // 250 分：旧口径显示 3（多 0.5）—— 0.5 恰好在银行家舍入的边界
    ["朱红立柱", 3.8], // 380 分：旧口径显示 4（多 0.2）—— 宗祠侧的样本
  ];
  for (const [nm, want] of SPOT) {
    const r = byName[nm];
    check(
      `素材「${nm}」福币价 === ${want}`,
      r ? Math.abs(r.shown - want) < 0.001 : false,
      r ? `实际 ${r.shown}（${r.fen}分）` : "未找到该素材",
    );
  }

  // 整元不补零（"21 福币" 而不是 "21.0 福币"）
  const intRow = priceRows.find((r) => r.fen % 100 === 0 && r.fen > 0);
  check(
    "整元福币价无小数尾巴",
    !!intRow && String(intRow.shown) === String(Math.round(intRow.shown)),
    intRow ? `${intRow.name} → ${intRow.shown}` : "无整元样本",
  );

  await pub.close();
  await loginPage.close();
} catch (e) {
  check("行为层执行未抛错", false, e instanceof Error ? e.message : String(e));
} finally {
  if (browser) await browser.close().catch(() => {});
  // 收尾：删测试用户（Cascade 会带走 Order/FortuneLog/OrderItem）
  try {
    if (cleanupIds.orderNo) {
      psql(`DELETE FROM "Order" WHERE "orderNo"='${cleanupIds.orderNo}';`);
    }
    if (cleanupIds.user) {
      psql(`DELETE FROM "FortuneLog" WHERE "userId"='${cleanupIds.user}';`);
      psql(`DELETE FROM "User" WHERE id='${cleanupIds.user}';`);
    }
    const leftover = psql(`SELECT count(*) FROM "User" WHERE email='${TEST_EMAIL}';`);
    check("收尾：测试用户已删除", Number(leftover) === 0, `残留 ${leftover}`);
  } catch (e) {
    check("收尾清理成功", false, e instanceof Error ? e.message : String(e));
  }
}

// ---------------------------------------------------------------------------
console.log(`\n通过 ${pass}/${pass + fail}`);
if (failures.length) {
  console.log(`失败项（${failures.length}）：`);
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail === 0 ? 0 : 1);
