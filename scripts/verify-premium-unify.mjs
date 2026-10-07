/**
 * 验收：高级订阅判定「唯一出口」+ 宗祠装修可保存（真 bug 回归）
 *
 * ## 这个脚本防的是什么
 *
 * 用户报「宗祠装修后无法保存」。根因**不是**保存逻辑本身，而是
 * **同一个事实有两个判据**：
 *
 *   · 宗祠控制台页 `page.tsx`：premium = 馆级 OR 用户级
 *         → 用户级订阅有效时，UI 显示「高级订阅生效中 · 全部装修素材可用」，
 *           所有素材卡显示「已解锁」
 *   · `saveClanDecor` 的 `isPremiumOf(hall)`：**只认馆级**
 *         → 同一用户被判「未解锁」→ 保存被驳回
 *
 * 用户看到的是「挑好模板 → 点保存 → 毫无反应」。
 *
 * ## 断言分层（源码层 + 数据层 + 行为层，缺一层就会漏）
 *
 *   §1 源码层：`lib/premium.ts` 被真正引用（它曾是**死代码**）
 *   §2 源码层：不允许再出现手写的 `premiumUntil && new Date(...)`
 *   §3 数据层：造出「馆级 null + 用户级有效」这个**最容易分叉的前提**
 *   §4 行为层：该前提下点素材 → 保存 → 库里 `updatedAt` 必须真的变
 *   §5 反向验证：把 action 改回「只认馆级」，§4 必须变红
 *
 * §3 是核心：**不造这个前提，整个脚本会全绿而什么都没测**
 * （库里默认的样本祠多半是馆级 null + 用户级有效，或两者都 null，
 *   必须显式确认，不能赌）。
 *
 * ## ⚠️ 本脚本会改数据，必须自清理（已踩过一次）
 *
 * §4 要验"保存成功"，就必须**真的保存一次装修** —— 这会把样本祠的
 * `templateConfig` 改掉。最初只还原了 `premiumUntil`，结果把兄弟套件
 * `verify-portrait-unify.mjs` 跑红：它对**同一座祠**断言
 * "实验后 templateId 应为空"，而本脚本留下的 `clan-tpl-plain` 让它报
 * `(clan-tpl-plain)` —— 看着像那边坏了，其实是这边没打扫。
 *
 * 现在 §3 同时备份 `templateConfig`，收尾按"逐字等于备份"还原并断言。
 * **判据是「等于备份」而不是「不等于实验值」/「等于空」** ——
 * 后者都隐含着"原始值长什么样"的假设，一旦别处改了数据就假红。
 */

import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://127.0.0.1:3000";
const PG = "postgresql://memorial:memorial@localhost:5432/memorial";

let pass = 0;
let fail = 0;
const skips = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}${detail ? "  → " + detail : ""}`);
  }
}
function skip(name, why) {
  skips.push(name);
  console.log(`SKIP ${name}  → ${why}`);
}

/** psql 走临时文件：JSON 字面量拼进 -c 会被三层引号剥坏（AGENTS.md 陷阱） */
const tmp = mkdtempSync(join(tmpdir(), "vprem-"));
let n = 0;
function psql(sql) {
  const f = join(tmp, `q${n++}.sql`);
  writeFileSync(f, sql, "utf8");
  const out = execFileSync(
    "bash",
    ["-c", `docker cp ${f} memorial-pg:/tmp/q.sql >/dev/null && docker exec memorial-pg psql "${PG}" -t -A -f /tmp/q.sql`],
    { encoding: "utf8" },
  );
  return out.trim();
}

// ---------------------------------------------------------------- §1 源码层

console.log("\n=== §1 源码层：lib/premium.ts 必须被引用（它曾是死代码）===");
{
  const src = execFileSync(
    "bash",
    [
      "-c",
      `grep -rl 'from "@/lib/premium"' /workspace/app /workspace/lib /workspace/components 2>/dev/null | grep -v '/lib/premium.ts$' | wc -l`,
    ],
    { encoding: "utf8" },
  ).trim();
  const count = Number(src);
  /*
    为什么断言"≥6"而不是">0"：
    只断言 >0，改回缺陷版后只要剩一个引用（哪怕是无关文件）就会假绿。
    6 是当前真实调用方数量（两个 console actions、两个 console pages、
    宗祠公页、纪念馆公页、两个 upload route、decor-grant、pay、
    whispers ×2、genealogy ×3）—— 取一个明显低于真实值但远高于 1 的下界。
  */
  check("lib/premium.ts 有 ≥6 个真实调用方（不再是死代码）", count >= 6, `实得 ${count}`);
}

{
  // 反向验证的锚点：缺陷版一定在 clan actions 里出现 isPremiumOf(hall)
  const clanActions = execFileSync(
    "bash",
    ["-c", `cat '/workspace/app/console/clan-halls/[id]/actions.ts'`],
    { encoding: "utf8" },
  );
  check(
    "宗祠 action 的 isPremiumOf 取 ctx（并集），不是仅馆级",
    /function isPremiumOf\(ctx: \{[^}]*user[^}]*hall[^}]*\}\)/.test(clanActions) ||
      /isPremiumUntil\(ctx\.user\.premiumUntil\)\s*\|\|\s*isPremiumUntil\(ctx\.hall\.premiumUntil\)/.test(
        clanActions,
      ),
    "未见并集写法",
  );
}

// ---------------------------------------------------------------- §2 源码层

console.log("\n=== §2 源码层：不得再有手写的 premiumUntil 判定 ===");
{
  const hits = execFileSync(
    "bash",
    [
      "-c",
      `grep -rn 'premiumUntil && new Date(' /workspace/app /workspace/lib /workspace/components 2>/dev/null | grep -v '/lib/premium.ts' | grep -v '\\.next' || true`,
    ],
    { encoding: "utf8" },
  ).trim();
  check(
    "全仓无手写 `premiumUntil && new Date(` 判定（唯一实现）",
    hits === "",
    hits ? hits.split("\n").slice(0, 3).join(" | ") : "",
  );
}

// ---------------------------------------------------------------- §3 数据层

console.log("\n=== §3 数据层：造出「馆级 null + 用户级有效」这个分叉前提 ===");

const USER_EMAIL = "user@test.com";

/** 找一座 user@test.com 名下 active 的宗祠 */
const clanRow = psql(
  `SELECT c.id || '|' || COALESCE(c."premiumUntil"::text,'') || '|' || COALESCE(u."premiumUntil"::text,'') ` +
    `FROM "ClanHall" c JOIN "User" u ON u.id = c."ownerUserId" ` +
    `WHERE u.email = '${USER_EMAIL}' AND c.status = 'active' ` +
    `ORDER BY c."createdAt" LIMIT 1`,
);

let clanId = "";
let clanPremBak = "";
let userPremBak = "";
let decorBak = "";
let decorBakSet = false;
if (!clanRow) {
  skip("§3/§4 全部", "user@test.com 名下没有 active 宗祠");
} else {
  const parts = clanRow.split("|");
  clanId = parts[0];
  clanPremBak = parts[1] ?? "";
  userPremBak = parts[2] ?? "";
  console.log(`样本宗祠: ${clanId}`);
  console.log(`  馆级 premiumUntil（原）: ${clanPremBak || "(null)"}`);
  console.log(`  用户级 premiumUntil（原）: ${userPremBak || "(null)"}`);

  /*
    ⚠️ §4 会**真的保存一次装修**（那是被测行为），这会把 templateConfig 改掉。
    必须连 templateConfig 一起备份 / 还原 —— 否则本脚本会污染兄弟套件：
    `verify-portrait-unify.mjs` 对同一座祠断言 "实验后 templateId 应为空"，
    而这里存进去的 templateId 会让它变成 `clan-tpl-plain` → 假红。
    （AGENTS.md 陷阱 6：验收脚本必须自清理，否则会把自己的兄弟断言跑红。）
  */
  decorBak = psql(
    `SELECT COALESCE("templateConfig"::text,'') FROM "ClanHall" WHERE id='${clanId}'`,
  );
  decorBakSet = decorBak !== "";
  console.log(`  templateConfig（原，长度）: ${decorBak.length}`);

  /*
    核心前提：馆级 = null，用户级 = 未来。
    这正是"页面说解锁、action 说未解锁"的那一格。
  */
  psql(`UPDATE "ClanHall" SET "premiumUntil" = NULL WHERE id = '${clanId}'`);
  psql(
    `UPDATE "User" SET "premiumUntil" = now() + interval '30 days' WHERE email = '${USER_EMAIL}'`,
  );
  const now = psql(
    `SELECT COALESCE(c."premiumUntil"::text,'NULL') || '|' || COALESCE(u."premiumUntil"::text,'NULL') ` +
      `FROM "ClanHall" c JOIN "User" u ON u.id = c."ownerUserId" WHERE c.id = '${clanId}'`,
  ).split("|");
  check(
    "前提成立：馆级 premiumUntil = NULL 且 用户级 premiumUntil 在未来",
    now[0] === "NULL" && now[1] !== "NULL",
    `馆级=${now[0]} 用户级=${now[1]}`,
  );
}

// ---------------------------------------------------------------- §4 行为层

let browser;
if (clanId) {
  console.log("\n=== §4 行为层：该前提下 挑素材 → 保存 → 库里必须真的变 ===");
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await ctx.addCookies([
    { name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" },
  ]);
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', USER_EMAIL);
  await page.fill('input[name="password"]', "user123456");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${BASE}/console/clan-halls/${clanId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  // UI 必须认这个前提（页面上应出现「高级订阅生效中」）
  const uiPremium = await page.evaluate(() =>
    document.body.innerText.includes("高级订阅生效中"),
  );
  check("控制台页认出高级订阅（UI 与 action 同口径）", uiPremium);

  // 保存前的 updatedAt
  const before = psql(
    `SELECT COALESCE("templateConfig"->'decor'->>'updatedAt','') FROM "ClanHall" WHERE id='${clanId}'`,
  );

  // 挑一套模板 → dirty → 保存
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.innerText.trim() === "一键应用",
    );
    b?.click();
  });
  await page.waitForTimeout(900);

  const dirtySeen = await page.evaluate(() => !!document.querySelector("[data-decor-dirty]"));
  check("挑了模板后出现未保存提示（dirty 条）", dirtySeen);

  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.innerText.trim() === "保存并完成装修",
    );
    b?.click();
  });
  await page.waitForTimeout(4500);

  const after = psql(
    `SELECT COALESCE("templateConfig"->'decor'->>'updatedAt','') FROM "ClanHall" WHERE id='${clanId}'`,
  );
  /*
    判据是「与保存前**不同**」而不是"非空" —— 缺陷版下 after 可能是
    一个很久以前的旧值（非空），写"非空"会假绿。
  */
  check(
    "点保存后库里 updatedAt 真的被改写（保存成功）",
    after !== "" && after !== before,
    `before=${before || "(空)"} after=${after || "(空)"}`,
  );

  // 保存后 dirty 条应消失（三态：草稿条只在 dirty 时为真时渲染）
  const stillDirty = await page.evaluate(() => !!document.querySelector("[data-decor-dirty]"));
  check("保存成功后未保存提示消失", !stillDirty);

  await browser.close();
}

// ---------------------------------------------------------------- §5 反向验证提示

console.log("\n=== §5 反向验证（人工，改完必须还原）===");
console.log(
  "把 app/console/clan-halls/[id]/actions.ts 的 isPremiumOf 改回 " +
    "`isPremiumUntil(ctx.hall.premiumUntil)`（去掉 user 那一半），" +
    "重跑本脚本 —— §1「宗祠 action 的 isPremiumOf 取 ctx（并集）」与 " +
    "§4 三条必须变红。若 §4 全绿，说明前提没造对。",
);

// ---------------------------------------------------------------- 还原

console.log("\n=== 还原实验数据 ===");
if (clanId) {
  psql(
    `UPDATE "ClanHall" SET "premiumUntil" = ${clanPremBak ? `'${clanPremBak}'` : "NULL"} WHERE id = '${clanId}'`,
  );
  psql(
    `UPDATE "User" SET "premiumUntil" = ${userPremBak ? `'${userPremBak}'` : "NULL"} WHERE email = '${USER_EMAIL}'`,
  );

  /*
    ⚠️ templateConfig 必须还原 —— §4 真的保存过一次装修。
    用 $q$...$q$ 美元引号包 JSON，避免被 shell/psql 的引号层剥坏
    （AGENTS.md：往 psql 传 JSON 字面量不要拼 `-c`，走文件）。
  */
  if (decorBakSet) {
    psql(`UPDATE "ClanHall" SET "templateConfig" = $q$${decorBak}$q$::jsonb WHERE id='${clanId}'`);
  } else {
    psql(`UPDATE "ClanHall" SET "templateConfig" = NULL WHERE id='${clanId}'`);
  }

  const back = psql(
    `SELECT COALESCE(c."premiumUntil"::text,'') || '|' || COALESCE(u."premiumUntil"::text,'') ` +
      `FROM "ClanHall" c JOIN "User" u ON u.id = c."ownerUserId" WHERE c.id = '${clanId}'`,
  ).split("|");
  /*
    还原判据 = **与备份逐字相同**，不能写"不等于实验值"
    （阶段 6 踩过：样本原本就是实验值时会误报"没还原"）。
  */
  const okClan = (back[0] ?? "") === (clanPremBak ?? "");
  check("馆级 premiumUntil 已还原到备份值", okClan, `now=${back[0]} bak=${clanPremBak}`);

  const decorNow = psql(
    `SELECT COALESCE("templateConfig"::text,'') FROM "ClanHall" WHERE id='${clanId}'`,
  );
  check(
    "templateConfig 已还原到备份值（不污染 verify-portrait-unify 等兄弟套件）",
    decorNow === decorBak,
    `len(now)=${decorNow.length} len(bak)=${decorBak.length}`,
  );
}

console.log(`\n结果: ${pass}/${pass + fail} 通过${skips.length ? `（另有 ${skips.length} 段跳过）` : ""}`);
process.exit(fail ? 1 : 0);
