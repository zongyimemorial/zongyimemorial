// 实名脱敏工具单元测试
// 运行：npx tsx scripts/verify-clan-tribute.mts
import { maskIdentity, maskName } from "../lib/mask";

const results: { name: string; ok: boolean; extra?: string }[] = [];
const check = (name: string, ok: boolean, extra = "") => results.push({ name, ok: !!ok, extra });

// ---------- 1. 中文姓名（含 2/3/4 字与单字） ----------
check("中文单字「李」原样", maskName({ realName: "李" }) === "李", maskName({ realName: "李" }));
check("中文 2 字「张三」→ 张*", maskName({ realName: "张三" }) === "张*", maskName({ realName: "张三" }));
check(
  "中文 3 字「李明华」→ 李*华",
  maskName({ realName: "李明华" }) === "李*华",
  maskName({ realName: "李明华" }),
);
check(
  "中文 4 字复姓「欧阳明华」→ 欧**华",
  maskName({ realName: "欧阳明华" }) === "欧**华",
  maskName({ realName: "欧阳明华" }),
);
check(
  "中文 6 字「爱新觉罗溥仪」→ 爱****仪",
  maskName({ realName: "爱新觉罗溥仪" }) === "爱****仪",
  maskName({ realName: "爱新觉罗溥仪" }),
);

// ---------- 2. 拉丁 / 英文名 ----------
check("英文「John」→ J***", maskName({ realName: "John" }) === "J***", maskName({ realName: "John" }));
check("英文「Al」→ A*", maskName({ realName: "Al" }) === "A*", maskName({ realName: "Al" }));
check("英文单字符「J」原样", maskName({ realName: "J" }) === "J", maskName({ realName: "J" }));

// ---------- 3. 手机号回退 ----------
check(
  "手机号回退「13812345678」→ 138****5678",
  maskName({ phone: "13812345678" }) === "138****5678",
  maskName({ phone: "13812345678" }),
);
check(
  "手机号含分隔符「138-1234-5678」→ 138****5678",
  maskName({ phone: "138-1234-5678" }) === "138****5678",
  maskName({ phone: "138-1234-5678" }),
);

// ---------- 4. 邮箱回退 ----------
check(
  "邮箱回退「user@test.com」→ us***@test.com",
  maskName({ email: "user@test.com" }) === "us***@test.com",
  maskName({ email: "user@test.com" }),
);
check(
  "短邮箱「a@b.com」→ a***@b.com",
  maskName({ email: "a@b.com" }) === "a***@b.com",
  maskName({ email: "a@b.com" }),
);

// ---------- 5. 优先级：realName > phone > email ----------
check(
  "优先级：实名优先于邮箱",
  maskName({ realName: "王五", email: "user@test.com" }) === "王*",
  maskName({ realName: "王五", email: "user@test.com" }),
);
check(
  "优先级：手机号优先于邮箱",
  maskName({ phone: "13812345678", email: "user@test.com" }) === "138****5678",
  maskName({ phone: "13812345678", email: "user@test.com" }),
);

// ---------- 6. 全空 / null 兜底（关键：不得空白） ----------
check("全空对象 → 匿名宗亲", maskName({}) === "匿名宗亲", maskName({}));
check("null → 匿名宗亲", maskName(null) === "匿名宗亲", maskName(null));
check("undefined → 匿名宗亲", maskName(undefined) === "匿名宗亲", maskName(undefined));
check(
  "空字符串字段 → 匿名宗亲",
  maskName({ realName: "", phone: "", email: "" }) === "匿名宗亲",
  maskName({ realName: "", phone: "", email: "" }),
);
check(
  "空白字符 → 匿名宗亲",
  maskName({ realName: "   ", email: "  " }) === "匿名宗亲",
  maskName({ realName: "   ", email: "  " }),
);

// ---------- 7. 安全断言：display 不得包含完整实名 ----------
const sensitive = ["张三", "李明华", "欧阳明华", "John", "爱新觉罗溥仪"];
for (const name of sensitive) {
  const out = maskIdentity({ realName: name }).display;
  check(`display 不含完整实名「${name}」`, out !== name && !out.includes(name), `实得 ${out}`);
}

// ---------- 8. 快照字段（馆主后台用） ----------
const snap = maskIdentity({ realName: "李明华", email: "user@test.com" });
check("快照保留完整实名", snap.realName === "李明华", String(snap.realName));
check("快照保留联系方式", snap.contact === "user@test.com", String(snap.contact));
const snap2 = maskIdentity({ email: "user@test.com" });
check("无实名时快照 realName 为 null", snap2.realName === null, String(snap2.realName));

// ---------- 输出 ----------
console.log("");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra ? `  (${r.extra})` : ""}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n通过 ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
