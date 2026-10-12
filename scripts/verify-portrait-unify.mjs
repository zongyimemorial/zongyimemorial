/**
 * 「遗像安奉两处统一」验收。
 *
 * 用户反馈：「这两个地方为什么不一样？不统一呢？」（纪念馆 vs 宗祠截图）
 *
 * 查下来是**三层不统一**，本套件逐条锁死：
 *
 *  ① 取值口径：宗祠早先 `archive.portrait ?? hall.coverImage`（把封面图当遗像），
 *     纪念馆只认 `archive.portrait`。→ 现在两边都只认 portrait。
 *  ② 观感规格：付费 3D 空间里的遗像早先是裸 <img>（120×150 / 128×160 两个数），
 *     现在统一走 PortraitNiche（150×188 + 描金龛体 + 名讳签）。
 *  ③ 重复渲染：3D 空间与大龛场景曾可同时渲染遗像 → 同一页出现两次。
 *
 * 断言策略：不硬编码"某张图一定在"，而是**数遗像 img 的个数**——
 * 「恰好 1 张」才是"安奉且不重复"的可证伪表达。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
import { makeChecks } from "./_check.mjs";
const { chromium } = pkg;
import { execSync } from "node:child_process";
import fs from "node:fs";

const BASE = "http://127.0.0.1:3000";
const psql = (q) =>
  execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`, {
    encoding: "utf8",
  }).trim();

/**
 * 跑含 JSON 字面量的 SQL。
 *
 * ⚠️ 必须走临时文件 —— 直接把 `{"photos":...}` 拼进 `psql -c` 会穿三层引号
 * （JS → shell → psql）被剥坏，报 `syntax error at or near "photos"`，
 * 看着像 SQL 写错了，其实是 shell 把引号吃了。做法见 AGENTS.md 与
 * `verify-decor-3d.mjs` 的 `psqlFile()`。
 */
const psqlFile = (sql, name = "vp") => {
  const local = `/tmp/${name}-${Date.now()}.sql`;
  fs.writeFileSync(local, sql, "utf8");
  execSync(`docker cp ${JSON.stringify(local)} memorial-pg:/tmp/${name}.sql`, { stdio: "pipe" });
  const out = execSync(
    `docker exec memorial-pg psql -U memorial -d memorial -t -A -f /tmp/${name}.sql`,
    { encoding: "utf8" },
  ).trim();
  fs.unlinkSync(local);
  return out;
};

/*
  三态断言（pass/fail/skip）——用共享的 makeChecks，见 scripts/_check.mjs。
  本套件原先只有 pass/fail 两态，遇到"没条件测"只能硬报红，
  于是「通过 21/27」里混着 6 条**假的失败**，掩盖了真正的架构断言问题。
*/
const _ck = makeChecks();
const check = _ck.check;
const skip = _ck.skip;

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

/** 数页面上"遗像"img 的数量（alt 含「遗像」） */
const countPortraits = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("img")].filter((i) => /遗像/.test(i.alt || "")).length,
  );

console.log("===== 遗像安奉统一性验收 =====\n");

// ── ① 取值口径：源码层断言 ────────────────────────────────────────
console.log("── ① 取值口径（两边都只认 archive.portrait）──");
{
  const fs = await import("node:fs");
  const clan = fs.readFileSync("app/(public)/clan/halls/[id]/page.tsx", "utf8");
  const hall = fs.readFileSync("app/(public)/halls/[id]/page.tsx", "utf8");

  // 宗祠：不得再把 coverImage 当遗像。
  // ⚠️ 先**剥掉注释**再判定 —— 否则会匹配到解释这条规则的注释本身
  //    （注释里就写着 `?? hall.coverImage` 这个反例），报出假红。
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const clanCode = stripComments(clan);
  const clanBad = /archive\.portrait\s*\?\?\s*hall\.coverImage/.test(clanCode);
  check("宗祠：遗像不再回落到 coverImage", !clanBad, clanBad ? "仍在 ?? hall.coverImage" : "");
  check("宗祠：遗像取自 archive.portrait", /const portrait = archive\.portrait/.test(clanCode));

  // 纪念馆：仍是 archive.portrait
  check("纪念馆：遗像取自 archive.portrait", /const portraitUrl = archive\.portrait/.test(hall));

  // 两边都用 PortraitNiche（观感统一的关键）
  check("纪念馆：3D 空间用 PortraitNiche", /<PortraitNiche/.test(hall));
  /*
    ⚠️ 这三条原先查的是 `has3DSpace` / `PortraitNiche` / `clanSpaceKind` ——
    它们随「宗祠改用 ClanHall3DTour 四段漫游」的架构演进**已从祠页移除**，
    于是永远查不到 → 常态报红，且报错文案指向早已修好的历史 bug（findTemplate 误用）。
    现在改为断言当前架构的真实约束：祠页走 ClanHall3DTour，遗像标记为 data-clan-portrait。
  */
  check("宗祠：3D 空间用 ClanHall3DTour", /<ClanHall3DTour/.test(clan));

  // 尺寸必须来自同一份常量，不得各自写数字
  const niche = fs.readFileSync("components/decor/PortraitNiche.tsx", "utf8");
  check("PortraitNiche 导出共用尺寸常量", /export const PORTRAIT_W/.test(niche) && /export const PORTRAIT_H/.test(niche));
  const hardW = /width:\s*12\d/.test(hall) || /width:\s*12\d/.test(clan);
  check("两个页面不再各自硬写 12x 尺寸", !hardW, hardW ? "仍有硬编码宽度" : "");

  // 互斥：同一页不得同时渲染大龛场景与 3D 空间
  check("纪念馆：壁龛墙与 3D 空间互斥", /isNicheWall && !use3DScene/.test(hall));
  check(
    "宗祠：遗像由 3D 场景承载（data-clan-portrait）",
    /data-clan-portrait/.test(fs.readFileSync("components/clan/ClanHallScene.tsx", "utf8")),
  );
  check(
    "宗祠：3D 场景与遗像同源传参（不重复渲染两张）",
    /portrait=\{portrait/.test(clan),
  );

  /*
    ⚠️ 【真 bug，2026-10 修复】宗祠侧必须用 findClanTemplate，不能用 findTemplate。

    曾写成 `import { findTemplate } from "@/lib/hall-decor"`（纪念馆的），
    于是 `findTemplate("clan-tpl-ancestral3d")` 在**纪念馆**模板表里查 → 永远 undefined
    → clanSpaceKind 恒 undefined → has3DSpace 恒假
    → **宗祠的付费 3D 空间从来不渲染**（用户买了立体模板，在祠页上完全看不到）。

    静默性是关键：不报错、不警告、页面照常（走回落分支），
    只是"付费升级"这件事在宗祠侧根本不存在。
    这与 AGENTS.md 里"商城详情页要查两边模板表"是同源问题 —— 两张表是两套。

    断言要点：宗祠公页的 import 与调用**都**必须是 findClanTemplate。
  */
  check(
    "宗祠：import 的是 findClanTemplate（不是纪念馆的 findTemplate）",
    /import\s*\{\s*findClanTemplate\s*\}\s*from\s*"@\/lib\/clan-decor"/.test(clan),
  );
  check(
    "宗祠：调用的是 findClanTemplate",
    /findClanTemplate\(decor\.templateId\)/.test(clan),
  );
  check(
    "宗祠：不得调用纪念馆的 findTemplate（防回归）",
    !/[^n]findTemplate\(decor\.templateId\)/.test(clanCode),
    /[^n]findTemplate\(decor\.templateId\)/.test(clanCode) ? "仍在用 findTemplate" : "",
  );
}

// ── ② 运行时：有遗像的馆，遗像恰好 1 张 ───────────────────────────
console.log("\n── ② 运行时（真实页面）──");
const halls = psql(
  `SELECT id || '|' || "deceasedName" || '|' || coalesce("templateConfig"->'decor'->>'templateId','') FROM "MemorialHall" WHERE coalesce("archive"->>'portrait','') <> '' LIMIT 3;`,
)
  .split("\n")
  .filter(Boolean);

check("库里有带遗像的纪念馆（前置）", halls.length >= 1, `${halls.length} 座`);
for (const row of halls) {
  const [id, name, tpl] = row.split("|");
  const res = await page.goto(`${BASE}/halls/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  if (res.status() !== 200) {
    check(`馆页可访问 ${name}`, false, `HTTP ${res.status()}`);
    continue;
  }
  const n = await countPortraits();
  check(`纪念馆「${name}」遗像恰好 1 张`, n === 1, `实际 ${n} 张，模板=${tpl || "(赠品/空)"}`);
}

// ── ③ 宗祠：无 portrait 时，封面图不得被当成遗像 ──────────────────
console.log("\n── ③ 宗祠封面图不得冒充遗像 ──");
const clans = psql(
  `SELECT id || '|' || "hallName" || '|' || case when coalesce("archive"->>'portrait','')='' then 'NOP' else 'HAS' end || '|' || case when coalesce("coverImage",'')='' then 'NOC' else 'HASC' end FROM "ClanHall" ORDER BY "createdAt" DESC LIMIT 3;`,
)
  .split("\n")
  .filter(Boolean);

for (const row of clans) {
  const [id, name, hasP, hasC] = row.split("|");
  const res = await page.goto(`${BASE}/clan/halls/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  if (res.status() !== 200) continue;
  const n = await countPortraits();
  const expect = hasP === "HAS" ? 1 : 0;
  check(
    `宗祠「${name}」遗像 ${expect} 张（portrait=${hasP} cover=${hasC}）`,
    n === expect,
    `实际 ${n} 张`,
  );
}

// ── ④ 反向验证：证明「0 张」不是假绿 ──────────────────────────────
//
// 这是本套件**最关键**的一段。§③ 断言"没有 portrait 的宗祠显示 0 张遗像"——
// 但如果页面根本没渲染出内容，这条也恒为真（AGENTS.md 记的假绿风险）。
// 所以必须**人为制造"portrait 有值"的前提**，确认遗像确实会渲染出来，
// 才能反证那个 0 是"真的没有"，而不是"什么都没测"。
//
// ⚠️ 收尾必须放在 finally 里。上一版把还原写在断言之后，中途一崩
//    （psql JSON 引号被剥坏）就把测试图**永久留在 archive.portrait 里**，
//    下一次跑 §③ 直接报「期望 0 张、实际 1 张」—— 看着像功能坏了，
//    其实是测试自己没打扫干净。这与 AGENTS.md 陷阱 6 是同一类问题。
console.log("\n── ④ 反向验证（证明「0 张」不是假绿）──");

// 开局自愈：清掉可能由上一次崩溃残留的测试遗像
{
  const dirty = psql(
    `SELECT id FROM "ClanHall" WHERE coalesce("archive"->>'portrait','') LIKE '/uploads/halls/%' LIMIT 5;`,
  )
    .split("\n")
    .filter(Boolean);
  if (dirty.length) {
    for (const d of dirty) {
      psql(`UPDATE "ClanHall" SET archive = archive - 'portrait' WHERE id='${d}';`);
    }
    console.log(`[自愈] 清掉 ${dirty.length} 座宗祠上一次残留的测试遗像`);
  }
}

{
  /*
    ⚠️ 反向实验要选一座**当前身份真能打开**的祠。

    踩过两次：
      ① 未登录 → 选中 `verify-clan-e2e` 刚建的 pending 祠，对匿名访客不公开，
         页面走"仅你可见"分支，场景不渲染 → 报「portrait 有值也 0 张」。
      ② 换管理员 → 该祠 `pending` 且馆主是 user@test.com，
         管理员拿到的是 **404**（pending 祠只对馆主本人可见）→ 还是 0 张。
    两次都像功能坏了，其实都是**身份/权限前提不对**。

    所以：用 `user@test.com`（它是这批祠的馆主，既有 pending 也有 active），
    并**只挑 active 的祠** —— active 对所有登录用户公开，前提最稳。
  */
  const activeClan = psql(
    `SELECT c.id || '|' || c."hallName" FROM "ClanHall" c JOIN "User" u ON u.id = c."ownerUserId" WHERE u.email = 'user@test.com' AND c.status = 'active' ORDER BY c."createdAt" ASC LIMIT 1;`,
  );
  const target = activeClan || clans[0];
  const id = target.split("|")[0];
  const name = target.split("|")[1];

  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', "user@test.com");
  await page.fill('input[name="password"]', "user123456");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4500);

  // 前置：确认这座祠当前身份真能打开（否则下面全是 0 张，白测）
  {
    const probe = await page.goto(`${BASE}/clan/halls/${id}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const ok = probe.status() === 200 && !/404/.test(await page.title());
    check(`反向前提：当前身份能打开「${name}」`, ok, `HTTP ${probe.status()}`);
    if (!ok) console.log("SKIP  反向实验无法进行（打不开目标祠）");
  }

  const archiveBackup = psql(`SELECT coalesce("archive"::text,'') FROM "ClanHall" WHERE id='${id}';`);
  // 取一张**本地上传目录**里真实存在的图（沙箱无外网图床，且要能真渲染）
  const coverUrl = psql(
    `SELECT coalesce("archive"->'photos'->>0, '') FROM "MemorialHall" WHERE coalesce("archive"->'photos'->>0,'') <> '' LIMIT 1;`,
  );

  try {
    if (!coverUrl) {
      check("反向前提：存在一张可用的测试图 URL", false, "库里找不到任何照片");
    } else {
      // 前提：这个 URL 真能取到（否则"渲染出遗像"可能只是 a11y 属性被写上了）
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      const urlOk = await page.evaluate(async (u) => {
        try {
          const r = await fetch(u, { method: "HEAD" });
          return r.ok || r.status === 405 || r.status === 403;
        } catch {
          return false;
        }
      }, coverUrl);
      check("反向前提：测试图可访问（证明下述计数不是图片挂掉）", urlOk, coverUrl.slice(0, 46));

      // 制造前提：给 portrait 一个真实值
      psql(
        `UPDATE "ClanHall" SET archive = coalesce(archive,'{}'::jsonb) || jsonb_build_object('portrait','${coverUrl}') WHERE id='${id}';`,
      );
      await page.goto(`${BASE}/clan/halls/${id}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      const n = await countPortraits();
      check(
        `反向：portrait 有值时「${name}」确实渲染遗像（证明计数有效）`,
        n >= 1,
        `实际 ${n} 张 —— 若为 0，说明 §③ 的"0 张"是假绿`,
      );
    }
  } finally {
    // 收尾：无论上面怎么炸，都把 archive 写回原值
    if (archiveBackup) {
      psqlFile(
        `UPDATE "ClanHall" SET archive = $vp$${archiveBackup}$vp$::jsonb WHERE id='${id}';`,
        "vp-restore",
      );
    } else {
      psql(`UPDATE "ClanHall" SET archive = NULL WHERE id='${id}';`);
    }
    const restored = psql(`SELECT coalesce("archive"->>'portrait','') FROM "ClanHall" WHERE id='${id}';`);
    check("反向实验后已还原（脚本可重复跑）", restored === "", `${restored || "(空)"}`);
  }
}

// ── ⑤ 宗祠付费 3D 空间必须真能渲染（findClanTemplate 回归）──────────
//
// 光断言源码"import 的是 findClanTemplate"还不够 —— 万一别名、重导出、
// 或者判定链上还有别的哨兵，源码对了运行时照样可以是空的。
// 所以这里**造出一个付费模板 + 有遗像的宗祠**，真去页面里数 `data-decor-3d`。
//
// 这条断言的价值：它抓的是"宗祠的付费升级在祠页上根本不存在"这个静默 bug ——
// 不报错、页面照常，只是用户花了 1700 积分在祠页上什么都看不到。
console.log("\n── ⑤ 宗祠 3D 空间与牌位墙口径 ──");
{
  /*
    ⚠️ 本段在 2026-10 被**重写**，因为断言口径过时了。

    旧写法断言 `[data-decor-3d]` 必须存在（付费 3D 空间渲染），
    但宗祠页早已改为渲染 `ClanHall3DTour`（四段 3D 漫游：山门→天井→享堂→寝堂，
    见 components/clan/ClanHall3DTour.tsx，标记 `data-clan-tour="1"`），
    原来的独立付费 3D 板块随之移除。于是这段必然报红 6 条，
    且报错信息写着「findClanTemplate 可能又写回 findTemplate 了」——
    **方向性误导**：让人去查一个早已修好的历史 bug，而真正的问题是断言在测一个不存在的架构。

    （这正是不该用 skip 掩盖的场景：断言本身错了，就该改正它，而不是跳过。）

    现在断言当前架构下的等价事实：
      · 祠页渲染出 3D 漫游（而非 Decor3DScene）
      · 遗像仍以 `[data-portrait-niche]` 安奉，且全页唯一
      · 两者同页共存（漫游里含寝堂场景，不应与遗像冲突出现两次）
  */
  const row = psql(
    `SELECT c.id || '|' || c."hallName" FROM "ClanHall" c JOIN "User" u ON u.id = c."ownerUserId" WHERE u.email IN ('user@test.com','admin@test.com') AND c.status = 'active' ORDER BY c."createdAt" ASC LIMIT 1;`,
  );
  const id = row.split("|")[0];
  const name = row.split("|")[1];

  const decorBak = psql(`SELECT coalesce("templateConfig"::text,'') FROM "ClanHall" WHERE id='${id}';`);
  const archiveBak = psql(`SELECT coalesce("archive"::text,'') FROM "ClanHall" WHERE id='${id}';`);
  const photo = psql(
    `SELECT coalesce("archive"->>'portrait','') FROM "MemorialHall" WHERE coalesce("archive"->>'portrait','') <> '' LIMIT 1;`,
  );

  try {
    // 给该祠配一个付费 3D 模板并解锁（unlocked 必须给 —— normalizeClanDecor 会丢弃未解锁的 templateId）
    psqlFile(
      `UPDATE "ClanHall" SET "templateConfig" = jsonb_set(coalesce("templateConfig",'{}'::jsonb), '{decor}', coalesce("templateConfig"->'decor','{}'::jsonb) || jsonb_build_object('templateId','clan-tpl-ancestral3d','unlocked',jsonb_build_array('tpl:clan-tpl-ancestral3d')), true) WHERE id='${id}';`,
      "vp-clan3d",
    );
    if (photo) {
      psqlFile(
        `UPDATE "ClanHall" SET archive = coalesce(archive,'{}'::jsonb) || jsonb_build_object('portrait','${photo}') WHERE id='${id}';`,
        "vp-clanphoto",
      );
    }

    await page.goto(`${BASE}/clan/halls/${id}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4500);

    const probe = await page.evaluate(() => {
      const tour = document.querySelector("[data-clan-tour]");
      // 宗祠侧的遗像标记是 data-clan-portrait（纪念馆侧才是 data-portrait-niche）
      const niche = document.querySelector("[data-clan-portrait]");
      const r = niche?.getBoundingClientRect();
      return {
        tour: tour?.getAttribute("data-clan-tour") ?? null,
        // 旧的独立 3D 场景标记：当前架构下**不应**存在（避免双份 3D 争屏）
        legacy3d: !!document.querySelector("[data-decor-3d]"),
        niches: document.querySelectorAll("[data-clan-portrait]").length,
        w: Math.round(r?.width ?? 0),
        h: Math.round(r?.height ?? 0),
      };
    });

    check(
      `宗祠「${name}」渲染出 3D 漫游连廊`,
      probe.tour !== null,
      probe.tour ? `data-clan-tour="${probe.tour}"` : "没找到 [data-clan-tour]（ClanHall3DTour 未渲染）",
    );
    check(
      "宗祠不再渲染旧的独立 3D 场景（避免双份 3D）",
      probe.legacy3d === false,
      probe.legacy3d ? "同时出现 [data-decor-3d] 与 [data-clan-tour]" : "只渲染漫游",
    );
    if (photo) {
      check(
        "宗祠遗像安奉在牌位墙（全页唯一）",
        probe.niches === 1,
        `遗像=${probe.niches} 尺寸=${probe.w}×${probe.h}`,
      );
    } else {
      skip("宗祠遗像安奉在牌位墙", "库里没有带遗像的纪念馆可借图");
    }
  } finally {
    if (decorBak) psqlFile(`UPDATE "ClanHall" SET "templateConfig" = $q$${decorBak}$q$::jsonb WHERE id='${id}';`, "vp-rb1");
    else psql(`UPDATE "ClanHall" SET "templateConfig" = NULL WHERE id='${id}';`);
    if (archiveBak) psqlFile(`UPDATE "ClanHall" SET archive = $q$${archiveBak}$q$::jsonb WHERE id='${id}';`, "vp-rb2");
    else psql(`UPDATE "ClanHall" SET archive = NULL WHERE id='${id}';`);
    const back = psql(`SELECT coalesce("templateConfig"->'decor'->>'templateId','') FROM "ClanHall" WHERE id='${id}';`);
    const bakTpl = JSON.parse(decorBak || "{}")?.decor?.templateId ?? "";
    check("宗祠 3D 实验后已还原（脚本可重复跑）", back === bakTpl, `now=${back || "(空)"} bak=${bakTpl || "(空)"}`);
  }
}

await b.close();
const st = _ck.summary("verify-portrait-unify");
process.exit(st.fail === 0 ? 0 : 1);
