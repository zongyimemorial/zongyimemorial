// 浏览器烟测：建馆(appeal) / 审核通过 / 补传 / 公页举报 / 后台举报队列
// 直接用 playwright-core 驱动，避免 playwright-cli daemon 的 sandbox 配置不生效问题。
import { createRequire } from "module";
import { writeFileSync } from "fs";

const require = createRequire(import.meta.url);
const PCORE =
  "/root/.nvm/versions/node/v22.13.1/lib/node_modules/@playwright/cli/node_modules/playwright-core";
const { chromium } = require(PCORE);

const BASE = process.env.BASE || "http://localhost:3001";
const OWNER_TOKEN = process.env.OWNER_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const EXEC = "/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome";
const PNG = "/workspace/.smoke/proof.png";

const log = (...a) => console.log("[smoke]", ...a);
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

  // ---------- OWNER: 建馆 (appeal) ----------
  const owner = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const op = await owner.newPage();
  op.setDefaultTimeout(30000);
  await login(op, OWNER_TOKEN);

  await op.goto(`${BASE}/halls/new`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await op.waitForSelector("button:has-text('特殊申述')", { timeout: 30000 });
  await op.screenshot({ path: "/workspace/.smoke/01-new-form.png" });
  check(true, "建馆页 /halls/new 加载，三通道表单可见");

  // 选择特殊申述通道
  await op.locator("button").filter({ hasText: "特殊申述" }).first().click();
  await op.waitForSelector("text=特殊申述补充材料", { timeout: 10000 });
  check(true, "切换到特殊申述(appeal)通道，补充材料区出现");

  // 实名与逝者信息
  await op.getByPlaceholder("将用作纪念馆名称").fill("烟测逝者");
  await op.getByPlaceholder("18位身份证号（加密存储）").fill("11010119900307123X");
  await op.getByPlaceholder("11位手机号").fill("13800000000");

  // 至少一项证明材料（appeal 第一项 obituary）
  await op.getByPlaceholder("填写编号或文字说明").first().fill("讣告编号 SMOKE-001");

  // 关系证明
  await op.getByPlaceholder("如：户口本编号 / 亲属关系说明").fill("户口本编号 SMOKE-REL-001");

  // 承诺书：上传签署件图片
  const up = op.locator("label").filter({ hasText: "上传签署件" }).locator("input[type=file]");
  await up.setInputFiles(PNG);
  await op.waitForFunction(
    () => document.querySelector('a[href*="/uploads/proofs/"]') !== null,
    { timeout: 20000 },
  );
  check(true, "承诺书图片上传成功（/uploads/proofs/ 链接出现）");

  // 勾选已签署
  await op.locator("label").filter({ hasText: "我已阅读并签署" }).locator("input[type=checkbox]").check();
  check(true, "勾选「已阅读并签署真实性承诺书」");

  await op.screenshot({ path: "/workspace/.smoke/02-appeal-filled.png" });

  // 提交
  await op.getByRole("button", { name: "免费提交建馆申请" }).click();
  await op.waitForURL("**/console/halls/**", { timeout: 30000 });
  const url = op.url();
  const hallId = url.match(/\/console\/halls\/([^/?#]+)/)?.[1];
  check(!!hallId, `建馆提交成功，跳转控制台馆页 id=${hallId}`);
  await op.screenshot({ path: "/workspace/.smoke/03-created.png" });

  // ---------- ADMIN: 审核通过 ----------
  const admin = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const ap = await admin.newPage();
  ap.setDefaultTimeout(30000);
  await login(ap, ADMIN_TOKEN);

  await ap.goto(`${BASE}/admin/review`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await ap.waitForSelector("text=建馆审核", { timeout: 30000 });
  // 找到 appeal 馆的通过按钮（仅创建者可见）
  const approveBtn = ap.getByRole("button", { name: "通过（仅创建者可见）" });
  await approveBtn.first().waitFor({ timeout: 20000 });
  await ap.screenshot({ path: "/workspace/.smoke/04-review.png" });
  await approveBtn.first().click();
  await sleep(4000);
  await ap.screenshot({ path: "/workspace/.smoke/05-after-approve.png" });
  check(true, "后台点击「通过（仅创建者可见）」审核 appeal 馆");

  // ---------- OWNER: 补传 ----------
  await op.goto(`${BASE}/console/halls/${hallId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await op.waitForSelector("summary:has-text('补传正式材料')", { timeout: 20000 });
  await op.locator("summary", { hasText: "补传正式材料" }).click();
  await op.getByPlaceholder("编号 / 说明").first().fill("补传编号 SMOKE-SUP-001");
  await op.screenshot({ path: "/workspace/.smoke/06-supplement-form.png" });
  await op.getByRole("button", { name: "提交补传并转公开" }).click();
  await op.waitForFunction(() => location.href.includes("supplemented=1"), { timeout: 30000 });
  check(true, "owner 补传材料并提交，跳转 ?supplemented=1");
  await op.screenshot({ path: "/workspace/.smoke/07-supplemented.png" });

  // ---------- PUBLIC: 举报 ----------
  await ap.goto(`${BASE}/halls/${hallId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  // 等馆名渲染完成（避免 domcontentloaded 后即读 innerText 的竞态）
  await ap.getByText("烟测逝者纪念馆").first().waitFor({ state: "visible", timeout: 15000 });
  // 应已公开可见（非 gated）
  const pubText = await ap.evaluate(() => document.body.innerText);
  check(
    /烟测逝者纪念馆/.test(pubText) && !/仅创建者可见|审核中|尚在审核/.test(pubText),
    "公页 /halls/[id] 对公众可见（含馆名，未触发实名/私有 gate）",
  );
  await ap.screenshot({ path: "/workspace/.smoke/08-public-visible.png" });

  await ap.locator("summary", { hasText: "发现违规内容？举报此纪念馆" }).click();
  await ap.locator('textarea[name="reason"]').fill("烟测举报：测试违规内容");
  await ap.locator('input[name="contact"]').fill("13800000000");
  await ap.screenshot({ path: "/workspace/.smoke/09-report-form.png" });
  await ap.getByRole("button", { name: "提交举报" }).click();
  await ap.waitForFunction(() => document.body.innerText.includes("举报已提交"), { timeout: 20000 });
  check(true, "公页提交举报，显示「举报已提交」");
  await ap.screenshot({ path: "/workspace/.smoke/10-reported.png" });

  // ---------- ADMIN: 举报队列 ----------
  await ap.goto(`${BASE}/admin/review`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await ap.evaluate(() => {
    const el = Array.from(document.querySelectorAll("h2")).find((h) => h.textContent.includes("建馆举报处理"));
    el?.scrollIntoView();
  });
  await sleep(1500);
  const queueText = await ap.evaluate(() => document.body.innerText);
  check(/烟测举报：测试违规内容/.test(queueText), "后台「建馆举报处理」队列出现该举报工单");
  await ap.screenshot({ path: "/workspace/.smoke/11-report-queue.png" });

  writeFileSync("/tmp/smoke-hall-id.txt", hallId || "");
  await browser.close();

  log("\n==== 结果 ====");
  if (fail.length === 0) log("全部通过 ✅  hallId=" + hallId);
  else {
    log("存在失败 ❌:", fail);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("[smoke] ERROR", e);
  process.exit(2);
});
