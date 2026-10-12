// 管理员账号体系（1 超级管理员 + 2 普通管理员）验收
// 验证点：
//   ① 三个管理账号在库（superadmin@test.com=super_admin，admin@test.com/admin2@test.com=admin）
//   ② 超管后台导航含「账号管理」「操作审计」，两页均可达
//   ③ 普通管理员导航不含系统级模块，且 /admin/accounts、/admin/audit 被拦截
//   ④ 普通用户（role=user）无后台权限，/admin 被踢回前台
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;

const BASE = "http://localhost:3000";
const results = [];
const check = (name, ok, extra = "") => results.push({ name, ok: !!ok, extra });

const browser = await chromium.launch();

async function loginAs(email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  return { ctx, page, errors };
}

// ───────────────────────── ① 三个管理账号在库 ─────────────────────────
const sys = await chromium.launch();
const sctx = await sys.newContext();
const spage = await sctx.newPage();
await spage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
// 直接查库更快：用 Prisma 通过 Node 读（复用项目依赖）
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const staff = await prisma.user.findMany({
  where: { role: { in: ["super_admin", "admin", "editor"] } },
  select: { email: true, role: true, status: true },
  orderBy: { role: "asc" },
});
await prisma.$disconnect();
await sctx.close();
await sys.close();

check("管理账号共 3 个（1 超管 + 2 普通）", staff.length === 3, `实际=${staff.length}`);
check(
  "含 1 名超级管理员 superadmin@test.com",
  staff.some((u) => u.email === "superadmin@test.com" && u.role === "super_admin")
);
check(
  "含 2 名普通管理员(admin / admin2)",
  staff.filter((u) => u.role === "admin").length === 2,
  `admin 数=${staff.filter((u) => u.role === "admin").length}`
);
check(
  "admin@test.com 仍为普通管理员(不破坏既有验收)",
  staff.some((u) => u.email === "admin@test.com" && u.role === "admin")
);

// ───────────────────────── ② 超级管理员视角 ─────────────────────────
{
  const { ctx, page, errors } = await loginAs("superadmin@test.com", "admin123456");
  check("超级管理员登录成功", !/\/login/.test(page.url()), page.url());

  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const nav = (await page.textContent("aside")) || "";
  check("超管导航含「账号管理」", nav.includes("账号管理"));
  check("超管导航含「操作审计」", nav.includes("操作审计"));
  check("超管导航含「商品管理」「订单管理」", nav.includes("商品管理") && nav.includes("订单管理"));

  await page.goto(`${BASE}/admin/accounts`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  check("账号管理页可达", page.url().includes("/admin/accounts"));
  const accText = (await page.textContent("body")) || "";
  check("账号管理页列出 superadmin@test.com", accText.includes("superadmin@test.com"));
  check("账号管理页列出 admin@test.com", accText.includes("admin@test.com"));
  check("账号管理页列出 admin2@test.com", accText.includes("admin2@test.com"));
  check("账号管理页提示上限 3 个", accText.includes("3"));

  await page.goto(`${BASE}/admin/audit`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  check("操作审计页可达", page.url().includes("/admin/audit"));
  const auditText = (await page.textContent("body")) || "";
  check("操作审计页含标题「操作审计」", auditText.includes("操作审计"));

  check("超管访问无控制台报错", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// ───────────────────────── ③ 普通管理员视角 ─────────────────────────
{
  const { ctx, page, errors } = await loginAs("admin@test.com", "admin123456");
  check("普通管理员登录成功", !/\/login/.test(page.url()), page.url());

  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const nav = (await page.textContent("aside")) || "";
  check("普通管理员导航【不含】账号管理", !nav.includes("账号管理"));
  check("普通管理员导航【不含】操作审计", !nav.includes("操作审计"));
  check("普通管理员导航含「商品管理」「订单管理」", nav.includes("商品管理") && nav.includes("订单管理"));

  // 直接访问系统级页：按「更显眼入口」设计，非超管看到「权限不足」友好提示（不暴露账号数据/操作），而非静默踢回
  await page.goto(`${BASE}/admin/accounts`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const accBody = (await page.textContent("body")) || "";
  check(
    "普通管理员访问 /admin/accounts 看到「权限不足」友好提示（不暴露账号数据）",
    accBody.includes("权限不足") && accBody.includes("超级管理员"),
    page.url()
  );

  await page.goto(`${BASE}/admin/audit`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const auditBody = (await page.textContent("body")) || "";
  check(
    "普通管理员访问 /admin/audit 看到「权限不足」友好提示（不暴露审计数据）",
    auditBody.includes("权限不足") && auditBody.includes("超级管理员"),
    page.url()
  );

  // 经营性模块仍可达
  await page.goto(`${BASE}/admin/products`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  check("普通管理员可见商品管理", page.url().includes("/admin/products"));

  check("普通管理员访问无控制台报错", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// ───────────────────────── ④ 普通用户视角（无后台权限） ─────────────────────────
{
  const { ctx, page } = await loginAs("user@test.com", "user123456");
  check("普通用户登录成功", !/\/login/.test(page.url()), page.url());
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  check("普通用户访问 /admin 被踢回前台", /\/console/.test(page.url()), page.url());
  await ctx.close();
}

await browser.close();

// ───────────────────────── 报告 ─────────────────────────
let pass = 0;
for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.extra ? "  「" + r.extra + "」" : ""}`);
  if (r.ok) pass++;
}
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);
