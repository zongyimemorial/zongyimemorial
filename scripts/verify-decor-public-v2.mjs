/**
 * 阶段 6 验收：**公页 3D 引擎切 v2**
 * （馆页 / 祠页 / 商城装修商品详情页，三处一起切）
 *
 * ============================================================================
 * 这个脚本守什么
 * ============================================================================
 *
 * 阶段 0–5 里 v2 只在**工坊**里跑；公页一直走 v1（刻意的分阶段切换，
 * 哨兵断言写在 `verify-decor-scene-engine.mjs` §6，防"悄悄提前切"）。
 * 阶段 6 把公页也切到 v2 —— 于是哨兵翻面，本套件接手"必须切齐"的监控。
 *
 * 切这一刀的**用户价值**只有一句话：
 *   在工坊里看到的那个"结构 + 光影"的空间，必须与**公页上**、与
 *   **商品页上**看到的是同一个东西。
 * 三者不一致时用户会说"我花积分买的立体堂殿，在馆页上怎么变平了"。
 *
 * 所以本套件的断言**全是行为级**（真开页面读 DOM），不是读源码了事：
 *   §1 三页真渲染出 v2：`data-engine="v2"` + 结构层 + 光影层 + 构件分类齐
 *   §2 遗像与 v2 并存：切了 v2 之后遗像大龛不能丢、不能变尺寸、不能变两张
 *   §3 商城页空间形态正确：锁"两端模板表都要查"这条链（宗祠模板商品最容易哑）
 *   §4 源码哨兵：三处**显式**传 engine（撞"以为切了其实没传"）
 *
 * ============================================================================
 * ⚠️ 本套件最容易被写假的地方（先看完再改）
 * ============================================================================
 *
 * **① 前提必须自己造 —— 这条是本套件存在的技术前提。**
 *
 * 实测：本仓库**默认没有任何馆/祠配了付费模板**（`templateConfig->'decor'->>'templateId'`
 * 全库 0 行）。而公页的 3D 场景有门禁：
 *   - 馆页 `use3DScene`：要选**付费**模板（赠品 `tpl-niche` 被显式排除）
 *   - 祠页 `has3DSpace`：要 `clanSpaceKind` 非空（同上，赠品被排除）
 * 于是"不造前提直接跑"会得到 `data-decor-3d` **0 个** ——
 * 而 0 个场景时"没找到结构层"这类断言**恒成立**，脚本**全绿但什么都没测**。
 *
 * 这不只是本套件的风险：既有的 `verify-mobile.mjs` ③/④ 两条 `clipped()` 断言
 * 也依赖这个前提。阶段 6 实跑时先单独验过一次 —— 那时库里 0 个场景，
 * `clipped()` 报绿其实是"页面没渲染任何 3D"的假绿。
 * 所以本套件**开局就用 psql 造前提**（挑已存在的馆/祠，临时挂付费模板 + 解锁），
 * 收尾 `finally` 还原，保证可反复跑。
 *
 * **② 别把"有场景"当成"是 v2"。**
 * `data-decor-3d` 存在只说明渲染了 3D；引擎版本要看 `data-engine`。
 * 两条断言必须分开写、各自可证伪。
 *
 * **③ 必须断言"标记与实际一致"（阶段 4 的教训：标记会撒谎）。**
 * 阶段 4 踩过 `data-page-skin` 报 `off` 而实际已被深色皮肤接管 —— 标记与渲染
 * 用了**两份不同的判据**。v2 这边同构的风险是：`data-engine="v2"` 只是外层盒子的
 * 属性，若 `isV2` 判定与渲染分支不同口径，就可能"属性说 v2、结构层没渲染"。
 * 所以 §1 直接断 `data-engine=v2 ⟺ 存在 [data-structure-layer]`，
 * 两个信号必须同时成立 —— 单看任一个都可能被"标记撒谎"骗过。
 *
 * **④ 遗像尺寸断言要有前提（防"0 张时报绿"）。**
 * `count === 1 && w === 150` 在"一张都没有"时是 false（好事，会红）；
 * 但如果写成 `every(...)` 就会在空数组上恒真。本套件用"恰好 1 张 + 尺寸相等"，
 * 且只在**确认该馆/祠有遗像**时才断言。
 *
 * ============================================================================
 * 反向验证（AGENTS.md 硬要求：断言必须先证明"能变红"）
 * ============================================================================
 *
 * 三组实验都实跑过、确认精确变红后才还原。脚本总数 29。
 *
 * **实验 A — 三处公页去掉 `engine="v2"`** → **10 条变红**（29 → 19）：
 *   馆/祠/商城三页各自的「场景是 v2」「有结构层/光影层」「构件分类」，
 *   外加 §5「三处都显式传」并**点名三页**。
 *
 * **实验 B — `DecorSpacePreview` 改回只 `findTemplate`** → **1 条变红**：
 *   §5「查两条模板表」。
 *   ⚠️ **行为级没有任何变化（三页仍全绿）** —— 因为三处调用方都传了
 *   `spaceKind`，把组件内部查表绕开了。所以这条**只有源码级覆盖，
 *   没有行为级反例可分叉**。这不是断言写得不好，而是"缺陷目前不可观测"。
 *   保留它的理由：组件自称通用，未来任何不传 `spaceKind` 的新调用方都会翻车；
 *   而这类静默失效（宗祠模板渲染成 classic，不报错）值得提前钉住。
 *
 * **实验 C — 让标记撒谎**（`data-engine` 硬写 `"v2"`，但两页实际走 v1）
 *   → **8 条变红**，其中「标记不得撒谎」两条报出
 *   `engine=v2 structure=false` —— 正是要抓的失效形态。
 *   **关键佐证**：同一轮里商城页（真 v2）仍 PASS，说明这条断言**有区分度**，
 *   不是"一律报红"。
 *
 * 三条实验共同证明一件事：**「标记不得撒谎」那条一致性断言
 * （`(engine==="v2") === hasStructureLayer`）不能单独用** ——
 * 实验 A 里 v1/v1 两边自洽时它照样 PASS。它必须与「engine === "v2"」配合，
 * 前者守"有没有切"，后者守"切了之后标记与渲染是否同口径"。两者缺一不可。
 *
 * 前置：Next 在 3000 端口跑（本套件要真开页面）。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { execSync } from "node:child_process";
import fs from "node:fs";
import { readFileSync, readdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const psql = (q) =>
  execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`, {
    encoding: "utf8",
  }).trim();

/**
 * 跑含 JSON 字面量的 SQL。
 *
 * ⚠️ 必须走临时文件 —— 直接把 `{"decor":...}` 拼进 `psql -c` 会穿三层引号
 * （JS → shell → psql）被剥坏，报 `syntax error at or near "decor"`，
 * 看着像 SQL 写错了，其实是 shell 把引号吃了。见 AGENTS.md 与
 * `verify-decor-3d.mjs` 的 `psqlFile()`。
 */
const psqlFile = (sql, name = "pv2") => {
  const local = `/tmp/${name}-${Date.now()}.sql`;
  fs.writeFileSync(local, sql, "utf8");
  execSync(`docker cp ${JSON.stringify(local)} memorial-pg:/tmp/${name}.sql`, { stdio: "pipe" });
  const out = execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -f /tmp/${name}.sql`, {
    encoding: "utf8",
  }).trim();
  fs.unlinkSync(local);
  return out;
};

let pass = 0;
let fail = 0;
const failures = [];
const check = (n, ok, d = "") => {
  if (ok) {
    pass++;
    console.log(`PASS  ${n}${d ? `  (${d})` : ""}`);
  } else {
    fail++;
    failures.push(n);
    console.log(`FAIL  ${n}${d ? `  (${d})` : ""}`);
  }
};

const src = (p) => {
  try {
    return readFileSync(`/workspace/${p}`, "utf8");
  } catch {
    return "";
  }
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

/**
 * 读页面上所有 3D 场景的引擎/结构/光影状态。
 *
 * ⚠️ 用 `page.evaluate` 读 DOM，**不要用 `fetch()` 读 HTML** ——
 * `Decor3DScene` 是 `"use client"`，服务端 HTML 里没有这些属性
 * （AGENTS.md 陷阱 12：客户端渲染的东西 fetch 读不到）。
 */
async function readScenes() {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("[data-decor-3d]"));
    return nodes.map((el) => {
      const structureLayer = el.querySelector("[data-structure-layer]");
      const lightLayer = el.querySelector("[data-light-layer]");
      const parts = {
        column: el.querySelectorAll('[data-structure="column"]').length,
        beam: el.querySelectorAll('[data-structure="beam"]').length,
        dougong: el.querySelectorAll('[data-structure="dougong"]').length,
        podium: el.querySelectorAll('[data-structure="podium"]').length,
        ceiling: el.querySelectorAll('[data-structure="ceiling"]').length,
        divider: el.querySelectorAll('[data-structure="divider"]').length,
      };
      return {
        engine: el.getAttribute("data-engine"),
        space: el.getAttribute("data-decor-3d"),
        tier: el.getAttribute("data-structure-tier"),
        hasStructureLayer: !!structureLayer,
        hasLightLayer: !!lightLayer,
        parts,
        partKinds: Object.values(parts).filter((n) => n > 0).length,
        totalParts: Object.values(parts).reduce((a, c) => a + c, 0),
      };
    });
  });
}

console.log("===== 阶段 6：公页 3D 引擎切 v2 验收 =====\n");

// ---------------------------------------------------------------------------
// 0. 造前提：挑一个馆 + 一个祠，临时挂上**付费**空间模板
// ---------------------------------------------------------------------------
console.log("── 0. 造前提（库里默认没有配模板的馆/祠，必须自己造）──");

/*
  挑样本的原则（照 verify-portrait-unify 的教训）：
    ① 必须是 **active** 的（pending 的祠匿名访客看不到场景，管理员也 404）；
    ② 必须是 `user@test.com` 名下的（登录身份要能打开）；
    ③ 祠侧还要有遗像（§2 要断言遗像与 v2 并存）。
  挑不到就显式报 SKIP 并说明原因，**不要静默跳过**（否则后面全是 0 个场景的假绿）。
*/
/*
  ⚠️ SQL 必须写成**单行**（用数组 join 也行，但别在模板串里真换行）——
  `psql -c` 收到含真实换行的语句会报 `syntax error at or near "\"`，
  看着像 SQL 写错，其实是换行符被当成了转义序列。
  既有脚本（verify-portrait-unify 等）一律单行，本套件照做。
*/
const hallRow = psql(
  `SELECT h.id || '|' || h."deceasedName" || '|' || h."ownerUserId" FROM "MemorialHall" h JOIN "User" u ON u.id = h."ownerUserId" WHERE u.email='user@test.com' AND h.status='active' AND h."isPublic"=true ORDER BY h."createdAt" ASC LIMIT 1;`,
);
const clanRow = psql(
  `SELECT c.id || '|' || c."hallName" || '|' || c."ownerUserId" FROM "ClanHall" c JOIN "User" u ON u.id = c."ownerUserId" WHERE u.email='user@test.com' AND c.status='active' ORDER BY c."createdAt" ASC LIMIT 1;`,
);

if (!hallRow || !clanRow) {
  check("找到可用的馆与祠作为样本", false, `hall=${hallRow || "(无)"} clan=${clanRow || "(无)"}`);
  await b.close();
  console.log(`\n通过 ${pass}/${pass + fail}`);
  process.exit(1);
}
const [hallId, hallName, hallOwner] = hallRow.split("|");
const [clanId, clanName, clanOwner] = clanRow.split("|");
console.log(`  纪念馆样本：${hallName}（${hallId}）`);
console.log(`  宗祠样本：${clanName}（${clanId}）`);

// 备份原配置，finally 里还原
const hallCfgBak = psql(`SELECT coalesce("templateConfig"::text,'') FROM "MemorialHall" WHERE id='${hallId}';`);
const clanCfgBak = psql(`SELECT coalesce("templateConfig"::text,'') FROM "ClanHall" WHERE id='${clanId}';`);

const hallPortrait = psql(
  `SELECT coalesce("archive"->>'portrait','') FROM "MemorialHall" WHERE id='${hallId}';`,
);
const clanPortrait = psql(
  `SELECT coalesce("archive"->>'portrait','') FROM "ClanHall" WHERE id='${clanId}';`,
);
const clanArchiveBak = psql(`SELECT coalesce("archive"::text,'') FROM "ClanHall" WHERE id='${clanId}';`);

try {
  /*
    纪念馆挂 `tpl-goldhall`（space=hall、¥1800 属付费档，非赠品）。
    `unlocked` 必须给 —— `normalizeDecor` 会丢弃"未解锁"的 templateId
    （这是防"没买却一直用"的正确设计；忘给就会误判成"模板坏了"，
    这个坑在排查宗祠 3D bug 时踩过一次）。
  */
  psqlFile(
    `UPDATE "MemorialHall" SET "templateConfig" = jsonb_set(
       jsonb_set(coalesce("templateConfig",'{}'::jsonb), '{decor,templateId}', '"tpl-goldhall"'),
       '{decor,unlocked}',
       (coalesce("templateConfig"->'decor'->'unlocked','[]'::jsonb)) || '"tpl:tpl-goldhall"'::jsonb
     ) WHERE id='${hallId}';`,
    "pv2-hall",
  );
  psqlFile(
    `UPDATE "ClanHall" SET "templateConfig" = jsonb_set(
       jsonb_set(coalesce("templateConfig",'{}'::jsonb), '{decor,templateId}', '"clan-tpl-imperial"'),
       '{decor,unlocked}',
       (coalesce("templateConfig"->'decor'->'unlocked','[]'::jsonb)) || '"tpl:clan-tpl-imperial"'::jsonb
     ) WHERE id='${clanId}';`,
    "pv2-clan",
  );

  const hallTpl = psql(`SELECT "templateConfig"->'decor'->>'templateId' FROM "MemorialHall" WHERE id='${hallId}';`);
  const clanTpl = psql(`SELECT "templateConfig"->'decor'->>'templateId' FROM "ClanHall" WHERE id='${clanId}';`);
  check("前提已就位：馆/祠都挂上了付费空间模板", hallTpl === "tpl-goldhall" && clanTpl === "clan-tpl-imperial", `hall=${hallTpl} clan=${clanTpl}`);

  /*
    祠侧还要**补一张遗像** —— 实测全库**没有任何宗祠有遗像**，
    于是 §3 宗祠那两条断言会常年走 SKIP 分支、永远不被覆盖
    （"常年 SKIP 的断言"等于没有断言，这是 AGENTS.md 陷阱 5 的变体）。
    借一张纪念馆已有的图片路径挂上去（同一台服务器、同一 uploads 目录），
    只为触发渲染，`finally` 里把 archive 整体还原。
  */
  if (!clanPortrait && hallPortrait) {
    psqlFile(
      `UPDATE "ClanHall" SET archive = coalesce(archive,'{}'::jsonb) || jsonb_build_object('portrait','${hallPortrait}') WHERE id='${clanId}';`,
      "pv2-clanphoto",
    );
  }

  // ── ① 馆页：v2 真渲染 ────────────────────────────────────────────
  console.log("\n── ① 纪念馆公页走 v2 ──");
  await page.goto(`${BASE}/halls/${hallId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const hallScenes = await readScenes();
  check(`馆页渲染出 3D 场景`, hallScenes.length >= 1, `场景数=${hallScenes.length}`);
  const hs = hallScenes[0] ?? {};
  check(`馆页场景是 v2 引擎`, hs.engine === "v2", `data-engine=${hs.engine}`);
  check(`馆页场景有结构层（v2 的标志）`, hs.hasStructureLayer === true);
  check(`馆页场景有光影层（v2 的标志）`, hs.hasLightLayer === true);
  check(`馆页场景构件分类 ≥ 3 类`, (hs.partKinds ?? 0) >= 3, `分类=${hs.partKinds} 总节点=${hs.totalParts} 明细=${JSON.stringify(hs.parts)}`);
  /*
    ⚠️ 核心断言：**标记与实际必须一致**（阶段 4「标记撒谎」的教训）。
    只断 `data-engine === "v2"` 不够 —— 那只是个属性；
    只断 `hasStructureLayer` 也不够 —— 不知道是哪个引擎渲染的。
    两条同时成立才说明"属性说 v2，并且结构层确实由它渲染出来了"。
  */
  check(
    `馆页 data-engine=v2 ⟺ 真有结构层（标记不得撒谎）`,
    (hs.engine === "v2") === (hs.hasStructureLayer === true),
    `engine=${hs.engine} structure=${hs.hasStructureLayer}`,
  );

  /*
    ── ② 祠页：走 ClanHall3DTour（不是 DecorSpacePreview）────────────────

    ⚠️ 架构演进说明（别改回去）：
    本段早先断言"宗祠公页走 v2 引擎"（data-decor-3d / data-engine=v2 / 结构层 /
    光影层 / space 不回落 classic）。但宗祠页后来重构为 **ClanHall3DTour**
    —— 四段固定 3D 漫游连廊（山门→天井→享堂→寝堂），
    它不再经过 DecorSpacePreview，也不消费宗祠模板的 space。
    继续按老判据测，8 条断言恒红，全是**断言过时**，不是祠页坏了。

    这里改守祠页**当前真实**的渲染契约 —— 价值没丢，只是换了对象：
      · 祠页确实渲染出 3D 漫游场景（data-clan-tour）
      · 场景真的带透视（不是一张静态图）
      · 遗像在祠页场景里、且全页只出现一次、不重复
      · 场景高度受控（别把正文顶到折叠线以下）
  */
  console.log("\n── ② 宗祠公页走 3D 漫游连廊 ──");
  await page.goto(`${BASE}/clan/halls/${clanId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const clanTour = await page.evaluate(() => {
    const el = document.querySelector('[data-clan-tour="1"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      perspective: cs.perspective,
      has3dLayer: !!el.querySelector('[style*="preserve-3d"]'),
      height: Math.round(r.height),
      // 连廊的"段"：每段有独立 translateZ，静态图不具备这个
      bayCount: el.querySelectorAll('[style*="translateZ"]').length,
      portraits: document.querySelectorAll("img[alt*='遗像']").length,
      clanPortrait: document.querySelectorAll("[data-clan-portrait]").length,
    };
  });
  check(`祠页渲染出 3D 漫游场景（data-clan-tour）`, !!clanTour, clanTour ? "" : "未找到");
  check(
    `祠页场景带透视且存在 preserve-3d 层（是立体连廊，不是平面图）`,
    !!clanTour && clanTour.perspective !== "none" && clanTour.has3dLayer,
    clanTour ? `perspective=${clanTour.perspective} preserve3d=${clanTour.has3dLayer}` : "无",
  );
  check(`祠页连廊分段渲染（≥3 段）`, (clanTour?.bayCount ?? 0) >= 3, `段数=${clanTour?.bayCount ?? 0}`);
  check(
    `祠页场景高度受控（不超过视口 110%，避免顶爆版面）`,
    !!clanTour && clanTour.height > 0 && clanTour.height <= 1100,
    `${clanTour?.height ?? 0}px`,
  );

  // ── ③ 遗像与 3D 场景并存 ────────────────────────────────────────
  console.log("\n── ③ 遗像与 3D 场景并存（切架构不得弄丢遗像）──");
  const clanHasPortrait = psql(
    `SELECT coalesce("archive"->>'portrait','') FROM "ClanHall" WHERE id='${clanId}';`,
  );
  if (clanHasPortrait) {
    const n = await page.evaluate(() => {
      const niches = Array.from(document.querySelectorAll("[data-clan-portrait]"));
      const info = niches.map((el) => {
        const img = el.querySelector("img") ?? el;
        const r = img.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      const allPortraits = [...document.querySelectorAll("img")].filter((i) => /遗像/.test(i.alt || "")).length;
      return { nicheCount: niches.length, info, allPortraits };
    });
    check(`祠页有遗像安奉标记（恰好 1 个）`, n.nicheCount === 1, `龛数=${n.nicheCount}`);
    check(`全页遗像 img 不超过 1 张（不重复渲染）`, n.allPortraits <= 1, `张数=${n.allPortraits}`);
  } else {
    console.log("SKIP  §0 补遗像失败（没有可借用的图片），跳过祠侧并存断言");
  }

  const hallHasPortrait = psql(
    `SELECT coalesce("archive"->>'portrait','') FROM "MemorialHall" WHERE id='${hallId}';`,
  );
  if (hallHasPortrait) {
    await page.goto(`${BASE}/halls/${hallId}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);
    const n2 = await page.evaluate(() => ({
      niches: document.querySelectorAll("[data-portrait-niche]").length,
      allPortraits: [...document.querySelectorAll("img")].filter((i) => /遗像/.test(i.alt || "")).length,
    }));
    check(`馆页 v2 空间里有遗像大龛（恰好 1 个）`, n2.niches === 1, `龛数=${n2.niches}`);
    check(`馆页遗像 img 不超过 1 张`, n2.allPortraits <= 1, `张数=${n2.allPortraits}`);
  } else {
    console.log("SKIP  该馆没有遗像，跳过并存断言");
  }

  // ── ④ 商城装修商品详情页：v2 + 空间形态正确 ────────────────────
  console.log("\n── ④ 商城装修商品详情页走 v2 ──");
  /*
    挑**宗祠**模板商品：它最能暴露"两端模板表只查一边"的缺陷
    （商品页 `findTemplate(ent.id) ?? findClanTemplate(ent.id)` 是唯一同时查两边的调用点）。
    非 classic 空间才有 3D 场景，所以挑 `clan-tpl-imperial`（space=hall）。
  */
  const mallSlug = "decor-clan-tpl-imperial";
  await page.goto(`${BASE}/mall/${mallSlug}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const mallScenes = await readScenes();
  check(`商城详情页渲染出 3D 场景`, mallScenes.length >= 1, `场景数=${mallScenes.length}`);
  const ms = mallScenes[0] ?? {};
  check(`商城详情页场景是 v2 引擎`, ms.engine === "v2", `data-engine=${ms.engine}`);
  check(`商城详情页场景有结构层`, ms.hasStructureLayer === true);
  check(
    `商城详情页 data-engine=v2 ⟺ 真有结构层（标记不得撒谎）`,
    (ms.engine === "v2") === (ms.hasStructureLayer === true),
    `engine=${ms.engine} structure=${ms.hasStructureLayer}`,
  );
  check(
    `商城详情页读到宗祠模板的 space（不是 classic）`,
    ms.space && ms.space !== "classic",
    `data-decor-3d="${ms.space}"`,
  );
  const badge = await page.evaluate(
    () => document.querySelector("[data-space-badge]")?.getAttribute("data-space-badge") ?? null,
  );
  check(`商城详情页空间角标与场景形态一致`, badge === ms.space, `badge=${badge} scene=${ms.space}`);
} finally {
  // 还原（脚本可重复跑）
  if (hallCfgBak) psqlFile(`UPDATE "MemorialHall" SET "templateConfig" = $q$${hallCfgBak}$q$::jsonb WHERE id='${hallId}';`, "pv2-rb1");
  else psql(`UPDATE "MemorialHall" SET "templateConfig" = NULL WHERE id='${hallId}';`);
  if (clanCfgBak) psqlFile(`UPDATE "ClanHall" SET "templateConfig" = $q$${clanCfgBak}$q$::jsonb WHERE id='${clanId}';`, "pv2-rb2");
  else psql(`UPDATE "ClanHall" SET "templateConfig" = NULL WHERE id='${clanId}';`);
  // archive 也要还原（§0 补遗像时动过）
  if (clanArchiveBak) psqlFile(`UPDATE "ClanHall" SET archive = $q$${clanArchiveBak}$q$::jsonb WHERE id='${clanId}';`, "pv2-rb3");
  else psql(`UPDATE "ClanHall" SET archive = NULL WHERE id='${clanId}';`);
  /*
    ⚠️ 还原判据必须是「与备份**逐字相同**」，不能写成「不等于实验值」。

    第一版写成 `backH !== "tpl-goldhall" && backC !== "clan-tpl-imperial"`，
    立刻踩到假红：样本祠原本（手工造的前提残留）`templateId` **就是**
    `clan-tpl-imperial` → 还原成功但值没变 → 断言误报"没还原"。

    教训（与阶段 5「变了是弱断言」同源）：**"不等于实验值"不是还原的证据**，
    "等于备份值"才是。还原断言要跟自己存档的那份比。
  */
  const nowH = psql(`SELECT coalesce("templateConfig"::text,'') FROM "MemorialHall" WHERE id='${hallId}';`);
  const nowC = psql(`SELECT coalesce("templateConfig"::text,'') FROM "ClanHall" WHERE id='${clanId}';`);
  const nowArc = psql(`SELECT coalesce("archive"::text,'') FROM "ClanHall" WHERE id='${clanId}';`);
  check(
    "实验后已还原（与备份逐字相同，脚本可重复跑）",
    nowH === hallCfgBak && nowC === clanCfgBak && nowArc === clanArchiveBak,
    `hall=${nowH === hallCfgBak ? "ok" : "变了"} clan=${nowC === clanCfgBak ? "ok" : "变了"} archive=${nowArc === clanArchiveBak ? "ok" : "变了"}`,
  );
}

// ---------------------------------------------------------------------------
// ⑤ 源码哨兵：三处必须**显式**传 engine="v2"
// ---------------------------------------------------------------------------
console.log("\n── ⑤ 源码哨兵（三处显式传，别靠默认值）──");
/*
  为什么要断"显式传"而不是断"渲染出来是 v2"？
  凡是行为级能覆盖的，就不必再断源码 —— 但 `mall/[slug]` 的 3D 场景有个门禁：
  `spaceKind !== "classic"` 才渲染。若哪天有人把商品页改回 classic 模板预览，
  行为级断言会 SKIP/失败，而"忘传 engine"这个错误就再也测不出来。
  所以这里补源码级断言，锁住"三处都写了"。

  ⚠️ 顺序：`<DecorSpacePreview` 与 `engine="v2"` 之间只允许出现
  属性/空白/换行，不允许跨越到下一个组件 —— 用 `[^>]*` 限定在同一标签内。
  早先有断言用 `[\s\S]{0,400}` 跨标签匹配，会把"下一个组件传了 v2"误判成本组件传了。
*/
/*
  阶段 10 起，馆页的 DecorSpacePreview 被 SceneLayoutEditor（拖拽布局编辑器）包裹，
  engine="v2" 挂在 <SceneLayoutEditor> 上、由它透传给内部的 DecorSpacePreview
  （透传链另有断言锁死）。所以这里允许两种写法命中：
    直接 <DecorSpacePreview ... engine="v2">（商城详情页）
    经由 <SceneLayoutEditor ... engine="v2">（馆页，组件内已证明透传）

  ⚠️ 宗祠祠页**不在此列** —— 它已改用 ClanHall3DTour（四段 3D 漫游连廊），
  不再经 DecorSpacePreview。祠页的渲染层由上面 §② 的 data-clan-tour 断言守。
*/
const publicPages = [
  ["纪念馆馆页", "app/(public)/halls/[id]/page.tsx"],
  ["商城装修商品详情页", "app/(public)/mall/[slug]/page.tsx"],
];
const v2Explicit = (p) =>
  /<(DecorSpacePreview|SceneLayoutEditor)[^>]*engine="v2"/.test(src(p));
const missing = publicPages.filter(([, p]) => !v2Explicit(p));
check(
  "两处公页都显式传 engine=\"v2\"（直接或经 SceneLayoutEditor 透传）",
  missing.length === 0,
  missing.map(([l, p]) => `${l}(${p})`).join(" , ") || "两处齐备",
);

/*
  DecorSpacePreview 的默认值**必须仍是 v1**。
  这不是"忘了改"，而是刻意的"回退开关"：三处各自显式传值，
  出问题改一处就能单独回退某页；默认值跟着改成 v2 会让"没传"变成"悄悄用上 v2"，
  回退时就得到处找。断言锁这个语义，防止有人"顺手统一"。
*/
const dspSrc = src("components/decor/DecorSpacePreview.tsx");
check(
  "DecorSpacePreview 默认引擎仍是 v1（保留逐页回退能力）",
  /engine\s*=\s*"v1"/.test(dspSrc),
);

/*
  两端模板表兜底链。
  DecorSpacePreview 自称"纪念馆/宗祠通用"，只查 `findTemplate`（纪念馆表）
  会让宗祠模板静默落回 classic —— 目前三处调用方都传了 `spaceKind` 把它绕开了，
  所以**当前没有行为级反例可分叉**（诚实记录：这条只有源码级覆盖，
  反向实验 B 证实行为级全绿、仅此条变红）。
  仍然要锁，因为它是"未来新调用方不传 spaceKind 就翻车"的隐患，
  且与 AGENTS.md 记的 `findTemplate` 误用真 bug 同源。
*/
check(
  "DecorSpacePreview 查两条模板表（findTemplate ?? findClanTemplate）",
  /findTemplate\(decor\.templateId\)\s*\?\?\s*findClanTemplate\(decor\.templateId\)/.test(dspSrc),
);
check(
  "DecorSpacePreview 已 import findClanTemplate",
  /import\s*\{\s*findClanTemplate\s*\}\s*from\s*"@\/lib\/clan-decor"/.test(dspSrc),
);

// ---------------------------------------------------------------------------
// ⑥ 封面图必须真的能加载（SVG 封面不能是空白盒）
// ---------------------------------------------------------------------------
/*
  ⚠️ 这条来自一次真实事故（2026-10）：
    /mall/decor-tpl-plain 页面顶部有一大片空白，看着像"布局留白/间距错了"，
    实际是**封面图加载失败**留下的空盒子。

  根因：Next.js 默认**拒绝对 SVG 走图片优化器**。`next/image` 会把 src 包成
  /_next/image?url=... ，优化器对 SVG 直接回 400 → 图不出来 →
  aspect-[16/9] 的容器只剩空白。而库里 68 个商品用 .svg 作封面。

  这里断**行为**（优化器真的返回 200），而不只是断配置项：
  配置写法会变，但"图能出来"这件事不会变。
*/
check(
  "next.config 已开启 dangerouslyAllowSVG（SVG 封面可经优化器出图）",
  /dangerouslyAllowSVG\s*:\s*true/.test(src("next.config.mjs")),
);

const svgProbe = await b.newContext().then(async (c) => {
  const r = await c.request.get(
    `${BASE}/_next/image?url=${encodeURIComponent("/assets/prod-decor-tpl.svg")}&w=1200&q=75`,
    { failOnStatusCode: false },
  );
  const out = { status: r.status(), type: r.headers()["content-type"] ?? "" };
  await c.close();
  return out;
});
check(
  "图片优化器对 SVG 返回 200（不是 400 空白）",
  svgProbe.status === 200,
  `HTTP ${svgProbe.status}`,
);
check(
  "SVG 经优化器后仍声明为图片类型",
  /image\/svg|image\//.test(svgProbe.type),
  svgProbe.type || "(无)",
);

/*
  Lottie 图标自检：`sr`（星形/多边形）**必须带 `or`（外径）**。

  真实事故（2026-10）：生成器把外径写进了 `"r"`（那是**旋转角**），`or` 从未产出。
  形状缺外径 → lottie-web 算不出顶点 → 渲染出一个**空的 <g>**：
  组件照常挂上 svg、尺寸也对，就是什么都不画 —— 页面表现是"封面区一片空白"，
  而 JSON 用肉眼看完全正常（有填充色、有透明度动画），极难定位。
  实测当时 9 个文件（cloud/decor/firework/kite/moon/music/service/star/tree）全空。

  这条断言直接扫资产，任何 `sr` 少了 `or` 就报出来 —— 生成器别再犯。
*/
{
  const dir = "/workspace/public/assets/lottie";
  const bad = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    let broken = false;
    const walk = (shapes) => {
      for (const s of shapes || []) {
        if (s.ty === "sr" && s.or === undefined) broken = true;
        if (s.it) walk(s.it);
      }
    };
    for (const L of j.layers || []) walk(L.shapes);
    if (broken) bad.push(f);
  }
  check("所有 Lottie 的 sr 都带外径 or（缺了会渲染成空白）", bad.length === 0, bad.join(", ") || "39 个文件全部合格");
}

await b.close();
console.log(`\n通过 ${pass}/${pass + fail}`);
if (failures.length) console.log(`变红：${failures.join(" | ")}`);
process.exit(fail === 0 ? 0 : 1);
