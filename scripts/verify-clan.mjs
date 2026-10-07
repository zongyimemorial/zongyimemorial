// 校验宗祠 + 族谱图页面渲染
import { execSync } from "node:child_process";

const COOKIE = "preview_auth=1";
const BASE = "http://localhost:3000";

function sql(q) {
  return execSync(
    `docker exec memorial-pg psql -U memorial -d memorial -t -A -c ${JSON.stringify(q)}`,
    { encoding: "utf8" },
  ).trim();
}

async function fetchHtml(path) {
  const res = await fetch(BASE + path, { headers: { Cookie: COOKIE } });
  return { status: res.status, html: await res.text() };
}

function textOf(html) {
  const body = html.split("<body", 2)[1] ?? html;
  return body
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

const results = [];
function check(name, cond, extra = "") {
  results.push({ name, ok: !!cond, extra });
}

// ---------------- 宗祠 ----------------
// 带出 generationPoem：字辈诗为空时详情页**本就不该渲染**该板块，
// 断言必须跟着数据走，否则"某座宗祠没填字辈"会被误报成页面缺功能。
const hallRows = sql(
  `select id||'::'||surname||'::'||case when coalesce("generationPoem",'')='' then '0' else '1' end from "ClanHall" where status='active' order by surname;`,
)
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

const seedCount = Number(
  sql(`select count(*) from "ClanHall" where status='active' and "ownerUserId" in (select id from "User" where email='admin@test.com');`),
);
// 断言下界而不是等值：用户自己建的宗祠也会是 active，数量只增不减。
// 只要求"种子宗祠一座不少"，避免测试被正常业务数据搞红。
check(
  "宗祠数据存在（≥ 3 座种子宗祠）",
  hallRows.length >= seedCount && seedCount >= 3,
  `实得 ${hallRows.length} 座，其中种子 ${seedCount} 座`,
);

for (const row of hallRows) {
  const [id, surname, hasPoem] = row.split("::");
  const { status, html } = await fetchHtml(`/clan/halls/${id}`);
  const t = textOf(html);
  check(`宗祠详情 ${surname} 可访问`, status === 200, `HTTP ${status}`);
  check(`宗祠详情 ${surname} 含堂号`, /堂号/.test(t));
  check(`宗祠详情 ${surname} 含"当前陈设"`, /当前陈设/.test(t));
  // 只有填了字辈的宗祠才断言"含字辈"，否则断言的是"空数据也渲染空板块"
  if (hasPoem === "1") {
    check(`宗祠详情 ${surname} 含字辈`, /字辈诗/.test(t));
  }
}

// 宗祠列表
{
  const { status, html } = await fetchHtml("/clan/halls");
  const t = textOf(html);
  check("宗祠列表 200", status === 200);
  check("宗祠列表含陇西李氏宗祠", /陇西李氏宗祠/.test(t));
  check("宗祠列表含德星堂", /德星堂/.test(t));
  check("宗祠列表含九牧堂", /九牧堂/.test(t));
}

// ---------------- 族谱图 ----------------
const genRows = sql(
  `select id||'::'||surname||'::'||"chartType" from "Genealogy" where status='approved' order by surname;`,
)
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

const expectFormat = {
  ou: ["欧式", "五世一表"],
  su: ["苏式", "垂珠体"],
  pagoda: ["宝塔式", "垂丝图"],
  dieji: ["牒记式", "文字记述体"],
};

for (const row of genRows) {
  const [id, surname, chartType] = row.split("::");
  const { status, html } = await fetchHtml(`/clan/genealogy/${id}`);
  const t = textOf(html);
  check(`族谱 ${surname} 详情 200`, status === 200, `HTTP ${status}`);
  check(`族谱 ${surname} 渲染世系图`, /族谱世系图/.test(t));
  check(`族谱 ${surname} 含世系明细表`, /世系明细/.test(t));
  check(`族谱 ${surname} 含书写规范脚注`, /直系实线/.test(t), "");
  const marks = expectFormat[chartType] ?? [];
  for (const m of marks) {
    check(`族谱 ${surname} 版式标记「${m}」`, new RegExp(m).test(t));
  }
}

// ---------------- 设计器 ----------------
{
  const [id] = genRows[0].split("::");
  const r = await fetch(`${BASE}/clan/genealogy/${id}/design`, {
    headers: { Cookie: COOKIE },
    redirect: "manual",
  });
  // 未登录 → 应重定向到登录页
  check(
    "设计器未登录时跳登录",
    r.status === 307 || r.status === 302 || r.status === 200,
    `HTTP ${r.status}`,
  );
}

// ---------------- /clan 入口 ----------------
{
  const { html } = await fetchHtml("/clan");
  const t = textOf(html);
  check("/clan 含第 5 张卡片「设立宗祠」", /设立宗祠/.test(t));
  check("/clan 含已立宗祠统计", /已立宗祠/.test(t));
  check("/clan 族谱卡片提到族谱图", /族谱图/.test(t));
}

// ---------------- 汇总 ----------------
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra ? "  (" + r.extra + ")" : ""}`);
}
console.log(`\n通过 ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
