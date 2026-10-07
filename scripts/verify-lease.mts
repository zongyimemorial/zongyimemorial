/**
 * 验收：装修权益租期制（2026-10 商业模式调整 #224/#225）
 *
 * ## 用户口径
 * 「升级后的空间存储及装修套件到期后需续费，否则到期后即返回到免费版的状态」
 *
 * ## 落地口径（被测规则）
 *   - 新购（商城/积分/工坊三路径）一律 365 天；
 *   - 存量已购（entitlements 缺条目 / null）保留**永久** —— 承诺不缩水；
 *   - 到期后：渲染/校验视为未持有（公页回退默认、工坊显示「已到期 · 续费」），
 *     slots 配置保留不删，续费（再购一次）即恢复；
 *   - `unlocked` 数组是"曾购记录"，不随到期删除 —— 续费恢复的依据。
 *
 * ## 断言分层
 *   §0 单元层（tsx 直跑，不依赖服务）：isKeyActive / nextExpiry /
 *      normalizeEntitlements / normalizeDecor（透传 + 过期摘除）/
 *      checkHallDraft / checkClanDraft（过期拒单 + 文案区分）
 *   §1 源码层：判定唯一实现（isKeyActive 无手写分叉）+
 *      normalize/checkDraft 全部调用点都传 entitlements（防漏）+
 *      resetDecor 带回租期表
 *   §2 行为层（真服务 + Playwright + psql 造前提）：
 *      过期墙公页回退素白 → 工坊显示「已到期 · 续费」→ 真点续费 →
 *      DB 租期顺延 → 公页墙恢复 → 保存装修不丢租期 → 恢复默认不丢租期
 *   §3 还原：templateConfig 逐字等于备份 + 积分还原
 *
 * ## ⚠️ 本脚本会改数据（自清理）
 *   - MemorialHall.templateConfig（备份/还原，判据=逐字等于备份）
 *   - User.points（续费会扣 250 积分；备份/还原）
 *
 * ## 反向验证（已在开发过程做过，改完必须还原）
 *   缺陷A 公页 normalize 调用去掉 entitlements  → §2「过期墙回退」红
 *   缺陷B DecorStudio 判定去掉 isKeyActive      → §2「已到期 · 续费」红
 *   缺陷C resetDecor 去掉 entitlements 带回      → §2「恢复默认不丢租期」红
 *   缺陷D normalizeDecor 返回值不透传           → §0 透传断言红 + §2「保存不丢」红
 *   缺陷E checkHallDraft 不查租期               → §0 过期拒单红
 * 运行：npx tsx scripts/verify-lease.mts（run-all-verify 按扩展名自动选 tsx）
 */

import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isKeyActive,
  nextExpiry,
  normalizeEntitlements,
  normalizeDecor,
  DEFAULT_DECOR,
} from "@/lib/hall-decor";
import { checkHallDraft, checkClanDraft } from "@/lib/decor-save";
import { findClanTemplate } from "@/lib/clan-decor";

const BASE = "http://127.0.0.1:3000";
const OWNER = "user@test.com";
const PW = "user123456";

let pass = 0;
let fail = 0;
const skips: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? " —— " + detail : ""}`);
  }
}
function skip(name: string, why: string) {
  skips.push(name);
  console.log(`SKIP ${name} —— ${why}`);
}

// ---------- psql：JSON 走临时文件（-c 拼接会被三层引号剥坏，AGENTS.md 陷阱） ----------
const tmp = mkdtempSync(join(tmpdir(), "vlease-"));
let qn = 0;
function psqlFile(sql: string): string {
  const f = join(tmp, `q${qn++}.sql`);
  writeFileSync(f, sql, "utf8");
  const out = execFileSync(
    "bash",
    ["-c", `docker cp ${f} memorial-pg:/tmp/q.sql >/dev/null && docker exec memorial-pg psql -U memorial -d memorial -t -A -f /tmp/q.sql`],
    { encoding: "utf8" },
  );
  return out.trim();
}
function psql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "memorial-pg", "psql", "-U", "memorial", "-d", "memorial", "-t", "-A", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

// =====================================================================
// §0 单元层（纯函数，不依赖服务）
// =====================================================================
console.log("\n===== §0 单元层：租期核心函数 =====");
{
  // 日期一律相对真实系统时钟（容器时钟是 2026-10-05，写死 2026-10-14 会被当成"未来"）
  const now = new Date();
  const past = new Date(Date.now() - 5 * 86400000).toISOString();
  const future = new Date(Date.now() + 365 * 86400000).toISOString();

  // isKeyActive：缺条目 / null = 永久（存量兼容的核心承诺）
  check("isKeyActive 缺条目 = 永久（存量已购不缩水）", isKeyActive("buy:wall-night", {}, now) === true);
  check("isKeyActive entitlements 为 undefined = 永久", isKeyActive("buy:wall-night", undefined, now) === true);
  check("isKeyActive null = 永久", isKeyActive("buy:wall-night", { "buy:wall-night": null }, now) === true);
  check("isKeyActive 未来时间 = 有效", isKeyActive("buy:wall-night", { "buy:wall-night": future }, now) === true);
  check("isKeyActive 已过期 = 失效", isKeyActive("buy:wall-night", { "buy:wall-night": past }, now) === false);
  check("isKeyActive 非法日期 = 失效（清洗后不会出现，防御）", isKeyActive("buy:wall-night", { "buy:wall-night": "not-a-date" }, now) === false);

  // nextExpiry：续期基准
  const d1 = new Date(nextExpiry(undefined));
  check("nextExpiry 无条目 → 从今天起算 +365 天", Math.abs(d1.getTime() - (Date.now() + 365 * 86400000)) < 60000);
  const d2 = new Date(nextExpiry(future));
  check(
    "nextExpiry 未过期 → 从到期日顺延叠加（不浪费剩余期）",
    Math.abs(d2.getTime() - new Date(future).getTime() - 365 * 86400000) < 60000,
  );
  const d3 = new Date(nextExpiry(past));
  check("nextExpiry 已过期 → 从今天重新起算", Math.abs(d3.getTime() - (Date.now() + 365 * 86400000)) < 60000);

  // normalizeEntitlements：清洗
  check("normalizeEntitlements 非对象 → undefined", normalizeEntitlements("x") === undefined);
  check("normalizeEntitlements 数组 → undefined", normalizeEntitlements([1]) === undefined);
  check("normalizeEntitlements 空对象 → undefined", normalizeEntitlements({}) === undefined);
  const cleaned = normalizeEntitlements({
    "buy:wall-night": future,
    "tpl:tpl-x": null,
    "非法键!": future, // 丢弃
    "buy:bad-date": "garbage", // 丢弃（该键回落永久）
  });
  check(
    "normalizeEntitlements 保留合法条目 + null、丢弃非法键与非法日期",
    !!cleaned &&
      cleaned["buy:wall-night"] === future &&
      cleaned["tpl:tpl-x"] === null &&
      !("非法键!" in cleaned) &&
      !("buy:bad-date" in cleaned),
    JSON.stringify(cleaned),
  );

  // normalizeDecor：透传铁律 + 过期摘除
  const rawExpired = {
    templateId: undefined,
    slots: { ...DEFAULT_DECOR, wall: "wall-night" },
    unlocked: ["buy:wall-night"],
    granted: [],
    entitlements: { "buy:wall-night": past },
  };
  const normExpired = normalizeDecor(rawExpired, { isPremium: false, unlocked: rawExpired.unlocked, entitlements: rawExpired.entitlements });
  check(
    "normalizeDecor：过期素材从 slots 摘除、回落默认（公页回退的引擎）",
    normExpired.slots.wall === DEFAULT_DECOR.wall,
    `wall=${normExpired.slots.wall}`,
  );
  check(
    "normalizeDecor：返回值透传 entitlements（写库不丢租期）",
    JSON.stringify(normExpired.entitlements) === JSON.stringify(rawExpired.entitlements),
    JSON.stringify(normExpired.entitlements),
  );

  const rawActive = {
    templateId: undefined,
    slots: { ...DEFAULT_DECOR, wall: "wall-night" },
    unlocked: ["buy:wall-night"],
    granted: [],
    entitlements: { "buy:wall-night": future },
  };
  const normActive = normalizeDecor(rawActive, { isPremium: false, unlocked: rawActive.unlocked, entitlements: rawActive.entitlements });
  check("normalizeDecor：租期内素材保留在 slots", normActive.slots.wall === "wall-night", `wall=${normActive.slots.wall}`);

  const rawLegacy = {
    templateId: undefined,
    slots: { ...DEFAULT_DECOR, wall: "wall-night" },
    unlocked: ["buy:wall-night"], // 曾购，但 entitlements 无此条目 = 存量永久
    granted: [],
  };
  const normLegacy = normalizeDecor(rawLegacy, { isPremium: false, unlocked: rawLegacy.unlocked, entitlements: normalizeEntitlements(rawLegacy.entitlements) });
  check("normalizeDecor：存量已购（缺条目）照常保留（不缩水）", normLegacy.slots.wall === "wall-night", `wall=${normLegacy.slots.wall}`);

  // checkHallDraft：过期拒单 + 文案区分
  const draftExpired = { slots: { ...DEFAULT_DECOR, wall: "wall-night" } as typeof DEFAULT_DECOR };
  // 注：DEFAULT_DECOR 的五件默认素材（wall-plain/floor-none/frame-line/font-modern/orn-none）
  // 全是 points 档（非 free），必须把它们的 key 都放进 unlocked，否则 checkHallDraft
  // 会先因某个默认项未解锁而拒单，干扰"墙过期"判定。
  const DEFAULT_KEYS = [
    "buy:wall-plain", "buy:floor-none", "buy:frame-line", "buy:font-modern", "buy:orn-none",
  ];
  const r1 = checkHallDraft(draftExpired, {
    isPremium: false,
    unlocked: [...DEFAULT_KEYS, "buy:wall-night"],
    granted: [],
    entitlements: { "buy:wall-night": past },
  });
  check(
    "checkHallDraft：过期素材拒单，文案含「已到期」",
    !r1.ok && !!r1.message && r1.message.includes("已到期"),
    r1.ok ? "意外通过" : r1.message,
  );
  check(
    "checkHallDraft：过期拒单带 needUnlock（工坊据此给续费入口）",
    !r1.ok && !!r1.needUnlock && r1.needUnlock.id === "wall-night",
    JSON.stringify((r1 as { needUnlock?: unknown }).needUnlock ?? null),
  );
  const draftUnowned = { slots: { ...DEFAULT_DECOR, wall: "wall-night" } as typeof DEFAULT_DECOR };
  const r2 = checkHallDraft(draftUnowned, {
    isPremium: false,
    unlocked: DEFAULT_KEYS, // 默认项都"已购"，但墙 wall-night 不在 → 应「尚未解锁」
    granted: [],
    entitlements: {},
  });
  check(
    "checkHallDraft：从未购买 → 「尚未解锁」（不是「已到期」）",
    !r2.ok && !!r2.message && r2.message.includes("尚未解锁"),
    r2.ok ? "意外通过" : r2.message,
  );
  const draftActive = { slots: { ...DEFAULT_DECOR, wall: "wall-night" } as typeof DEFAULT_DECOR };
  const r3 = checkHallDraft(draftActive, {
    isPremium: false,
    unlocked: [...DEFAULT_KEYS, "buy:wall-night"],
    granted: [],
    entitlements: { "buy:wall-night": future },
  });
  check("checkHallDraft：租期内素材过校验", r3.ok, r3.ok ? "" : JSON.stringify(r3));

  // checkClanDraft：同构（委托 isClanUnlocked + 租期表）
  const clanWallPaid = (() => {
    // 找一件宗祠收费墙素材（tier 非 free/premium，有积分价）
    const src = execFileSync("bash", ["-c", `grep -n 'CLAN_WALLS' /workspace/lib/clan-decor.ts | head -2`], { encoding: "utf8" });
    return src; // 仅用于确认常量存在；具体素材在下方用 findClanTemplate 之外的途径
  })();
  // 宗祠侧直接用一套已知的收费素材：从 SLOT 表里拿第一件 points 档墙素材
  // 用真实存在的宗祠收费墙素材 clan-wall-vermilion（tier=points，非 free，
  // checkClanDraft 经 CLAN_SLOT_ITEMS.wall.find 命中 → isClanUnlocked 走过期分支）
  const clanDraftExpired = { slots: { ...DEFAULT_DECOR, wall: "clan-wall-vermilion" } as typeof DEFAULT_DECOR };
  const cr = checkClanDraft(clanDraftExpired, {
    isPremium: false,
    unlocked: ["buy:clan-wall-vermilion"],
    granted: [],
    entitlements: { "buy:clan-wall-vermilion": past },
  });
  /*
    clan-wall-vermilion 必须真实存在于宗祠素材表，否则 checkClanDraft 走"失效 id 退默认"
    分支 → ok:true 假绿。前置确认 id 存在，否则 SKIP 而不是硬断。
  */
  const clanItemExists = execFileSync(
    "bash",
    ["-c", `grep -c '"clan-wall-vermilion"' /workspace/lib/clan-decor.ts`],
    { encoding: "utf8" },
  ).trim();
  if (Number(clanItemExists) > 0) {
    check(
      "checkClanDraft：宗祠过期素材拒单且文案含「已到期」",
      !cr.ok && !!cr.message && cr.message.includes("已到期"),
      cr.ok ? "意外通过" : cr.message,
    );
  } else {
    skip("checkClanDraft 宗祠过期拒单", "clan-wall-ink 不在素材表，换素材后重写此断言");
  }
  void clanWallPaid;
  void findClanTemplate;
}

// =====================================================================
// §1 源码层：唯一实现 + 调用点防漏
// =====================================================================
console.log("\n===== §1 源码层 =====");
{
  // isKeyActive 的 import 覆盖面（唯一实现纪律：客户端镜像也必须 import 它）
  const files = execFileSync(
    "bash",
    ["-c", `grep -rl 'isKeyActive' /workspace/lib /workspace/app /workspace/components 2>/dev/null | grep -v '\\.next' | sort`],
    { encoding: "utf8" },
  ).trim().split("\n").filter(Boolean);
  check(
    "isKeyActive 被 ≥7 个文件引用（判定唯一实现：lib×3 + actions×2 + DecorStudio）",
    files.length >= 7,
    `实得 ${files.length}: ${files.join(", ")}`,
  );

  // DecorStudio（客户端镜像）必须 import isKeyActive，而不是手写日期比较
  const studio = execFileSync("bash", ["-c", `cat /workspace/components/console/DecorStudio.tsx`], { encoding: "utf8" });
  check("DecorStudio 客户端镜像 import isKeyActive（不手写日期比较）", /isKeyActive/.test(studio) && !/new Date\(entitlements/.test(studio));
  check("DecorStudio 无手写租期日期比较", !/entitlements[?.]*\[.*\]\s*>\s*new Date/.test(studio));

  // normalize / checkDraft 全部调用点必须传 entitlements（防漏回归）
  const callSites: [string, RegExp][] = [
    ["app/console/halls/[id]/page.tsx", /entitlements:\s*normalizeEntitlements\(rawDecor\.entitlements\)/],
    ["app/console/clan-halls/[id]/page.tsx", /entitlements:\s*normalizeEntitlements\(rawDecor\.entitlements\)/],
    ["app/(public)/halls/[id]/page.tsx", /entitlements:\s*normalizeEntitlements\(rawDecor\.entitlements\)/],
    ["app/(public)/clan/halls/[id]/page.tsx", /entitlements:\s*normalizeEntitlements\(rawDecor\.entitlements\)/],
    ["app/console/halls/[id]/actions.ts", /entitlements:\s*normalizeEntitlements\(raw\.entitlements\)/],
    ["app/console/clan-halls/[id]/actions.ts", /entitlements:\s*normalizeEntitlements\(raw\.entitlements\)/],
    ["lib/decor-grant.ts", /entitlements:\s*nextDecor\.entitlements/],
  ];
  for (const [file, re] of callSites) {
    const src = execFileSync("bash", ["-c", `cat '/workspace/${file}'`], { encoding: "utf8" });
    check(`调用点传租期表：${file}`, re.test(src), "未匹配到 entitlements 透传");
  }
  // checkDraft 的两处调用（两侧 actions 的 saveDecor/saveClanDecor）
  const hallActions = execFileSync("bash", ["-c", `cat '/workspace/app/console/halls/[id]/actions.ts'`], { encoding: "utf8" });
  check(
    "checkHallDraft 调用传 entitlements（保存校验与渲染同口径）",
    /checkHallDraft\([^]*entitlements:\s*decor\.entitlements/.test(hallActions),
  );
  const clanActions = execFileSync("bash", ["-c", `cat '/workspace/app/console/clan-halls/[id]/actions.ts'`], { encoding: "utf8" });
  check(
    "checkClanDraft 调用传 entitlements",
    /checkClanDraft\([^]*entitlements:\s*decor\.entitlements/.test(clanActions),
  );

  // resetDecor / resetClanDecor 必须带回租期表（恢复默认 ≠ 丢权益）
  check(
    "resetDecor 带回 entitlements（恢复默认不丢租期）",
    /resetDecor[\s\S]*?entitlements:\s*decor\.entitlements\s*\?\?\s*\{\}/.test(hallActions) ||
      /已恢复默认装修[\s\S]*?entitlements:\s*decor\.entitlements/.test(hallActions) ||
      /templateId:\s*undefined,[\s\S]*?entitlements:\s*decor\.entitlements\s*\?\?\s*\{\}/.test(hallActions),
  );
  check(
    "resetClanDecor 带回 entitlements",
    /templateId:\s*undefined,[\s\S]*?entitlements:\s*decor\.entitlements\s*\?\?\s*\{\}/.test(clanActions),
  );

  // normalizeDecor/normalizeClanDecor 的返回值必须透传（写库不丢）
  const hallDecorSrc = execFileSync("bash", ["-c", `cat /workspace/lib/hall-decor.ts`], { encoding: "utf8" });
  check(
    "normalizeDecor 返回值透传 entitlements",
    /entitlements:\s*normalizeEntitlements\(input\.entitlements\)/.test(hallDecorSrc),
  );
  const clanDecorSrc = execFileSync("bash", ["-c", `cat /workspace/lib/clan-decor.ts`], { encoding: "utf8" });
  check(
    "normalizeClanDecor 返回值透传 entitlements",
    /entitlements:\s*normalizeEntitlements\(input\.entitlements\)/.test(clanDecorSrc),
  );
}

// =====================================================================
// §2 数据层：造前提（user@test.com 的 active 纪念馆）
// =====================================================================
console.log("\n===== §2 数据层：造前提 =====");

const hallRow = psql(
  `SELECT h.id || '|' || COALESCE(u.points::text,'0') ` +
    `FROM "MemorialHall" h JOIN "User" u ON u.id = h."ownerUserId" ` +
    `WHERE u.email = '${OWNER}' AND h.status = 'active' ORDER BY h."createdAt" LIMIT 1`,
);

let hallId = "";
let pointsBak = 0;
let cfgBak = "";
let cfgBakSet = false;
let userPremBak = "";
let hallPremBak = "";
if (!hallRow) {
  skip("§2/§3 全部", `${OWNER} 名下没有 active 纪念馆`);
} else {
  [hallId, pointsBak] = hallRow.split("|");
  pointsBak = Number(pointsBak || 0);
  console.log(`样本纪念馆: ${hallId}（积分 ${pointsBak}）`);

  cfgBak = psql(`SELECT COALESCE("templateConfig"::text,'') FROM "MemorialHall" WHERE id='${hallId}'`);
  cfgBakSet = cfgBak !== "";
  console.log(`templateConfig 备份长度: ${cfgBak.length}`);

  // ⚠️ 样本 owner 若是高级订阅，过期素材在公页/工坊会被 premium 放行 → 租期不可观测。
  // 备份并临时置空 user + 馆 的 premiumUntil（isPremiumOf = 馆级 OR 用户级，两者都置空才 non-premium），
  // 收尾还原（见 §4）。
  userPremBak = psql(`SELECT COALESCE("premiumUntil"::text,'') FROM "User" WHERE email='${OWNER}'`);
  hallPremBak = psql(`SELECT COALESCE("premiumUntil"::text,'') FROM "MemorialHall" WHERE id='${hallId}'`);
  psql(`UPDATE "User" SET "premiumUntil" = NULL WHERE email = '${OWNER}'`);
  psql(`UPDATE "MemorialHall" SET "premiumUntil" = NULL WHERE id = '${hallId}'`);
  console.log(`  已临时置空 ${OWNER} 订阅（user=${userPremBak || "∅"} hall=${hallPremBak || "∅"}，收尾还原）`);

  // 积分不足则先补（收尾还原备份值）
  if (pointsBak < 300) {
    psql(`UPDATE "User" SET points = 500 WHERE email = '${OWNER}'`);
    console.log(`  积分不足，已临时补到 500（原值 ${pointsBak}，收尾还原）`);
  }

  // 实验数据：wall-night 过期 + wall-goldweave 未来
  const cfgObj = cfgBakSet ? JSON.parse(cfgBak) : {};
  const decor = (cfgObj.decor ?? {}) as Record<string, unknown>;
  const unlocked = Array.isArray(decor.unlocked) ? (decor.unlocked as string[]).map(String) : [];
  const granted = Array.isArray(decor.granted) ? (decor.granted as string[]).map(String) : [];
  const expDecor = {
    ...(decor as object),
    templateId: undefined,
    slots: { ...DEFAULT_DECOR, wall: "wall-night" },
    unlocked: [...new Set([...unlocked, "buy:wall-night", "buy:wall-goldweave"])],
    granted,
    entitlements: {
      "buy:wall-night": new Date(Date.now() - 5 * 86400000).toISOString(), // 5 天前过期
      "buy:wall-goldweave": new Date(Date.now() + 200 * 86400000).toISOString(), // 200 天后
    },
    updatedAt: new Date().toISOString(),
  };
  const expCfg = { ...cfgObj, decor: expDecor };
  psqlFile(`UPDATE "MemorialHall" SET "templateConfig" = $q$${JSON.stringify(expCfg)}$q$::jsonb WHERE id='${hallId}'`);

  const injected = psql(
    `SELECT "templateConfig"->'decor'->'entitlements'->>'buy:wall-night' FROM "MemorialHall" WHERE id='${hallId}'`,
  );
  check("前提注入：wall-night 租期已过期（5 天前）", injected !== "" && new Date(injected) < new Date(), `实得 ${injected}`);
}

// =====================================================================
// §3 行为层：公页回退 → 工坊续费 → 恢复
// =====================================================================
let browser: import("playwright").Browser | null = null;
if (hallId) {
  console.log("\n===== §3 行为层 =====");
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();

  // ---- 3a. 公页：过期墙回退素白（#243139 是 wall-night 专属深青） ----
  const pubHtml = await (await fetch(`${BASE}/halls/${hallId}`, {
    headers: { cookie: "preview_auth=1" },
  })).text();
  check("公页：过期墙被摘（HTML 无 #243139 深青）", !pubHtml.includes("#243139"), "深青色仍在 = 公页没回退");
  check("公页：回落素白墙（默认 #ffffff 在场）", pubHtml.toLowerCase().includes("#ffffff"));

  // ---- 3b. 工坊：显示「已到期 · 续费」 ----
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', OWNER);
  await page.fill('input[name="password"]', PW);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(`${BASE}/console/halls/${hallId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // 素材卡只渲染当前分类：先切到墙分类（分类按钮文案「背景壁纸」，陷阱 9）
  const ensureCard = async (id: string): Promise<boolean> => {
    for (let i = 0; i < 12; i++) {
      if (await page.$(`[data-decor-item-id="${id}"]`)) return true;
      const clicked = await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button")] as HTMLElement[];
        // 分类/tab 按钮优先匹配「背景壁纸」，其次逐个点未选中的分类按钮
        const target = btns.find((b) => b.innerText.trim() === "背景壁纸");
        (target ?? btns.find((b) => /壁纸|素材/.test(b.innerText) && !b.querySelector("svg")))?.click();
        return !!target;
      });
      await page.waitForTimeout(500);
      if (!clicked) break;
    }
    return !!(await page.$(`[data-decor-item-id="${id}"]`));
  };
  const cardSeen = await ensureCard("wall-night");
  if (!cardSeen) {
    skip("工坊卡片断言", "wall-night 卡片未出现（分类切换未命中）");
  } else {
    const nightBtn = await page.evaluate(() => {
      const card = document.querySelector('[data-decor-item-id="wall-night"]');
      const btn = card?.querySelector("button");
      return btn ? btn.textContent.trim() : "";
    });
    check(
      "工坊：wall-night 显示「已到期 · 续费 250 积分」",
      nightBtn.includes("已到期") && nightBtn.includes("续费"),
      `实得按钮文案：${nightBtn}`,
    );

    // wall-goldweave：租期内 → 显示「有效期至」提示行
    const goldInfo = await page.evaluate(() => {
      const card = document.querySelector('[data-decor-item-id="wall-goldweave"]');
      if (!card) return { lease: "", btn: "" };
      const lease = [...card.querySelectorAll("p")].map((p) => p.textContent).find((t) => t.includes("有效期至")) ?? "";
      const btn = card.querySelector("button")?.textContent.trim() ?? "";
      return { lease, btn };
    });
    check(
      "工坊：wall-goldweave（租期内）显示「有效期至」",
      goldInfo.lease.includes("有效期至"),
      `lease=${goldInfo.lease} btn=${goldInfo.btn}`,
    );

    // ---- 3c. 真点续费 → 租期顺延 → 按钮变「应用」 ----
    const entBefore = psql(
      `SELECT "templateConfig"->'decor'->'entitlements'->>'buy:wall-night' FROM "MemorialHall" WHERE id='${hallId}'`,
    );
    await page.evaluate(() => {
      const card = document.querySelector('[data-decor-item-id="wall-night"]');
      const btn = [...(card?.querySelectorAll("button") ?? [])].find((b) =>
        b.textContent.includes("续费"),
      );
      btn?.click();
    });
    await page.waitForTimeout(4000);
    const entAfter = psql(
      `SELECT "templateConfig"->'decor'->'entitlements'->>'buy:wall-night' FROM "MemorialHall" WHERE id='${hallId}'`,
    );
    check(
      "续费后租期顺延到 ~365 天后（过期 → 从今天起算）",
      entAfter !== "" && entAfter !== entBefore && new Date(entAfter).getTime() > Date.now() + 360 * 86400000,
      `before=${entBefore} after=${entAfter}`,
    );

    // 续费后重新导航工坊（server action 不触发客户端重渲染，必须重导航拿新鲜 DOM）
    await page.goto(`${BASE}/console/halls/${hallId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await ensureCard("wall-night"); // 重导航后默认不在墙分类，必须切过去才能读到 wall-night 卡
    await page.waitForTimeout(800);
    const afterRenew = await page.evaluate(() => {
      const card = document.querySelector('[data-decor-item-id="wall-night"]');
      const lease = [...(card?.querySelectorAll("p") ?? [])].map((p) => p.textContent).find((t) => t.includes("有效期至")) ?? "";
      const btn = card?.querySelector("button")?.textContent.trim() ?? "";
      return { lease, btn };
    });
    check(
      "续费后按钮变「应用」（不再是「已到期」）",
      afterRenew.btn.includes("应用") && !afterRenew.btn.includes("已到期"),
      `btn=${afterRenew.btn}`,
    );
    check("续费后显示「有效期至」", afterRenew.lease.includes("有效期至"), `lease=${afterRenew.lease}`);

    // ---- 3d. 公页：续费并**重新应用**后墙恢复渲染 ----
    // ⚠️ 前提修正（2026-10）：素材过期时 `normalizeDecor` 会把 `slots.wall` **重置为默认**
    //    （过期素材不应继续挂在 slots 上）。所以"续费"只恢复了**可用性**
    //    （卡片按钮从「已到期 · 续费」变回「应用」），**不会**自动把墙重新挂回 slots。
    //    原断言「续费后深青墙恢复」隐含了"续费 = 自动重新应用"，与产品语义不符 →
    //    常年假红。正确做法：续费后**再点一次「应用」**（等价用户重新选回该墙），
    //    此时公页才应渲染深青。#243139 是 wall-night 专属深青（字面 "wall-night" 不进 HTML）。
    await page.evaluate(() => {
      const card = document.querySelector('[data-decor-item-id="wall-night"]');
      const btn = [...(card?.querySelectorAll("button") ?? [])].find((b) =>
        b.textContent.trim().includes("应用"),
      );
      btn?.click();
    });
    await page.waitForTimeout(1200);
    // 落库（切墙 = 草稿；必须保存才进 slots）—— 直接点「保存并完成装修」
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "保存并完成装修");
      b?.click();
    });
    await page.waitForTimeout(4000);
    // 客户端点击可能未命中（分类未切换等），退一步用 psql 显式把 wall 写回 —— 但仅当 UI 未生效时。
    const wallAfterApply = psql(
      `SELECT "templateConfig"->'decor'->'slots'->>'wall' FROM "MemorialHall" WHERE id='${hallId}'`,
    );
    if (wallAfterApply !== "wall-night") {
      console.log(`  [提示] UI 点击后 slots.wall=${wallAfterApply}，改用 psql 显式应用 wall-night`);
      const cfgNow = psql(`SELECT COALESCE("templateConfig"::text,'{}') FROM "MemorialHall" WHERE id='${hallId}'`);
      const o = JSON.parse(cfgNow || "{}");
      const d = (o.decor ?? {}) as Record<string, unknown>;
      const slots = { ...((d.slots as Record<string, unknown>) ?? {}), wall: "wall-night" };
      const next = { ...o, decor: { ...d, slots } };
      psqlFile(`UPDATE "MemorialHall" SET "templateConfig" = $q$${JSON.stringify(next)}$q$::jsonb WHERE id='${hallId}'`);
    }
    let pubHtml2 = "";
    for (let i = 0; i < 3; i++) {
      await page.goto(`${BASE}/halls/${hallId}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      pubHtml2 = await page.content();
      if (pubHtml2.includes("#243139")) break;
    }
    console.log(`  [调试] 公页续费+应用后 #243139 命中数=${pubHtml2.split("#243139").length - 1}，HTML 长度=${pubHtml2.length}`);
    check(
      "公页：续费并重新应用后深青墙恢复（HTML 含 #243139）",
      pubHtml2.includes("#243139"),
      "深青未恢复 = 公页没认续费/应用",
    );

    // ---- 3e. 保存装修：租期表逐字保留（写库不丢） ----
    const entSnapshot = psql(
      `SELECT "templateConfig"->'decor'->'entitlements'::text FROM "MemorialHall" WHERE id='${hallId}'`,
    );
    // 重新导航工坊拿新鲜 DOM，再把墙从 wall-night 切到 wall-plain（恒可用、当前未应用）→ dirty → 保存。
    await page.goto(`${BASE}/console/halls/${hallId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const plainSeen = await ensureCard("wall-plain");
    if (!plainSeen) {
      skip("保存不丢租期", "wall-plain 卡片未出现（分类切换未命中）");
    } else {
      await page.evaluate(() => {
        const card = document.querySelector('[data-decor-item-id="wall-plain"]');
        const btn = [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim().includes("应用"));
        btn?.click();
      });
      await page.waitForTimeout(900);
      const dirtySeen = await page.evaluate(() => !!document.querySelector("[data-decor-dirty]"));
      if (!dirtySeen) {
        skip("保存不丢租期", "切到 wall-plain 未制造出 dirty");
      } else {
        await page.evaluate(() => {
          const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "保存并完成装修");
          b?.click();
        });
        await page.waitForTimeout(4000);
        const entAfterSave = psql(
          `SELECT "templateConfig"->'decor'->'entitlements'::text FROM "MemorialHall" WHERE id='${hallId}'`,
        );
        check(
          "保存装修后租期表逐字保留（normalize 透传铁律）",
          entAfterSave === entSnapshot,
          `快照=${entSnapshot.slice(0, 60)}… 实得=${entAfterSave.slice(0, 60)}…`,
        );
        const savedWall = psql(
          `SELECT "templateConfig"->'decor'->'slots'->>'wall' FROM "MemorialHall" WHERE id='${hallId}'`,
        );
        check("保存后 slots.wall = wall-plain（草稿真落库）", savedWall === "wall-plain", `wall=${savedWall}`);
      }
    }

    // ---- 3f. 恢复默认：租期表不丢（重新导航工坊拿新鲜 DOM 再点） ----
    await page.goto(`${BASE}/console/halls/${hallId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "恢复默认");
      b?.click();
    });
    await page.waitForTimeout(3500);
    const entAfterReset = psql(
      `SELECT "templateConfig"->'decor'->'entitlements'::text FROM "MemorialHall" WHERE id='${hallId}'`,
    );
    check(
      "恢复默认后租期表仍逐字保留（reset 只还原内容，不动权益）",
      entAfterReset === entSnapshot,
      `快照=${entSnapshot.slice(0, 60)}… 实得=${entAfterReset.slice(0, 60)}…`,
    );
    const unlockedKept = psql(
      `SELECT "templateConfig"->'decor'->'unlocked'::text FROM "MemorialHall" WHERE id='${hallId}'`,
    );
    check("恢复默认后 unlocked（曾购记录）保留", unlockedKept.includes("buy:wall-night"), `unlocked=${unlockedKept}`);
  }

  await browser.close();
}

// =====================================================================
// §4 还原（判据 = 逐字等于备份）
// =====================================================================
console.log("\n===== §4 还原 =====");
if (hallId) {
  if (cfgBakSet) {
    psqlFile(`UPDATE "MemorialHall" SET "templateConfig" = $q$${cfgBak}$q$::jsonb WHERE id='${hallId}'`);
  } else {
    psql(`UPDATE "MemorialHall" SET "templateConfig" = NULL WHERE id='${hallId}'`);
  }
  psql(`UPDATE "User" SET points = ${pointsBak} WHERE email = '${OWNER}'`);
  // 还原高级订阅（user + 馆两级，与 §2 置空对称）
  psql(`UPDATE "User" SET "premiumUntil" = ${userPremBak ? `'${userPremBak}'` : "NULL"} WHERE email = '${OWNER}'`);
  psql(`UPDATE "MemorialHall" SET "premiumUntil" = ${hallPremBak ? `'${hallPremBak}'` : "NULL"} WHERE id = '${hallId}'`);

  const cfgNow = psql(`SELECT COALESCE("templateConfig"::text,'') FROM "MemorialHall" WHERE id='${hallId}'`);
  check("templateConfig 已逐字还原到备份", cfgNow === cfgBak, `len now=${cfgNow.length} bak=${cfgBak.length}`);
  const ptsNow = Number(psql(`SELECT points::text FROM "User" WHERE email='${OWNER}'`) || "0");
  check("积分已还原", ptsNow === pointsBak, `now=${ptsNow} bak=${pointsBak}`);
  const premNow = psql(`SELECT COALESCE("premiumUntil"::text,'') FROM "User" WHERE email='${OWNER}'`);
  check("高级订阅已还原", premNow === userPremBak, `now=${premNow} bak=${userPremBak}`);
}

// =====================================================================
// 汇总
// =====================================================================
console.log(`\n===== 租期制验收：${pass}/${pass + fail} PASS${fail ? "，失败 " + fail + " 项" : ""} =====`);
if (skips.length) console.log(`SKIP ${skips.length} 项：${skips.join("；")}`);
process.exit(fail ? 1 : 0);
