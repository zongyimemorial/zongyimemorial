import { createRequire } from "module";
const require = createRequire("/workspace/");
const { PrismaClient } = require("@prisma/client");
const { chromium } = require("/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js");
import fs from "fs";
import path from "path";

const BASE = "http://localhost:3000";
const OWNER_EMAIL = "user@test.com";
const OWNER_PWD = "user123456";
const prisma = new PrismaClient();

let failures = 0;
function assert(cond, label) {
  if (!cond) { console.error("  ✗ FAIL:", label); failures++; }
  else console.log("  ✓", label);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function visitorText(ctxPage, url) {
  // 加 cache-buster：避免浏览器复用下架前缓存的 200 响应，确保拿到服务端真实状态
  const bust = url + (url.includes("?") ? "&" : "?") + "v=" + Date.now();
  await ctxPage.goto(bust, { waitUntil: "load" });
  await sleep(800);
  return (await ctxPage.locator("body").innerText().catch(() => "")) ?? "";
}

// 轮询 DB 直到 isPublic 达到期望值（dev 提交有延迟，避免固定 sleep 竞态）
async function waitDbPublic(id, expected, kind, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const row =
      kind === "纪念馆"
        ? await prisma.memorialHall.findUnique({ where: { id } })
        : await prisma.clanHall.findUnique({ where: { id } });
    if (row && row.isPublic === expected) return true;
    await sleep(300);
  }
  return false;
}

await (async () => {
  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
  const ts = Date.now();

  // 1) 建两座 active + 公开 的馆/祠（bare，无子数据）
  const hall = await prisma.memorialHall.create({
    data: {
      ownerUserId: owner.id,
      name: `可见性测试纪念馆_${ts}`,
      deceasedName: "测试逝者",
      status: "active",
      isPublic: true,
    },
  });
  const clan = await prisma.clanHall.create({
    data: {
      ownerUserId: owner.id,
      surname: "测",
      hallName: `可见性测试宗祠_${ts}`,
      name: "敦本堂",
      status: "active",
      isPublic: true,
    },
  });
  console.log("临时馆 id =", hall.id, " 临时祠 id =", clan.id);

  // 2) 浏览器：owner 登录 + visitor（仅 preview_auth，无会话）
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const ownerCtx = await browser.newContext();
  await ownerCtx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
  const ownerPage = await ownerCtx.newPage();
  await ownerPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sleep(1000);
  await ownerPage.fill('input[name="identifier"]', OWNER_EMAIL);
  await ownerPage.fill('input[name="password"]', OWNER_PWD);
  await Promise.all([
    ownerPage.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 }),
    ownerPage.click('button[type="submit"]'),
  ]).catch(() => {});
  await sleep(1200);

  const visitorCtx = await browser.newContext();
  await visitorCtx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
  const visitorPage = await visitorCtx.newPage();

  const targets = [
    {
      kind: "纪念馆",
      id: hall.id,
      hallName: hall.name,
      consoleUrl: `${BASE}/console/halls/${hall.id}`,
      publicUrl: `${BASE}/halls/${hall.id}`,
      republishBtn: "重新公开纪念馆",
    },
    {
      kind: "宗祠",
      id: clan.id,
      hallName: clan.hallName,
      consoleUrl: `${BASE}/console/clan-halls/${clan.id}`,
      publicUrl: `${BASE}/clan/halls/${clan.id}`,
      republishBtn: "重新公开宗祠",
    },
  ];

  for (const t of targets) {
    console.log(`\n===== ${t.kind} ${t.id} =====`);

    // 进入控制台
    await ownerPage.goto(t.consoleUrl, { waitUntil: "domcontentloaded" });
    await sleep(1800);

    // 软撤回区已挂载（用 HallVisibilityZone 独有的描述文案断言，避免与别处文案歧义）
    const zoneMounted = await ownerPage.getByText("馆内全部内容保留").count();
    assert(zoneMounted === 1, `${t.kind} 控制台渲染了「下架 / 撤回为私密草稿」区`);

    // 初始状态：已公开 + 下架按钮
    const hasWithdraw = await ownerPage.getByRole("button", { name: "下架并撤回为私密草稿" }).count();
    assert(hasWithdraw === 1, `${t.kind} 公开态显示「下架并撤回为私密草稿」按钮`);
    const badgePublic = await ownerPage.getByText("已公开（访客可访问）").count();
    assert(badgePublic === 1, `${t.kind} 状态徽标为「已公开（访客可访问）」`);

    // 访客视角：下架前公页可见馆名（内容级断言，不依赖 HTTP 状态码——
    // 本环境 notFound() 在 dev 下返回 200，故用"页面是否含馆名"判定可见性）
    const v1 = await visitorText(visitorPage, t.publicUrl);
    assert(v1.includes(t.hallName), `${t.kind} 下架前访客公页可见馆名（内容公开）`);

    // 点击下架
    await ownerPage.getByRole("button", { name: "下架并撤回为私密草稿" }).click();
    await sleep(800);
    const withdrawn = await waitDbPublic(t.id, false, t.kind);
    assert(withdrawn, `${t.kind} 下架后 DB isPublic=false`);
    const wlog = await prisma.auditLog.findFirst({
      where: { entityId: t.id, action: { contains: "withdraw" } },
    });
    assert(wlog !== null, `${t.kind} 已写入「撤回」审计日志`);

    // 访客视角：下架后公页不再含馆名（notFound 渲染，访客看不到私密馆）
    const v2 = await visitorText(visitorPage, t.publicUrl);
    assert(!v2.includes(t.hallName), `${t.kind} 下架后访客公页已隐藏馆名（仅馆主可见）`);

    // 控制台：变为私密 + 重新公开按钮
    await ownerPage.goto(t.consoleUrl, { waitUntil: "domcontentloaded" });
    await sleep(1500);
    const badgePrivate = await ownerPage.getByText("仅你可见（私密草稿）").count();
    assert(badgePrivate === 1, `${t.kind} 下架后状态徽标为「仅你可见（私密草稿）」`);
    const hasRepublish = await ownerPage.getByRole("button", { name: t.republishBtn }).count();
    assert(hasRepublish === 1, `${t.kind} 私密态显示「${t.republishBtn}」按钮`);

    // 点击重新公开
    await ownerPage.getByRole("button", { name: t.republishBtn }).click();
    await sleep(800);
    const republished = await waitDbPublic(t.id, true, t.kind);
    assert(republished, `${t.kind} 重新公开后 DB isPublic=true`);
    const rlog = await prisma.auditLog.findFirst({
      where: { entityId: t.id, action: { contains: "republish" } },
    });
    assert(rlog !== null, `${t.kind} 已写入「重新公开」审计日志`);

    // 访客视角：重新公开后公页再次可见馆名
    const v3 = await visitorText(visitorPage, t.publicUrl);
    assert(v3.includes(t.hallName), `${t.kind} 重新公开后访客公页再次可见馆名`);
  }

  // 3) 清理
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [hall.id, clan.id] } } });
  await prisma.memorialHall.delete({ where: { id: hall.id } });
  await prisma.clanHall.delete({ where: { id: clan.id } });
  for (const id of [hall.id, clan.id]) {
    const d = path.join(process.cwd(), "public/uploads/halls", id);
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
    const cd = path.join(process.cwd(), "public/uploads/clan-halls", id);
    if (fs.existsSync(cd)) fs.rmSync(cd, { recursive: true, force: true });
  }

  await ownerCtx.close();
  await visitorCtx.close();
  await browser.close();
  await prisma.$disconnect();

  console.log("\n软撤回 E2E 验证：", failures ? `存在 ${failures} 项失败` : "全部通过 ✅");
  process.exitCode = failures ? 1 : 0;
})().catch(async (e) => {
  console.error("脚本异常：", e);
  process.exitCode = 1;
  await prisma.$disconnect();
});
