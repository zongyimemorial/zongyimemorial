/*
  scripts/_db.mjs —— 验收脚本的数据库操作统一入口

  为什么要这个文件：
  在它之前，22 个脚本各自抄了一份 `execSync('docker exec memorial-pg psql ...')` 封装，
  于是三个问题反复出现：

    1. **崩溃即污染**。脚本直接 `update`/`delete` 业务表，一旦中途抛异常，
       改动就留在库里，连锁影响后续套件。实测事故：
       verify-poem-stock-gray 崩在"改商品 slug"之后，slug 永久卡在 free-poem-renamed，
       导致所有按 slug 硬查找的套件（祭文段）一起失败。
    2. **还原逻辑各写各的**，有的记得回滚、有的忘了，没有统一约束。
    3. **改完不自证**，跑完不知道库里现在是什么状态。

  本模块把"改库"收敛成 `withRestore()` 一种写法：
  先快照 → 执行 → **finally 里无条件还原** → 打印还原后的实际值自证。
  这样即便测试中途崩溃，库也不会被留在脏状态。

  用法：
    import { sql, sqlCount, withRestore } from "./_db.mjs";

    // 只读查询
    const id = sql(`select id from "Product" where slug='free-poem';`);

    // 需要改库：把"改动 + 断言"整体放进回调，收尾自动还原
    await withRestore(
      [
        { table: '"Product"', where: `id='${id}'`, cols: ["slug", "status"] },
      ],
      async ({ mark }) => {
        sql(`update "Product" set status='inactive' where id='${id}';`);
        const r = await probe();
        mark("商品下架", r);
      },
    );
*/
import { execSync } from "node:child_process";

const PG_CONTAINER = process.env.PG_CONTAINER || "memorial-pg";
const PG_USER = process.env.PG_USER || "memorial";
const PG_DB = process.env.PG_DB || "memorial";

/** 执行一条 SQL，返回去除首尾空白的文本结果（psql -t -A 模式） */
export function sql(q) {
  return execSync(
    `docker exec ${PG_CONTAINER} psql -U ${PG_USER} -d ${PG_DB} -t -A -c ${JSON.stringify(q)}`,
    { encoding: "utf8" },
  ).trim();
}

/** 执行一条 SQL 并把结果转成数字（无结果按 0 计） */
export function sqlCount(q) {
  return Number(sql(q) || "0");
}

/**
 * 快照若干行/列，返回可用于还原的记录。
 * spec: [{ table: '"Product"', where: "id='x'", cols: ["slug","status"] }]
 */
function snapshot(specs) {
  return specs.map((s) => {
    const cols = s.cols.map((c) => `"${c}"`).join(", ");
    // 取不到行（比如本来就不存在）时返回空数组，还原阶段据此跳过
    const raw = sql(`select row_to_json(t) from (select ${cols} from ${s.table} where ${s.where}) t;`);
    return { ...s, rows: raw ? raw.split("\n").filter(Boolean) : [] };
  });
}

/** 按快照还原：逐行 update 回原值；原生不存在则不动（不擅自插入/删除） */
function restore(snaps) {
  const report = [];
  for (const s of snaps) {
    if (s.rows.length === 0) {
      report.push(`${s.table} (原无行，跳过)`);
      continue;
    }
    for (const row of s.rows) {
      const obj = JSON.parse(row);
      /*
        ⚠️ 三类值必须分开拼，否则还原会写坏数据：
          · null          → null
          · 对象/数组      → 用 $q$...$q$ 包住 JSON 文本再 ::jsonb，
                            **绝不能直接 String(obj)** —— 那会写出 '[object Object]'，
                            PostgreSQL 报 "invalid input syntax for type json"。
                            实测：快照 ClanHall.templateConfig（jsonb）时踩到，
                            还原直接失败，等于还原机制在 jsonb 列上不可用。
          · 其它标量      → 普通引号字符串
        用 $q$ 美元引用而非单引号：JSON 里的单引号/反斜杠不必转义，更不容易出错。
      */
      /*
        用 $t$ 作美元引用标签（而非 $q$）—— 标签要选一个**不会出现在 JSON 内容里**的词，
        且整个 SQL 通过 JSON.stringify 传给 sh，任何裸的 $ 都可能被误解析。
        实测踩过两次：$q$ 与内容冲突报 "Unterminated quoted string"，
        直接 String(obj) 写出 '[object Object]' 报 "invalid input syntax for type json"。
      */
      const lit = (v) => {
        if (v === null || v === undefined) return "null";
        if (typeof v === "object") {
          const json = JSON.stringify(v).replace(/'/g, "''");
          return `'${json}'::jsonb`;
        }
        return `'${String(v).replace(/'/g, "''")}'`;
      };
      const sets = s.cols.map((c) => `"${c}"=${lit(obj[c])}`).join(", ");
      sql(`update ${s.table} set ${sets} where ${s.where};`);
    }
    /*
      自证：把还原后的实际值回读一遍并打印（只读第一行）。

      ⚠️ 这里**不能**用 `"a"||'|'||"b"` 拼接：
      jsonb 列参与 || 会被 PostgreSQL 当作 jsonb 连接（不是文本连接），
      于是 '|' 被当成 JSON 字面量解析 → 报
        invalid input syntax for type json / Token "|" is invalid
      实测踩过：ClanHall.templateConfig / MemorialHall.archive 都是 jsonb，
      还原本身成功了，却崩在这句自证上，把 finally 里的还原打印整个打断。
      改用 row_to_json 取整行，天然兼容任意列类型。
    */
    const now = sql(
      `select row_to_json(t)::text from (select ${s.cols.map((c) => `"${c}"`).join(", ")} from ${s.table} where ${s.where} limit 1) t;`,
    );
    report.push(`${s.table} → ${now || "(空)"}`);
  }
  return report;
}

/**
 * 改库 + 断言的整体包装。**无论回调是否抛异常，finally 都会还原。**
 *
 * @param specs  需要快照/还原的行（见 snapshot）
 * @param fn     回调；入参 { mark } 可用于记录中间结果
 * @returns 回调的返回值（若回调抛异常，异常会被重新抛出，但还原已完成）
 */
export async function withRestore(specs, fn) {
  const snaps = snapshot(specs);
  try {
    return await fn();
  } finally {
    const report = restore(snaps);
    console.log("  已还原：", report.join(" | ").slice(0, 240));
  }
}

/** 当前是否有可用的 PG 容器（脚本开头自检用） */
export function pgReady() {
  try {
    return sql("select 1;") === "1";
  } catch {
    return false;
  }
}
