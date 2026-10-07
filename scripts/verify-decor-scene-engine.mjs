/**
 * 阶段 0 验收：场景引擎 v2 的**地基**
 * （数据结构齐备 / 档位单调 / 工厂不漏填 / 渲染层真读到）
 *
 * ============================================================================
 * 这个脚本守什么
 * ============================================================================
 *
 * v2 把 `Space3D` 从「几面墙 + 一块顶」扩成「几何 + 档位 + 光影 + 材质」四层。
 * 这种"宽接口 + 工厂派生"的结构有一个最阴险的失效模式：
 *
 *   **工厂漏填一个字段 → 那 8 个空间一起 undefined → 渲染层读到 undefined
 *   就静默跳过整个结构层。** 页面照常打开、不报错、没有控制台警告，
 *   只是"没有结构"—— 看起来像"设计就是这样"。
 *
 * 所以断言不能只测"函数返回了对象"，必须逐项测**字段真的齐备且类型对**，
 * 并且测档位表是**单调**的（防有人改一处、把豪华档悄悄降级）。
 *
 * ============================================================================
 * 反向验证（AGENTS.md 硬要求）
 * ============================================================================
 *
 * 本脚本的 §2 / §3 做过反向实验：
 *   - 把 `classic` 的 `columns` 清空 → §2「classic 至少有 2 根立柱」变红；
 *   - 把 `hall` 的 `structureTier` 从 `grand` 改成 `basic` → §3「豪华档结构数
 *     显著多于朴素档」变红。
 * 两条都不是"恒真断言"（AGENTS.md 点过名的假绿坑）。
 *
 * 前置：不需要 Next 在跑 —— 本阶段只测纯函数与数据（跑得快，可反复跑）。
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";

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

function src(p) {
  try {
    return readFileSync(`/workspace/${p}`, "utf8");
  } catch {
    return "";
  }
}

/**
 * 在真实的 TS 环境里跑一段探针，取它 stdout 的**最后一行**。
 *
 * ⚠️ **不要把多行代码塞进 `npx tsx -e`** —— 那串东西要穿
 *    「JS 字符串 → shell → tsx → esbuild」四层，换行与引号必然被剥坏。
 *    实测报错是 `Syntax error "n"`，看着像 TS 写错了，其实是 shell 把 \n 吃了。
 *    （与 AGENTS.md 记的"往 psql 传含 JSON 的 SQL 不要拼在 -c 里"同源问题。）
 *
 * 稳妥做法：写进临时文件 → `npx tsx <file>`。文件内容不被任何一层解析。
 *
 * ⚠️ 探针文件**必须落在 `/workspace` 内**（此处用 `/workspace/.probe/`），
 *    否则里面的 `@/lib/decor-3d` 相对导入解析不到 —— 报 `MODULE_NOT_FOUND`，
 *    看着像"模块没了"，其实只是文件放错目录。跑完即删。
 */
const PROBE_DIR = "/workspace/.probe";
mkdirSync(PROBE_DIR, { recursive: true });
function probe(code) {
  const f = `${PROBE_DIR}/p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ts`;
  writeFileSync(f, code, "utf8");
  try {
    const out = execSync(`cd /workspace && npx tsx ${f} 2>&1`, { encoding: "utf8" }).trim();
    // tsx 可能夹带 npm notice；只认自己打的那一行
    const lines = out.split("\n").map((l) => l.trim());
    const hit = lines.filter((l) => /^(OK|BAD:)/.test(l) || /^[a-z0-9_,=.\-]+$/.test(l));
    return (hit[hit.length - 1] ?? lines[lines.length - 1] ?? "").trim();
  } finally {
    try {
      unlinkSync(f);
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// 1. SPACES：kind 自洽 + 8 种形态
// ---------------------------------------------------------------------------
console.log("\n=== 1. 空间注册表自洽 ===");

const kindProbe = probe(
  `import {SPACES} from "@/lib/decor-3d"; const bad=Object.entries(SPACES).filter(([k,v]:any)=>v.kind!==k).map(([k,v]:any)=>k+":"+v.kind); console.log(bad.length?"BAD:"+bad.join(","):"OK");`,
);
check(
  "SPACES 每项的 kind 等于其 key（防派生函数写死 kind）",
  kindProbe.endsWith("OK"),
  kindProbe.slice(-140),
);

const keysProbe = probe(`import {SPACES} from "@/lib/decor-3d"; console.log(Object.keys(SPACES).join(","));`);
const spaceKeys = keysProbe.split(",").filter(Boolean);
check("空间形态注册表仍含 8 种形态（v2 未误删）", spaceKeys.length === 8, keysProbe.slice(-140));

// ---------------------------------------------------------------------------
// 2. v2 新字段**逐项齐备**（工厂漏填就会 8 处一起 undefined）
// ---------------------------------------------------------------------------
console.log("\n=== 2. v2 新字段齐备（防工厂漏填）===");

/*
  这一段的写法要特别注意：不能只 `if (s.structureTier)` ——
  空数组 `[]` 是**合法且有语义**的值（比如 niche 空间本来就该没有明柱），
  用 truthy 判定会把"合法空数组"误判成"漏填"。
  所以判据一律是 **类型对不对**：数组必须是 Array，对象必须是 object 且非 null。
*/
const completenessProbe = probe(
  `
import {SPACES} from "@/lib/decor-3d";
const TIERS=["none","basic","grand","imperial"];
const KEYS=["top","left","right","front","ambient"];
const TEMPS=["warm","neutral","cool","moonlight"];
const bad:string[]=[];
const isTri=(t:any)=>t&&typeof t.light==="string"&&typeof t.base==="string"&&typeof t.dark==="string";
for(const [k,s] of Object.entries(SPACES) as any){
  const p=(f:string)=>{ if(!s[f]) bad.push(k+"."+f); };
  if(!TIERS.includes(s.structureTier)) bad.push(k+".structureTier="+s.structureTier);
  if(!Array.isArray(s.columns)) bad.push(k+".columns");
  if(!Array.isArray(s.beams)) bad.push(k+".beams");
  if(!Array.isArray(s.dougong)) bad.push(k+".dougong");
  if(!("podium" in s)) bad.push(k+".podium(missing)");
  if(!Array.isArray(s.dividers)) bad.push(k+".dividers");
  // 材质：5 个 TriTone 都要有
  for(const f of ["pillar","beam","stone","metal","floor"]) if(!isTri(s.material?.[f])) bad.push(k+".material."+f);
  // 光影
  if(!s.light) bad.push(k+".light");
  else{
    if(!KEYS.includes(s.light.key)) bad.push(k+".light.key="+s.light.key);
    if(!TEMPS.includes(s.light.temperature)) bad.push(k+".light.temperature="+s.light.temperature);
    if(typeof s.light.intensity!=="number") bad.push(k+".light.intensity");
    if(!(s.light.shafts===null||typeof s.light.shafts==="object")) bad.push(k+".light.shafts");
    if(typeof s.light.ao!=="number") bad.push(k+".light.ao");
    if(!s.light.fog||typeof s.light.fog.density!=="number") bad.push(k+".light.fog");
    if(!s.light.tint||typeof s.light.tint.opacity!=="number") bad.push(k+".light.tint");
  }
}
console.log(bad.length?"BAD:"+bad.join(","):"OK");
`,
);
check(
  "8 种 SpaceKind 的 structureTier/columns/beams/dougong/podium/dividers/material/light 全部齐备",
  completenessProbe.endsWith("OK"),
  completenessProbe.slice(-200),
);

// 列数：classic 必须有立柱（反向验证就是清空它）
const colProbe = probe(
  `import {SPACES} from "@/lib/decor-3d"; const n=(k:string)=>(SPACES as any)[k].columns.length; console.log(["classic","shrine","hall","gate"].map(k=>k+"="+n(k)).join(","));`,
);
const colMap = Object.fromEntries(colProbe.split(",").map((s) => s.split("=")));
check("classic 至少有 2 根立柱（朴素档也有骨架）", Number(colMap.classic) >= 2, colProbe);
check("shrine 至少有 4 根立柱（grand 档）", Number(colMap.shrine) >= 4, colProbe);
check("hall 至少有 6 根立柱（grand 档）", Number(colMap.hall) >= 6, colProbe);

// niche 是"壁龛墙模式"，刻意无明柱：空数组是合法语义，不是漏填
const nicheCol = probe(`import {SPACES} from "@/lib/decor-3d"; console.log(SPACES.niche.columns.length+","+SPACES.niche.structureTier);`);
check("niche 无明柱且降为 basic（壁龛墙模式，防与墙面打架）", nicheCol === "0,basic", nicheCol);

// ---------------------------------------------------------------------------
// 3. 档位表单调性 + 结构计数落差
// ---------------------------------------------------------------------------
console.log("\n=== 3. 档位单调性与结构落差 ===");

/*
  单调性是**必备**而不是"锦上添花"：
  `imperial` 若少了某个构件，用户花 ¥88 买到的东西比 ¥22 的还少 ——
  这类"改一处、降一档"只能靠结构化的包含关系来锁。
*/
const monoProbe = probe(
  `
import {STRUCTURE_TIERS,TIER_ORDER,tierLevel} from "@/lib/decor-3d";
const FLAGS=["podium","columns","beams","dougong","cofferedCeiling","dividers"];
const bad:string[]=[];
for(let i=1;i<TIER_ORDER.length;i++){
  const lo=TIER_ORDER[i-1], hi=TIER_ORDER[i];
  for(const f of FLAGS) if(STRUCTURE_TIERS[lo][f] && !STRUCTURE_TIERS[hi][f]) bad.push(lo+"."+f+" → "+hi);
  if(STRUCTURE_TIERS[hi].detail < STRUCTURE_TIERS[lo].detail) bad.push(lo+".detail → "+hi);
}
// tierLevel 单调
for(let i=1;i<TIER_ORDER.length;i++) if(tierLevel(TIER_ORDER[i])<=tierLevel(TIER_ORDER[i-1])) bad.push("tierLevel "+TIER_ORDER[i]);
// none 必须什么都不画
for(const f of FLAGS) if(STRUCTURE_TIERS.none[f]) bad.push("none."+f+" 不该为真");
console.log(bad.length?"BAD:"+bad.join(","):"OK");
`,
);
check(
  "STRUCTURE_TIERS 单调：imperial ⊇ grand ⊇ basic ⊇ none",
  monoProbe.endsWith("OK"),
  monoProbe.slice(-200),
);

/*
  结构计数落差：这是"装修前后肉眼可辨"的**可证伪口径**。
  刻意不写"某个空间的结构数 ≥ N"（那是硬编码、加一个构件就误报），
  而是比**同一种形态在改档位前后的差** —— 这样它测的是
  "档位真的驱动了结构"，而不是"数字恰好等于多少"。
*/
const gapProbe = probe(
  `
import {SPACES,structureCount} from "@/lib/decor-3d";
const clone=(o:any)=>({...o,columns:[...o.columns],beams:[...o.beams],dougong:[...o.dougong],dividers:[...o.dividers],material:{...o.material},light:{...o.light}});
const hall=SPACES.hall;
const grand=structureCount(hall);
const basic=structureCount({...clone(hall),structureTier:"basic"});
const none=structureCount({...clone(hall),structureTier:"none"});
console.log("grand="+grand+",basic="+basic+",none="+none);
`,
);
const gapNums = Object.fromEntries(
  gapProbe.split(",").map((s) => s.split("=")),
);
check(
  "档位真的驱动结构：hall 的 grand 结构数显著多于 basic",
  Number(gapNums.grand) - Number(gapNums.basic) >= 8,
  `${gapProbe}（差 ${Number(gapNums.grand) - Number(gapNums.basic)}）`,
);
check(
  "none 档不画任何结构（structureCount = 0）",
  Number(gapNums.none) === 0,
  `none=${gapNums.none}`,
);

// starfield 是深空：结构必须是 none，且不应有台基
const starProbe = probe(
  `import {SPACES} from "@/lib/decor-3d"; console.log(SPACES.starfield.structureTier+","+(SPACES.starfield.podium===null));`,
);
check("starfield 为 none 档且无台基（深空不该有建筑）", starProbe === "none,true", starProbe);

// ---------------------------------------------------------------------------
// 4. 工厂一致性：classicSpace 的默认值与 SPACES.classic 一致
// ---------------------------------------------------------------------------
console.log("\n=== 4. 工厂默认值一致性 ===");

/*
  工厂漏填的另一种表现：`classicSpace()` 的默认值与 `SPACES.classic` 手写值不一致
  （比如工厂给 `ao: 0.12`、SPACES 里写 `ao: 0.2`）。这本身不算错，
  但若"工厂默认"与"空间覆写"混着来、且没测试，很容易出现
  `podium: undefined` 这种"看起来设了、实际是洞"的情况。
  这条断言把"classic 是完全由工厂产出的"这件事钉住。
*/
const factoryProbe = probe(
  `
import {SPACES,classicSpace} from "@/lib/decor-3d";
const a=classicSpace(); const b=SPACES.classic;
const keys=["structureTier","columns.length","beams.length","dougong.length","dividers.length","material.pillar.base","light.key","light.temperature","light.ao","podium.steps"];
const get=(o:any,k:string)=>k.split(".").reduce((x:any,p:any)=>x?.[p],o);
const bad=keys.filter(k=>JSON.stringify(get(a,k))!==JSON.stringify(get(b,k))).map(k=>k+":"+JSON.stringify(get(a,k))+"≠"+JSON.stringify(get(b,k)));
console.log(bad.length?"BAD:"+bad.join(" | "):"OK");
`,
);
check(
  "classicSpace() 默认值与 SPACES.classic 完全一致（防工厂/手写漂移）",
  factoryProbe.endsWith("OK"),
  factoryProbe.slice(-200),
);

// ---------------------------------------------------------------------------
// 5. 材质配方与色温
// ---------------------------------------------------------------------------
console.log("\n=== 5. 材质配方与色温 ===");

const matProbe = probe(
  `
import {MATERIAL_RECIPES,DEFAULT_MATERIAL,applyTemperature,litMaterial,SPACES} from "@/lib/decor-3d";
const out:string[]=[];
// 五种配方都能产出非空字符串
for(const [k,fn] of Object.entries(MATERIAL_RECIPES)){
  const s=(fn as any)(DEFAULT_MATERIAL.pillar);
  if(typeof s!=="string"||s.length<20) out.push("recipe:"+k);
}
// 色温偏移必须真的改变色值，且输出是 #rrggbb
for(const t of ["warm","cool","moonlight"] as const){
  const r=applyTemperature(DEFAULT_MATERIAL.pillar,t);
  if(r.base===DEFAULT_MATERIAL.pillar.base) out.push("temp-noop:"+t);
  for(const v of [r.light,r.base,r.dark]) if(!/^#[0-9a-f]{6}$/i.test(v)) out.push("temp-badhex:"+t+":"+v);
}
// litMaterial 不能返回原对象引用（必须逐项偏移过）
const lm=litMaterial(SPACES.pond);
if(lm.pillar.base===SPACES.pond.material.pillar.base) out.push("lit-noop");
console.log(out.length?"BAD:"+out.join(","):"OK");
`,
);
check(
  "五种材质配方均可用；色温偏移真的改色且输出合法 hex；litMaterial 非空转",
  matProbe.endsWith("OK"),
  matProbe.slice(-160),
);

/*
  ⚠️ 这条断言自己踩过一次坑，写清楚为什么判据是"72/34"而不是"34/56"：
  最初我按"横 34 / 竖 56"写断言，结果变红 —— 去查 `arch/defs.tsx`
  才发现那边的 `<pattern>` 是 `width=72 height=34`，**竖缝是 72**。
  也就是说**错的是配方、不是断言**。教训：写"两边必须一致"的断言时，
  先去读出另一边真实的值，别凭印象填一个数字 ——
  否则会得到一个"永远失败"的断言，最后被人当成噪音删掉。
*/
const stoneConsistency = (() => {
  const s = src("lib/decor-3d.ts");
  const a = src("components/clan/arch/defs.tsx");
  /*
    ⚠️ 提取缝距**不能**用 `[^)]*` 跨过 `rgba(...)` ——
    那串里的第一个 `)` 就把匹配截断了（实测得到 undefined）。
    做法：先按 `repeating-linear-gradient(` 切开，取每一段，再取段内的
    `0deg|90deg` 与末尾的 `Npx`。
  */
  const segs = [...s.matchAll(/repeating-linear-gradient\(([^;]*?)\)\s*,/g)].map((m) => m[1]);
  const rows = segs.find((x) => x.trim().startsWith("0deg"))?.match(/(\d+)px\s*$/)?.[1];
  const cols = segs.find((x) => x.trim().startsWith("90deg"))?.match(/(\d+)px\s*$/)?.[1];
  // SVG pattern 的尺寸（width=x height=y → 竖缝 x、横缝 y）
  const svgW = /width="(\d+)"[\s\S]{0,80}?height="(\d+)"/.exec(a);
  return { rows, cols, svgW: [svgW?.[1], svgW?.[2]], ok: rows === svgW?.[2] && cols === svgW?.[1] };
})();
check(
  "石材配方缝距与宗祠 SVG pattern 同口径（防两视图砖纹密度不一）",
  !!stoneConsistency.rows && stoneConsistency.ok,
  `配方 ${stoneConsistency.rows}行/${stoneConsistency.cols}列 vs SVG ${stoneConsistency.svgW[1]}行/${stoneConsistency.svgW[0]}列`,
);

// ---------------------------------------------------------------------------
// 6. 渲染层接线：v1 保留 + v2 分支存在
// ---------------------------------------------------------------------------
console.log("\n=== 6. 渲染层接线 ===");

const sceneSrc = src("components/decor/Decor3DScene.tsx");
check("Decor3DScene 有 engine 开关", /engine\?:\s*"v1"\s*\|\s*"v2"/.test(sceneSrc));
check("engine 默认 v1（分阶段切换的前提）", /engine\s*=\s*"v1"/.test(sceneSrc));

/*
  ⚠️ 这两条是"v1 代码路径完整保留"的机器化表达。
  v1 分支是本阶段唯一的回退开关，若有人"重构"时把它删了，
  回退能力就静默消失（而且删了也照样能编译、能跑）。
*/
check(
  "v1 的 Ceiling3D 仍在（回退路径不得删除）",
  /function Ceiling3D\(/.test(sceneSrc) && /Ceiling3D space=\{space\}/.test(sceneSrc),
);
check(
  "v1 的两层光照仍在（色罩 + 辉光）",
  /mixBlendMode:\s*"multiply"/.test(sceneSrc) && /space\.ambient\.keyLight !== "ambient"/.test(sceneSrc),
);
check("v2 结构层已接线", /Structure3D/.test(sceneSrc));
check("v2 光影层已接线", /LightLayer/.test(sceneSrc));
check(
  "v1 天花与 v2 结构层互斥（两层顶会叠出乱象）",
  /\{isV2 \? \([\s\S]{0,600}Structure3D[\s\S]{0,400}<Ceiling3D/.test(sceneSrc),
);

const structSrc = src("components/decor/Scene/Structure3D.tsx");
/*
  ⚠️ 判据只看 **`<img` 标签**，不扫「遗像」二字。
  最初我写成 `!/<img/.test(s) && !/遗像/.test(s)`，结果恒为红 ——
  结构层的**注释里**明明白白写着"绝不能把遗像画进来"（那是在解释约束），
  扫「遗像」二字必然命中。这是典型的"断言把说明文档当成违规证据"。
  真正要防的是**渲染出图片/SVG 节点**，所以只扫标签。
*/
check(
  "结构层不渲染任何图片节点（遗像等业务内容必须由 children 传入）",
  !/<img/.test(structSrc) && !/<svg/.test(structSrc),
  /<img/.test(structSrc) ? "出现 <img>" : /<svg/.test(structSrc) ? "出现 <svg>" : "",
);
check(
  "结构层屏门在最后绘制（层叠顺序：屏门要挡住前面构件）",
  structSrc.indexOf("screens.map") > structSrc.indexOf("others.map"),
);
check(
  "结构层全部 pointer-events:none（不吃拖拽事件）",
  /pointerEvents:\s*"none"/.test(structSrc),
);

const lightSrc = src("components/decor/Scene/LightLayer.tsx");
check(
  "光影层包 pointer-events:none（光柱不吃拖拽）",
  /data-light-layer[\s\S]{0,200}pointerEvents:\s*"none"/.test(lightSrc),
);
check(
  "雾用 normal 混合而非 screen（screen 会变成发光的雾）",
  !/data-light-fog[\s\S]{0,400}mixBlendMode:\s*"screen"/.test(lightSrc),
);

/*
  ===== v2 的启用点必须**唯一且可控** =====

  分阶段交付的核心是"能秒回退"。若 v2 在十几处被散开启用，
  出问题时根本不知道该改哪一行。所以：
    ① 工坊小预览走 v2（用户能立刻看到落差 —— M1 的交付点）
    ② 工坊全屏预览也必须走 v2（否则"同一份装饰两处渲染不一致"，
       用户点全屏会以为装饰丢了）
    ③ 公页（馆页 / 祠页 / 商城商品详情页）**阶段 6 起也已切 v2**，
       与工坊同口径 —— 用户花积分/钱买的空间，在公页上必须和工坊里看到的一致。

  ⚠️ 这条断言在阶段 6 之前是**哨兵**（`!/engine="v2"/`，防"悄悄提前切"）。
  阶段 6 把它翻成**正面断言**（三处都必须显式传），而不是删掉：
  翻面不是"放宽"，而是把监控点从"别提前切"推进到"必须切齐"——
  漏切一页（尤其商城详情页这种容易被忘的）会当场点名，而不是等到用户投诉
  "我在商品页看到的和馆页不一样"。
*/
const studioSrc = src("components/console/DecorStudio.tsx");
const fullPrevSrc = src("components/decor/DecorFullPreview.tsx");
check(
  "工坊小预览启用 v2（M1：用户能立刻看到结构落差）",
  /<DecorSpacePreview[^>]*engine="v2"/.test(studioSrc),
);
check(
  "工坊全屏预览也传 engine（与小预览同值，防「两处渲染不一致」）",
  /<DecorFullPreview[\s\S]{0,400}engine="v2"/.test(studioSrc),
);
check(
  "DecorFullPreview 透传 engine 给 DecorSpacePreview",
  /engine\?:\s*"v1"\s*\|\s*"v2"/.test(fullPrevSrc) && /<DecorSpacePreview[\s\S]{0,300}engine=\{engine\}/.test(fullPrevSrc),
);

const publicV2Pages = [
  ["纪念馆馆页", "app/(public)/halls/[id]/page.tsx"],
  ["宗祠祠页", "app/(public)/clan/halls/[id]/page.tsx"],
  ["商城装修商品详情页", "app/(public)/mall/[slug]/page.tsx"],
];
/*
  阶段 10 起馆页/祠页经由 SceneLayoutEditor 包裹（engine="v2" 挂在它上面），
  透传链由下一条断言锁死 —— 这里允许两种标签命中。
*/
const editorSrc = src("components/decor/SceneLayoutEditor.tsx");
const notEnabled = publicV2Pages.filter(
  ([, p]) => !/<(DecorSpacePreview|SceneLayoutEditor)[^>]*engine="v2"/.test(src(p)),
);
check(
  `阶段 6：三处公页已显式启用 v2（直接或经 SceneLayoutEditor 透传）`,
  notEnabled.length === 0,
  notEnabled.map(([label, p]) => `${label}(${p})`).join(" , "),
);
// 透传链必须闭合：SceneLayoutEditor 内部确实把 engine 原样传给 DecorSpacePreview
check(
  "阶段 10：SceneLayoutEditor 把 engine 透传给 DecorSpacePreview（链路闭合）",
  /<DecorSpacePreview[\s\S]{0,300}engine=\{engine\}/.test(editorSrc),
);

// ---------------------------------------------------------------------------
// 7. 装修模块仍不 import 供奉模块（AGENTS.md 用户硬要求）
// ---------------------------------------------------------------------------
console.log("\n=== 7. 装修 / 供奉 解耦 ===");

const decorModules = [
  "lib/decor-3d.ts",
  "lib/decor-skin.ts",
  "components/decor/Decor3DScene.tsx",
  "components/decor/DecorSpacePreview.tsx",
  "components/decor/Scene/Structure3D.tsx",
  "components/decor/Scene/LightLayer.tsx",
  "components/decor/Scene/MaterialStyle.tsx",
  "components/console/DecorStudio.tsx",
];
const offenders = decorModules.filter((p) => /from\s+"@\/lib\/offerings"/.test(src(p)));
check("装修模块不 import 供奉模块（含本阶段新增的 3 个 Scene 文件）", offenders.length === 0, offenders.join(","));

check(
  "lib/decor-3d.ts 不 import React（纯值模块，层级不得反转）",
  !/from\s+"react"/.test(src("lib/decor-3d.ts")),
);
/*
  ⚠️ 判据要**排除 `import type`**。

  阶段 4 给 decor-skin 加了一个 `import type { CSSProperties } from "react"`，
  用来给页面侧 helper（skinCardStyle 等）标注返回类型。
  这是**类型专用导入**，编译期就被完全擦除，运行时产物里没有 react ——
  所以"数据层不依赖 React"这条层级约束**并没有被破坏**。

  原断言 `!/from\s+"react"/` 太钝：它把"类型导入"与"值导入"一视同仁，
  于是把一次合法的类型标注判成了架构违规。这不是"放宽断言"，
  而是**把断言的口径修准**：层级约束关心的是**运行时依赖**，
  对应的是 `import { x } from "react"`（值导入），不是 `import type`。
  反向验证：把 `import type` 改成 `import`（值导入）→ 本断言应立刻变红。
*/
const valueReactImport = (file) => {
  const s = src(file);
  const lines = s.split("\n").filter((l) => /from\s+"react"/.test(l) || /^\s*import\s+["']react["']/.test(l));
  // 只要有一行是**非** `import type` 的（即真的引入了运行时绑定），就算违规
  return lines.some((l) => !/^\s*import\s+type\b/.test(l.trim()));
};
check("lib/decor-3d.ts 不 import React（同上）", !valueReactImport("lib/decor-3d.ts"));
check(
  "lib/decor-skin.ts 不 import React 运行时（允许 import type）",
  !valueReactImport("lib/decor-skin.ts"),
  "只允许 `import type`（编译期擦除）",
);

// ---------------------------------------------------------------------------
// 8. skin 模块
// ---------------------------------------------------------------------------
console.log("\n=== 8. 换肤 token（阶段 0 只落定义）===");

const skinSrc = src("lib/decor-skin.ts");
check("DEFAULT_SKIN 的 gilt 为 transparent（素白基准）", /gilt:\s*"transparent"/.test(skinSrc));
check("skinVars 输出 --skin-* 前缀变量", /--skin-primary/.test(skinSrc) && /--skin-gilt/.test(skinSrc));
/*
  ⚠️ 这条断言的原版把合并表达式**逐字**写进了正则
  （`out = { ...out, ...inferred, ...(explicit ?? {}) }`）。
  阶段 4 把变量名从 `explicit` 改成 `item.skin` / `tpl.skin`，
  正则立刻失配 —— 但**合并顺序（槽位循环 → 模板）根本没变**。

  这是"断言写得比它要守的规则更具体"的典型：它守的是**顺序**，
  却顺带把变量命名也锁死了，于是任何重命名都误报成"顺序错了"。
  正确做法是只锁**顺序本身**：
    ① 槽位循环出现在模板合并之前；
    ② 模板那一段**在槽位循环之后**覆盖 out（即模板最后拍板）。

  下面同时保留一个**行为级**验证（skinProbe 里的 `item-overrode-template`），
  静态顺序 + 运行时行为两条一起守，比单一正则稳得多。
*/
check(
  "skinOf 的合并顺序为 素材 → 模板（模板最后拍板）",
  (() => {
    const slotIdx = skinSrc.indexOf("for (const slot of SLOT_ORDER)");
    const tplIdx = skinSrc.indexOf("const tpl = sources.template");
    // ② 模板段落里必须有一次对 out 的覆盖赋值
    const tplBlock = tplIdx >= 0 ? skinSrc.slice(tplIdx, tplIdx + 600) : "";
    const tplOverwrites = /out = \{ \.\.\.out,/.test(tplBlock);
    return slotIdx >= 0 && tplIdx > slotIdx && tplOverwrites;
  })(),
  "槽位循环在前、模板覆盖在后",
);

const skinProbe = probe(
  `
import {DEFAULT_SKIN,skinOf,skinIsActive,skinVars} from "@/lib/decor-skin";
const out:string[]=[];
const plainSlots={wall:"wall-plain",floor:"floor-none",ornament:"orn-none",frame:"frame-line",font:"font-modern"};
// 未装修 → 不激活（这是"对比视图左边那屏"的口径）
const plain=skinOf({slots:plainSlots} as any,{});
if(skinIsActive(plain)) out.push("plain-should-be-inactive:"+JSON.stringify(plain.gilt));
// 模板提供 gilt → 激活
const lux=skinOf({slots:{...plainSlots,wall:"wall-goldweave"},templateId:"tpl-goldhall"} as any,{template:{id:"tpl-goldhall"}});
if(!skinIsActive(lux)) out.push("lux-should-be-active");
if(lux.gilt==="transparent") out.push("lux-gilt-transparent");
// 显式 skin 覆盖推断（约定优于配置，但必须能被覆盖）
const exp=skinOf({slots:plainSlots} as any,{template:{id:"tpl-goldhall",skin:{gilt:"#123456"}}});
if(exp.gilt!=="#123456") out.push("explicit-skin-not-winning:"+exp.gilt);
// 模板必须最后拍板：素材说 gilt=A、模板说 gilt=B → 取 B
const tplWins=skinOf({slots:plainSlots} as any,{items:{wall:{id:"wall-goldweave",skin:{gilt:"#aaaaaa"}}},template:{id:"tpl-starry3d"}});
if(tplWins.gilt==="#aaaaaa") out.push("item-overrode-template");
// 变量带 --skin- 前缀
const v=skinVars(lux);
if(!("--skin-gilt" in v)) out.push("skinVars-missing");
console.log(out.length?"BAD:"+out.join(","):"OK");
`,
);
check(
  "skinOf：未装修不激活 / 豪华模板激活且 gilt 非透明 / 显式 skin 优先 / 模板最后拍板 / 变量前缀正确",
  skinProbe.endsWith("OK"),
  skinProbe.slice(-200),
);

// ---------------------------------------------------------------------------
console.log(`\n结果: ${pass}/${pass + fail} 通过`);
if (fail > 0) {
  console.log("失败项：");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
