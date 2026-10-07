/**
 * 阶段 10 验收：3D 场景陈设拖拽布局（公页馆主直接拖）
 *
 * 覆盖：
 *   §1 normalizeLayout 单元（形状/钳制/上限/非法输入）
 *   §2 渲染 override（访客也能看到馆主保存的布局；未拖件零变化）
 *   §3 馆主/访客差异（访客无编辑 DOM；馆主有开关、编辑态有描边与工具条）
 *   §4 action 行为闭环（馆主真点「恢复默认」→ 库里 layout 键消失）
 *   §5 源码层护栏（saveDecorLayout/saveClanDecorLayout 只写 layout，不合并 slots/unlocked）
 *
 * 教训先行（写本套件前重读的旧账）：
 *   - 库里默认没有任何馆/祠配付费模板 → 不造前提必然全绿而什么都没测（阶段 6 教训）。
 *     开局 psql 造前提：祠挂 clan-tpl-ancestral3d（space=shrine，底座 props 有稳定 id
 *     shrine-tablets/shrine-altar/shrine-lantern-l/r）、馆挂 tpl-goldhall + 挂饰
 *     orn-lantern-red（kind=lantern → 渲染 id lantern-0/lantern-1）。
 *   - 「不等于实验值」不是还原判据，必须与备份逐字相同（阶段 6 第三次踩）。
 *   - 验收脚本必须自清理：本套件改过 templateConfig 与 layout，finally 逐字还原。
 *
 * 反向验证（AGENTS.md 硬要求）：
 *   R1 注掉 Decor3DScene 的 override 分支 → §2 全红（transform 与基线无差异）；
 *   R2 SceneLayoutEditor 的 isOwner 门改成恒 true → §3「访客无编辑 DOM」变红；
 *   R3 action 合并入参 slots（伪造权益路径）→ §5 变红。
 */

import fs from "node:fs";
import { execSync } from "node:child_process";
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;

const BASE = "http://127.0.0.1:3000";
let pass = 0;
let fail = 0;
const failures: string[] = [];
const check = (n: string, ok: boolean, d = "") => {
  if (ok) {
    pass++;
    console.log(`PASS  ${n}${d ? `  (${d})` : ""}`);
  } else {
    fail++;
    failures.push(n);
    console.log(`FAIL  ${n}${d ? `  (${d})` : ""}`);
  }
};

const psql = (sql: string) =>
  execSync(
    `docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(sql.replace(/\n\s*/g, " "))}`,
    { encoding: "utf8" },
  ).trim();

/* SQL 含 JSON 字面量时绝不拼 -c（AGENTS.md：三层引号必然剥坏），走文件。 */
const psqlFile = (sql: string, name = "draglay") => {
  const local = `/tmp/${name}-${Date.now()}.sql`;
  fs.writeFileSync(local, sql, "utf8");
  execSync(`docker cp ${JSON.stringify(local)} memorial-pg:/tmp/${name}.sql`, { stdio: "pipe" });
  const out = execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -f /tmp/${name}.sql`, {
    encoding: "utf8",
  }).trim();
  fs.unlinkSync(local);
  return out;
};

// ── 0. 造前提 ──────────────────────────────────────────────────────────
console.log("── 0. 造前提（库里默认没有配付费模板的馆/祠）──");

const hallRow = psql(
  `SELECT h.id FROM "MemorialHall" h JOIN "User" u ON u.id=h."ownerUserId" WHERE u.email='user@test.com' AND h.status='active' AND h."isPublic"=true ORDER BY h."createdAt" ASC LIMIT 1;`,
);
const clanRow = psql(
  `SELECT c.id FROM "ClanHall" c JOIN "User" u ON u.id=c."ownerUserId" WHERE u.email='user@test.com' AND c.status='active' ORDER BY c."createdAt" ASC LIMIT 1;`,
);
if (!hallRow || !clanRow) {
  check("找到可用的馆与祠作为样本", false, `hall=${hallRow || "(无)"} clan=${clanRow || "(无)"}`);
  console.log(`\n通过 ${pass}/${pass + fail}`);
  process.exit(1);
}
const hallId = hallRow;
const clanId = clanRow;
console.log(`  纪念馆样本=${hallId}  宗祠样本=${clanId}`);

const hallCfgBak = psql(`SELECT coalesce("templateConfig"::text,'') FROM "MemorialHall" WHERE id='${hallId}';`);
const clanCfgBak = psql(`SELECT coalesce("templateConfig"::text,'') FROM "ClanHall" WHERE id='${clanId}';`);

try {
  psqlFile(
    `UPDATE "ClanHall" SET "templateConfig" = jsonb_set(jsonb_set(
       coalesce("templateConfig",'{}'::jsonb), '{decor,templateId}', '"clan-tpl-ancestral3d"'),
       '{decor,unlocked}',
       (coalesce("templateConfig"->'decor'->'unlocked','[]'::jsonb)) || '"tpl:clan-tpl-ancestral3d"'::jsonb
     ) WHERE id='${clanId}';`,
    "dl-clan",
  );
  psqlFile(
    `UPDATE "MemorialHall" SET "templateConfig" = jsonb_set(jsonb_set(jsonb_set(
       coalesce("templateConfig",'{}'::jsonb), '{decor,templateId}', '"tpl-goldhall"'),
       '{decor,unlocked}',
       (coalesce("templateConfig"->'decor'->'unlocked','[]'::jsonb)) || '["tpl:tpl-goldhall","buy:orn-lantern-red"]'::jsonb),
       '{decor,slots}',
       (coalesce("templateConfig"->'decor'->'slots','{}'::jsonb)) || '{"ornament":["orn-lantern-red"]}'::jsonb
     ) WHERE id='${hallId}';`,
    "dl-hall",
  );
  const t1 = psql(`SELECT "templateConfig"->'decor'->>'templateId' FROM "ClanHall" WHERE id='${clanId}';`);
  const t2 = psql(`SELECT "templateConfig"->'decor'->>'templateId' FROM "MemorialHall" WHERE id='${hallId}';`);
  check("前提已就位：祠挂 shrine 空间模板 / 馆挂 hall 模板 + 灯笼挂饰", t1 === "clan-tpl-ancestral3d" && t2 === "tpl-goldhall", `clan=${t1} hall=${t2}`);

  // ── §1 normalizeLayout 单元 ─────────────────────────────────────────
  console.log("\n── §1 normalizeLayout 单元 ──");
  const { normalizeLayout } = await import("@/lib/hall-decor");
  check("非对象输入 → undefined", normalizeLayout(null) === undefined && normalizeLayout("x") === undefined && normalizeLayout([1]) === undefined);
  check("空对象 → undefined", normalizeLayout({}) === undefined);
  const ok1 = normalizeLayout({ "shrine-lantern-l": { x: 10, bottom: 30 } });
  check("合法键值通过", JSON.stringify(ok1) === '{"shrine-lantern-l":{"x":10,"bottom":30}}', JSON.stringify(ok1));
  const clamped = normalizeLayout({ "a": { x: 999, z: -999, bottom: -999 } });
  check("越界钳回边界（x≤60 / z≥-40 / bottom≥-20）", JSON.stringify(clamped) === '{"a":{"x":60,"z":-40,"bottom":-20}}', JSON.stringify(clamped));
  check("非数值维度整件丢弃", normalizeLayout({ a: { x: "abc" } }) === undefined);
  check("键名不合法（空格/特殊字符）丢弃", normalizeLayout({ "bad key!": { x: 1 } }) === undefined);
  const many: Record<string, { x: number }> = {};
  for (let i = 0; i < 45; i++) many[`k${i}`] = { x: i };
  check("键数量上限 40", Object.keys(normalizeLayout(many) ?? {}).length === 40);

  // ── 抓 transform 的公共函数 ─────────────────────────────────────────
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);

  const grabTransforms = async (url: string) => {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3500);
    const out = await page.evaluate(() => {
      const map: Record<string, string> = {};
      for (const el of document.querySelectorAll("[data-prop-id]")) {
        map[el.getAttribute("data-prop-id")!] = (el as HTMLElement).style.transform || "";
      }
      return {
        props: map,
        has3d: document.querySelectorAll("[data-decor-3d]").length,
        toggle: document.querySelectorAll("[data-layout-toggle]").length,
        editing: document.querySelectorAll('[data-editing="1"]').length,
      };
    });
    await page.close();
    return out;
  };

  // ── §2 渲染 override（无 layout 基线 → 写 layout → 对比）────────────
  console.log("\n── §2 渲染 override：写库的布局必须真实改变渲染 ──");
  const base = await grabTransforms(`${BASE}/clan/halls/${clanId}`);
  check("祠页渲染出 3D 场景", base.has3d >= 1, `场景=${base.has3d}`);
  check("祠页有 shrine 底座陈设（shrine-lantern-l/r）", !!base.props["shrine-lantern-l"] && !!base.props["shrine-lantern-r"]);
  check("基线（无 layout）：访客无编辑开关", base.toggle === 0, `toggle=${base.toggle}`);
  const baseL = base.props["shrine-lantern-l"] ?? "";
  const baseR = base.props["shrine-lantern-r"] ?? "";

  psqlFile(
    `UPDATE "ClanHall" SET "templateConfig" = jsonb_set(coalesce("templateConfig",'{}'::jsonb), '{decor,layout}', '{"shrine-lantern-l":{"x":18},"shrine-altar":{"bottom":26}}'::jsonb) WHERE id='${clanId}';`,
    "dl-layout",
  );
  const after = await grabTransforms(`${BASE}/clan/halls/${clanId}`);
  check("被拖件（shrine-lantern-l x=18）transform 与基线不同", (after.props["shrine-lantern-l"] ?? "") !== baseL, `前=${baseL.slice(0, 60)}`);
  check("未拖件（shrine-lantern-r）transform 与基线逐字一致", (after.props["shrine-lantern-r"] ?? "") === baseR);
  check("另一拖件（shrine-altar bottom=26）transform 与基线不同", (after.props["shrine-altar"] ?? "") !== (base.props["shrine-altar"] ?? ""));
  check("布局对访客同样生效（访客页能看到馆主保存的布局）", (after.props["shrine-lantern-l"] ?? "") !== baseL);

  // stale 键：指向不存在的陈设 → 渲染层忽略、零影响
  psqlFile(
    `UPDATE "ClanHall" SET "templateConfig" = jsonb_set(coalesce("templateConfig",'{}'::jsonb), '{decor,layout}', '{"ghost-prop":{"x":50}}'::jsonb) WHERE id='${clanId}';`,
    "dl-stale",
  );
  const stale = await grabTransforms(`${BASE}/clan/halls/${clanId}`);
  check(
    "stale 键（ghost-prop）被渲染层忽略：全部 transform 与基线一致",
    Object.keys(stale.props).every((k) => stale.props[k] === base.props[k]),
  );

  // ── §3 馆主/访客差异 ────────────────────────────────────────────────
  console.log("\n── §3 馆主/访客差异 ──");
  const pageO = await ctx.newPage();
  await pageO.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pageO.waitForSelector('input[name="identifier"]', { timeout: 30000 });
  await pageO.fill('input[name="identifier"]', "user@test.com");
  await pageO.fill('input[name="password"]', "user123456");
  await Promise.all([
    pageO.waitForNavigation({ timeout: 60000 }).catch(() => null),
    pageO.click('button[type="submit"]'),
  ]);
  await pageO.waitForTimeout(1200);

  await pageO.goto(`${BASE}/clan/halls/${clanId}`, { waitUntil: "domcontentloaded" });
  await pageO.waitForTimeout(3500);
  const ownerToggle = await pageO.evaluate(() => document.querySelectorAll("[data-layout-toggle]").length);
  check("馆主看到「调整布局」开关", ownerToggle === 1, `toggle=${ownerToggle}`);
  await pageO.click("[data-layout-toggle]");
  await pageO.waitForTimeout(600);
  const editing = await pageO.evaluate(() => ({
    editingProps: document.querySelectorAll('[data-editing="1"]').length,
    bar: document.querySelectorAll("[data-layout-bar]").length,
  }));
  check("编辑态：陈设出现可拖标记（data-editing=1）", editing.editingProps >= 1, `件数=${editing.editingProps}`);
  check("编辑态：工具条出现（含恢复默认/完成）", editing.bar === 1);

  // ── §4 action 行为闭环：真点「恢复默认」→ 库里 layout 键消失 ─────────
  console.log("\n── §4 action 闭环（真调 server action）──");
  const beforeKeys = psql(`SELECT coalesce("templateConfig"->'decor'->>'layout','') FROM "ClanHall" WHERE id='${clanId}';`);
  await pageO.evaluate(() => {
    const btn = [...document.querySelectorAll("[data-layout-bar] button")].find((b) => (b.textContent || "").includes("恢复默认"));
    (btn as HTMLButtonElement)?.click();
  });
  await pageO.waitForTimeout(2500);
  const afterKeys = psql(`SELECT coalesce("templateConfig"->'decor'->>'layout','') FROM "ClanHall" WHERE id='${clanId}';`);
  check("恢复默认后库里 layout 键消失（action 真实生效）", beforeKeys !== "" && afterKeys === "", `前=${beforeKeys.slice(0, 60)} 后=${afterKeys || "(空)"}`);
  check("恢复默认不碰 templateId", psql(`SELECT "templateConfig"->'decor'->>'templateId' FROM "ClanHall" WHERE id='${clanId}';`) === "clan-tpl-ancestral3d");

  // 馆侧：馆主开关同样存在（两端同步）
  await pageO.goto(`${BASE}/halls/${hallId}`, { waitUntil: "domcontentloaded" });
  await pageO.waitForTimeout(3500);
  const hallToggle = await pageO.evaluate(() => document.querySelectorAll("[data-layout-toggle]").length);
  const hallLantern = await pageO.evaluate(() => document.querySelectorAll('[data-prop-id="lantern-0"]').length);
  check("纪念馆公页馆主同样有开关（两端同步）", hallToggle === 1, `toggle=${hallToggle}`);
  check("纪念馆公页灯笼挂饰渲染（lantern-0）", hallLantern === 1, `count=${hallLantern}`);
  await pageO.close();
  await b.close();

  // ── §5 源码层护栏 ───────────────────────────────────────────────────
  console.log("\n── §5 源码层护栏（action 只写 layout）──");
  const hallSrc = fs.readFileSync("app/console/halls/[id]/actions.ts", "utf8");
  const clanSrc = fs.readFileSync("app/console/clan-halls/[id]/actions.ts", "utf8");
  const bodyOf = (src: string, fn: string) => {
    const i = src.indexOf(`export async function ${fn}`);
    const j = src.indexOf("export async function", i + 10);
    return src.slice(i, j > i ? j : undefined);
  };
  for (const [src, fn] of [
    [hallSrc, "saveDecorLayout"],
    [clanSrc, "saveClanDecorLayout"],
  ] as const) {
    const body = bodyOf(src, fn);
    check(`${fn} 走 normalizeLayout 独立解析`, body.includes("normalizeLayout"));
    check(`${fn} 不写 slots/unlocked/granted/templateId（权益绝不来自入参）`, !/slots\s*:|unlocked\s*:|granted\s*:|templateId\s*:/.test(body));
  }
} catch (e) {
  check("脚本主体无异常", false, String(e).slice(0, 200));
} finally {
  // 还原判据 = 与备份逐字相同（不写"不等于实验值"）
  psqlFile(
    `UPDATE "MemorialHall" SET "templateConfig" = ${hallCfgBak ? `'${hallCfgBak.replace(/'/g, "''")}'::jsonb` : "NULL"} WHERE id='${hallId}';`,
    "dl-rh",
  );
  psqlFile(
    `UPDATE "ClanHall" SET "templateConfig" = ${clanCfgBak ? `'${clanCfgBak.replace(/'/g, "''")}'::jsonb` : "NULL"} WHERE id='${clanId}';`,
    "dl-rc",
  );
  const rh = psql(`SELECT coalesce("templateConfig"::text,'') FROM "MemorialHall" WHERE id='${hallId}';`);
  const rc = psql(`SELECT coalesce("templateConfig"::text,'') FROM "ClanHall" WHERE id='${clanId}';`);
  check("测试后馆/祠 templateConfig 已逐字还原（可重复跑）", rh === hallCfgBak && rc === clanCfgBak);
}

console.log(`\n通过 ${pass}/${pass + fail}`);
if (fail > 0) {
  console.log("失败项：");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
