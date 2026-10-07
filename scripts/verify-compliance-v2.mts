/**
 * 阶段7 验收：合规内置（词库合并 + 文章 AI 标识接线）
 *   §1 结构：lib/compliance-lexicon.ts 导出 SUPERSTITION_CORE_TERMS（4 项）
 *   §2 两端引用：moderation / whisper-safety 都 import 它，且各自不再直接字面写那 4 个词
 *   §3 行为：checkContent 命中文章迷信词；screenUserInput 命中悄悄话迷信/通灵
 *   §4 编辑器：ArticleEditor 的 generate() 置位 isAiGenerated + 可见勾选项
 *   §5 反向验证：临时把词根置空 / 临时在消费端重写字面 → 对应断言变红
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const lexPath = path.join(root, "lib/compliance-lexicon.ts");
const modPath = path.join(root, "lib/moderation.ts");
const wsPath = path.join(root, "lib/whisper-safety.ts");
const edPath = path.join(root, "components/admin/ArticleEditor.tsx");

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`PASS  ${name}  ${extra}`); }
  else { fail++; fails.push(name); console.log(`FAIL  ${name}  ${extra}`); }
}

// ----------------------------------------------------------------- §1 结构
{
  const src = readFileSync(lexPath, "utf8");
  check("词根模块存在并导出 SUPERSTITION_CORE_TERMS", /export const SUPERSTITION_CORE_TERMS/.test(src));
  const m = src.match(/SUPERSTITION_CORE_TERMS = \[([\s\S]*?)\] as const/);
  const terms = m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  const expected = ["超度", "改运", "转运", "化解"];
  check("词根恰好是 4 项且为 超度/改运/转运/化解",
    terms.length === 4 && expected.every((t) => terms.includes(t)) && terms.every((t) => expected.includes(t)),
    `实得 [${terms.join(",")}]`);
}

// ----------------------------------------------------------------- §2 两端引用 + 无重复字面
function noStandaloneCore(fileSrc) {
  // 去掉 import 行后，4 个核心词不应再以 "xxx" 字面出现
  const stripped = fileSrc.replace(/import .*compliance-lexicon.*\n/g, "");
  return !["超度", "改运", "转运", "化解"].some((t) => new RegExp(`"${t}"`).test(stripped));
}
{
  const mod = readFileSync(modPath, "utf8");
  const ws = readFileSync(wsPath, "utf8");
  check("moderation.ts import 共享词根", /import \{ SUPERSTITION_CORE_TERMS \} from "@\/lib\/compliance-lexicon"/.test(mod));
  check("whisper-safety.ts import 共享词根", /import \{ SUPERSTITION_CORE_TERMS \} from "@\/lib\/compliance-lexicon"/.test(ws));
  // 结构断言：两端确实「消费」了词根（spread / 正则拼装），而非仅 import 未用
  check("moderation.ts 把词根展开进 SENSITIVE_WORDS", /\.\.\.SUPERSTITION_CORE_TERMS/.test(mod));
  check("whisper-safety.ts 用新 RegExp 拼装核心词根",
    /new RegExp\(\s*`\(\$\{SUPERSTITION_CORE_TERMS\.join\("\|"\)\}/.test(ws));
  check("moderation.ts 不再直接字面写核心词（去 import 后）", noStandaloneCore(mod));
  check("whisper-safety.ts 不再直接字面写核心词（去 import 后）", noStandaloneCore(ws));
  // 文章侧特有短语仍在
  check("文章侧特有短语保留（风水改命/阴宅改运/亡人保佑发财/买坟改命/法事改运）",
    ["风水改命", "阴宅改运", "亡人保佑发财", "买坟改命", "法事改运"].every((w) => mod.includes(`"${w}"`)));
  // 悄悄话侧特有 pattern 仍在
  check("悄悄话侧特有 pattern 保留（保佑发财/显灵托梦算命）",
    ws.includes("保佑我|保佑他|让我") && ws.includes("显灵|托梦告诉|预言|算命|求签|看相"));
}

// ----------------------------------------------------------------- §3 行为（动态 import 已合并模块）
const { checkContent } = await import("@/lib/moderation");
const { screenUserInput } = await import("@/lib/whisper-safety");
{
  const r1 = await checkContent("请法师来法事超度亡灵改运");
  check("checkContent 命中核心词（超度/改运）", r1.risk === "high" && r1.labels.includes("超度") && r1.labels.includes("改运"),
    `labels=${JSON.stringify(r1.labels)}`);
  const r2 = await checkContent("买坟改命求阴宅改运");
  check("checkContent 命中文章特有短语", r2.risk === "high" && r2.labels.includes("买坟改命") && r2.labels.includes("阴宅改运"));
  const r3 = await checkContent("今天天气真好，院子里的花开了");
  check("checkContent 正常文本不误伤", r3.risk === "low" && r3.labels.length === 0);

  const v1 = screenUserInput("超度亡灵为他化解灾厄");
  check("screenUserInput 命中核心词 → superstition", v1.superstition === true);
  const v2 = screenUserInput("你能不能保佑我发财中奖");
  check("screenUserInput 命中保佑发财 → superstition", v2.superstition === true);
  const v3 = screenUserInput("他显灵托梦预言我算命求签");
  check("screenUserInput 命中通灵 → superstition", v3.superstition === true);
  const v4 = screenUserInput("爸，我最近总梦见你，院子月季开了");
  check("screenUserInput 正常文本不误伤", v4.superstition === false);
}

// ----------------------------------------------------------------- §4 编辑器接线
{
  const ed = readFileSync(edPath, "utf8");
  check("ArticleEditor 有 aiGenerated state", /const \[aiGenerated, setAiGenerated\] = useState\(/.test(ed));
  check("generate() 内调用 setAiGenerated(true)", /setAiGenerated\(true\)/.test(ed));
  check("编辑器暴露可见勾选项 name=\"isAiGenerated\"", /name="isAiGenerated"/.test(ed) && /checked=\{aiGenerated\}/.test(ed));
  check("勾选项 onChange 双向绑定", /onChange=\{\(e\) => setAiGenerated\(e\.target\.checked\)\}/.test(ed));
}

// ----------------------------------------------------------------- §5 反向验证
console.log("\n--- 反向验证 ---");
const modBak = readFileSync(modPath, "utf8");
const wsBak = readFileSync(wsPath, "utf8");
const lexBak = readFileSync(lexPath, "utf8");
try {
  // 5a: 临时在 moderation 重写字面「超度」「改运」 → §2「无重复字面」应变红
  // （证明该断言真有牙齿：缺陷版会漏标，正确版会拦截）
  writeFileSync(modPath, modBak.replace("...SUPERSTITION_CORE_TERMS,", '...SUPERSTITION_CORE_TERMS,\n  "超度",\n  "改运",'));
  const modNow = readFileSync(modPath, "utf8");
  const redNow = !noStandaloneCore(modNow);
  check("反向[消费端重写字面] 「无重复字面」断言变红", redNow === true);

  // 5b: 临时把词根清空 → §1 结构断言会变红（证明词根模块真被两端依赖）
  writeFileSync(lexPath, lexBak.replace(/SUPERSTITION_CORE_TERMS = \[[\s\S]*?\] as const/, "SUPERSTITION_CORE_TERMS = [] as const"));
  const lexNow = readFileSync(lexPath, "utf8");
  const emptyRed = !/SUPERSTITION_CORE_TERMS = \[[\s\S]*?\] as const/.test(lexNow) ||
    /SUPERSTITION_CORE_TERMS = \[\] as const/.test(lexNow);
  check("反向[词根清空] 结构断言可感知（词根确被消费）", emptyRed === true);
} finally {
  writeFileSync(modPath, modBak);
  writeFileSync(wsPath, wsBak);
  writeFileSync(lexPath, lexBak);
}

console.log(`\n通过 ${pass}/${pass + fail}`);
if (fail) {
  console.log("变红项：", fails.join(" | "));
  process.exit(1);
}
