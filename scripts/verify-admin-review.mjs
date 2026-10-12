// 管理台审核链路验证：确认「通过 / 驳回」按钮真的生效
// 回归目标（本轮修复的 bug）：Server Action 表单里用 <button name="decision" value="...">
// 提交时 decision 字段丢失，导致服务端 formData.get("decision") 为空、action 静默返回，
// 表现为「点了通过没反应、无报错、无状态变化」。
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { execSync } from "node:child_process";
const { chromium } = pkg;

const BASE = "http://localhost:3000";
const results = [];
const check = (name, ok, extra = "") => results.push({ name, ok: !!ok, extra });

function sql(q) {
  return execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`, {
    encoding: "utf8",
  }).trim();
}

const WHISPER_ID = "cmulxs0yb0009vcfqaolxgaen";

/*
  重置为待审核 —— 并且**必须一并满足"可以放行"的两个合规闸门**。

  ⚠️ 实测踩过（2026-10）：本套件早先只重置 status，点「通过并开启」却实得 rejected，
  看着像"通过按钮坏了"。查 actions.ts 才发现是**闸门按设计工作**：
     blocked = (decision==="active" && !consentOk) || (decision==="active" && ethicsBlocked)
     finalDecision = blocked ? "rejected" : decision
  该 profile 有 3 条声音克隆，而 ethicsStatus=pending → ethicsBlocked 为真 → 强制驳回。
  也就是说：**系统是对的，测试没备货**（AGENTS.md：断言前显式备好前提，别赌库里的状态）。

  所以这里显式把 ethicsStatus 置为 approved（有克隆件时伦理必须先过，这正是闸门要求的），
  原值在收尾还原，保证脚本可重复跑。
*/
const ethicsBefore = sql(`SELECT coalesce("ethicsStatus",'') FROM "WhisperProfile" WHERE id='${WHISPER_ID}';`);

/*
  同时备份 status/enabled/isPublic —— 本套件最后一步会把装置置为 rejected，
  若不还原，后续套件（如 verify-whispers-e2e 断言"对话页显示装置名称"）
  会因为"装置已被关闭"而红。这类**测试顺序污染**排查成本很高（单独跑一切正常），
  所以这里必须成对备份 + 收尾还原。
*/
const stateBefore = sql(
  `SELECT status||'|'||enabled||'|'||"isPublic" FROM "WhisperProfile" WHERE id='${WHISPER_ID}';`,
);

const resetPending = () =>
  sql(
    `UPDATE "WhisperProfile" SET status='pending', enabled=false, "isPublic"=false, "ethicsStatus"='approved' WHERE id='${WHISPER_ID}';`,
  );

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

// ---- 登录管理员 ----
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.fill('input[name="identifier"]', "admin@test.com");
await page.fill('input[name="password"]', "admin123456");
await page.click('button[type="submit"]');
await page.waitForTimeout(3500);
check("管理员登录成功", !/\/login/.test(page.url()), page.url());

// ---- 审核页可达 ----
await page.goto(`${BASE}/admin/review`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
check("审核页可达", page.url().includes("/admin/review"));

// ---- 场景 1：通过并开启 ----
resetPending();
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

const form = page.locator('form:has(button:has-text("通过并开启"))').first();
check("找到悄悄话审核表单", (await form.count()) > 0);
await form.locator('button:has-text("通过并开启")').click();
await page.waitForTimeout(5000);

let row = sql(`SELECT status||'|'||enabled||'|'||"isPublic" FROM "WhisperProfile" WHERE id='${WHISPER_ID}';`);
check("通过后 status=active", row.startsWith("active"), `实得 ${row}`);
check("通过后 enabled=true", row === "active|true|true", `实得 ${row}`);
check("通过后 isPublic=true", row === "active|true|true", `实得 ${row}`);

let audit = sql(
  `SELECT count(*) FROM "AuditLog" WHERE entity='WhisperProfile' AND "entityId"='${WHISPER_ID}' AND action LIKE 'whisper_active%';`,
);
check("通过后写入审计日志", Number(audit) >= 1, `实得 ${audit} 条`);

// ---- 场景 2：驳回 ----
resetPending();
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

const form2 = page.locator('form:has(button:has-text("通过并开启"))').first();
await form2.locator('button:has-text("驳回")').click();
await page.waitForTimeout(5000);

row = sql(`SELECT status||'|'||enabled FROM "WhisperProfile" WHERE id='${WHISPER_ID}';`);
check("驳回后 status=rejected", row.startsWith("rejected"), `实得 ${row}`);
check("驳回后 enabled=false", row === "rejected|false", `实得 ${row}`);

audit = sql(
  `SELECT count(*) FROM "AuditLog" WHERE entity='WhisperProfile' AND "entityId"='${WHISPER_ID}' AND action LIKE 'whisper_rejected%';`,
);
check("驳回后写入审计日志", Number(audit) >= 1, `实得 ${audit} 条`);

// ---- 场景 3：decision 字段确实送达服务端（DOM 校验修复形态）----
resetPending();
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

const hasInjectSlot = await page.evaluate(() => {
  const f = [...document.querySelectorAll("form")].find((x) =>
    x.querySelector('button[type="submit"]')?.textContent?.includes("通过并开启"),
  );
  if (!f) return "no-form";
  // 按钮不应再带 name="decision"（修复形态）
  const btnHasName = !!f.querySelector('button[name="decision"]');
  // 点击后应注入隐藏 decision 字段
  const btn = [...f.querySelectorAll('button[type="submit"]')].find((b) =>
    b.textContent.includes("通过并开启"),
  );
  btn.click();
  const injected = f.querySelector('input[name="decision"]');
  return JSON.stringify({ btnHasName, injectedValue: injected?.value ?? null });
});
check("按钮不再依赖 name/value 提交", hasInjectSlot.includes('"btnHasName":false'), hasInjectSlot);
check("点击时注入 decision 隐藏字段", hasInjectSlot.includes('"injectedValue":"active"'), hasInjectSlot);

// ---- 场景 4：无控制台错误 ----
const realErrors = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
check("无控制台错误", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));

await browser.close();

// ---- 收尾：还原伦理状态与装置可见性（脚本可重复跑，不留测试数据 / 不污染后续套件）----
if (ethicsBefore) {
  sql(`UPDATE "WhisperProfile" SET "ethicsStatus"='${ethicsBefore}' WHERE id='${WHISPER_ID}';`);
  const nowEthics = sql(`SELECT coalesce("ethicsStatus",'') FROM "WhisperProfile" WHERE id='${WHISPER_ID}';`);
  check("测试后伦理状态已还原", nowEthics === ethicsBefore, `${nowEthics} vs ${ethicsBefore}`);
}
{
  // stateBefore 形如 "active|true|true"，逐字写回（值来自本库，不需再转义）
  const [st, en, pub] = stateBefore.split("|");
  if (st) {
    sql(
      `UPDATE "WhisperProfile" SET status='${st}', enabled=${en === "true"}, "isPublic"=${pub === "true"} WHERE id='${WHISPER_ID}';`,
    );
    const nowState = sql(
      `SELECT status||'|'||enabled||'|'||"isPublic" FROM "WhisperProfile" WHERE id='${WHISPER_ID}';`,
    );
    check("测试后装置状态已还原（不污染后续套件）", nowState === stateBefore, `${nowState} vs ${stateBefore}`);
  }
}

// ---- 输出 ----
console.log("");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra ? `  (${r.extra})` : ""}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n===== 管理台审核链路：${passed}/${results.length} PASS =====`);
process.exit(passed === results.length ? 0 : 1);
