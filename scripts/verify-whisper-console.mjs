// 阶段4 验收：追思装置管理台（生平资料库 / 声音克隆 / 家属授权 / 审核开关 · 纯语音）
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { execSync } from "node:child_process";
const { chromium } = pkg;

const BASE = "http://localhost:3000";
let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}  ${extra}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}  ${extra}`);
  }
}

function sql(q) {
  return execSync(
    `docker exec -i memorial-pg psql -U memorial -d memorial -t -A -F '|' -c ${JSON.stringify(q)}`,
    { encoding: "utf8" },
  ).trim();
}

// 取测试账号名下、属于 user@test.com 的追思装置
const profileId = sql(
  `SELECT p.id FROM "WhisperProfile" p JOIN "User" u ON u.id=p."ownerUserId" WHERE u.email='user@test.com' LIMIT 1;`,
);
console.log(`设备 ID: ${profileId}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

const errors = [];
const bad = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", (r) => {
  if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
});

/**
 * 登录（带重试）。
 *
 * 已知环境噪声：dev 服务器在按需重新编译时会阻塞响应，
 * 导致 waitForURL 超时——这不是登录功能坏了。
 * 重试一次即可稳定通过（与既有 login 类脚本的做法一致）。
 */
async function login(targetPage = page, email = "user@test.com", pwd = "user123456") {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await targetPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      await targetPage.waitForTimeout(1200);
      if (!(await targetPage.locator('input[name="identifier"]').count())) {
        // 已登录态
        if (!targetPage.url().includes("/login")) return true;
        continue;
      }
      await targetPage.fill('input[name="identifier"]', email);
      await targetPage.fill('input[name="password"]', pwd);
      await Promise.all([
        targetPage.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 }),
        targetPage.click('button[type="submit"]'),
      ]);
      await targetPage.waitForTimeout(2500);
      if (!targetPage.url().includes("/login")) return true;
    } catch (e) {
      console.log(`  [login] 第 ${attempt} 次超时（环境抖动），${attempt < 2 ? "重试…" : "放弃"}`);
      if (attempt === 2) return false;
      await targetPage.waitForTimeout(2000);
    }
  }
  return false;
}

await login();
check("登录成功", !page.url().includes("/login"), page.url());

// —— 1. 页面可达 ——
const resp = await page.goto(`${BASE}/console/whispers/${profileId}`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(1800);
check("管理台页面 HTTP 200", resp?.status() === 200, String(resp?.status()));
check(
  "标题含「追思装置」",
  (await page.locator("h1").first().innerText()).includes("追思装置"),
);

// —— 2. 六大区块齐全 ——
const body = await page.locator("body").innerText();
check("区块·生平资料库", body.includes("生平资料库"));
check("区块·声音克隆", body.includes("声音克隆"));
check("区块·家属授权", body.includes("家属授权"));
check("区块·提交审核", body.includes("提交审核"));
check("区块·无数字形象选择器", !body.includes("交流方式与数字形象"));
check("面包屑含控制台", body.includes("控制台"));
check("返回首页按钮存在", (await page.locator('a:has-text("← 返回首页")').count()) > 0);

// —— 3. 配额概览 ——
check("配额卡片·当前套餐", body.includes("当前套餐"));
check("配额卡片·剩余语音时长", body.includes("剩余语音时长"));
check("配额卡片·剩余对话轮次", body.includes("剩余对话轮次"));
check("配额卡片·积分余额", body.includes("积分余额"));

// —— 4. 生平资料库表单字段 ——
const lib = page.locator("section", { hasText: "生平资料库" }).first();
check("字段·称呼", (await lib.locator('input[name="personaName"]').count()) > 0);
check("字段·身份头衔", (await lib.locator('input[name="personTitle"]').count()) > 0);
check("字段·性格特征", (await lib.locator('input[name="traits"]').count()) > 0);
check("字段·生平概述", (await lib.locator('textarea[name="bio"]').count()) > 0);
check("字段·语气", (await lib.locator('input[name="tone"]').count()) > 0);
check("字段·方言口音", (await lib.locator('input[name="dialect"]').count()) > 0);
check("字段·习惯称呼", (await lib.locator('input[name="addressForm"]').count()) > 0);
check("字段·口头禅", (await lib.locator('textarea[name="catchphrases"]').count()) > 0);
check("字段·记忆条目", (await lib.locator('textarea[name="memories"]').count()) > 0);
check("字段·关系图谱", (await lib.locator('textarea[name="relationships"]').count()) > 0);
check("按钮·保存资料库", (await lib.locator('button:has-text("保存资料库")').count()) > 0);
check(
  "按钮·重新生成人格",
  (await lib.locator('button:has-text("保存并重新生成人格")').count()) > 0,
);

// 记忆条目已回填（seed 中 3 条 → 文本域非空）
const memVal = await lib.locator('textarea[name="memories"]').inputValue();
check("记忆条目已回填", memVal.split("\n").filter((l) => l.trim()).length >= 3, `${memVal.split("\n").filter((l) => l.trim()).length} 条`);

// —— 5. 声音克隆 ——
const vc = page.locator("section", { hasText: "声音克隆" }).first();
check("上传·声线名称", (await vc.locator('input[name="voiceName"]').count()) > 0);
check("上传·文件选择器", (await vc.locator('input[type="file"]').count()) > 0);
const acceptAttr = await vc.locator('input[type="file"]').first().getAttribute("accept");
check("文件选择器限定音频类型", !!acceptAttr && acceptAttr.includes("audio/"), acceptAttr ?? "");
check("预设声线区存在", (await vc.locator("text=系统预设声线").count()) > 0);
check("克隆声线区存在", (await vc.locator("text=我的克隆声线").count()) > 0);
check(
  "上传按钮·上传样本并创建声线",
  (await vc.locator('button:has-text("上传样本并创建声线")').count()) > 0,
);

// 有授权的账号：不应出现「尚未完成家属授权」告警
check("已授权时不显示克隆拦截", !(await vc.innerText()).includes("尚未完成家属授权"));

// —— 6. 家属授权 ——
const cf = page.locator("section", { hasText: "家属授权" }).first();
const cfText = await cf.innerText();
check("授权状态徽标", /授权有效|已撤回|未授权/.test(cfText));
check("字段·授权人姓名", (await cf.locator('input[name="applicantName"]').count()) > 0);
check("字段·关系", (await cf.locator('input[name="relation"]').count()) > 0);
check("字段·身份证号", (await cf.locator('input[name="applicantIdNo"]').count()) > 0);
check("字段·逝者意愿", (await cf.locator('textarea[name="deceasedWill"]').count()) > 0);
check("复选框·其他近亲属无异议", (await cf.locator('input[type="checkbox"]').count()) > 0);
check("法律依据·民法典994", cfText.includes("994"));
check("法律依据·民法典1019", cfText.includes("1019"));
check("法律依据·个人信息保护法", cfText.includes("个人信息保护法"));
check("撤回授权按钮", (await cf.locator('button:has-text("撤回授权")').count()) > 0);
check("身份证号不回显明文", !cfText.includes("110101"));

// —— 8. 审核开关 ——
const sr = page.locator("section", { hasText: "提交审核与开关" }).first();
const srText = await sr.innerText();
check("清单·家属授权", srText.includes("家属授权"));
check("清单·人格提示词", srText.includes("人格提示词"));
check(
  "提交审核按钮",
  (await sr.locator('button:has-text("送审"), button:has-text("提交审核")').count()) > 0,
);
check("合规存档说明", srText.includes("合规存档"));
check("合规存档·不少于 6 个月", srText.includes("6 个月"));

// —— 9. 数据删除权（危险操作区） ——
const dz = page.locator("section", { hasText: "删除追思装置" }).first();
check("区块·删除追思装置", (await dz.count()) > 0);
const dzText = await dz.innerText();
check("删除区·告知不可逆", /不可撤销|无法找回/.test(dzText));
check("删除区·引用个人信息保护法", dzText.includes("个人信息保护法"));
check("删除区·引用第 47 条", dzText.includes("47"));
check("删除区·声明删除范围（声线/样本）", dzText.includes("声线") && dzText.includes("样本"));
check("删除区·需展开确认（初始未显示输入框）", (await dz.locator('input[type="text"], input:not([type])').count()) === 0);
// 展开确认框
const openBtn = dz.locator('button:has-text("我要删除这个装置")');
if ((await openBtn.count()) > 0) {
  await openBtn.first().click();
  await page.waitForTimeout(400);
  const confirmInput = dz.locator("input").first();
  check("删除区·展开后出现名称确认输入", (await confirmInput.count()) > 0);
  const delBtn = dz.locator('button:has-text("确认永久删除")');
  check("删除区·确认按钮初始禁用", await delBtn.first().isDisabled());
  await confirmInput.fill("__wrong_name__");
  await page.waitForTimeout(300);
  check("删除区·名称不匹配仍禁用", await delBtn.first().isDisabled());
  // 用装置真实名称填（从页面 H1 读取，避免与 seed 选馆结果耦合）
  const h1 = await page.locator("h1").first().innerText();
  const realName = h1.replace(/^追思装置\s*·\s*/, "").trim();
  await confirmInput.fill(realName);
  await page.waitForTimeout(300);
  check("删除区·名称匹配后启用", !(await delBtn.first().isDisabled()), `名称=${realName}`);
  // 不实际点击删除——只验证守卫生效
  await dz.locator('button:has-text("取消")').first().click();
  await page.waitForTimeout(300);
  check("删除区·可取消", (await dz.locator('button:has-text("我要删除这个装置")').count()) > 0);
} else {
  check("删除区·展开按钮存在", false, "未找到「我要删除这个装置」");
}

// —— 10. 历史回顾入口 ——
check(
  "底部·查看我的对话记录入口",
  (await page.locator('a:has-text("查看我的对话记录")').count()) > 0,
);

// —— 11. 非馆主不得访问 ——
await ctx.clearCookies();
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page2 = await ctx.newPage();
await login(page2, "admin@test.com", "admin123456");
await page2.goto(`${BASE}/console/whispers/${profileId}`, { waitUntil: "domcontentloaded" });
await page2.waitForTimeout(1500);
check("非馆主被重定向（不被允许管理）", !page2.url().includes(`/console/whispers/${profileId}`), page2.url());
await page2.close();

// —— 12. 无控制台错误 / 无 4xx-5xx ——
const realErrors = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
check("无控制台错误", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));
const realBad = bad.filter((b) => !/favicon|__nextjs/i.test(b));
check("无 4xx/5xx 请求", realBad.length === 0, realBad.slice(0, 3).join(" | "));

await browser.close();

console.log(`\n===== 阶段4 验收：${pass}/${pass + fail} PASS =====`);
if (fail > 0) process.exit(1);
