/**
 * 板块拖拽排序验收套件（阶段7 · 拖拽编辑器）
 *
 * 验收点：
 *   §1 默认序：sectionOrder 为 null 时，公页按「现状 DOM 顺序」渲染（零回归）。
 *      纪念馆：profile（逝者：）在 tributes（追思记录）之前。
 *      宗祠：若干无条件板块标记齐全。
 *   §2 存储序生效：经 DB 写入交换序（tributes 调到 profile 之前）→ 页面顺序翻转。
 *   §3 不删板块：交换序下，原默认序里的板块标记依然都在。
 *   §4 硬文案 intact（宗祠）：堂号「」/当前陈设/字辈诗·派语/献祭·敬奉先祖/祭祀记录 仍在。
 *   §5 反向验证：§1 的「profile 在 tributes 前」在交换序页面应为 FALSE
 *      → 证明页面真的按存储序渲染（断言有牙齿）；随后还原 sectionOrder。
 *   §6 action 归属 + 落库：馆主在控制台拖拽后点保存，DB 的 sectionOrder 被写入（owner 路径）；
 *      非馆主访问该控制台页被重定向（与 action 共用的 loadHall 归属守卫生效）。
 *   §7 还原：sectionOrder 写回原始（null）。
 *
 * 前置：Next 已在 127.0.0.1:3000 运行；PostgreSQL 在容器 memorial-pg。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { execSync } from "node:child_process";
const { chromium } = pkg;

const BASE = "http://127.0.0.1:3000";
const USER = "user@test.com";
const USER_PW = "user123456";
const ADMIN = "admin@test.com";
const ADMIN_PW = "admin123456";

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

// ---- DB 助手（经容器执行 psql）----
function psql(sql) {
  return execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(sql)}`, {
    encoding: "utf8",
  });
}
function q1(sql) {
  return psql(sql).trim().split("\n")[0] ?? "";
}
// 把 sectionOrder 写回库（null 即清空）
function setOrder(table, id, order) {
  if (order === null) {
    psql(`update "${table}" set "sectionOrder"=NULL where id='${id}'`);
  } else {
    const json = JSON.stringify(order).replace(/'/g, "''");
    psql(`update "${table}" set "sectionOrder"='${json}'::jsonb where id='${id}'`);
  }
}

// HALL_DEFAULT_ORDER（与 lib/section-order.ts 保持一致，用于构造交换序）
const HALL_DEFAULT_ORDER = [
  "hero", "worship", "cover", "profile", "couplet", "paidTributes",
  "archive", "tributes", "community", "panorama", "decorInfo",
];

// 选一个 user@test.com 名下的 active 纪念馆
const HALL_ID = q1(
  `select "id" from "MemorialHall" where status='active' and "ownerUserId"=(select id from "User" where email='${USER}') limit 1`,
);
// 选一个 active+公开 宗祠（优先 user@test.com，否则 admin@test.com）
const CLAN_OWNER = q1(
  `select u.email from "ClanHall" c join "User" u on u.id=c."ownerUserId" where c.status='active' and c."isPublic"=true and u.email in ('${USER}','${ADMIN}') limit 1`,
);
const CLAN_ID = q1(
  `select c.id from "ClanHall" c join "User" u on u.id=c."ownerUserId" where c.status='active' and c."isPublic"=true and u.email='${CLAN_OWNER}' limit 1`,
);
const CLAN_HAS_POEM = CLAN_ID
  ? q1(`select case when "generationPoem" is not null and "generationPoem"<>'' then '1' else '0' end from "ClanHall" where id='${CLAN_ID}'`) === "1"
  : false;

console.log(`HALL_ID=${HALL_ID}  CLAN_ID=${CLAN_ID} (owner=${CLAN_OWNER}, hasPoem=${CLAN_HAS_POEM})`);
check("找到 user@test.com 名下的 active 纪念馆", !!HALL_ID, HALL_ID);
check("找到 active+公开 宗祠", !!CLAN_ID, CLAN_ID);

const browser = await chromium.launch();
const errors = [];

// 记录原始 sectionOrder 以便还原
const origHallOrder = q1(`select "sectionOrder" from "MemorialHall" where id='${HALL_ID}'`).trim();
const origClanOrder = q1(`select "sectionOrder" from "ClanHall" where id='${CLAN_ID}'`).trim();
const origHall = origHallOrder === "" ? null : origHallOrder;
const origClan = origClanOrder === "" ? null : origClanOrder;

// 跨块共享的索引（§1 写入，§5 反向验证读取）
let idxProfile = -1;
let idxTributes = -1;

try {
  // -------------------------------------------------------------------------
  // §1 + §4 默认序渲染（仅过预览口令，不登录）
  // -------------------------------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

    // 纪念馆默认序
    await page.goto(`${BASE}/halls/${HALL_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const hallText = await page.locator("body").innerText();
    idxProfile = hallText.indexOf("逝者：");
    idxTributes = hallText.indexOf("追思记录");
    const idxCommunity = hallText.indexOf("亲友交流社区");
    check("纪念馆默认序：profile 在 tributes 之前", idxProfile >= 0 && idxTributes > idxProfile, `profile@${idxProfile} tributes@${idxTributes}`);
    check("纪念馆默认序：tributes 板块存在", idxTributes >= 0);
    check("纪念馆默认序：community 板块存在", idxCommunity >= 0, `community@${idxCommunity}`);

    // 宗祠默认序 + 硬文案
    await page.goto(`${BASE}/clan/halls/${CLAN_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const clanText = await page.locator("body").innerText();
    check("宗祠默认序：堂号「」存在", /堂号「/.test(clanText));
    check("宗祠默认序：当前陈设 存在", clanText.includes("当前陈设"));
    check("宗祠默认序：献祭 · 敬奉先祖 存在", clanText.includes("献祭 · 敬奉先祖"));
    check("宗祠默认序：祭祀记录 存在", clanText.includes("祭祀记录"));
    check("宗祠默认序：宗亲交流社区 存在", clanText.includes("宗亲交流社区"));
    check("宗祠默认序：关联入口 存在", clanText.includes("也来立一座宗祠") || clanText.includes("更多宗祠"));
    if (CLAN_HAS_POEM) {
      check("宗祠默认序：字辈诗 · 派语 存在", clanText.includes("字辈诗 · 派语"));
    } else {
      console.log("SKIP  宗祠无字辈诗，跳过该标记断言");
    }
    await ctx.close();
  }

  // -------------------------------------------------------------------------
  // §2 + §3 + §5 交换序生效（写入 tributes 在 profile 之前）
  // -------------------------------------------------------------------------
  {
    // 构造交换序：把 "tributes" 提到 "profile" 之前
    const swapped = [...HALL_DEFAULT_ORDER];
    const iProfile = swapped.indexOf("profile");
    const iTributes = swapped.indexOf("tributes");
    swapped.splice(iTributes, 1);
    swapped.splice(iProfile, 0, "tributes"); // 现在 tributes 紧挨在 profile 之前
    setOrder("MemorialHall", HALL_ID, swapped);

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

    await page.goto(`${BASE}/halls/${HALL_ID}?cb=${Date.now()}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const text = await page.locator("body").innerText();
    const p = text.indexOf("逝者：");
    const t = text.indexOf("追思记录");

    // §2：交换序生效 → tributes 在 profile 之前
    check("交换序生效：tributes 已调到 profile 之前", t >= 0 && p > t, `tributes@${t} profile@${p}`);
    // §3：不删板块
    check("交换序下：tributes 板块仍在", t >= 0);
    check("交换序下：profile 板块仍在", p >= 0);
    check("交换序下：community 板块仍在", text.includes("亲友交流社区"));
    // §5 反向验证：默认序下「profile 在 tributes 前」的断言，在交换序页面应为 FALSE
    const defaultRel = idxBefore(idxProfile, idxTributes); // §1 当时为 true
    const swappedRel = idxBefore(p, t); // 交换序应为 false
    check("反向验证：默认序关系(true) 与 交换序关系(false) 相反", defaultRel === true && swappedRel === false, `default=${defaultRel} swapped=${swappedRel}`);
    await ctx.close();
  }

  // -------------------------------------------------------------------------
  // §6 action 归属 + 落库（馆主在控制台拖拽保存）
  // -------------------------------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

    async function login(email, password) {
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      if ((await page.locator('input[name="identifier"]').count()) > 0) {
        await page.fill('input[name="identifier"]', email);
        await page.fill('input[name="password"]', password);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(3500);
      }
    }

    // 馆主登录并进入控制台
    await login(USER, USER_PW);
    await page.goto(`${BASE}/console/halls/${HALL_ID}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    check("馆主可进入纪念馆控制台", !/\/login/.test(page.url()) && page.url().includes(`/console/halls/${HALL_ID}`), page.url());

    const hasEditor = (await page.locator("text=页面板块排序").count()) > 0;
    check("控制台出现「页面板块排序」编辑器", hasEditor);

    if (hasEditor) {
      // 把第一项（hero）下移一次 → hero 从 index0 变 index1
      const firstItem = page.locator("li", { hasText: "壁龛 / 3D 首屏" }).first();
      const downBtn = firstItem.locator('button[aria-label="下移"]');
      if ((await downBtn.count()) > 0) {
        await downBtn.click();
        await page.waitForTimeout(200);
      }
      // 点保存
      const saveBtn = page.locator('button:has-text("保存顺序")');
      if ((await saveBtn.count()) > 0) {
        await saveBtn.click();
        await page.waitForTimeout(1500);
      }
      // 读 DB 确认写入
      const written = q1(`select "sectionOrder" from "MemorialHall" where id='${HALL_ID}'`).trim();
      check("保存后 DB 写入了 sectionOrder（非 null）", written !== "" && written.startsWith("["), written.slice(0, 60));
      if (written.startsWith("[")) {
        const arr = JSON.parse(written);
        check("写入的序长度为 11（无板块丢失；预约板块已下线）", arr.length === 11, `len=${arr.length}`);
        check("hero 已下移到 index 1", arr[1] === "hero", `arr[1]=${arr[1]}`);
        check("写入是默认序的一个排列", arr.slice().sort().join() === HALL_DEFAULT_ORDER.slice().sort().join());
      }
    }
    await ctx.close();
  }

  // §6（续）非馆主访问该控制台被重定向（与 action 共用 loadHall 归属守卫）
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
    const page = await ctx.newPage();
    async function login(email, password) {
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      if ((await page.locator('input[name="identifier"]').count()) > 0) {
        await page.fill('input[name="identifier"]', email);
        await page.fill('input[name="password"]', password);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(3500);
      }
    }
    // 用另一个账号登录（若馆主是 user，则用 admin；反之亦然）
    const otherEmail = USER === (await otherOwnerOf(HALL_ID)) ? ADMIN : USER;
    await login(otherEmail, otherEmail === ADMIN ? ADMIN_PW : USER_PW);
    await page.goto(`${BASE}/console/halls/${HALL_ID}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const bounced = !page.url().includes(`/console/halls/${HALL_ID}`);
    check("非馆主访问该控制台被重定向（归属守卫生效）", bounced, page.url());
    await ctx.close();
  }
} finally {
  // §7 还原
  setOrder("MemorialHall", HALL_ID, origHall);
  setOrder("ClanHall", CLAN_ID, origClan);
  console.log("已还原 sectionOrder（hall/clan → 原始值）");
}

function idxBefore(a, b) {
  return a >= 0 && b >= 0 && a < b;
}
async function otherOwnerOf(id) {
  const email = q1(`select u.email from "MemorialHall" h join "User" u on u.id=h."ownerUserId" where h.id='${id}'`);
  return email;
}

check("运行期无控制台/页面错误", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`\n结果: ${pass}/${pass + fail} 通过`);
if (fail > 0) {
  console.log("失败项: " + failures.join("; "));
  process.exit(1);
}
await browser.close();
