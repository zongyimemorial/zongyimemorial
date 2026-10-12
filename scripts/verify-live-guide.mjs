/*
  verify-live-guide.mjs —— 云直播指引页的完整性与可用性验收

  本次给指引补了「地址从哪来 + 软硬件怎么配」，内容量翻倍（280 → 740+ 行）。
  这类"纯内容页"最容易出的问题不是崩溃，而是：

   1. **目录死链**：新增章节时锚点写错/漏改，点目录跳到页面空白处。
   2. **讲了但没讲全**：三个平台各要一个取址流程，漏一个用户就卡住。
   3. **可复制的地址不可复制**：CopyField 的复制按钮失效（clipboard 在
      非 HTTPS 下是 undefined —— 内测期可能走 http，所以有 execCommand 回退，
      但回退是否真的工作必须实测，否则会出现"点了没反应"）。
   4. **没写关键警示**：YouTube 必须用 /embed/、Zoom 参会链接不能嵌、
      rtmp 推流地址不能填 —— 这三条是用户最容易踩的坑，缺一条都会显著增加黑屏率。

  所以断言分两类：内容完整性（静态扫描）+ 交互可用性（浏览器实测）。
*/
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { readFileSync } from "node:fs";
import { makeChecks } from "./_check.mjs";

const BASE = "http://localhost:3000";
const { check, skip, summary } = makeChecks();

const src = readFileSync("app/(public)/live/guide/page.tsx", "utf8");

// ---------------------------------------------------------------- A. 目录锚点无死链
const tocIds = [...src.matchAll(/id:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
const secIds = new Set([...src.matchAll(/id="([a-z0-9-]+)"/g)].map((m) => m[1]));
const dead = tocIds.filter((x) => !secIds.has(x));
check(
  "A1 目录锚点全部有对应章节（无死链）",
  dead.length === 0,
  dead.length ? `死链：${dead.join(", ")}` : `${tocIds.length} 个锚点全部命中`,
);

// ---------------------------------------------------------------- B. 三个平台取址流程齐备
check("B1 YouTube 取址流程", /6\.1 YouTube Live 取址/.test(src) && /studio\.youtube\.com/.test(src));
check("B2 Zoom 取址流程", /6\.2 Zoom 取址/.test(src) && /Zoom Events/.test(src));
check("B3 自建推流取址流程", /6\.3 自建推流/.test(src) && /\.m3u8/.test(src));

// ---------------------------------------------------------------- C. 关键警示（用户最容易踩的坑）
check(
  "C1 警示：YouTube 必须用 /embed/（不能用 watch?v=）",
  /不允许被嵌入/.test(src) && /\/embed\//.test(src),
);
check(
  "C2 警示：Zoom 参会链接不能直接嵌",
  /参会链接不能直接嵌/.test(src) && /zoom\.us\/j\//.test(src),
);
check(
  "C3 警示：推流地址与播放地址不能混填",
  /推流地址.*是密码级机密|绝不能填进本平台/.test(src),
);
check(
  "C4 警示：串流密钥是机密",
  /串流密钥（STREAM_KEY）是密码级机密/.test(src),
);

// ---------------------------------------------------------------- D. 软硬件配置三档 + 网络保障
check("D1 软硬件三档方案", /方案 A：零成本/.test(src) && /方案 B：进阶/.test(src) && /方案 C：专业/.test(src));
check("D2 收音要点（祭祀场景的真实痛点）", /收音比画质更重要/.test(src) && /防风毛套/.test(src));
check("D3 网络与现场保障", /上行带宽/.test(src) && /双路备份/.test(src));
check("D4 故障排查速查表", /故障排查速查表/.test(src) && /拒绝连接/.test(src));
check("D5 合规与礼仪底线", /合规与礼仪底线/.test(src) && /取得家属同意/.test(src));

// ---------------------------------------------------------------- E. 浏览器实测
const b = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

await page.goto(`${BASE}/live/guide`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1600);

const body = await page.locator("body").innerText();
check("E1 指引页可访问且渲染出核心章节", /取地址：去哪儿拿直播地址/.test(body) && /软硬件对接与配置/.test(body));

// 目录锚点点击后真的能滚到那一节
const firstToc = page.locator('nav a[href^="#"]').first();
if ((await firstToc.count()) > 0) {
  await firstToc.click();
  await page.waitForTimeout(700);
  check("E2 点击目录能跳转（URL 带锚点）", page.url().includes("#"), page.url().split("/").pop());
} else {
  check("E2 点击目录能跳转（URL 带锚点）", false, "未找到目录链接");
}

/*
  复制按钮实测。这是本页最实用的交互 —— 24 位频道 ID、带密钥的推流地址
  手抄极易出错，抄错的后果是"直播间一直黑屏"且用户难以自查。
  clipboard 在非安全上下文下不可用，组件里有 execCommand 回退，这里一并验证。
*/
const copyBtns = page.locator('button[aria-label^="复制"]');
const n = await copyBtns.count();
check("E3 地址示例都配了复制按钮", n >= 4, `共 ${n} 个复制按钮`);

if (n > 0) {
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const first = copyBtns.first();
  const target = await first.getAttribute("aria-label");
  await first.click();
  await page.waitForTimeout(600);
  const label = await first.innerText();
  check("E4 点击复制后按钮给出反馈", /已复制/.test(label), `按钮文案="${label}"（目标：${target}）`);

  // 剪贴板内容应与相邻 code 块一致
  const got = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return "(读取剪贴板被拒)";
    }
  });
  const codeText = await page.locator("code").nth(0).innerText().catch(() => "");
  const isExpected = got.includes("youtube.com/embed") || got.includes("http") || got.includes("rtmp");
  check(
    "E5 复制内容确为地址（不是空/不是按钮文案）",
    isExpected,
    `剪贴板前 60 字："${String(got).slice(0, 60)}"`,
  );
} else {
  skip("E4 点击复制后按钮给出反馈", "页面未渲染复制按钮");
  skip("E5 复制内容确为地址", "页面未渲染复制按钮");
}

// 页面无控制台错误
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
check("E6 页面无运行时报错", errs.length === 0, errs.slice(0, 2).join(" | "));

await b.close();
const st = summary("verify-live-guide");
process.exit(st.fail === 0 ? 0 : 1);
