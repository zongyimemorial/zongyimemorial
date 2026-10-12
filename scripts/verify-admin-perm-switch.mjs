// 权限切换冒烟（细粒度 RBAC）：验证超级管理员可在「账号管理 → 模块权限设置」中
// 为某个普通管理员单独收回 / 恢复模块权限，且切换后该管理员的后台导航与访问随之变化。
//   ① 超管登录 → 进入账号管理页
//   ② 收回 admin@test.com 的「商品管理 products」「订单管理 orders」
//   ③ 以 admin@test.com 登录 → 导航【不含】商品管理/订单管理，且 /admin/products 被拦截
//   ④ 超管恢复 admin@test.com 全部默认权限
//   ⑤ 再次以 admin@test.com 登录 → 导航【含】商品管理/订单管理
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

// 在「某邮箱所在卡片」内定位（按 p-4 卡片 + 邮箱文本 + 内含 perm 表单精确定位）
const cardOf = (page, email) =>
  page.locator("div.p-4", { hasText: email }).filter({
    has: page.locator('input[name="perm"]'),
  });

// ───────── ① 超管登录并进入账号管理 ─────────
{
  const { ctx, page, errors } = await loginAs("superadmin@test.com", "admin123456");
  await page.goto(`${BASE}/admin/accounts`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const body = (await page.textContent("body")) || "";
  check("超管可见「模块权限设置」区", body.includes("模块权限设置"), "");

  // 该账号的「商品管理 / 订单管理」复选框初始应为勾选态
  const prodCb = cardOf(page, "admin@test.com").locator('input[name="perm"][value="products"]');
  const orderCb = cardOf(page, "admin@test.com").locator('input[name="perm"][value="orders"]');
  check("admin@test.com 的「商品管理」初始勾选", await prodCb.isChecked());
  check("admin@test.com 的「订单管理」初始勾选", await orderCb.isChecked());

  // ② 收回两个模块
  await prodCb.uncheck();
  await orderCb.uncheck();
  const saveBtn = cardOf(page, "admin@test.com").locator('button[type="submit"]');
  await saveBtn.click();
  await page.waitForTimeout(2500);

  check("收回后无控制台报错", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// 查询 DB 验证权限已写入（products/orders 不在 admin@test.com 的 permissions 中）
import { PrismaClient } from "@prisma/client";
{
  const prisma = new PrismaClient();
  const u = await prisma.user.findUnique({
    where: { email: "admin@test.com" },
    select: { permissions: true },
  });
  await prisma.$disconnect();
  const perms = u?.permissions ?? [];
  check("DB: admin@test.com 已不含 products", !perms.includes("products"), `perms=${JSON.stringify(perms)}`);
  check("DB: admin@test.com 已不含 orders", !perms.includes("orders"), `perms=${JSON.stringify(perms)}`);
  check("DB: admin@test.com 仍含 monitor(其余保留)", perms.includes("monitor"), `perms=${JSON.stringify(perms)}`);
}

// ───────── ③ 以 admin@test.com 登录验证导航变化 ─────────
{
  const { ctx, page, errors } = await loginAs("admin@test.com", "admin123456");
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const nav = (await page.textContent("aside")) || "";
  check("收回后：admin 导航【不含】商品管理", !nav.includes("商品管理"), "");
  check("收回后：admin 导航【不含】订单管理", !nav.includes("订单管理"), "");
  check("收回后：admin 导航仍含「内容管理」", nav.includes("内容管理"), "");

  // 直接访问被收回的模块应被拦截（路由守卫踢回 /admin）
  await page.goto(`${BASE}/admin/products`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  check("收回后：admin 访问 /admin/products 被拦截", !page.url().includes("/admin/products"), page.url());

  check("admin 访问无控制台报错", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// ───────── ④ 超管恢复 admin@test.com 全部默认权限 ─────────
{
  const { ctx, page } = await loginAs("superadmin@test.com", "admin123456");
  await page.goto(`${BASE}/admin/accounts`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  // 点击「全选」后再保存，等价于恢复全部 11 个模块
  const selectAll = cardOf(page, "admin@test.com").locator("button", { hasText: "全选" });
  await selectAll.click();
  await page.waitForTimeout(300);
  const saveBtn = cardOf(page, "admin@test.com").locator('button[type="submit"]');
  await saveBtn.click();
  await page.waitForTimeout(2500);
  await ctx.close();
}

// 验证恢复
{
  const prisma = new PrismaClient();
  const u = await prisma.user.findUnique({
    where: { email: "admin@test.com" },
    select: { permissions: true },
  });
  await prisma.$disconnect();
  const perms = u?.permissions ?? [];
  check("恢复后：DB 含 products", perms.includes("products"), `perms=${JSON.stringify(perms)}`);
  check("恢复后：DB 含 orders", perms.includes("orders"), `perms=${JSON.stringify(perms)}`);
}

// ───────── ⑤ 再次以 admin@test.com 登录验证恢复生效 ─────────
{
  const { ctx, page } = await loginAs("admin@test.com", "admin123456");
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const nav = (await page.textContent("aside")) || "";
  check("恢复后：admin 导航【含】商品管理", nav.includes("商品管理"), "");
  check("恢复后：admin 导航【含】订单管理", nav.includes("订单管理"), "");
  await ctx.close();
}

await browser.close();

let pass = 0;
for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.extra ? "  「" + r.extra + "」" : ""}`);
  if (r.ok) pass++;
}
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);
