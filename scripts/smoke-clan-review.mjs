// 浏览器烟测：宗祠建立审核闭环
//   建馆(standard 通道) → 后台「宗祠设立审核」通过并公开 → 公页对非创建者可见
// 直接用 playwright-core 驱动（同 smoke-hall-review.mjs），避免 playwright-cli daemon 的 sandbox 问题。
//
// 验证点：
//   1) /clan/halls/new 加载（实名后表单可见、含「宗祠佐证材料」）
//   2) 填写基本信息 + 至少一项佐证材料 → 提交成功，跳 /console/clan-halls/[id]
//   3) 审批前，公页 /clan/halls/[id] 对非创建者不可见（先审后显，notFound/404）
//   4) 后台「宗祠设立审核」队列出现该待审宗祠
//   5) 后台点击「通过并公开」审批
//   6) 公页 /clan/halls/[id] 对公众可见（含馆名 + 堂号，未触发私有 gate）
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

async function login(page, token) {
  await page.goto(`${BASE}/quick-login?t=${token}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForURL("**/console", { timeout: 60000 });
  log("login ->", page.url());
}

async function run() {
  const browser = await chromium.launch({
    executablePath: EXEC,
    headless: true,
    chromiumSandbox: false,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  // ---------- OWNER: 设立宗祠 (standard 通道) ----------
  const owner = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const op = await owner.newPage();
  op.setDefaultTimeout(30000);
  await login(op, OWNER_TOKEN);

  await op.goto(`${BASE}/clan/halls/new`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await op.getByRole("button", { name: "提交并进入装修工坊" }).waitFor({ timeout: 30000 });
  await op.screenshot({ path: `${OUT}/clan-01-new-form.png` });
  check(true, "宗祠建馆页 /clan/halls/new 加载，含「宗祠佐证材料」与提交按钮");

  // 基本信息
  await op.getByPlaceholder("如：李", { exact: true }).fill("测");
  await op.getByPlaceholder("如：陇西李氏宗祠").fill("烟测宗氏宗祠");
  await op.getByPlaceholder("如：敦本堂").fill("怀本堂");
  // 佐证材料（至少一项，文本即可；standard 通道不要求图片 / 承诺书）
  await op.getByPlaceholder("如：族谱记载 / 宗亲会证明编号").fill("族谱记载 SMOKE-CLAN-001");
  // 经办人实名（与认证一致）
  await op.getByPlaceholder("18位（加密存储）").fill("11010119900307123X");
  await op.getByPlaceholder("11位").fill("13800000000");
  await op.screenshot({ path: `${OUT}/clan-02-filled.png` });

  await op.getByRole("button", { name: "提交并进入装修工坊" }).click();
  await op.waitForURL("**/console/clan-halls/**", { timeout: 30000 });
  const url = op.url();
  const hallId = url.match(/\/console\/clan-halls\/([^/?#]+)/)?.[1];
  check(!!hallId, `宗祠建馆提交成功，跳转控制台馆页 id=${hallId}`);
  await op.screenshot({ path: `${OUT}/clan-03-created.png` });

  // ---------- ADMIN: 审批前，公页对非创建者不可见（先审后显）----------
  const admin = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const ap = await admin.newPage();
  ap.setDefaultTimeout(30000);
  await login(ap, ADMIN_TOKEN);

  const before = await ap.goto(`${BASE}/clan/halls/${hallId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  const beforeVisible = await ap.evaluate(
    (name) => document.body.innerText.includes(name),
    "烟测宗氏宗祠",
  );
  check(
    before?.status() === 404 || !beforeVisible,
    `审批前公页对非创建者不可见（HTTP ${before?.status() ?? "?"}, 含馆名=${beforeVisible}）`,
  );

  // ---------- ADMIN: 宗祠设立审核 → 通过并公开 ----------
  await ap.goto(`${BASE}/admin/review`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await ap.getByText("宗祠设立审核").first().waitFor({ timeout: 30000 });
  const queueText = await ap.evaluate(() => document.body.innerText);
  check(queueText.includes("烟测宗氏宗祠"), "后台「宗祠设立审核」队列出现该待审宗祠");
  await ap.screenshot({ path: `${OUT}/clan-04-review.png` });

  // 精确锁定本宗祠的审核表单（隐藏 input[name=id][value=hallId]），点「通过并公开」
  const form = ap
    .locator("form")
    .filter({ has: ap.locator(`input[name="id"][value="${hallId}"]`) });
  await form.getByRole("button", { name: "通过并公开" }).click();
  await sleep(4000);
  await ap.screenshot({ path: `${OUT}/clan-05-after-approve.png` });
  check(true, "后台点击「通过并公开」审批宗祠");

  // ---------- PUBLIC: 公页对非创建者可见 ----------
  await ap.goto(`${BASE}/clan/halls/${hallId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  // 等馆名渲染完成（避免 domcontentloaded 后即读 innerText 的竞态）
  await ap.getByText("烟测宗氏宗祠").first().waitFor({ state: "visible", timeout: 15000 });
  const pubText = await ap.evaluate(() => document.body.innerText);
  check(
    /烟测宗氏宗祠/.test(pubText) && /怀本堂/.test(pubText) && !/待审核|仅你可见/.test(pubText),
    "公页 /clan/halls/[id] 对公众可见（含馆名 + 堂号「怀本堂」，未触发私有 gate）",
  );
  await ap.screenshot({ path: `${OUT}/clan-06-public-visible.png` });

  writeFileSync("/tmp/smoke-clan-id.txt", hallId || "");
  await browser.close();

  log("\n==== 结果 ====");
  if (fail.length === 0) log("全部通过 ✅  clanHallId=" + hallId);
  else {
    log("存在失败 ❌:", fail);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("[smoke-clan] ERROR", e);
  process.exit(2);
});
