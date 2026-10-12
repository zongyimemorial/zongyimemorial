/**
 * 直播后台：编辑能力 + 时间戳状态机 验收套件
 *
 * 为什么需要这个套件（它守的是一段真实事故）：
 *   公开的《云直播指引》明确要求主办方「先建成预告 → 当天改成直播中 → 结束改成回放」，
 *   并承诺「改状态即自动记入开播/结束时间」。
 *   但旧代码里 `app/admin/live/actions.ts` **只有 createLive**，
 *   列表页三列全只读，全站搜 `liveSession.update` 命中 0 处 ——
 *   直播一旦创建，标题/地址/状态全改不了，想开播只能去改数据库。
 *   也就是说：**指引在教用户做一件产品做不到的事。**
 *   本套件锁死修复结果，防止哪天又被改回去（只剩个新建页）。
 *
 * 数据安全：本套件**自建一条一次性直播**，验完当场删除，不碰任何既有业务数据。
 *   即便中途抛异常，finally 里也会按标题前缀把它清掉（不留脏数据）。
 *
 * 前置：Next 已在 127.0.0.1:3000 运行，且 admin@test.com / admin123456 可登录。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { sql } from "./_db.mjs";
const { chromium } = pkg;

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PWD = "admin123456";

/** 标题前缀：清理时按它精准删除，绝不误伤真实数据 */
const MARK = "E2E直播验收";

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

const title = `${MARK}-${Date.now().toString().slice(-6)}`;
const liveId = () => sql(`SELECT id FROM "LiveSession" WHERE title='${title}' LIMIT 1;`);

function cleanup() {
  try {
    sql(`DELETE FROM "LiveSession" WHERE title='${title}';`);
  } catch {
    /* 清理失败不掩盖主结果 */
  }
}

/** 读三态时间戳，用于断言状态机 */
function stamps() {
  const row = sql(
    `SELECT status||'|'||coalesce("startedAt"::text,'-')||'|'||coalesce("endedAt"::text,'-') FROM "LiveSession" WHERE title='${title}' LIMIT 1;`,
  );
  const [status, startedAt, endedAt] = row.split("|");
  return {
    status,
    startedAt: startedAt === "-" ? null : startedAt,
    endedAt: endedAt === "-" ? null : endedAt,
  };
}

const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  // ---------- 0. 管理员登录 ----------
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.fill('input[name="identifier"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PWD);
  // 登录按钮：按「含账号输入框的那个表单」限定，避免误点到页面其它 submit 按钮
  await page.locator('form:has(input[name="identifier"]) button[type="submit"]').click();
  await page.waitForTimeout(3500);
  check("管理员登录成功", !/\/login/.test(page.url()), page.url());

  // ---------- 1. 列表页：必须有操作入口与指引入口 ----------
  await page.goto(`${BASE}/admin/live`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const listText = await page.locator("body").innerText();
  check("直播管理列表可访问", page.url().includes("/admin/live"));
  check(
    "列表页有《云直播指引》入口（后台↔指引不再脱节）",
    (await page.locator('a[href="/live/guide"]').count()) > 0,
  );

  // ---------- 2. 新建页：防错提示 + 指引入口 ----------
  await page.goto(`${BASE}/admin/live/new`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const newText = await page.locator("body").innerText();
  check("新建页含「不要填推流地址/串流密钥」防错提示", /不要填\s*推流地址/.test(newText) && /串流密钥/.test(newText));
  check(
    "新建页含指引深链（取地址 / 软硬件 / 自检清单）",
    (await page.locator('a[href="/live/guide#address"]').count()) > 0 &&
      (await page.locator('a[href="/live/guide#hardware"]').count()) > 0 &&
      (await page.locator('a[href="/live/guide#publish"]').count()) > 0,
  );
  check("新建页说明「先建预告」的理由", /预告/.test(newText));

  // ---------- 3. 新建一条一次性直播（状态=预告）----------
  await page.fill('input[name="title"]', title);
  await page.selectOption('select[name="status"]', "scheduled");
  await page.selectOption('select[name="category"]', "宗祠落成");
  await page.selectOption('select[name="embedType"]', "iframe");
  await page.fill('input[name="streamUrl"]', "https://example.com/embed/e2e");
  await page.fill('textarea[name="description"]', "验收用一次性直播，跑完即删。");
  // ⚠️ 必须限定在直播表单内：后台侧栏的「退出登录」也是 <button type="submit">，
  // 且排在 DOM 更前面，用裸选择器会点到它（症状：提交后跳首页、掉登录、action 不执行）。
  await page.locator('[data-live-form] button[type="submit"]').click();
  await page.waitForTimeout(3500);

  const id = liveId();
  check("新建直播成功（列表已出现该条）", !!id, id || "未落库");
  if (!id) throw new Error("新建失败，后续断言无意义");

  let s = stamps();
  check("新建为「预告」时两个时间戳都为空", s.status === "scheduled" && !s.startedAt && !s.endedAt, JSON.stringify(s));

  // ---------- 4. 编辑页：回填正确 ----------
  await page.goto(`${BASE}/admin/live/${id}/edit`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const editText = await page.locator("body").innerText();
  check("编辑页可打开", page.url().includes(`/admin/live/${id}/edit`));
  check("编辑页回填标题", (await page.inputValue('input[name="title"]')) === title);
  check("编辑页回填状态=预告", (await page.inputValue('select[name="status"]')) === "scheduled");
  check("编辑页回填直播类型", (await page.inputValue('select[name="category"]')) === "宗祠落成");
  check("编辑页回填接入方式", (await page.inputValue('select[name="embedType"]')) === "iframe");
  check("编辑页回填播放地址", (await page.inputValue('input[name="streamUrl"]')) === "https://example.com/embed/e2e");
  check("编辑页展示开播/结束时间（让「自动记时间」可见）", /开播时间/.test(editText) && /结束时间/.test(editText));
  check("编辑页也含防错提示（新建/编辑同源，不会分叉）", /不要填\s*推流地址/.test(editText));

  // ---------- 5. 状态机：预告 → 直播中 ----------
  await page.selectOption('select[name="status"]', "live");
  // ⚠️ 必须限定在直播表单内：后台侧栏的「退出登录」也是 <button type="submit">，
  // 且排在 DOM 更前面，用裸选择器会点到它（症状：提交后跳首页、掉登录、action 不执行）。
  await page.locator('[data-live-form] button[type="submit"]').click();
  await page.waitForTimeout(3500);
  s = stamps();
  check("改为「直播中」→ status=live", s.status === "live", JSON.stringify(s));
  check("改为「直播中」→ 自动写入 startedAt（指引承诺的「自动记时间」）", !!s.startedAt, s.startedAt || "(空)");
  check("改为「直播中」→ endedAt 仍为空", !s.endedAt, s.endedAt || "(空)");
  const started1 = s.startedAt;

  // ---------- 6. 状态机：直播中 → 回放 ----------
  await page.goto(`${BASE}/admin/live/${id}/edit`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.selectOption('select[name="status"]', "ended");
  // ⚠️ 必须限定在直播表单内：后台侧栏的「退出登录」也是 <button type="submit">，
  // 且排在 DOM 更前面，用裸选择器会点到它（症状：提交后跳首页、掉登录、action 不执行）。
  await page.locator('[data-live-form] button[type="submit"]').click();
  await page.waitForTimeout(3500);
  s = stamps();
  check("改为「回放」→ status=ended", s.status === "ended", JSON.stringify(s));
  check("改为「回放」→ 自动写入 endedAt", !!s.endedAt, s.endedAt || "(空)");
  check("改为「回放」→ startedAt 保持不变（不覆盖首次开播时间）", s.startedAt === started1, `${s.startedAt} vs ${started1}`);

  // ---------- 7. 状态机：回放 → 预告（应清空）----------
  await page.goto(`${BASE}/admin/live/${id}/edit`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.selectOption('select[name="status"]', "scheduled");
  // ⚠️ 必须限定在直播表单内：后台侧栏的「退出登录」也是 <button type="submit">，
  // 且排在 DOM 更前面，用裸选择器会点到它（症状：提交后跳首页、掉登录、action 不执行）。
  await page.locator('[data-live-form] button[type="submit"]').click();
  await page.waitForTimeout(3500);
  s = stamps();
  check(
    "改回「预告」→ 两个时间戳都清空（回到「还没开始」）",
    s.status === "scheduled" && !s.startedAt && !s.endedAt,
    JSON.stringify(s),
  );

  // ---------- 8. 编辑标题也能生效（不只是状态）----------
  const newTitle = `${title}改`;
  await page.goto(`${BASE}/admin/live/${id}/edit`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.fill('input[name="title"]', newTitle);
  // ⚠️ 必须限定在直播表单内：后台侧栏的「退出登录」也是 <button type="submit">，
  // 且排在 DOM 更前面，用裸选择器会点到它（症状：提交后跳首页、掉登录、action 不执行）。
  await page.locator('[data-live-form] button[type="submit"]').click();
  await page.waitForTimeout(3500);
  const renamed = sql(`SELECT title FROM "LiveSession" WHERE id='${id}';`);
  check("改标题能保存（编辑不只改状态）", renamed === newTitle, renamed);
  // 同步更新清理用标题
  sql(`UPDATE "LiveSession" SET title='${title}' WHERE id='${id}';`);

  // ---------- 9. 删除 ----------
  await page.goto(`${BASE}/admin/live`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  check(
    "列表页每行有「编辑」入口",
    (await page.locator(`a[href="/admin/live/${id}/edit"]`).count()) === 1,
  );
  const delCount = await page.locator('button:has-text("删除")').count();
  check("列表页有「删除」按钮", delCount > 0, `count=${delCount}`);

  // confirm() 是原生弹窗，Playwright 默认自动 dismiss → 必须先接受
  page.on("dialog", (d) => d.accept());
  // 在该条所在的行里点「删除」：按 tr 收敛范围，避免误点到别的行
  const row = page.locator("tr", { has: page.locator(`a[href="/admin/live/${id}/edit"]`) });
  await row.locator('button:has-text("删除")').first().click();
  await page.waitForTimeout(3500);
  check("点「删除」后该条已从库中移除", !liveId(), liveId() || "已删除");
} catch (e) {
  check("套件执行未抛异常", false, String(e).slice(0, 200));
  console.error(e);
} finally {
  cleanup();
  // 自证清理干净
  const left = sql(`SELECT count(*) FROM "LiveSession" WHERE title LIKE '${MARK}%';`);
  check("清理彻底（无验收残留数据）", Number(left) === 0, `残留 ${left} 条`);
}

const realErrors = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
check("无控制台错误", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

await browser.close();

console.log("");
console.log(`通过 ${pass}/${pass + fail}`);
if (fail) {
  console.log("失败项：");
  failures.forEach((f) => console.log("  -", f));
}
process.exit(fail ? 1 : 0);
