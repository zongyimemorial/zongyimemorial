/**
 * 「装修完了点保存即完成装修」验证据点。
 *
 * 核心要证明的三件事：
 *   ① 点素材**不落库**（草稿）
 *   ② 点「保存并完成装修」**才落库**，且馆页跟着变
 *   ③ 「放弃改动」能把草稿退回上次保存的状态
 *
 * 这三条必须用**真实点击 + 回查数据库**验证 —— 只读源码会被
 * "写了但没生效""写到别的分支去了"骗过。
 */
import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { execSync } from "node:child_process";

const BASE = "http://127.0.0.1:3000";
const psql = (q) =>
  execSync(`docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`, {
    encoding: "utf8",
  }).trim();

const uid = psql(`SELECT id FROM "User" WHERE email='user@test.com' LIMIT 1;`);
const hallId = psql(`SELECT id FROM "MemorialHall" WHERE "ownerUserId"='${uid}' ORDER BY "createdAt" ASC LIMIT 1;`);
const BACKUP = psql(`SELECT "templateConfig"->'decor'->>'templateId' FROM "MemorialHall" WHERE id='${hallId}';`);
// ⚠️ 必须备份**整份 decor**：§4 的「保存并完成装修」是原子写入 templateId+slots，
//    只还原 templateId 会把模板预设 slots 留在库里 —— 库一旦收敛成与 tpl-niche 预设
//    逐字相同，下一轮 §1 再点赠品模板就是 no-op，dirty 永不亮（实测踩过：22/22 → 17/19）。
const FULL_BACKUP = psql(`SELECT "templateConfig"->'decor' FROM "MemorialHall" WHERE id='${hallId}';`);
console.log(`馆=${hallId} 原模板=${BACKUP || "(空)"}`);

/*
  前提自造（陷阱 11：断言别依赖残留状态）：
  §1 靠「点赠品模板 tpl-niche」制造草稿，前提是已保存 slots ≠ tpl-niche 预设。
  这里把 slots 显式写成默认值组合（锁定素材经 normalize 回落后**就是**这组默认值，
  确定性强），与 tpl-niche 预设（wall-warm/floor-marble/orn-niche-wall/frame-gold/font-serif）
  必不相同 → 点击必然产生真实改动 → dirty 必然亮。
*/
const PREMISE_SLOTS = '{"wall":"wall-plain","floor":"floor-none","ornament":["orn-none"],"frame":"frame-line","font":"font-modern"}';
psql(`UPDATE "MemorialHall" SET "templateConfig" = jsonb_set(coalesce("templateConfig",'{}'), '{decor,slots}', '${PREMISE_SLOTS}'::jsonb, true) WHERE id='${hallId}';`);

const tplOf = () =>
  psql(`SELECT coalesce("templateConfig"->'decor'->>'templateId','') FROM "MemorialHall" WHERE id='${hallId}';`);
const wallOf = () =>
  psql(`SELECT coalesce("templateConfig"->'decor'->'slots'->>'wall','') FROM "MemorialHall" WHERE id='${hallId}';`);

let pass = 0, fail = 0;
const check = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`PASS  ${n}${d ? `  (${d})` : ""}`); }
  else { fail++; console.log(`FAIL  ${n}${d ? `  (${d})` : ""}`); }
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();

await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.fill('input[name="identifier"]', "user@test.com");
await page.fill('input[name="password"]', "user123456");
await page.click('button[type="submit"]');
await page.waitForTimeout(4500);

await page.goto(BASE + "/console/halls/" + hallId, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3200);

// ---- 0. 指引与全屏预览入口存在 ----
const html0 = await page.content();
check("工坊有装修指引", /data-decor-guide/.test(html0));
check("指引含四步文案", /挑一套模板/.test(html0) && /保存并完成装修/.test(html0));
check("工坊有「全屏预览」按钮", /全屏预览/.test(html0));
check("初始无未保存提示", !/data-decor-dirty/.test(html0));

// ---- 1. 点一个收费模板 → 不落库，但出现未保存提示 ----
const before = tplOf();
const paidCard = page.locator("div.overflow-hidden").filter({ hasText: "水墨山房 · 立体" }).first();
if ((await paidCard.count()) === 0) {
  check("找到收费模板卡片", false, "水墨山房 · 立体");
} else {
  // 该模板没买过 → 卡片里是兑换按钮，点它会真花积分。改用一次免费可应用的操作：
  // 直接点「赠品模板」（它 tier=free，点了就是改草稿）
  const giftCard = page.locator("div.overflow-hidden").filter({ hasText: "壁龛纪念堂" }).first();
  await giftCard.getByRole("button", { name: /一键应用|重新应用/ }).first().click();
  await page.waitForTimeout(1500);
  check("点模板后**未落库**（草稿）", tplOf() === before, `库=${tplOf() || "(空)"} 期望=${before || "(空)"}`);
  const html1 = await page.content();
  check("点模板后出现「有未保存的改动」", /data-decor-dirty/.test(html1));
  check("草稿条有「放弃改动」与「保存并完成装修」", /放弃改动/.test(html1) && /保存并完成装修/.test(html1));
}

// ---- 2. 换一个壁纸 → 仍然不落库 ----
const wallBefore = wallOf();
const wallCard = page.locator('button:text-is("背景壁纸")').first();
if ((await wallCard.count()) > 0) {
  await wallCard.click();
  await page.waitForTimeout(1200);
  const target = page.locator("div.overflow-hidden").filter({ hasText: "宣纸" }).first();
  if ((await target.count()) > 0) {
    await target.getByRole("button", { name: /一键应用|使用|应用/ }).first().click().catch(async () => {
      await target.click();
    });
    await page.waitForTimeout(1500);
    check("换壁纸后**未落库**（草稿）", wallOf() === wallBefore, `库=${wallOf() || "(空)"}`);
  }
}

// ---- 3. 放弃改动 → 草稿退回 ----
//
// 注意（踩过的坑）：草稿条只在 `dirty` 为真时渲染。
// 若第 2 步选的壁纸恰好等于「已保存值」，dirty 会变回 false、
// 草稿条整条消失 —— 这时找不到「放弃改动」是**正确行为**，不是缺陷。
//
// 所以这里**不依赖前一步的残留状态**，自己制造一个确定性的改动场景：
//   确保 dirty（点一个 ≠ 当前值的模板）→ 点放弃 → 断言退回 + 库不变。
{
  const ensureDirty = async () => {
    if ((await page.locator("[data-decor-dirty]").count()) > 0) return true;
    // 换一套模板制造改动（挑「壁龛纪念堂」之外的免费可点项做不到，
    // 就直接改壁纸：依次试几个不同壁纸，直到出现未保存提示）
    const wallTab = page.locator('button:text-is("背景壁纸")').first();
    if ((await wallTab.count()) > 0) {
      await wallTab.click();
      await page.waitForTimeout(1000);
      const cards = page.locator("div.overflow-hidden");
      const n = await cards.count();
      for (let i = 0; i < n && i < 12; i++) {
        const c = cards.nth(i);
        const btn = c.getByRole("button", { name: /一键应用|使用|应用|兑换/ }).first();
        if ((await btn.count()) === 0) continue;
        await btn.click().catch(() => {});
        await page.waitForTimeout(900);
        if ((await page.locator("[data-decor-dirty]").count()) > 0) return true;
      }
    }
    return (await page.locator("[data-decor-dirty]").count()) > 0;
  };

  const got = await ensureDirty();
  if (got) {
    const discard = page.locator('button', { hasText: "放弃改动" }).first();
    check("草稿条里有「放弃改动」按钮", (await discard.count()) > 0);
    if ((await discard.count()) > 0) {
      await discard.click();
      await page.waitForTimeout(1200);
      const html2 = await page.content();
      check("放弃改动后提示条消失", !/data-decor-dirty/.test(html2));
      check("放弃改动后库仍未变（本来就没写）", tplOf() === before, `库=${tplOf() || "(空)"}`);
    }
  } else {
    check("弃改场景：已成功制造出未保存改动", false, "无法制造 dirty，本节未生效");
  }
}

// ---- 4. 真正保存 → 落库 + 完成反馈 ----
{
  /*
    ⚠️ 必须先切回「整套模板」分类。
    第 2 步点了「背景壁纸」，素材墙现在显示的是壁纸卡片 ——
    直接去找模板卡会超时（这正是上面那次失败的成因）。
  */
  const tplTab = page.locator('button:text-is("整套模板")').first();
  if ((await tplTab.count()) > 0) {
    await tplTab.click();
    await page.waitForTimeout(1200);
  }

  const giftCard = page.locator("div.overflow-hidden").filter({ hasText: "壁龛纪念堂" }).first();
  await giftCard.getByRole("button", { name: /一键应用|重新应用/ }).first().click();
  await page.waitForTimeout(1200);
  const saveBtn = page.locator('button:text-is("保存并完成装修")').first();
  if ((await saveBtn.count()) > 0) {
    await saveBtn.click();
    await page.waitForTimeout(3000);
    check("点保存后**已落库**", tplOf() === "tpl-niche", `库=${tplOf() || "(空)"}`);
    const html3 = await page.content();
    check("保存后出现完成反馈", /data-decor-saved/.test(html3));
    check("完成反馈含「装修已保存完成」", /装修已保存完成/.test(html3));
    check("完成反馈含去馆页入口", /去馆页看看/.test(html3));
  } else {
    check("找到「保存并完成装修」按钮", false);
  }
}

// ---- 5. 馆页确实跟着变了 ----
{
  const pub = await page.goto(BASE + "/halls/" + hallId, { waitUntil: "domcontentloaded" });
  const h = await page.content();
  check("馆页可打开", (pub?.status() ?? 0) < 400, `HTTP ${pub?.status()}`);
  check("馆页仍渲染壁龛墙（装修生效）", /壁龛纪念墙/.test(h));
  check("馆页祭祀面板仍在（供奉体系未被装修影响）", /一键祭拜|献上上香|献祭/.test(h));
}

// ---- 6. 全屏预览 ----
{
  await page.goto(BASE + "/console/halls/" + hallId, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const btn = page.locator('button:text-is("全屏预览")').first();
  if ((await btn.count()) > 0) {
    await btn.click();
    await page.waitForTimeout(1500);
    const html4 = await page.content();
    check("全屏预览层已打开", /data-decor-fullpreview/.test(html4));
    check("全屏预览里有 3D 场景", /data-decor-3d/.test(html4));
    // Esc 关闭
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
    const html5 = await page.content();
    check("Esc 可关闭全屏预览", !/data-decor-fullpreview/.test(html5));
  } else {
    check("找到全屏预览按钮", false);
  }
}

// ---- 收尾：还原库状态 ----
/*
  ⚠️ 还原**整份 decor**（逐字写回 FULL_BACKUP），不是只还原 templateId。
  理由见开头的 FULL_BACKUP 注释：§4 的保存会连 slots 一起原子写入，
  漏还原 slots 就是"本套件毒化自己的下一轮 + 毒化依赖同一座馆的兄弟套件"。
  （templateId 的两种情况 —— 原值非空/为空 —— 都被整份写回天然覆盖，
  不再需要 jsonb_set 分支。）
*/
psql(`UPDATE "MemorialHall" SET "templateConfig" = jsonb_set(coalesce("templateConfig",'{}'), '{decor}', '${FULL_BACKUP}'::jsonb, true) WHERE id='${hallId}';`);
const restoredFull = psql(`SELECT "templateConfig"->'decor' FROM "MemorialHall" WHERE id='${hallId}';`);
check("测试后整份装修已逐字还原（脚本可重复跑）", restoredFull === FULL_BACKUP, `${restoredFull.slice(0, 80)}… vs 备份`);
const restored = tplOf();
check("测试后模板已还原", restored === (BACKUP || ""), `${restored || "(空)"} vs ${BACKUP || "(空)"}`);
console.log(`\n[teardown] 已还原整份装修 = ${restoredFull.slice(0, 80)}…`);
console.log(`\n通过 ${pass}/${pass + fail}`);

await b.close();
process.exit(fail ? 1 : 0);
