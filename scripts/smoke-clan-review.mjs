// 浏览器烟测：宗祠建立审核闭环（三通道全覆盖）
//   standard  通道：填基本信息 + 一项佐证 → 后台通过并公开 → 公页可见
//   alternative 通道：切换替代通道 + 一项替代核验材料 → 后台通过并公开 → 公页可见
//   appeal    通道：切换申述通道 + 一项申述材料 + 关系说明 + 承诺书 + 勾选
//                  → 后台通过（仅创建者可见）→ 公页对非创建者不可见
//                  → owner 控制台补传正式材料 → 公页转公开可见
// 直接用 playwright-core 驱动（同 smoke-hall-review.mjs），避免 playwright-cli daemon 的 sandbox 问题。
//
// 用法（需 dev server 在 BASE，默认 :3000）：
//   BASE=http://localhost:3000 OWNER_TOKEN=<t> ADMIN_TOKEN=<t> node scripts/smoke-clan-review.mjs
import { createRequire } from "module";
import { writeFileSync } from "fs";

const require = createRequire(import.meta.url);
const PCORE =
  "/root/.nvm/versions/node/v22.13.1/lib/node_modules/@playwright/cli/node_modules/playwright-core";
const { chromium } = require(PCORE);

const BASE = process.env.BASE || "http://localhost:3000";
const OWNER_TOKEN = process.env.OWNER_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const EXEC = "/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome";
const OUT = "/workspace/.smoke";

// 1x1 透明 PNG，用于承诺书 / 补传材料的文件上传
const DUMMY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
writeFileSync(`${OUT}/dummy.png`, Buffer.from(DUMMY_PNG, "base64"));

const log = (...a) => console.log("[smoke-clan]", ...a);
const fail = [];
function check(cond, msg) {
  if (cond) log("PASS:", msg);
  else {
    fail.push(msg);
    log("FAIL:", msg);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 轮询等待公页对公众可见：goto 后用 waitForFunction 反复检查 body 是否含祠名
 * 且不含「仅你可见 / 待审核」遮罩。避免 dev server 按需重编译 + revalidate 延迟
 * 造成的偶发 404/未公开假失败；若审批真未生效则会在超时后如实抛出。
 */
async function expectPublicVisible(page, id, name, timeout = 25000) {
  await page.goto(`${BASE}/clan/halls/${id}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForFunction(
    (n) =>
      document.body &&
      document.body.innerText.includes(n) &&
      !/待审核|仅你可见|该宗祠正在审核/.test(document.body.innerText),
    name,
    { timeout, polling: 500 },
  );
  return page.evaluate(() => document.body.innerText);
}

async function login(page, token) {
  let lastErr;
  // 重试：避开 dev server 按需重编译造成的瞬时超时
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(`${BASE}/quick-login?t=${token}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForURL("**/console", { timeout: 60000 });
      log("login ->", page.url());
      return;
    } catch (e) {
      lastErr = e;
      log(`login attempt ${attempt} 未跳转，重试…`);
      await sleep(1500);
    }
  }
  throw lastErr;
}

// 在后台「宗祠设立审核」队列中，定位本宗祠的审核表单并通过（按钮文案随通道不同：
// 标准/替代为「通过并公开」，申述为「通过（仅创建者可见）」）
async function approveInQueue(ap, hallId) {
  await ap.goto(`${BASE}/admin/review`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await ap.getByText("宗祠设立审核").first().waitFor({ timeout: 30000 });
  const form = ap
    .locator("form")
    .filter({ has: ap.locator(`input[name="id"][value="${hallId}"]`) });
  await form.getByRole("button", { name: /通过/ }).click();
  await sleep(4000);
  log("approved clanHall", hallId);
}

async function run() {
  const browser = await chromium.launch({
    executablePath: EXEC,
    headless: true,
    chromiumSandbox: false,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const owner = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const op = await owner.newPage();
  op.setDefaultTimeout(30000);
  await login(op, OWNER_TOKEN);

  const admin = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const ap = await admin.newPage();
  ap.setDefaultTimeout(30000);
  await login(ap, ADMIN_TOKEN);

  // ============ 通道一：standard（保留原 6 断言）============
  await op.goto(`${BASE}/clan/halls/new`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await op.getByRole("button", { name: "提交并进入装修工坊" }).waitFor({ timeout: 30000 });
  await op.screenshot({ path: `${OUT}/clan-01-new-form.png` });
  check(true, "宗祠建馆页 /clan/halls/new 加载，含「宗祠佐证材料」与提交按钮");

  await op.getByPlaceholder("如：李", { exact: true }).fill("测");
  await op.getByPlaceholder("如：陇西李氏宗祠").fill("烟测宗氏宗祠");
  await op.getByPlaceholder("如：敦本堂").fill("怀本堂");
  await op.getByPlaceholder("如：族谱记载 / 宗亲会证明编号").fill("族谱记载 SMOKE-CLAN-001");
  await op.getByPlaceholder("18位（加密存储）").fill("11010119900307123X");
  await op.getByPlaceholder("11位").fill("13800000000");
  await op.screenshot({ path: `${OUT}/clan-02-filled.png` });

  await op.getByRole("button", { name: "提交并进入装修工坊" }).click();
  await op.waitForURL("**/console/clan-halls/**", { timeout: 30000 });
  const standardId = op.url().match(/\/console\/clan-halls\/([^/?#]+)/)?.[1];
  check(!!standardId, `standard 通道：宗祠建馆提交成功，跳转控制台馆页 id=${standardId}`);
  await op.screenshot({ path: `${OUT}/clan-03-created.png` });

  const beforeStd = await ap.goto(`${BASE}/clan/halls/${standardId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  const beforeVisibleStd = await ap.evaluate(
    (name) => document.body.innerText.includes(name),
    "烟测宗氏宗祠",
  );
  check(
    beforeStd?.status() === 404 || !beforeVisibleStd,
    `standard 审批前公页对非创建者不可见（HTTP ${beforeStd?.status() ?? "?"}, 含馆名=${beforeVisibleStd}）`,
  );

  await approveInQueue(ap, standardId);
  check(true, "standard 后台点击「通过并公开」审批宗祠");

  let pubStd = "";
  let stdVisible = false;
  try {
    pubStd = await expectPublicVisible(ap, standardId, "烟测宗氏宗祠");
    stdVisible = /烟测宗氏宗祠/.test(pubStd) && /怀本堂/.test(pubStd) && !/待审核|仅你可见/.test(pubStd);
  } catch {
    stdVisible = false;
  }
  check(stdVisible, "standard 公页 /clan/halls/[id] 对公众可见（含馆名 + 堂号「怀本堂」）");
  if (stdVisible) await ap.screenshot({ path: `${OUT}/clan-06-public-visible.png` });

  // ============ 通道二：alternative（替代核验）============
  await op.goto(`${BASE}/clan/halls/new`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await op.getByRole("button", { name: "提交并进入装修工坊" }).waitFor({ timeout: 30000 });
  await op.getByRole("button", { name: /替代通道/ }).click();
  await op.getByPlaceholder("如：李", { exact: true }).fill("测");
  await op.getByPlaceholder("如：陇西李氏宗祠").fill("烟测替代宗氏宗祠");
  await op.getByPlaceholder("如：敦本堂").fill("怀本堂");
  await op.getByPlaceholder("如：宗亲会/村委会出具的证明信编号").fill("替代核验 SMOKE-ALT-001");
  await op.getByPlaceholder("18位（加密存储）").fill("11010119900307123X");
  await op.getByPlaceholder("11位").fill("13800000000");
  await op.screenshot({ path: `${OUT}/clan-alt-01-filled.png` });

  await op.getByRole("button", { name: "提交并进入装修工坊" }).click();
  await op.waitForURL("**/console/clan-halls/**", { timeout: 30000 });
  const altId = op.url().match(/\/console\/clan-halls\/([^/?#]+)/)?.[1];
  check(!!altId, `alternative 通道：宗祠建馆提交成功，跳转控制台馆页 id=${altId}`);

  const beforeAlt = await ap.goto(`${BASE}/clan/halls/${altId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  const beforeVisibleAlt = await ap.evaluate(
    (name) => document.body.innerText.includes(name),
    "烟测替代宗氏宗祠",
  );
  check(
    beforeAlt?.status() === 404 || !beforeVisibleAlt,
    `alternative 审批前公页对非创建者不可见（HTTP ${beforeAlt?.status() ?? "?"}, 含馆名=${beforeVisibleAlt}）`,
  );

  await approveInQueue(ap, altId);
  let pubAlt = "";
  let altVisible = false;
  try {
    pubAlt = await expectPublicVisible(ap, altId, "烟测替代宗氏宗祠");
    altVisible = /烟测替代宗氏宗祠/.test(pubAlt) && !/仅你可见/.test(pubAlt);
  } catch {
    altVisible = false;
  }
  check(altVisible, "alternative 公页 /clan/halls/[id] 对公众可见（替代通道审核通过即公开）");
  if (altVisible) await ap.screenshot({ path: `${OUT}/clan-alt-02-public.png` });

  // ============ 通道三：appeal（特殊申述 + 补传转公开）============
  await op.goto(`${BASE}/clan/halls/new`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await op.getByRole("button", { name: "提交并进入装修工坊" }).waitFor({ timeout: 30000 });
  await op.getByRole("button", { name: /特殊申述通道/ }).click();
  await op.screenshot({ path: `${OUT}/clan-appeal-01-channel.png` });

  await op.getByPlaceholder("如：李", { exact: true }).fill("测");
  await op.getByPlaceholder("如：陇西李氏宗祠").fill("烟测申述宗氏宗祠");
  await op.getByPlaceholder("如：敦本堂").fill("怀本堂");
  await op.getByPlaceholder("如：历史祭祖文告 / 讣告记载").fill("申述材料 SMOKE-APPEAL-001");
  await op.getByPlaceholder(/与始祖/).fill("与李氏宗族关系说明 SMOKE-APPEAL-REL");
  await op.locator('input[name="file_promiseLetter"]').setInputFiles(`${OUT}/dummy.png`);
  await op.getByRole("checkbox").check();
  await op.getByPlaceholder("18位（加密存储）").fill("11010119900307123X");
  await op.getByPlaceholder("11位").fill("13800000000");
  await op.screenshot({ path: `${OUT}/clan-appeal-02-filled.png` });

  await op.getByRole("button", { name: "提交并进入装修工坊" }).click();
  await op.waitForURL("**/console/clan-halls/**", { timeout: 30000 });
  const appealId = op.url().match(/\/console\/clan-halls\/([^/?#]+)/)?.[1];
  check(!!appealId, `appeal 通道：宗祠建馆提交成功，跳转控制台馆页 id=${appealId}`);

  // 审批前：pending 不可见
  const beforeAppeal = await ap.goto(`${BASE}/clan/halls/${appealId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  const beforeVisibleAppeal = await ap.evaluate(
    (name) => document.body.innerText.includes(name),
    "烟测申述宗氏宗祠",
  );
  check(
    beforeAppeal?.status() === 404 || !beforeVisibleAppeal,
    `appeal 审批前公页对非创建者不可见（HTTP ${beforeAppeal?.status() ?? "?"}, 含馆名=${beforeVisibleAppeal}）`,
  );

  // 后台通过（仅创建者可见）
  await approveInQueue(ap, appealId);
  const afterApprove = await ap.goto(`${BASE}/clan/halls/${appealId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  const afterVisibleAppeal = await ap.evaluate(
    (name) => document.body.innerText.includes(name),
    "烟测申述宗氏宗祠",
  );
  check(
    afterApprove?.status() === 404 || !afterVisibleAppeal,
    `appeal 通过后仍仅创建者可见（HTTP ${afterApprove?.status() ?? "?"}, 含馆名=${afterVisibleAppeal}）`,
  );

  // owner 控制台补传
  await op.goto(`${BASE}/console/clan-halls/${appealId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await op.getByText("待补传").first().waitFor({ state: "visible", timeout: 15000 });
  await op.screenshot({ path: `${OUT}/clan-appeal-03-pending-supplement.png` });
  await op.getByText("补传正式佐证材料（转公开）").click();
  await op.locator('input[name="sup_clan_obituary"]').fill("补传正式材料 SMOKE-APPEAL-SUP");
  await op.screenshot({ path: `${OUT}/clan-appeal-04-supplement-form.png` });
  await op.getByRole("button", { name: "提交补传材料" }).click();
  await op.waitForURL("**?supplemented=1", { timeout: 30000 });
  check(true, "appeal owner 提交补传材料，跳转 ?supplemented=1");
  await op.screenshot({ path: `${OUT}/clan-appeal-05-supplemented.png` });

  // 补传后公页转公开
  let pubAppeal = "";
  let appealVisible = false;
  try {
    pubAppeal = await expectPublicVisible(ap, appealId, "烟测申述宗氏宗祠");
    appealVisible = /烟测申述宗氏宗祠/.test(pubAppeal) && !/仅你可见/.test(pubAppeal);
  } catch {
    appealVisible = false;
  }
  check(appealVisible, "appeal 补传后公页 /clan/halls/[id] 对公众转公开可见");
  if (appealVisible) await ap.screenshot({ path: `${OUT}/clan-appeal-06-public.png` });

  writeFileSync("/tmp/smoke-clan-ids.txt", [standardId, altId, appealId].join("\n"));
  await browser.close();

  log("\n==== 结果 ====");
  if (fail.length === 0) log("全部通过 ✅  clanHallIds=standard:" + standardId + " alt:" + altId + " appeal:" + appealId);
  else {
    log("存在失败 ❌:", fail);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("[smoke-clan] ERROR", e);
  process.exit(2);
});
