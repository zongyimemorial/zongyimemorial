#!/usr/bin/env node
/*
  verify-single-source.mjs —— 「同一真相只写一处」的静态守卫

  为什么需要它：
  本项目反复踩同一族坑，症状各不相同但根因一致 —— **同一个事实被写在两个地方**：

    1. 祭品动效表在纪念馆/宗祠面板各抄一份（30 条逐字节相同）→
       谁先改谁就对不上，症状是"同一件祭品两边动效不同"，不报错、不崩溃。
    2. 每日免费配额写在 lib/offerings.ts 是 1，验收脚本里写死 3 →
       6 条断言常年飘红，看着像补货功能坏了，其实是数字过期。
    3. 祭文有两个入口读不同数据源 → 一个灰显一个不灰显。

  这些都是"运行时才暴露、且症状误导方向"的问题。与其每次人工发现，
  不如用一条几秒内跑完的静态检查把它们钉死。

  检查项：
    A. 动效/音效表已统一到 lib/ritual-effects.ts，组件里不得再有本地副本
    B. 验收脚本不得硬编码业务常量（配额/价格），必须引用真相源
    C. 脚本引用的祭品 slug 必须存在于 lib/ritual.ts 权威表
    D. 三个祭拜面板必须都消费共享动效模块（防止新面板又抄一份）
*/
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const results = [];
const check = (name, ok, extra = "") => {
  const line = { name, ok: !!ok, extra: String(extra).slice(0, 200).replace(/\n/g, " ") };
  results.push(line);
  console.log(`${line.ok ? "✅" : "❌"} ${line.name}${line.extra ? `  — ${line.extra}` : ""}`);
};

const read = (p) => readFileSync(p, "utf8");

// ---------------------------------------------------------------- A. 动效表唯一
const EFFECT_PANELS = [
  "components/hall/WorshipPanel.tsx",
  "components/clan/ClanWorshipPanel.tsx",
  "components/memorial/PublicWorshipPanel.tsx",
];

for (const f of EFFECT_PANELS) {
  const src = read(f);
  /*
    本地定义检测：行首 `const EFFECT_KIND` / `const SOUND` / `function playTone`。
    公益馆的 EFFECT_KIND 是**豁免**的 —— 它的键是祭品 type 而非 slug，
    与共享模块的键空间不同，强行合并会让动效全部回落 offering。
    见 lib/ritual-effects.ts 顶部注释的三类口径差异说明。
  */
  const localSound = /^const SOUND\s*:/m.test(src);
  const localTone = /^function playTone\s*\(/m.test(src);
  const localEffect = /^const EFFECT_KIND\s*:/m.test(src);
  const exempt = f.includes("memorial/PublicWorshipPanel");

  check(`A1 ${f} 无本地 SOUND 副本`, !localSound);
  check(`A2 ${f} 无本地 playTone 副本`, !localTone);
  check(
    `A3 ${f} ${exempt ? "保留自身的 type 键动效表（豁免）" : "无本地 EFFECT_KIND 副本"}`,
    exempt ? localEffect : !localEffect,
    exempt ? "键是祭品 type 不是 slug，见共享模块注释" : "",
  );
  check(
    `A4 ${f} 已消费共享动效模块`,
    /from\s+"@\/lib\/ritual-effects"/.test(src),
  );
}

// 共享模块内容自检：30 条 slug 映射 + 18 条音效
const shared = read("lib/ritual-effects.ts");
const slugEffectCount = (shared.slice(shared.indexOf("export const EFFECT_KIND"), shared.indexOf("export const MEMORIAL_EFFECT_KIND")).match(/":\s*"/g) || []).length;
check("A5 共享 EFFECT_KIND 覆盖 30 件礼器", slugEffectCount === 30, `实际 ${slugEffectCount} 条`);
const soundCount = (shared.slice(shared.indexOf("export const SOUND"), shared.indexOf("export function playTone")).match(/:\s*\[/g) || []).length;
check("A6 共享 SOUND 含 18 类音效", soundCount === 18, `实际 ${soundCount} 条`);

// ---------------------------------------------------------------- B. 脚本不硬编码业务常量
/*
  只查**断言里**的字面量，不查 SQL 里的 —— 后者常常是在造数据（如备货 3 份），
  那是脚本自己的输入，不属于"真相源被抄写"。
  判据：`check(...)` 或 `=== N` 之类的比较中出现业务常量数字。
*/
const BUSINESS_CONSTANTS = [
  { name: "FREE_DAILY_QUOTA", truth: /FREE_DAILY_QUOTA\s*=\s*(\d+)/, file: "lib/offerings.ts" },
];
const truthValues = {};
for (const c of BUSINESS_CONSTANTS) {
  const m = read(c.file).match(c.truth);
  truthValues[c.name] = m ? m[1] : null;
  check(`B0 真相源可读：${c.name}`, !!m, `${c.file} → ${m ? m[1] : "(未找到)"}`);
}

const scripts = readdirSync("scripts").filter((f) => /^verify-.*\.mjs$/.test(f));
/*
  检测口径必须**窄**：只抓"免费配额被写成字面量"这一种写法，别误伤无关数字。

  第一版写成 `=== \d+` + 名称里出现"N 份"就报，结果 8 个脚本全被误判 ——
  它们里有 `expect === 3` 的分页条数、`=== 200` 的 HTTP 码、`=== 12` 的素材数……
  误报比漏报更糟：守卫一旦常亮红灯就没人看了。

  正确的判据：**同一个脚本里，既出现"免费/每日配额"语义的文案，
  又没有引用 FREE_DAILY_QUOTA 常量** —— 这才说明它把配额抄成了数字。
*/
/*
  ⚠️ 必须**先剥离注释**再判断是否"引用了真相源"。
  反向验证时抓到过这个漏报：把脚本退化成 `const FREE_DAILY_QUOTA = 1;` 后，
  注释里那句"FREE_DAILY_QUOTA 早已调成 1"仍然包含该词，
  于是正则在注释里匹配成功 → 判定"已引用真相源" → 漏报。
  检测代码和被检测代码共用同一段文本时，注释永远是最容易骗过正则的地方。
*/
const stripComments = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const offenders = [];
for (const f of scripts) {
  const code = stripComments(read(`scripts/${f}`));
  // "真的从真相源取值"：出现 import 或 readFileSync 读取 lib/offerings.ts
  const readsTruth =
    /require\(|readFileSync/.test(code) && /offerings\.ts/.test(code) ||
    /import\s*\{[^}]*FREE_DAILY_QUOTA[^}]*\}\s*from/.test(code);
  // 代码里（非注释）出现"免费配额/每日领 N 份/补当日配额"这类语义
  const mentionsQuota = /(免费配额|每日领\s*\d+\s*份|补当日免费配额)/.test(code);
  if (mentionsQuota && !readsTruth) offenders.push(f);
}
check(
  "B1 验收脚本用常量而非字面量断言配额",
  offenders.length === 0,
  offenders.length ? `疑似硬编码：${offenders.join(", ")}` : "",
);

// ---------------------------------------------------------------- C. 脚本引用的祭品 slug 必须在权威表内
const ritual = read("lib/ritual.ts");
// 权威 slug 名单：lib/ritual.ts 里出现的 "free-xxx" 字面量
const knownSlugs = new Set((ritual.match(/"(free-[a-z-]+)"/g) || []).map((s) => s.replace(/"/g, "")));
/*
  同样要**窄**：只查 SQL 与选择器里真正被当作商品 slug 用的字面量。

  第一版把脚本里所有 free-xxx 词都算进来了，于是两类必然误报：
    · 测试自己造的假 slug（verify-poem-stock-gray 里的 free-poem-renamed，
      它**故意**用一个库外的名字来验证降级兜底）；
    · 守卫脚本自身的文档举例（本文件里的 free-xxx）。
  判据收紧为：出现在 `slug='...'` / `slug='free-...'` 或 `献上<slug>` 这类
  真实引用位置，且不是明显的占位符（含 xxx）与刻意构造的改名样本。
*/
const IGNORE_SLUGS = new Set(["free-xxx"]);
const unknown = [];
for (const f of scripts) {
  if (f === "verify-single-source.mjs") continue; // 自身文档里的举例不算引用
  const src = read(`scripts/${f}`);
  const used = new Set();
  // p.slug='free-...' / slug='free-...' 形式
  for (const m of src.matchAll(/slug\s*[=:]\s*['"](free-[a-z-]+)['"]/g)) used.add(m[1]);
  for (const s of used) {
    if (IGNORE_SLUGS.has(s)) continue;
    /*
      刻意构造的改名样本（如 free-poem-renamed）是**测试输入**，
      它的存在本身就是在验证"库里查不到时降级"，不该要求它在权威表内。
      判据：权威表里存在该 slug 的前缀（free-poem）即视为构造样本。
    */
    const isConstructed = [...knownSlugs].some((k) => s.startsWith(k + "-"));
    if (!knownSlugs.has(s) && !isConstructed) unknown.push(`${f}:${s}`);
  }
}
check(
  "C1 脚本引用的祭品 slug 都在 lib/ritual.ts 权威表内",
  unknown.length === 0,
  unknown.length ? `未知：${unknown.slice(0, 6).join(", ")}${unknown.length > 6 ? ` …共 ${unknown.length} 个` : ""}` : "",
);

// ---------------------------------------------------------------- D. 共享模块被 git 跟踪
try {
  execSync("git ls-files --error-unmatch lib/ritual-effects.ts", { stdio: "ignore" });
  check("D1 lib/ritual-effects.ts 已纳入版本控制", true);
} catch {
  check("D1 lib/ritual-effects.ts 已纳入版本控制", false, "未被 git 跟踪（新文件需 git add）");
}

// ---------------------------------------------------------------- 汇总
const passed = results.filter((r) => r.ok).length;
console.log(`\n${"=".repeat(60)}`);
console.log(`结果: ${passed}/${results.length} 通过`);
if (passed < results.length) {
  console.log("失败项:");
  for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}${r.extra ? `  (${r.extra})` : ""}`);
}
console.log(
  "\n本套件守的是「同一真相只写一处」：\n" +
    "  A 动效/音效表已统一到 lib/ritual-effects.ts\n" +
    "  B 验收脚本从真相源读常量，不抄写数字\n" +
    "  C 脚本引用的祭品 slug 都在权威表内\n" +
    "  D 共享模块已入库",
);
process.exit(passed === results.length ? 0 : 1);
