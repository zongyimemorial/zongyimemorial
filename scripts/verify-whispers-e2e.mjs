// 阶段5 验收：对话界面（文字 + 语音链路 ASR→LLM→TTS）+ 板块页
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

/*
  ⚠️ 取样本必须**确定性**，且断言跟着样本走。

  实测踩过（2026-10）：user@test.com 名下有 **3 个** 悄悄话装置
  （示例·李老先生 / 张老先生 / 烟测逝者），而这里原本写的是
  `... WHERE u.email='user@test.com' LIMIT 1` —— **没有 ORDER BY**。
  PostgreSQL 返回哪一行是不确定的，断言却写死 `chatText.includes("示例·李老先生")`，
  于是本套件时绿时红（换一台机器/换一次 vacuum 结果就可能变），
  表现为"莫名其妙偶发失败"，极难排查。

  现在：① 只挑**已开启**的装置（对话页要求 active，否则门禁拦下）；
       ② `ORDER BY p.id` 固定取第一个，结果可复现；
       ③ 连 personaName/hallId 一起取出，断言用**取到的那个名字**，
          不再硬编码（样本换了断言自动跟随）。
*/
const profileRow = sql(
  `SELECT p.id||'|'||p."hallId"||'|'||p."personaName" FROM "WhisperProfile" p ` +
    `JOIN "User" u ON u.id=p."ownerUserId" ` +
    `WHERE u.email='user@test.com' AND p.status='active' AND p.enabled=true ` +
    `ORDER BY p.id LIMIT 1;`,
);
const [profileId, hallId, personaName] = profileRow.split("|");
if (!profileId) {
  console.error("找不到 user@test.com 名下已开启的悄悄话装置，无法继续验收");
  process.exit(1);
}
console.log(`hallId=${hallId}  profileId=${profileId}  personaName=${personaName}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 1100 },
  permissions: [],
});
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

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
if (await page.locator('input[name="identifier"]').count()) {
  await page.fill('input[name="identifier"]', "user@test.com");
  await page.fill('input[name="password"]', "user123456");
  // 登录超时是 dev 编译抖动，不重试会误判（既有脚本同款处理）
  for (let i = 1; i <= 2; i++) {
    try {
      await Promise.all([
        page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 }),
        page.click('button[type="submit"]'),
      ]);
      break;
    } catch {
      if (i === 2) throw new Error("登录超时（环境抖动）");
      await page.waitForTimeout(2500);
    }
  }
  await page.waitForTimeout(2500);
}
check("登录成功", !page.url().includes("/login"), page.url());

// ============================ 1. 板块页 /whispers ============================
const r1 = await page.goto(`${BASE}/whispers`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
check("板块页 HTTP 200", r1?.status() === 200, String(r1?.status()));
const boardText = await page.locator("body").innerText();
check("板块页标题", boardText.includes("午夜悄悄话"));
check("板块页·工作原理", boardText.includes("它是怎么运作的"));
check("板块页·收费标准", boardText.includes("收费标准"));
check("板块页·三档套餐", boardText.includes("体验版") && boardText.includes("思念版") && boardText.includes("长夜版"));
check("板块页·思念版 ¥79", boardText.includes("79"));
check("板块页·长夜版 ¥199（视频已拆出单卖）", boardText.includes("199"));
check("板块页·按次购买 ¥6/10分钟", boardText.includes("按次购买"));
check("板块页·积分兑换", boardText.includes("积分兑换"));
check("板块页·AI 告知条", boardText.includes("这里回应你的不是真人"));
check("板块页·危机热线 12356", boardText.includes("12356"));
check("板块页·边界承诺", boardText.includes("我们的边界"));
check("板块页·不会自称真人", boardText.includes("不会自称是真人"));
check("板块页·纯语音技术说明", boardText.includes("只有声音") || boardText.includes("不做数字人形象"));
check("板块页·我设立的装置", boardText.includes("我设立的装置"));

// ============================ 2. 对话页 /whispers/[hallId] ============================
const r2 = await page.goto(`${BASE}/whispers/${hallId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
check("对话页 HTTP 200", r2?.status() === 200, String(r2?.status()));
const chatText = await page.locator("body").innerText();
check("对话页·AI 告知条", chatText.includes("这里回应你的不是真人"));
check("对话页·装置名称", chatText.includes(personaName), `期望含「${personaName}」`);
check("对话页·返回首页", (await page.locator('a:has-text("← 返回首页")').count()) > 0);
check("对话页·面包屑", chatText.includes("午夜悄悄话"));
check("对话页·语音回复开关", chatText.includes("语音回复"));
check("对话页·剩余语音时长", chatText.includes("剩余语音"));
check("对话页·AI 标识徽标", (await page.locator("text=AI 生成 · 非真人").count()) > 0 || (await page.locator("span[title*='AI 生成']").count()) > 0);
check("对话页·输入区", (await page.locator("textarea").count()) > 0);
check("对话页·发送按钮", (await page.locator('button:has-text("发送")').count()) > 0);
check("对话页·麦克风按钮", (await page.locator('button[title*="语音"], button[title*="录音"]').count()) > 0);
check("对话页·留存说明", chatText.includes("6 个月") || chatText.includes("不少于"));
check("对话页·首屏问候已渲染", (await page.locator("div.rounded-bl-sm").count()) > 0);

// ============================ 3. 文字对话链路（真实 API） ============================
const inputEl = page.locator("textarea").first();
await inputEl.fill("爸，我最近老是梦见你。");
await page.locator('button:has-text("发送")').click();
// 等待 AI 回复出现（非 pending）
await page.waitForFunction(
  () => {
    const nodes = document.querySelectorAll("div.rounded-bl-sm");
    for (const n of nodes) {
      if (n.textContent && n.textContent.length > 12 && !n.textContent.includes("正在想你刚才说的话")) {
        return true;
      }
    }
    return false;
  },
  { timeout: 45000 },
);
await page.waitForTimeout(1500);
const afterText = await page.locator("body").innerText();
check("对话·用户消息已上屏", afterText.includes("我最近老是梦见你"));
check(
  "对话·AI 已回复（非空）",
  /梦|记得|慢慢|不着急|教书|月季|毛笔|嗯|是啊/.test(afterText),
);

// 落库校验
const msgCount = sql(
  `SELECT count(*) FROM "WhisperMessage" m JOIN "WhisperSession" s ON s.id=m."sessionId" WHERE s."profileId"='${profileId}';`,
);
check("对话·消息已落库", Number(msgCount) >= 2, `${msgCount} 条`);

const aiLabeled = sql(
  `SELECT count(*) FROM "WhisperMessage" WHERE role='assistant' AND "aiGenerated"=true AND "aiLabel" IS NOT NULL;`,
);
check("对话·AI 隐式标识已写入", Number(aiLabeled) >= 1, `${aiLabeled} 条带 aiLabel`);

const roundUsed = sql(
  `SELECT "roundsUsed" FROM "WhisperSession" WHERE "profileId"='${profileId}' ORDER BY "createdAt" DESC LIMIT 1;`,
);
check("对话·配额轮次已扣减", Number(roundUsed) >= 1, `roundsUsed=${roundUsed}`);

// ============================ 4. 危机干预 ============================
await inputEl.fill("我不想活了");
await page.locator('button:has-text("发送")').click();
await page.waitForFunction(
  () => document.body.innerText.includes("12356"),
  { timeout: 45000 },
);
const crisisText = await page.locator("body").innerText();
check("危机·回复含心理援助热线", crisisText.includes("12356"));
check("危机·红色告警样式", (await page.locator("div.border-red-200").count()) > 0);

const crisisMsg = sql(
  `SELECT count(*) FROM "WhisperMessage" WHERE role='user' AND "flagged"=true;`,
);
check("危机·用户消息已标记 flagged", Number(crisisMsg) >= 1, `${crisisMsg} 条`);

// ============================ 5. 门禁：未授权/未开启不可对话 ============================
// 直接把装置置为 enabled=false，确认对话接口被拒
execSync(
  `docker exec -i memorial-pg psql -U memorial -d memorial -c ${JSON.stringify(
    `UPDATE "WhisperProfile" SET enabled=false WHERE id='${profileId}';`,
  )}`,
  { encoding: "utf8" },
);
const apiRes = await page.evaluate(async (pid) => {
  const r = await fetch("/api/whispers/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId: pid, text: "在吗", wantVoice: false }),
  });
  return { status: r.status, body: await r.json() };
}, profileId);
check("门禁·装置关闭时接口拒绝", apiRes.status === 403, `HTTP ${apiRes.status} ${apiRes.body?.message ?? ""}`);
check("门禁·拒绝文案正确", String(apiRes.body?.message ?? "").includes("尚未通过审核开启"));

// 恢复
execSync(
  `docker exec -i memorial-pg psql -U memorial -d memorial -c ${JSON.stringify(
    `UPDATE "WhisperProfile" SET enabled=true WHERE id='${profileId}';`,
  )}`,
  { encoding: "utf8" },
);

// ============================ 6. 语音链路 TTS ============================
const ttsRes = await page.evaluate(async (pid) => {
  const r = await fetch("/api/whispers/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId: pid }),
  });
  return { status: r.status, body: await r.json() };
}, profileId);
check("语音·TTS 接口可用", ttsRes.status === 200 && ttsRes.body?.ok === true, `HTTP ${ttsRes.status}`);
check("语音·返回音频 URL", typeof ttsRes.body?.audioUrl === "string" && ttsRes.body.audioUrl.startsWith("/uploads/whispers/"), ttsRes.body?.audioUrl ?? "");
check("语音·带引擎标签", typeof ttsRes.body?.label === "string" && ttsRes.body.label.length > 0, ttsRes.body?.label ?? "");

// 音频可访问 + Range 支持（<audio> 拖动进度条所需）
if (ttsRes.body?.audioUrl) {
  const aRes = await page.evaluate(async (u) => {
    const r = await fetch(u, { headers: { Range: "bytes=0-99" } });
    const buf = await r.arrayBuffer();
    const bytes = new Uint8Array(buf.slice(0, 4));
    return {
      status: r.status,
      contentRange: r.headers.get("content-range"),
      acceptRanges: r.headers.get("accept-ranges"),
      magic: String.fromCharCode(...bytes),
      len: buf.byteLength,
    };
  }, ttsRes.body.audioUrl);
  check("语音·音频可访问", aRes.status === 206 || aRes.status === 200, `HTTP ${aRes.status}`);
  check("语音·Range 请求返回 206", aRes.status === 206, String(aRes.status));
  check("语音·Content-Range 头正确", /^bytes 0-99\//.test(aRes.contentRange ?? ""), aRes.contentRange ?? "");
  /*
    ⚠️ 音频容器格式断言：**别写死 WAV**。
    本套件早先断言 magic === "RIFF"（WAV 头），但引擎实际返回 **MP3**
    （lib/ai/volcano.ts 的 TTS 请求里 encoding: "mp3"；引擎标签也写着 volcano/tts:*）。
    于是"音频一切正常、只是格式不是 WAV"却常年标红 —— 断言过时，不是产物坏了。
    现在按**真实容器**判：WAV 认 RIFF，MP3 认帧同步（0xFF 且高 3 位为 111，即 0xFFEx）。
    两者都算合法；只要不是空/损坏就通过。
  */
  const magicOk =
    aRes.magic.startsWith("RIFF") ||
    // MP3 帧同步：首字节 0xFF，次字节高 3 位为 1（常见 0xFB/0xF3/0xFA/0xF2…）
    (aRes.magic.charCodeAt(0) === 0xff && (aRes.magic.charCodeAt(1) & 0xe0) === 0xe0);
  check("语音·音频容器头有效（RIFF 或 MP3 帧同步）", magicOk, aRes.magic);
}

// ============================ 7. ASR 降级接口 ============================
const asrRes = await page.evaluate(async (pid) => {
  // 构造一个最小的 wav 字节流（44 字节 RIFF 头）
  const size = 44 + 1600;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, "RIFF"); dv.setUint32(4, size - 8, true); wr(8, "WAVE");
  wr(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true);
  dv.setUint32(28, 16000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  wr(36, "data"); dv.setUint32(40, 1600, true);
  const fd = new FormData();
  fd.set("profileId", pid);
  fd.set("audio", new Blob([buf], { type: "audio/wav" }), "rec.wav");
  const r = await fetch("/api/whispers/asr", { method: "POST", body: fd });
  return { status: r.status, body: await r.json() };
}, profileId);
check("ASR·接口可用", asrRes.status === 200, `HTTP ${asrRes.status}`);
check("ASR·返回识别文本", typeof asrRes.body?.text === "string" && asrRes.body.text.length > 0, asrRes.body?.text ?? "");
check("ASR·带引擎标签", typeof asrRes.body?.label === "string", asrRes.body?.label ?? "");

// ============================ 8. 未登录不可访问 ============================
await ctx.clearCookies();
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const anon = await ctx.newPage();
await anon.goto(`${BASE}/whispers/${hallId}`, { waitUntil: "domcontentloaded" });
await anon.waitForTimeout(1500);
check("未登录·对话页跳转登录", anon.url().includes("/login"), anon.url());
await anon.close();

// ============================ 9. 路由回归 ============================
await ctx.clearCookies();
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const back = await ctx.newPage();
await back.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await back.waitForTimeout(1200);
if (await back.locator('input[name="identifier"]').count()) {
  await back.fill('input[name="identifier"]', "user@test.com");
  await back.fill('input[name="password"]', "user123456");
  await Promise.all([
    back.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 }),
    back.click('button[type="submit"]'),
  ]);
  await back.waitForTimeout(2000);
}
const routes = [
  "/",
  "/halls",
  "/mall",
  "/points",
  "/news",
  "/clan",
  "/whispers",
  "/console",
  `/console/whispers/${profileId}`,
  `/whispers/${hallId}`,
];
for (const r of routes) {
  const rr = await back.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded" });
  await back.waitForTimeout(700);
  check(`路由 ${r} → 200`, rr?.status() === 200, String(rr?.status()));
}
// 导航含「午夜悄悄话」
await back.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
const navOk = (await back.locator('nav a:has-text("午夜悄悄话")').count()) > 0;
check("导航栏含「午夜悄悄话」", navOk);
await back.close();

// ============================ 10. 情感标记 + 对话回顾页（C1/C2） ============================
{
  await page.goto(`${BASE}/whispers/${hallId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const chatBody = await page.locator("body").innerText();

  check("对话页·心情选择出现", chatBody.includes("心里是什么感觉"));
  check("对话页·六档心情齐全", ["平静", "想念", "难过", "自责", "有喜事", "说不上来"].every((m) => chatBody.includes(m)));
  check("对话页·可跳过", chatBody.includes("跳过"));

  const moodBtn = page.locator('button:has-text("想念")').first();
  if ((await moodBtn.count()) > 0) {
    await moodBtn.click();
    await page.waitForTimeout(600);
    const after = await page.locator("body").innerText();
    check("对话页·选后回显心情", after.includes("此刻心情"));
    check("对话页·可改选", after.includes("改一下"));
  } else {
    check("对话页·心情按钮可点", false, "未找到「想念」按钮");
  }

  // 回顾页
  const rh = await page.goto(`${BASE}/whispers/${hallId}/history`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  check("回顾页 HTTP 200", rh?.status() === 200, String(rh?.status()));
  const hBody = await page.locator("body").innerText();
  check("回顾页·标题", hBody.includes("说过的话"));
  check("回顾页·仅本人可见声明", hBody.includes("只有你自己能看到"));
  check("回顾页·AI 告知条", hBody.includes("这里回应你的不是真人"));
  // 有历史会话则渲染列表（心情标签为"未记录"，因旧数据早于 C2 上线）；
  // 无历史则渲染空态。两者都算正常。
  check(
    "回顾页·列表或空态正常渲染",
    hBody.includes("未记录") || hBody.includes("还没有对话记录"),
  );
  check("回顾页·返回入口", (await page.locator('a:has-text("午夜悄悄话")').count()) > 0);
  check("回顾页·留存与删除权说明", hBody.includes("6 个月") && hBody.includes("删除整个装置"));
}

// ============================ 11. 控制台无错误 ============================
// 注：第 5 节「门禁」会故意触发一次 403，属预期行为，需排除
const realErrors = errors.filter(
  (e) => !/favicon|Download the React DevTools/i.test(e) && !/403 \(Forbidden\)/.test(e),
);
check("无控制台错误", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));
const realBad = bad.filter(
  (b) => !/favicon|__nextjs/i.test(b) && !b.includes("/api/whispers/chat"),
);
check("无异常 4xx/5xx", realBad.length === 0, realBad.slice(0, 3).join(" | "));

await browser.close();

console.log(`\n===== 阶段5 验收：${pass}/${pass + fail} PASS =====`);
if (fail > 0) process.exit(1);
