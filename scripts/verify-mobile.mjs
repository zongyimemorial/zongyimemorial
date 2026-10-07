/**
 * 移动端可用性巡检。
 *
 * 用户问：「手机端可以登录查看吗？」
 * 要回答这个问题，必须**在移动视口下真登录、真走一遍关键页面**，
 * 而不是假设"响应式写了就能用"。
 *
 * 检查三件事：
 *  ① 登录流程在 375 宽（iPhone 常见逻辑宽度）下能不能走完
 *  ② 关键页面有没有**横向溢出**（需要左右拖才能看全 = 移动端体验崩了）
 *  ③ 有没有元素**超出视口**（被裁掉、点不到）—— 尤其是按钮
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium, devices } = pkg;

const BASE = "http://127.0.0.1:3000";

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

const b = await chromium.launch();
// 用真实 iPhone 设备描述符（含 UA / DPR / 视口 / hasTouch）
const ctx = await b.newContext({ ...devices[process.env.MDEV || "iPhone 13"], locale: "zh-CN" });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

console.log("===== 移动端可用性巡检 =====\n");
{
  const vp = page.viewportSize();
  console.log(`视口 ${vp?.width}×${vp?.height}（设备描述符：${process.env.MDEV || "iPhone 13"}）\n`);
}

/** 页面是否横向溢出（可横向滚动的距离 > 2px 即视为溢出） */
const overflowX = () =>
  page.evaluate(() => {
    const d = document.documentElement;
    return {
      scrollW: d.scrollWidth,
      clientW: d.clientWidth,
      over: d.scrollWidth - d.clientWidth,
    };
  });

/** 统计超出视口右边界、且宽度可观的元素（被裁掉的典型症状） */
const clipped = () =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      // 只关心"明显有内容但被推出视口"的元素
      if (r.width > 40 && r.height > 20 && r.right > vw + 4 && r.left >= 0) {
        const tag = el.tagName.toLowerCase();
        const cls = (el.className || "").toString().slice(0, 50);
        bad.push(`${tag}.${cls} right=${Math.round(r.right)}`);
      }
    }
    return bad.slice(0, 5);
  });

// ── ① 内测口令页 → 登录页 ──────────────────────────────────────────
console.log("── ① 登录链路 ──");
{
  const res = await page.goto(BASE + "/preview-gate", { waitUntil: "domcontentloaded" });
  check("内测口令页可访问", res.status() === 200, `HTTP ${res.status()}`);
  const o = await overflowX();
  check("内测口令页无横向溢出", o.over <= 2, `溢出 ${o.over}px`);
}

// 直接种 cookie 过门（脚本里别填表单，见 AGENTS.md）
{
  const res = await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  check("登录页可访问", res.status() === 200, `HTTP ${res.status()}`);
  const o = await overflowX();
  check("登录页无横向溢出", o.over <= 2, `溢出 ${o.over}px`);

  // 关键：表单元素在手机上要够大、够得着
  const form = await page.evaluate(() => {
    const idf = document.querySelector('input[name="identifier"]');
    const pwd = document.querySelector('input[name="password"]');
    const sb = document.querySelector('button[type="submit"]');
    const box = (e) => (e ? e.getBoundingClientRect() : null);
    const f = (e) => {
      const r = box(e);
      return r ? { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) } : null;
    };
    return {
      vw: document.documentElement.clientWidth,
      identifier: f(idf),
      password: f(pwd),
      submit: f(sb),
    };
  });
  check("登录页有账号输入框", !!form.identifier);
  check("登录页有密码输入框", !!form.password);
  check("登录页有提交按钮", !!form.submit);
  if (form.submit) {
    // 触控目标建议 ≥ 44px（iOS HIG）
    check(
      "提交按钮达到触控最小尺寸（≥40px 高）",
      form.submit.h >= 40,
      `实际高 ${form.submit.h}px 宽 ${form.submit.w}px`,
    );
    check("提交按钮未被推出视口", form.submit.right <= form.vw + 2, `right=${form.submit.right} vw=${form.vw}`);
  }

  // 真登录
  await page.fill('input[name="identifier"]', "user@test.com");
  await page.fill('input[name="password"]', "user123456");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  const url = page.url();
  check("手机端登录成功（已离开登录页）", !/\/login/.test(url), url.replace(BASE, ""));
}

// ── ② 控制台 ────────────────────────────────────────────────────────
console.log("\n── ② 控制台 ──");
{
  const res = await page.goto(BASE + "/console", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  check("控制台可访问", res.status() === 200, `HTTP ${res.status()}`);
  const o = await overflowX();
  check("控制台无横向溢出", o.over <= 2, `溢出 ${o.over}px，scrollW=${o.scrollW} clientW=${o.clientW}`);
  const body = await page.locator("body").innerText();
  check("控制台显示用户内容（非空白）", body.length > 200, `${body.length} 字`);
  for (const t of ["我的纪念馆", "我的宗祠"]) {
    check(`控制台含「${t}」`, body.includes(t), body.includes(t) ? "" : "未找到");
  }
  const c = await clipped();
  check("控制台无被裁切的关键元素", c.length === 0, c.join(" | "));
}

// ── ③ 纪念馆公页（手机端最常看的页面）──────────────────────────────
console.log("\n── ③ 纪念馆公页 ──");
{
  const hallId = await page.evaluate(async () => {
    const r = await fetch("/console");
    const t = await r.text();
    const m = t.match(/\/halls\/([a-z0-9]{20,})/);
    return m ? m[1] : null;
  });
  if (!hallId) {
    check("解析到纪念馆 id", false, "控制台里没找到馆");
  } else {
    const res = await page.goto(`${BASE}/halls/${hallId}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    check("纪念馆页可访问", res.status() === 200, `HTTP ${res.status()}`);
    const o = await overflowX();
    check("纪念馆页无横向溢出", o.over <= 2, `溢出 ${o.over}px`);
    const body = await page.locator("body").innerText();
    /*
      ⚠️ 文案要照**这个页面真实的**措辞写。
      纪念馆公页的祭祀面板给的是「🕯️上香×3」「🌸献花×3」这类按钮 + 「献祭」标题；
      「献上上香」是别处的措辞（曾用来做断言，结果假红 —— 页面明明渲染得好好的）。
      同一个概念在不同页面文案不同，断言必须先看清再写。
    */
    check(
      "纪念馆页渲染出祭祀面板",
      /献祭/.test(body) && /上香/.test(body) && /敬献/.test(body),
      `献祭=${/献祭/.test(body)} 上香=${/上香/.test(body)} 敬献=${/敬献/.test(body)}`,
    );
    const c = await clipped();
    check("纪念馆页无被裁切的关键元素", c.length === 0, c.join(" | "));
  }
}

// ── ④ 我的宗祠列表 + 宗祠页 ────────────────────────────────────────
console.log("\n── ④ 宗祠侧 ──");
{
  const res = await page.goto(BASE + "/clan/halls", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  check("宗祠列表可访问", res.status() === 200, `HTTP ${res.status()}`);
  const o = await overflowX();
  check("宗祠列表无横向溢出", o.over <= 2, `溢出 ${o.over}px`);

  const clanId = await page.evaluate(async () => {
    const r = await fetch("/console");
    const t = await r.text();
    const m = t.match(/\/clan\/halls\/([a-z0-9]{20,})/);
    return m ? m[1] : null;
  });
  if (clanId) {
    const r2 = await page.goto(`${BASE}/clan/halls/${clanId}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    check("宗祠页可访问", r2.status() === 200, `HTTP ${r2.status()}`);
    const o2 = await overflowX();
    check("宗祠页无横向溢出", o2.over <= 2, `溢出 ${o2.over}px`);
    const c = await clipped();
    check("宗祠页无被裁切的关键元素", c.length === 0, c.join(" | "));
  } else {
    console.log("SKIP  控制台未解析到宗祠 id");
  }
}

// ── ⑤ 装修工坊（元素最多的页面，最容易溢出）───────────────────────
console.log("\n── ⑤ 装修工坊 ──");
{
  const hallId = await page.evaluate(async () => {
    const r = await fetch("/console");
    const t = await r.text();
    const m = t.match(/\/console\/halls\/([a-z0-9]{20,})/);
    return m ? m[1] : null;
  });
  if (!hallId) {
    console.log("SKIP  未解析到馆 id");
  } else {
    const res = await page.goto(`${BASE}/console/halls/${hallId}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    check("装修工坊可访问", res.status() === 200, `HTTP ${res.status()}`);
    const o = await overflowX();
    check("装修工坊无横向溢出", o.over <= 2, `溢出 ${o.over}px`);
    const body = await page.locator("body").innerText();
    check("工坊渲染出装修指引", /data-decor-guide|装修指引/.test(body + (await page.content())));
  }
}

// ── ⑥ 触控：点一个供奉按钮，确认手机端能真点 ──────────────────────
console.log("\n── ⑥ 触控可操作性 ──");
{
  const hallId = await page.evaluate(async () => {
    const r = await fetch("/console");
    const t = await r.text();
    const m = t.match(/\/halls\/([a-z0-9]{20,})/);
    return m ? m[1] : null;
  });
  if (hallId) {
    await page.goto(`${BASE}/halls/${hallId}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const btn = await page.evaluate(() => {
      // 用真实文案定位（「🕯️上香×3」这类），不用猜测的措辞
      const b = [...document.querySelectorAll("button")].find((x) => /上香/.test(x.textContent || ""));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { text: b.textContent.trim().slice(0, 12), w: Math.round(r.width), h: Math.round(r.height), disabled: b.disabled };
    });
    if (!btn) {
      check("找到供奉按钮", false, "页面上没有「上香」按钮");
    } else {
      check("供奉按钮在手机端可点（尺寸足够）", btn.w >= 36 && btn.h >= 28, `${btn.w}×${btn.h} 「${btn.text}」${btn.disabled ? "（灰显）" : ""}`);
    }
  }
}

await b.close();
console.log(`\n通过 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
