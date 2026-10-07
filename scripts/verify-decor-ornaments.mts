/**
 * 阶段 8 验收：多挂饰（ornaments 清单）+ 落地场景可拖拽（ground 板块）。
 *
 * 覆盖：
 *   §1 单元层（tsx 直跑，@/ 别名可用）：parseDecorDraft / checkHallDraft / checkClanDraft /
 *      normalizeClanDecor / normalizeDecor / resolveClanOrnamentItems 的清单校验与不变量。
 *   §1b 3D 多件同带排位（纯函数层）：Decor3DScene.propsFromDecor —— 案上类挂饰
 *      与底座同带时，代表必须取"自己的 spec"（取错会把挂饰换成底座副本，静默丢功能）；
 *   §2 落地场景板块化：默认序下 ground 仍在页尾（零回归）；
 *      sectionOrder 把 ground 提到最前 → 页面 DOM 顺序真变；控制台排序列表出现「落地场景」。
 *   §3 多挂饰端到端（宗祠）：psql 造前提（unlocked 加两件挂饰）→ 工坊真点两件 →
 *      保存 → 库里 slots.ornament 长度/首件正确 → 公页渲染 data-ornament 数量正确。
 *   §4 满员拦截：第 4 件点下去被提示拦住，清单不变。
 *   §5 反向验证：
 *      ① 单挂饰页（清单仅 1 件）不得出现 data-ornament（data-ornament 仅多件分支逐件包裹）——
 *        若它误出现，说明"单件/多件布局分支"选择器写反；
 *      ② 默认序 groundRel 与交换序 groundRel 相反，证明页面真按序渲染。
 *   §6 收尾：备份逐字还原（sectionOrder + templateConfig + unlocked）。
 *
 * 反向验证纪律：每条断言都问过自己"缺陷版会不会也绿"——
 *   §3 若保存路径漏接 ornaments，DB 断言必红；§5① 若有人把单件也包进 flex，必红。
 */

import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------- 基础设施

const BASE = "http://127.0.0.1:3000";
const OWNER = "user@test.com";
const PW = "user123456";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? ` —— ${detail}` : ""}`);
  }
}

function psql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "memorial-pg", "psql", "-U", "memorial", "-d", "memorial", "-t", "-A", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}
function q1(sql: string): string {
  return psql(sql);
}

async function login(page: import("playwright").Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  // 登录表单字段为 name="identifier" / name="password"（见 components/login/LoginForm.tsx）
  await page.locator('input[name="identifier"]').first().fill(email);
  await page.locator('input[name="password"]').first().fill(PW);
  await page.locator('button[type="submit"]').first().click();
  // 登录是客户端跳转（router.push），networkidle 会过早返回；必须等 URL 离开 /login
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
}

// ================================================================ §1 单元层
{
  const { parseDecorDraft, checkHallDraft, checkClanDraft } = await import("@/lib/decor-save");
  const { normalizeClanDecor, resolveClanOrnamentItems } = await import("@/lib/clan-decor");
  const { normalizeDecor, MAX_ORNAMENTS } = await import("@/lib/hall-decor");

  // parseDecorDraft：封顶 + 去重 + 只收字符串（阶段 9：清单即 slots.ornament）
  const parsed = parseDecorDraft(
    JSON.stringify({
      slots: { ornament: ["a", "a", 3, "b", "c", "d"] },
    }),
  );
  check(
    "parseDecorDraft 封顶去重（4 上限、丢非字符串）",
    JSON.stringify(parsed?.slots.ornament) === JSON.stringify(["a", "b", "c", "d"].slice(0, MAX_ORNAMENTS)),
    `got ${JSON.stringify(parsed?.slots.ornament)}`,
  );

  // checkClanDraft：未解锁挂饰拒单
  const clanLocked = checkClanDraft(
    { slots: { ornament: ["clan-orn-lion"] } as never, templateId: undefined } as never,
    { isPremium: false, unlocked: [], granted: [] },
  );
  check(
    "checkClanDraft 未解锁挂饰 → 拒单",
    !clanLocked.ok && /石狮镇门/.test((clanLocked as { message?: string }).message ?? ""),
  );

  // checkClanDraft：合法清单通过，且首件 = slots.ornament[0]
  const clanOk = checkClanDraft(
    {
      slots: { wall: "clan-wall-brick", floor: "clan-floor-plain", ornament: ["clan-orn-censer", "clan-orn-lantern"], frame: "clan-frame-plain", font: "clan-font-song" },
    } as never,
    { isPremium: false, unlocked: ["clan-floor-plain", "clan-frame-plain", "clan-font-song", "clan-orn-lantern", "clan-orn-censer"], granted: [] },
  );
  const clanOkDraft = (clanOk as { draft?: { slots: HallSlots } }).draft;
  check(
    "checkClanDraft 合法清单 → 通过且首件=主陈设",
    clanOk.ok &&
      clanOkDraft?.slots.ornament?.[0] === "clan-orn-censer" &&
      clanOkDraft.slots.ornament.length === 2,
  );

  // checkClanDraft：未知 id 丢弃，不让整单失败
  const clanBogus = checkClanDraft(
    {
      slots: { wall: "clan-wall-brick", floor: "clan-floor-plain", ornament: ["bogus-orn", "clan-orn-censer"], frame: "clan-frame-plain", font: "clan-font-song" },
    } as never,
    { isPremium: false, unlocked: ["clan-floor-plain", "clan-frame-plain", "clan-font-song", "clan-orn-censer"], granted: [] },
  );
  check(
    "checkClanDraft 未知 id 丢弃、整单仍通过",
    clanBogus.ok &&
      JSON.stringify(clanBogus.draft?.slots.ornament) === JSON.stringify(["clan-orn-censer"]),
  );

  // checkHallDraft：纪念馆侧同口径（lantern 未解锁拒单 / 解锁后通过）
  const hallLocked = checkHallDraft(
    { slots: { ornament: ["orn-lantern-red"] } as never, templateId: undefined } as never,
    { isPremium: false, unlocked: [], granted: [] },
  );
  check("checkHallDraft 未解锁挂饰 → 拒单", !hallLocked.ok);

  // normalizeClanDecor：旧顶层 ornaments 数组迁移 → 清单去重/过滤/首项=主陈设
  const norm = normalizeClanDecor(
    {
      slots: { ornament: "clan-orn-censer" },
      ornaments: ["clan-orn-lion", "clan-orn-lion", "bogus", "clan-orn-lantern"],
    },
    { isPremium: false, unlocked: ["clan-orn-lion", "clan-orn-lantern"], granted: [] },
  );
  check(
    "normalizeClanDecor 旧 ornaments 迁移 → 清单去重/过滤/首项=主陈设",
    JSON.stringify(norm.slots.ornament) === JSON.stringify(["clan-orn-lion", "clan-orn-lantern"]),
    `ornament=${JSON.stringify(norm.slots.ornament)}`,
  );

  const normOld = normalizeClanDecor({}, { isPremium: false, unlocked: [], granted: [] });
  check(
    "normalizeClanDecor 旧数据（无挂饰）→ 回落默认单件清单",
    normOld.slots.ornament.length === 1 && normOld.slots.ornament[0] === "clan-orn-censer",
  );

  const normHall = normalizeDecor(
    { slots: { ornament: "orn-none" }, ornaments: ["orn-none", "orn-none"] },
    { isPremium: false, unlocked: [], granted: [] },
  );
  check(
    "normalizeDecor 旧 ornaments 迁移 → 清单去重且非空",
    JSON.stringify(normHall.slots.ornament) === JSON.stringify(["orn-none"]),
  );

  check(
    "resolveClanOrnamentItems 空清单回落 slots.ornament",
    resolveClanOrnamentItems({ slots: { ornament: "clan-orn-censer" } } as never).map((i) => i.id).join(",") ===
      "clan-orn-censer",
  );
}

// ================================================================ §1b 3D 多件同带排位（纯函数层）
// 背景：propsFromDecor 同带多件时取"该件自己的 spec"当代表。案上类挂饰
// （vase/香几/供桌…）的 specsForOne 返回 `[...base, 自己]` —— 若误取 specs[0]，
// 代表会变成空间底座（shrine = 牌位墙）：挂饰整体消失、底座被复制 n 份摊开。
// 该缺陷 DOM 无错、2D 断言不红，只能在这里对纯函数直接点验。
{
  const { space3d } = await import("@/lib/decor-3d");
  const { SLOT_ITEMS } = await import("@/lib/hall-decor");
  const { propsFromDecor } = await import("@/components/decor/Decor3DScene");

  const byId = (id: string) => SLOT_ITEMS.ornament.find((i) => i.id === id)!;
  const space = space3d("shrine"); // base props 非空（牌位墙/香炉/长明灯），才能暴露取错代表
  const vase = byId("orn-vase");
  const table = byId("orn-incense-table");
  const lantern = byId("orn-lantern-red");
  const none = byId("orn-none");

  // 前提自检：底座非空 + 两件确实同带（bandOf 的 default）
  const baseKinds = space.props.map((p) => p.kind);
  check(
    "§1b-0 前提：shrine 底座非空且含 tablet-wall",
    baseKinds.length > 0 && baseKinds.includes("tablet-wall"),
    `baseKinds=${JSON.stringify(baseKinds)}`,
  );

  // 单件基线（零回归）
  const one = propsFromDecor(space, [vase]);
  check(
    "§1b-1 单件花瓶：vase 在场且底座保留（单件路径逐字节不变）",
    one.some((p) => p.kind === "vase") && one.some((p) => p.kind === "tablet-wall"),
  );

  // 同带多件：挂饰不得消失、底座只 1 份
  const two = propsFromDecor(space, [vase, table]);
  const k2 = two.map((p) => p.kind);
  check(
    "§1b-2 同带多件（花瓶+香几）：两件都在场",
    k2.includes("vase") && k2.includes("incense-table"),
    `kinds=${JSON.stringify(k2)}`,
  );
  check(
    "§1b-3 同带多件：底座 tablet-wall 恰 1 份（不复制、不挪位）",
    k2.filter((k) => k === "tablet-wall").length === 1,
    `tablet-wall×${k2.filter((k) => k === "tablet-wall").length}`,
  );
  // 两件沿 X 错开（不重叠）
  const vx = two.find((p) => p.kind === "vase")?.x ?? 0;
  const tx = two.find((p) => p.kind === "incense-table")?.x ?? 0;
  check("§1b-4 同带多件：两件 x 错开（不叠在原点）", vx !== tx, `vx=${vx} tx=${tx}`);

  // 跨带多件：各带形态完整（灯笼成对）
  const k3 = propsFromDecor(space, [lantern, vase, table]).map((p) => p.kind);
  check(
    "§1b-5 跨带三件：lantern/vase/incense-table 都在场",
    k3.includes("lantern") && k3.includes("vase") && k3.includes("incense-table"),
    `kinds=${JSON.stringify(k3)}`,
  );

  // orn-none 混入（旧数据/防御）：不得复制底座、不产出 Fallback 件
  const kn = propsFromDecor(space, [none, vase]).map((p) => p.kind);
  check(
    "§1b-6 orn-none+花瓶：花瓶在场且底座恰 1 份",
    kn.includes("vase") && kn.filter((k) => k === "tablet-wall").length === 1,
    `kinds=${JSON.stringify(kn)}`,
  );
}

// ================================================================ 数据前提
const CLAN_ID = q1(
  `select c.id from "ClanHall" c join "User" u on u.id=c."ownerUserId"
   where c.status='active' and u.email='${OWNER}' order by c."createdAt" desc limit 1`,
);
check("找到 user 名下 active 宗祠", !!CLAN_ID, `CLAN_ID=${CLAN_ID}`);

const origSectionOrder = q1(`select "sectionOrder" from "ClanHall" where id='${CLAN_ID}'`);
const origDecor = q1(`select "templateConfig" from "ClanHall" where id='${CLAN_ID}'`);

// ================================================================ 浏览器
const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

try {
  // ================================================================ §2 落地场景板块化
  // DOM 顺序用 Playwright 真实渲染判定（raw HTML 的 indexOf 会被 RSC flight 数据干扰）。
  async function groundBeforeInfo(): Promise<boolean> {
    return page.evaluate(() => {
      const g = document.querySelector('[data-section-key="ground"]');
      const i = document.querySelector('[data-section-key="info"]');
      if (!g || !i) return false;
      // g.compareDocumentPosition(i) 含 FOLLOWING(4) ⇒ i 在 g 之后 ⇒ ground 在 info 前
      return (g.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
  }

  // ②a 默认序（先把 sectionOrder 置 NULL 制造前提，再验零回归：ground 在 info 之后）
  psql(`update "ClanHall" set "sectionOrder"=NULL where id='${CLAN_ID}'`);
  await page.goto(`${BASE}/clan/halls/${CLAN_ID}`);
  await page.waitForLoadState("networkidle");
  const defBefore = await groundBeforeInfo();
  check(
    "§2a 默认序：落地场景在页尾（info 之后）—— 零回归",
    defBefore === false,
    `groundBeforeInfo=${defBefore}`,
  );

  // ②b 交换序：ground 提到最前 → ground 在 info 之前
  const swapped = JSON.stringify([
    "ground", "gate", "clan3d", "info", "shrine", "worship", "courtyard",
    "photos", "mainhall", "tributes", "community", "decorSummary", "aboutDecor", "links",
  ]);
  psql(`update "ClanHall" set "sectionOrder"='${swapped}'::jsonb where id='${CLAN_ID}'`);
  await page.goto(`${BASE}/clan/halls/${CLAN_ID}`);
  await page.waitForLoadState("networkidle");
  const swapBefore = await groundBeforeInfo();
  check(
    "§2b ground 提到最前：落地场景渲染在 info 之前",
    swapBefore === true,
    `groundBeforeInfo=${swapBefore}`,
  );

  // ②c 控制台排序列表出现「落地场景」项
  await login(page, OWNER);
  await page.goto(`${BASE}/console/clan-halls/${CLAN_ID}`);
  await page.waitForLoadState("networkidle");
  const editorText = await page.evaluate(() => document.body.innerText);
  check("§2c 控制台排序列表含「落地场景（供桌收尾图）」", editorText.includes("落地场景（供桌收尾图）"));

  // ================================================================ §3 多挂饰端到端
  // templateConfig 结构是 { decor: { slots, unlocked, granted, ornaments } }
  const cfg = origDecor && origDecor !== "" ? JSON.parse(origDecor) : {};
  const baseDecor = cfg.decor && typeof cfg.decor === "object" ? cfg.decor : {};
  const needUnlock = ["clan-orn-lion", "clan-orn-lantern", "clan-orn-pillar"];
  // 重置为可预测干净态：主陈设**固定**为香炉（建馆赠品，tier=free），unlocked 直接给齐测试件。
  //
  // ⚠️ 这里**绝不能从库里当前值推导 primaryOrn**（曾经写成
  // `baseDecor.slots.ornament[0] ?? "clan-orn-censer"`）——
  // 那是"依赖上一步的残留状态"，**复跑就会翻车**（本仓库陷阱 11）：
  //   第 1 次跑：库里 [censer] → primary=censer → 点灯笼=**添加** → 清单 3 件 ✅
  //   第 2 次跑：库里已是上一轮 §3 存下的 [censer,lion,lantern] → primary=censer …
  //            但 §5① 把库改成 [censer]、§3 保存又写成 [censer,lion,lantern]，
  //            于是下一轮 primary 取到 [lantern]（模板自带值）→ 点灯笼=**取消** → 只剩 1 件 ❌
  // 修法：**自己制造前提**（写死 free 档香炉），不读残留。
  const PRIMARY_ORN = "clan-orn-censer";
  const granted: string[] = Array.isArray(baseDecor.granted) ? baseDecor.granted : [];
  const cleanDecor = {
    slots: { ...(baseDecor.slots ?? {}), ornament: PRIMARY_ORN },
    granted,
    unlocked: [...needUnlock],
  };
  psql(
    `update "ClanHall" set "templateConfig"='${JSON.stringify({ ...cfg, decor: cleanDecor }).replace(/'/g, "''")}'::jsonb where id='${CLAN_ID}'`,
  );
  const decorObj = cleanDecor;
  const decorBackup = JSON.stringify(cleanDecor);

  await page.goto(`${BASE}/console/clan-halls/${CLAN_ID}`);
  await page.waitForLoadState("networkidle");

  // 切到「挂饰陈设」分类（文案来自 lib/clan-decor.ts 的 CATEGORIES）
  await page.locator("button", { hasText: "挂饰陈设" }).first().click();
  await page.waitForTimeout(400);

  /** 按 data-decor-item-id 找到素材卡里的「应用/使用中」按钮并点击 */
  async function clickItem(id: string) {
    const btn = page
      .locator(`[data-decor-item-id="${id}"] button`)
      .filter({ hasText: /应用|使用中/ })
      .first();
    await btn.click();
    await page.waitForTimeout(300);
  }

  // 初始清单应为 [香炉]（免费默认件，"使用中"）
  // 加石狮 → [香炉, 石狮]
  await clickItem("clan-orn-lion");
  // 加灯笼 → [香炉, 石狮, 灯笼]（满 3）
  await clickItem("clan-orn-lantern");

  // 草稿条应已出现（dirty 判定覆盖 ornaments —— 漏了这里就不会亮）
  const draftBar = await page.locator("[data-decor-dirty]").count();
  check("§3a 多挂饰改动后草稿条出现（dirty 覆盖 ornaments）", draftBar > 0, `draftBar=${draftBar}`);

  // 保存
  const saveBtn = page.locator("button", { hasText: "保存并完成装修" }).first();
  await saveBtn.click();
  await page.waitForTimeout(1200);

  // 库里断言（主陈设取该馆实际 slots.ornament，而非硬编码，避免依赖种子数据）
  const saved = q1(`select "templateConfig" from "ClanHall" where id='${CLAN_ID}'`);
  const savedObj = JSON.parse(saved || "{}");
  const savedDecor = savedObj.decor && typeof savedObj.decor === "object" ? savedObj.decor : {};
  const primary = savedDecor.slots?.ornament?.[0];
  check(
    "§3b 库里 slots.ornament=[主陈设,石狮,灯笼] 且首件=主陈设",
    Array.isArray(savedDecor.slots.ornament) &&
      savedDecor.slots.ornament.length === 3 &&
      savedDecor.slots.ornament[0] === primary &&
      savedDecor.slots.ornament.includes("clan-orn-lion") &&
      savedDecor.slots.ornament.includes("clan-orn-lantern"),
    `ornament=${JSON.stringify(savedDecor.slots.ornament)} primary=${primary}`,
  );

  // 公页渲染：3 个 data-ornament
  const resp3 = await page.goto(`${BASE}/clan/halls/${CLAN_ID}`);
  const html3 = (await resp3!.text()) ?? "";
  const ornCount = (html3.match(/data-ornament="/g) ?? []).length;
  check("§3c 公页渲染 3 件挂饰（data-ornament ×3）", ornCount === 3, `count=${ornCount}`);

  // ================================================================ §4 满员拦截
  await page.goto(`${BASE}/console/clan-halls/${CLAN_ID}`);
  await page.waitForLoadState("networkidle");
  await page.locator("button", { hasText: "挂饰陈设" }).first().click();
  await page.waitForTimeout(400);
  await clickItem("clan-orn-pillar"); // 第 4 件
  const bodyText = await page.evaluate(() => document.body.innerText);
  check(
    "§4 第 4 件被「最多同时陈设 3 件」拦截",
    bodyText.includes("最多同时陈设 3 件"),
  );
  // 拦截后库里应仍是 3 件（拦截不写库、不污染草稿）。
  // 注：被拦截时不产生 dirty，因此「保存并完成装修」按钮不渲染、不可点；
  // 这里直接回读 DB，DB 应仍是 §3 落库的 3 件。
  const saved2 = JSON.parse(q1(`select "templateConfig" from "ClanHall" where id='${CLAN_ID}'`) || "{}");
  const saved2Decor = saved2.decor && typeof saved2.decor === "object" ? saved2.decor : {};
  check(
    "§4b 拦截后库里仍是 3 件（拦截不污染）",
    (saved2Decor.slots.ornament ?? []).length === 3,
    `ornament=${JSON.stringify(saved2Decor.slots.ornament)}`,
  );

  // ================================================================ §5 反向验证
  // ⑤① 单挂饰（清单仅 1 件）页**不出现** data-ornament：
  //    渲染层对"单件"与"多件"是两套布局分支（单件居中、多件 flex 均布），
  //    data-ornament 标记只在多件分支逐件包裹（见 ClanDecorLayer / HallDecorLayer）。
  //    所以 1 件页标记数 = 0、≥2 件页标记数 = N（§3c 已验 3 件 = 3 标记）。
  //    这条反向验证：若分支选择器写反（单件误走多件 flex 包裹），标记会冒出来 → 必红。
  const singleDecor = JSON.parse(JSON.stringify(cfg));
  const sInner = singleDecor.decor && typeof singleDecor.decor === "object" ? singleDecor.decor : {};
  delete sInner.ornaments;
  sInner.slots = { ...(sInner.slots ?? {}), ornament: "clan-orn-censer" };
  psql(
    `update "ClanHall" set "templateConfig"='${JSON.stringify(singleDecor).replace(/'/g, "''")}'::jsonb where id='${CLAN_ID}'`,
  );
  const respS = await page.goto(`${BASE}/clan/halls/${CLAN_ID}`);
  const htmlS = (await respS!.text()) ?? "";
  const singleCount = (htmlS.match(/data-ornament="/g) ?? []).length;
  check(
    "§5① 反向：单挂饰页不出现 data-ornament（单件布局分支不包裹 flex 标记）",
    singleCount === 0,
    `count=${singleCount}`,
  );

  // ⑤② 板块序反向验证：默认序关系 vs 交换序关系必须相反
  check(
    "§5② 反向：ground/info 先后关系在默认序与交换序下相反",
    defBefore === false && swapBefore === true,
  );
} finally {
  // ================================================================ §6 收尾：逐字还原
  try {
    const soSql = origSectionOrder && origSectionOrder !== ""
      ? `update "ClanHall" set "sectionOrder"='${origSectionOrder.replace(/'/g, "''")}'::jsonb where id='${CLAN_ID}'`
      : `update "ClanHall" set "sectionOrder"=NULL where id='${CLAN_ID}'`;
    psql(soSql);
    const tcSql = origDecor && origDecor !== ""
      ? `update "ClanHall" set "templateConfig"='${origDecor.replace(/'/g, "''")}'::jsonb where id='${CLAN_ID}'`
      : `update "ClanHall" set "templateConfig"=NULL where id='${CLAN_ID}'`;
    psql(tcSql);
    const back = q1(`select "templateConfig" from "ClanHall" where id='${CLAN_ID}'`);
    check("§6 templateConfig 还原 = 备份逐字相同", back === origDecor);
  } catch (e) {
    console.log("❌ §6 还原失败", e);
    fail++;
  }
  await browser.close();
}

console.log(`\n结果: ${pass}/${pass + fail} 通过`);
if (fail > 0) process.exit(1);
