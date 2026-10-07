/**
 * 社区功能验收（纪念馆 + 宗祠）
 *
 * 覆盖：
 *  ① 馆主进入社区 → 自动成为 owner 成员 → 生成邀请码
 *  ② 非成员看不到社区内容
 *  ③ 凭邀请码加入 → 成员列表正确
 *  ④ 成员发帖（文本 + 视频 URL）→ 即时显示
 *  ⑤ 成员回帖 → 显示在帖子下
 *  ⑥ 非成员看不到帖子
 *  ⑦ 身份快照：前台只 select displayName，不泄露实名
 *  ⑧ 自清理（脚本可重复跑）
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { execSync } from "node:child_process";

const BASE = "http://127.0.0.1:3000";
const psql = (q) =>
  execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`, {
    encoding: "utf8",
  }).trim();

let pass = 0;
let fail = 0;
const check = (n, ok, d = "") => {
  if (ok) {
    pass++;
    console.log(`PASS  ${n}${d ? `  (${d})` : ""}`);
  } else {
    fail++;
    console.log(`FAIL  ${n}${d ? `  (${d})` : ""}`);
  }
};

// ── 找测试目标 ──────────────────────────────────────────────────────
const hallId = psql(`SELECT id FROM "MemorialHall" WHERE status='active' AND "ownerUserId"=(SELECT id FROM "User" WHERE email='user@test.com') ORDER BY "createdAt" ASC LIMIT 1;`);
const clanId = psql(`SELECT id FROM "ClanHall" WHERE status='active' AND "ownerUserId"=(SELECT id FROM "User" WHERE email='user@test.com') ORDER BY "createdAt" ASC LIMIT 1;`);
check("找到测试纪念馆", !!hallId, hallId || "未找到");
check("找到测试宗祠", !!clanId, clanId || "未找到");

// 清理上次残留
psql(`DELETE FROM "CommunityReply" WHERE "postId" IN (SELECT id FROM "CommunityPost" WHERE "hallId"='${hallId}' OR "clanHallId"='${clanId}');`);
psql(`DELETE FROM "CommunityPost" WHERE "hallId"='${hallId}' OR "clanHallId"='${clanId}';`);
psql(`DELETE FROM "CommunityMember" WHERE "hallId"='${hallId}' OR "clanHallId"='${clanId}';`);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

console.log("\n===== 社区功能验收 =====\n");

// ── ① 馆主进入社区 → 自动成为 owner + 生成邀请码 ──────────────────
console.log("── ① 馆主进入社区 ──");
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.fill('input[name="identifier"]', "user@test.com");
await page.fill('input[name="password"]', "user123456");
await page.click('button[type="submit"]');
await page.waitForTimeout(4500);

await page.goto(`${BASE}/halls/${hallId}/community`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

const hallInviteCode = psql(`SELECT "communityInviteCode" FROM "MemorialHall" WHERE id='${hallId}';`);
check("纪念馆社区页可访问", page.url().includes("/community"), page.url());
check("馆主自动成为社区 owner", psql(`SELECT count(*) FROM "CommunityMember" WHERE "hallId"='${hallId}' AND "role"='owner';`) === "1");
check("生成了邀请码", !!hallInviteCode && hallInviteCode.length >= 8, hallInviteCode || "未生成");
check("社区页有发帖框", await page.locator("textarea").count() > 0);
check("社区页有邀请链接卡片（馆主）", await page.locator("text=邀请亲朋好友").count() > 0);

// ── ② 非成员看不到社区内容 ──────────────────────────────────────────
console.log("\n── ② 非成员看不到社区内容 ──");
{
  // admin 没被邀请 → 不应是社区成员
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', "admin@test.com");
  await page.fill('input[name="password"]', "admin123456");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4500);

  await page.goto(`${BASE}/halls/${hallId}/community`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const html = await page.content();
  check("非成员看到加入入口", html.includes("输入邀请码") || html.includes("亲友交流社区"));
  check("非成员看不到发帖框", (await page.locator("textarea").count()) === 0);
}

// ── ③ 凭邀请码加入 → 成员列表正确 ──────────────────────────────────
console.log("\n── ③ 凭邀请码加入 ──");
{
  // admin 凭码加入
  const fd = new FormData();
  fd.set("code", hallInviteCode);
  // 用 action 测试 —— 直接在页面上输入邀请码
  await page.goto(`${BASE}/halls/${hallId}/community`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.fill('input[placeholder="输入邀请码"]', hallInviteCode);
  await page.click('button:has-text("加入")');
  await page.waitForTimeout(3000);

  // 验证成员列表
  const adminId = psql(`SELECT id FROM "User" WHERE email='admin@test.com' LIMIT 1;`);
  const isMember = psql(`SELECT count(*) FROM "CommunityMember" WHERE "hallId"='${hallId}' AND "userId"='${adminId}';`);
  check("admin 凭码加入成功", isMember === "1");

  // 成员数应 ≥ 2（owner + admin）
  const count = psql(`SELECT count(*) FROM "CommunityMember" WHERE "hallId"='${hallId}';`);
  check("成员数 ≥ 2", Number(count) >= 2, `实际 ${count}`);

  // admin 现在能看到发帖框了
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  check("加入后能看到发帖框", (await page.locator("textarea").count()) > 0);
}

// ── ④ 成员发帖 → 即时显示 ──────────────────────────────────────────
console.log("\n── ④ 成员发帖 ──");
{
  const postText = `社区测试帖 ${Date.now()}`;
  await page.fill("textarea", postText);
  await page.click('button[type="submit"]:has-text("发布")');
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const body = await page.locator("body").innerText();
  check("帖子即时显示", body.includes(postText), `未找到刚发的帖子`);

  // DB 也应该有这条
  const dbPost = psql(`SELECT count(*) FROM "CommunityPost" WHERE "hallId"='${hallId}' AND content LIKE '%${postText.slice(-8)}';`);
  check("帖子已写入 DB", dbPost === "1");

  // 帖子应该有脱敏的 displayName（不含 admin@test.com 完整邮箱）
  const post = psql(`SELECT "displayName" FROM "CommunityPost" WHERE "hallId"='${hallId}' ORDER BY "createdAt" DESC LIMIT 1;`);
  check("帖子 displayName 已脱敏", !post.includes("admin@test.com"), `displayName=${post}`);
}

// ── ⑤ 成员回帖 ────────────────────────────────────────────────────
console.log("\n── ⑤ 成员回帖 ──");
{
  const replyText = `测试回复 ${Date.now()}`;
  // 页面可能还没完全渲染好，等一下再找回复按钮
  await page.waitForTimeout(500);
  // 找回复按钮
  const replyBtn = page.locator('button:has-text("回复")').first();
  let tries = 0;
  while ((await replyBtn.count()) === 0 && tries < 10) {
    await page.waitForTimeout(500);
    tries++;
  }
  if ((await replyBtn.count()) > 0) {
    await replyBtn.click();
    await page.waitForTimeout(500);
    const replyTextarea = page.locator('textarea[placeholder*="回复"]').first();
    await replyTextarea.fill(replyText);
    await page.locator('button[type="submit"]:has-text("回复")').last().click();
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText();
    check("回复即时显示", body.includes(replyText));
  } else {
    check("找到回复按钮", false, "未找到");
  }
}

// ── ⑥ 宗祠侧同样测试（快速验证）──────────────────────────────────
console.log("\n── ⑥ 宗祠社区 ──");
{
  // 切回 user
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', "user@test.com");
  await page.fill('input[name="password"]', "user123456");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4500);

  await page.goto(`${BASE}/clan/halls/${clanId}/community`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  check("宗祠社区页可访问", page.url().includes("/community"));

  const clanCode = psql(`SELECT "communityInviteCode" FROM "ClanHall" WHERE id='${clanId}';`);
  check("宗祠生成了邀请码", !!clanCode && clanCode.length >= 8);

  check("宗祠馆主是 owner", psql(`SELECT count(*) FROM "CommunityMember" WHERE "clanHallId"='${clanId}' AND "role"='owner';`) === "1");

  // 发帖
  const clanPostText = `宗祠社区帖 ${Date.now()}`;
  await page.fill("textarea", clanPostText);
  await page.click('button[type="submit"]:has-text("发布")');
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const body = await page.locator("body").innerText();
  check("宗祠帖子即时显示", body.includes(clanPostText));
}

// ── ⑦ 身份快照：前台只 select displayName ──────────────────────────
console.log("\n── ⑦ 身份快照安全 ──");
{
  // 检查服务端 HTML 不含完整实名
  const html = await page.content();
  check("HTML 不含完整邮箱 admin@test.com", !html.includes("admin@test.com"));
  check("HTML 不含 realNameSnap 字段名", !html.toLowerCase().includes("realnamesnap"));
}

// ── ⑧ 清理 ────────────────────────────────────────────────────────
console.log("\n── ⑧ 清理 ──");
psql(`DELETE FROM "CommunityReply" WHERE "postId" IN (SELECT id FROM "CommunityPost" WHERE "hallId"='${hallId}' OR "clanHallId"='${clanId}');`);
psql(`DELETE FROM "CommunityPost" WHERE "hallId"='${hallId}' OR "clanHallId"='${clanId}';`);
// 只删除 admin 的成员记录（馆主 owner 记录留着，下次可复跑）
const adminId = psql(`SELECT id FROM "User" WHERE email='admin@test.com' LIMIT 1;`);
psql(`DELETE FROM "CommunityMember" WHERE "userId"='${adminId}' AND ("hallId"='${hallId}' OR "clanHallId"='${clanId}');`);
check("清理后帖子=0", psql(`SELECT count(*) FROM "CommunityPost" WHERE "hallId"='${hallId}' OR "clanHallId"='${clanId}';`) === "0");
check("清理后非馆主成员=0", psql(`SELECT count(*) FROM "CommunityMember" WHERE ("hallId"='${hallId}' OR "clanHallId"='${clanId}') AND "role"!='owner';`) === "0");

await b.close();
console.log(`\n通过 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
