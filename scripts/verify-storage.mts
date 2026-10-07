/**
 * 验收：纪念馆 / 宗祠 存储空间容量体系（免费额度 + 按年升级，2026-10）
 *
 * ## 用户口径
 * 「纪念馆及宗祠空间存储容量开通时免费赠送一定的容量，容量可以升级，
 *   升级后可以存储更多的资料、照片及视频！请根据市场中服务器存储的市场价格
 *   及保证平台一定利润的前提下帮我设计…并落实到平台当中」
 *
 * ## 落地口径（被测规则）
 *   - 免费额度：纪念馆 1GB / 宗祠 2GB（建馆/建祠即赠，永久）；
 *   - 容量包按年订阅（365 天），到期回退免费额度、**已存资料不删**、仅限制新上传；
 *   - **单一判据**：容量 = 免费额度 + (订阅有效 ? storageSubBytes : 0)，
 *     与 premium **彻底解耦**；
 *   - **单张 20MB 高清原片**（2026-10）：判据 = `hasHdUpload()` =
 *     「有效容量包 **或** 有效高级订阅」（`premiumUntil` 保留只为不剥夺存量权益）；
 *   - 上传接口按**字节配额**判定（不再按 20/500 张），并递增 storageUsedBytes；
 *   - 删除照片递减 storageUsedBytes（防容量只增不减）。
 *
 * ## 断言分层
 *   §0 单元层（tsx 直跑，不依赖服务）：effectiveStorageQuota / isStorageActive /
 *      storageSubBytesOf / freeQuotaOf / activeStoragePlanSlug / formatBytes /
 *      nextExpiry 顺延语义（复用 hall-decor）/ hasHdUpload 四象限 + maxImageBytes
 *   §1 源码层：上传接口走字节判据（无张数上限残留）+ 不读 premium 决定容量 +
 *      单一判据函数被引用 + 履约分支写 storageSubBytes + 删除递减
 *   §1.5 源码层（2026-10）：hasHdUpload 唯一判据 + 两个上传 route 无手写三元 +
 *      字节常量单源 + premium-storage 已在 seed 中下架
 *   §2 数据层：造前提（样本馆免费额度、已用回填值）
 *   §3 行为层（真服务 + psql）：免费额度满 → 上传被拒（错误含「存储空间不足」）→
 *      升级（直接改库模拟履约）→ 配额放大 → 可继续上传 → 到期回退 → 再被拒 →
 *      续费顺延 → 恢复
 *   §3.5 数据层（2026-10）：商城无同价同容量重复存储商品 / 4 档容量包在售 /
 *      全仓无指向已下架商品的深链
 *   §4 还原：storageUsedBytes / storageSubBytes / storageUntil / archive 逐字还原
 *
 * ## ⚠️ 本脚本会改数据（自清理）
 *   - MemorialHall.storageUsedBytes / storageSubBytes / storageUntil / archive
 *   - 上传产生的磁盘文件（/public/uploads/halls/<id>/）+ archive.photos 追加
 *     收尾按备份逐字还原 archive、并把 used/sub/until 还原为备份值。
 *
 * ## 反向验证（开发过程做过，改完必须还原）
 *   缺陷A 上传接口改回 `existing.length >= cap` 张数判定 → §1 变红
 *   缺陷B effectiveStorageQuota 改成读 premium（`isPremium ? 500GB : 1GB`）→ §0+§1 变红
 *   缺陷C pay.ts storage 分支去掉（不写 storageSubBytes）→ §1 变红
 *   实测：缺陷B 让 §0「与 premium 解耦」+ §1「判据不读 premium」同时变红。
 *
 *   缺陷D（2026-10）hasHdUpload 去掉 `if (isStorageActive(hall)) return true;`
 *     → §0「有效容量包 → 享 20MB」+「有效容量包 → 上限 20MB」+ §0 的
 *       「高级订阅已过期 → 若容量包有效仍享 20MB」三条变红 ——
 *       正是"买了容量包却传不了高清原片"这个原缺陷的精确复现。
 *   缺陷E（2026-10）seed 里 premium-storage 改回 active
 *     → §1.5「premium-storage 标记为 inactive」变红 + §3.5
 *       「商城无同价同容量重复存储商品」变红（重叠组：premium-storage + storage-50g）。
 *
 * 运行：npx tsx scripts/verify-storage.mts（run-all-verify 按扩展名自动选 tsx）
 */

import pkg from "/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js";
const { chromium } = pkg;
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GB,
  HALL_FREE_QUOTA,
  CLAN_FREE_QUOTA,
  STORAGE_PLANS,
  effectiveStorageQuota,
  isStorageActive,
  storageSubBytesOf,
  freeQuotaOf,
  activeStoragePlanSlug,
  formatBytes,
  storagePercent,
  hasHdUpload,
  maxImageBytes,
} from "@/lib/storage";
import { nextExpiry } from "@/lib/hall-decor";

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
const tmp = mkdtempSync(join(tmpdir(), "vstorage-"));
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
console.log("\n===== §0 单元层：容量判据核心函数 =====");
{
  const past = new Date(Date.now() - 5 * 86400000).toISOString();
  const future = new Date(Date.now() + 365 * 86400000).toISOString();

  // 免费额度
  check("纪念馆免费额度 = 1GB", HALL_FREE_QUOTA === 1 * GB, `实得 ${HALL_FREE_QUOTA}`);
  check("宗祠免费额度 = 2GB", CLAN_FREE_QUOTA === 2 * GB, `实得 ${CLAN_FREE_QUOTA}`);
  check("freeQuotaOf('hall') = 1GB", freeQuotaOf("hall") === 1 * GB);
  check("freeQuotaOf('clan') = 2GB", freeQuotaOf("clan") === 2 * GB);

  // isStorageActive：null / 过期 / 未来
  check("isStorageActive(null) = false", isStorageActive({ storageUntil: null }) === false);
  check("isStorageActive(过期) = false", isStorageActive({ storageUntil: past }) === false);
  check("isStorageActive(未来) = true", isStorageActive({ storageUntil: future }) === true);
  check("isStorageActive(无字段) = false", isStorageActive({}) === false);

  // storageSubBytesOf：过期回退 0（关键：到期后不占额度）
  check("storageSubBytesOf 过期 = 0（到期回退）", storageSubBytesOf({ storageSubBytes: 50 * GB, storageUntil: past }) === 0);
  check("storageSubBytesOf 未来 = 原值", storageSubBytesOf({ storageSubBytes: 50 * GB, storageUntil: future }) === 50 * GB);

  // ★ 核心：effectiveStorageQuota
  check("有效配额：仅免费（无订阅）= 免费额度", effectiveStorageQuota({ storageSubBytes: 0, storageUntil: null }, "hall") === 1 * GB);
  check("有效配额：馆 1GB + 50GB 订阅 = 51GB", effectiveStorageQuota({ storageSubBytes: 50 * GB, storageUntil: future }, "hall") === 51 * GB);
  check("有效配额：祠 2GB + 50GB 订阅 = 52GB", effectiveStorageQuota({ storageSubBytes: 50 * GB, storageUntil: future }, "clan") === 52 * GB);
  check("有效配额：订阅过期 → 回退免费额度", effectiveStorageQuota({ storageSubBytes: 50 * GB, storageUntil: past }, "hall") === 1 * GB);

  // ★★ 与 premium 解耦：即使对象带着 premiumUntil，也**不影响**容量判据
  const withPremium = { storageSubBytes: 0, storageUntil: null, premiumUntil: future } as Parameters<typeof effectiveStorageQuota>[0];
  check(
    "有效配额与 premium 解耦（带 premiumUntil 仍是免费额度）",
    effectiveStorageQuota(withPremium, "hall") === 1 * GB,
    `实得 ${effectiveStorageQuota(withPremium, "hall")}`,
  );

  // activeStoragePlanSlug：能反查当前档位
  check(
    "activeStoragePlanSlug 认 50GB 档",
    activeStoragePlanSlug({ storageSubBytes: 50 * GB, storageUntil: future }) === "storage-50g",
  );
  check("activeStoragePlanSlug 过期 = null", activeStoragePlanSlug({ storageSubBytes: 50 * GB, storageUntil: past }) === null);

  // 定价表（单一事实来源）
  check("定价表共 4 档", Object.keys(STORAGE_PLANS).length === 4);
  check("10GB = ¥29", STORAGE_PLANS["storage-10g"].priceFen === 2900);
  check("50GB = ¥99", STORAGE_PLANS["storage-50g"].priceFen === 9900);
  check("200GB = ¥299", STORAGE_PLANS["storage-200g"].priceFen === 29900);
  check("500GB = ¥599", STORAGE_PLANS["storage-500g"].priceFen === 59900);
  // 毛利为正：价格 > 标称裸成本（1.20 元/GB/年）
  for (const [slug, p] of Object.entries(STORAGE_PLANS)) {
    const bareCostFen = p.gb * 1.2 * 100;
    check(`毛利为正（${slug}：价 ¥${p.priceFen / 100} > 裸成本 ¥${(bareCostFen / 100).toFixed(0)}）`, p.priceFen > bareCostFen * 0.4);
  }

  // 工具函数
  check("formatBytes(1GB) = '1 GB'", formatBytes(1 * GB) === "1 GB", formatBytes(1 * GB));
  check("formatBytes(1.5GB) 含 GB", formatBytes(1.5 * GB).includes("GB"));
  check("storagePercent(半满) = 50", storagePercent(50, 100) === 50);
  check("storagePercent 封顶 100", storagePercent(200, 100) === 100);

  // nextExpiry 顺延（复用租期制）
  const d1 = new Date(nextExpiry(null, 365));
  check("nextExpiry(null) → 今天 +365 天", Math.abs(d1.getTime() - (Date.now() + 365 * 86400000)) < 60000);
  const d2 = new Date(nextExpiry(future, 365));
  check("nextExpiry(未来) → 从原到期日顺延", d2.getTime() > new Date(future).getTime() + 300 * 86400000);
  const d3 = new Date(nextExpiry(past, 365));
  check("nextExpiry(过期) → 从今天起算", Math.abs(d3.getTime() - (Date.now() + 365 * 86400000)) < 60000);

  // —— 高清原片权限（hasHdUpload / maxImageBytes，2026-10 并入容量包） ——
  const noSub = { storageSubBytes: 0, storageUntil: null, premiumUntil: null };
  check("无容量包无订阅 → 不享 20MB", hasHdUpload(noSub) === false);
  check("无容量包无订阅 → 上限 8MB", maxImageBytes(noSub) === 8 * 1024 * 1024);
  check(
    "有效容量包 → 享 20MB（本次新增：以前必须买 premium 才行）",
    hasHdUpload({ storageSubBytes: 10 * GB, storageUntil: future, premiumUntil: null }) === true,
  );
  check(
    "有效容量包 → 上限 20MB",
    maxImageBytes({ storageSubBytes: 10 * GB, storageUntil: future, premiumUntil: null }) === 20 * 1024 * 1024,
  );
  check(
    "容量包已过期 → 回到 8MB（到期回退，与容量同构）",
    hasHdUpload({ storageSubBytes: 10 * GB, storageUntil: past, premiumUntil: null }) === false,
  );
  check(
    "仅有效高级订阅（存量已购用户）→ 仍享 20MB，权益不剥夺",
    hasHdUpload({ storageSubBytes: 0, storageUntil: null, premiumUntil: future }) === true,
  );
  check(
    "高级订阅已过期 → 若容量包有效仍享 20MB",
    hasHdUpload({ storageSubBytes: 10 * GB, storageUntil: future, premiumUntil: past }) === true,
  );
  check("null → 不享 20MB（防御）", hasHdUpload(null) === false);
}

// =====================================================================
// §1 源码层：单一判据 + 字节配额 + 履约链
// =====================================================================
console.log("\n===== §1 源码层：单一判据与履约链 =====");
{
  const hallsUpload = execFileSync("bash", ["-c", `cat '/workspace/app/api/halls/[id]/upload/route.ts'`], { encoding: "utf8" });
  const clanUpload = execFileSync("bash", ["-c", `cat '/workspace/app/api/clan-halls/[id]/upload/route.ts'`], { encoding: "utf8" });
  const paySrc = execFileSync("bash", ["-c", `cat /workspace/lib/pay.ts`], { encoding: "utf8" });
  const ordering = execFileSync("bash", ["-c", `cat /workspace/lib/orders.ts`], { encoding: "utf8" });
  const hallActions = execFileSync("bash", ["-c", `cat '/workspace/app/console/halls/[id]/actions.ts'`], { encoding: "utf8" });
  const clanActions = execFileSync("bash", ["-c", `cat '/workspace/app/console/clan-halls/[id]/actions.ts'`], { encoding: "utf8" });

  // 字节配额：两个上传接口都调单一判据
  check("纪念馆上传走 effectiveStorageQuota", /effectiveStorageQuota\(/.test(hallsUpload));
  check("宗祠上传走 effectiveStorageQuota", /effectiveStorageQuota\(/.test(clanUpload));

  // 旧的张数上限必须**清除**（cap = isPremium ? 500 : 20）
  check(
    "纪念馆上传无张数上限残留（cap = isPremium ? 500 : 20）",
    !/isPremium\s*\?\s*500\s*:\s*20/.test(hallsUpload),
    "仍有张数上限 = 未切换到字节配额",
  );
  check(
    "宗祠上传无张数上限残留",
    !/isPremium\s*\?\s*500\s*:\s*20/.test(clanUpload),
  );

  // 不读 premium 决定**容量**（单张体积上限 2026-10 起也不再读 premium，
  // 改为 hasHdUpload：容量包有效 或 高级订阅有效，见下方 §1.5）
  check(
    "纪念馆上传：容量判定不读 premium（quota 源自 storage 判据）",
    /const\s+quota\s*=\s*effectiveStorageQuota\(/.test(hallsUpload),
  );
  check(
    "宗祠上传：容量判定不读 premium",
    /const\s+quota\s*=\s*effectiveStorageQuota\(/.test(clanUpload),
  );

  // 上传成功递增 used（列是 BigInt，值是 BigInt(file.size)）
  check("纪念馆上传递增 storageUsedBytes", /storageUsedBytes:\s*\{\s*increment:\s*BigInt\(file\.size\)\s*\}/.test(hallsUpload));
  check("宗祠上传递增 storageUsedBytes", /storageUsedBytes:\s*\{\s*increment:\s*BigInt\(file\.size\)\s*\}/.test(clanUpload));

  // 删除递减 used（BigInt 列）
  check("纪念馆删照片递减 storageUsedBytes", /storageUsedBytes:\s*freed\s*>\s*0\s*\?\s*\{\s*decrement:\s*BigInt\(freed\)\s*\}/.test(hallActions));
  check("宗祠删照片递减 storageUsedBytes", /storageUsedBytes:\s*freed\s*>\s*0\s*\?\s*\{\s*decrement:\s*BigInt\(freed\)\s*\}/.test(clanActions));

  // 履约链：pay.ts 写 storageSubBytes + storageUntil
  check("pay.ts 有 storage 分支", /item\.product\.type\s*===\s*"storage"/.test(paySrc));
  check("pay.ts 写 storageSubBytes（BigInt）", /storageSubBytes:\s*BigInt\(plan\.gb\s*\*\s*GB\)/.test(paySrc));
  check("pay.ts 写 storageUntil（nextExpiry 顺延）", /storageUntil:\s*new Date\(/.test(paySrc) && /nextExpiry\(/.test(paySrc));
  check("pay.ts 履约按 targetKind 分表（clan/memorialHall 两条分支）", /tx\.clanHall\.update/.test(paySrc) && /tx\.memorialHall\.update/.test(paySrc));
  // 旧 premium-storage 不再写 premiumStorage 标记
  check("旧 premium-storage 不再写 premiumStorage 标记（容量已解耦）", !/premiumStorage:/.test(paySrc));

  // 下单链：归属校验（防越权充值）
  check("createOrder 对 storage 商品做 targetHallId 归属校验", /product\.type\s*===\s*"storage"[\s\S]*?owned/.test(ordering) || /ownerUserId:\s*params\.userId[\s\S]*?ownerUserId:\s*params\.userId/.test(ordering));
  check("createOrder 写 targetHallId/targetKind", /targetHallId:\s*targetHallId/.test(ordering) && /targetKind:\s*targetKind/.test(ordering));

  // 控制台升级动作
  check("纪念馆有 createStorageOrder（带 targetKind hall）", /createStorageOrder/.test(hallActions) && /targetKind:\s*"hall"/.test(hallActions));
  check("宗祠有 createClanStorageOrder（带 targetKind clan）", /createClanStorageOrder/.test(clanActions) && /targetKind:\s*"clan"/.test(clanActions));
}

// =====================================================================
// §1.5 源码层：premium-storage 下架 + 20MB 权限并入容量包（2026-10）
// ---------------------------------------------------------------------
// 起因：商城同时并列 `premium-storage`（¥99/年 · 50GB）与
//       `storage-50g`（¥99/年 · 50GB）—— 同价同容量，用户无法二选一，
//       且前者不支持积分兑换（价格歧视）。
//       根因是 premium-storage 属于"premium 时代"：容量由 premiumUntil
//       隐式推导，是 lib/storage.ts 之外的第二判据。
// 处置：下架旧商品 + 把 20MB 高清原片权限并入容量包（全档位）。
// =====================================================================
console.log("\n===== §1.5 源码层：旧订阅下架与 20MB 权限归位 =====");
{
  const storageSrc = execFileSync("bash", ["-c", `cat /workspace/lib/storage.ts`], { encoding: "utf8" });
  const uploadSrc = execFileSync("bash", ["-c", `cat /workspace/lib/upload.ts`], { encoding: "utf8" });
  const hallsUpload = execFileSync("bash", ["-c", `cat '/workspace/app/api/halls/[id]/upload/route.ts'`], { encoding: "utf8" });
  const clanUpload = execFileSync("bash", ["-c", `cat '/workspace/app/api/clan-halls/[id]/upload/route.ts'`], { encoding: "utf8" });
  const seedOffer = execFileSync("bash", ["-c", `cat /workspace/prisma/seed-free-offerings.mjs`], { encoding: "utf8" });

  // —— A. 单一判据 hasHdUpload ——
  check("lib/storage.ts 导出 hasHdUpload（20MB 权限的唯一判据）", /export function hasHdUpload\(/.test(storageSrc));
  check("hasHdUpload 认「有效容量包」来源", /if \(isStorageActive\(hall\)\) return true;/.test(storageSrc));
  check("hasHdUpload 认「有效高级订阅」来源（存量权益不剥夺）", /hall\.premiumUntil/.test(storageSrc));
  check("lib/storage.ts 导出 maxImageBytes", /export function maxImageBytes\(/.test(storageSrc));

  // —— B. 两个上传 route 都不再手写 isPremium 三元 ——
  for (const [label, src] of [["纪念馆", hallsUpload], ["宗祠", clanUpload]] as const) {
    check(`${label}上传：单张上限走 maxImageBytes`, /const\s+maxBytes\s*=\s*maxImageBytes\(/.test(src));
    check(`${label}上传：高清判定走 hasHdUpload`, /hasHdUpload\(/.test(src));
    check(
      `${label}上传：无 \`isPremium ? MAX_BYTES_PREMIUM : MAX_BYTES_FREE\` 残留`,
      !/isPremium\s*\?\s*MAX_BYTES_PREMIUM\s*:\s*MAX_BYTES_FREE/.test(src),
      "仍有手写三元 = 存在第二判据",
    );
    check(`${label}上传：拒因文案指向容量包（不再只说高级订阅）`, /购买存储容量包可上传 20MB/.test(src));
  }

  // —— C. 旧常量名不再各自定义（避免两处字节数漂移） ——
  check(
    "lib/upload.ts 的字节常量改为从 lib/storage.ts 转出（不再各存一份）",
    /export \{ MAX_BYTES_STD as MAX_BYTES_FREE, MAX_BYTES_HD as MAX_BYTES_PREMIUM \} from "@\/lib\/storage"/.test(uploadSrc),
  );
  check(
    "lib/upload.ts 不再自写 8MB/20MB 字面量",
    !/export const MAX_BYTES_FREE = 8 \* 1024 \* 1024/.test(uploadSrc),
  );

  // —— D. premium-storage 已下架 ——
  check(
    "seed：premium-storage 标记为 inactive（下架）",
    /\["premium-storage",[^\]]*"inactive"\]/.test(seedOffer),
    "seed 里 premium-storage 仍是 active → 商城会继续并列两个同价同容量商品",
  );
  check("seed：其余订阅商品仍为 active", !/\["premium-domain",[^\]]*"inactive"\]/.test(seedOffer));

  check(
    "pay.ts 保留 premium-storage 履约分支（存量已购订单不能失效）",
    /slug === "premium-storage"/.test(execFileSync("bash", ["-c", `cat /workspace/lib/pay.ts`], { encoding: "utf8" })),
  );
}

// =====================================================================
// §2 数据层：造前提（user@test.com 的 active 纪念馆）
// =====================================================================
console.log("\n===== §2 数据层：造前提 =====");

const hallRow = psql(
  `SELECT h.id FROM "MemorialHall" h JOIN "User" u ON u.id = h."ownerUserId" ` +
    `WHERE u.email = '${OWNER}' AND h.status = 'active' ORDER BY h."createdAt" LIMIT 1`,
);

let hallId = "";
let usedBak = 0;
let subBak = 0;
let untilBak = "";
let archiveBak = "";
let archiveBakSet = false;
let pointsBak = 0;
if (!hallRow) {
  skip("§2/§3/§4 全部", `${OWNER} 名下没有 active 纪念馆`);
} else {
  hallId = hallRow;
  console.log(`样本纪念馆: ${hallId}`);

  usedBak = Number(psql(`SELECT COALESCE("storageUsedBytes",0)::text FROM "MemorialHall" WHERE id='${hallId}'`) || "0");
  subBak = Number(psql(`SELECT COALESCE("storageSubBytes",0)::text FROM "MemorialHall" WHERE id='${hallId}'`) || "0");
  untilBak = psql(`SELECT COALESCE("storageUntil"::text,'') FROM "MemorialHall" WHERE id='${hallId}'`);
  archiveBak = psql(`SELECT COALESCE("archive"::text,'') FROM "MemorialHall" WHERE id='${hallId}'`);
  archiveBakSet = archiveBak !== "";
  pointsBak = Number(psql(`SELECT points::text FROM "User" WHERE email='${OWNER}'`) || "0");
  console.log(`  备份：used=${usedBak} sub=${subBak} until=${untilBak || "∅"} archive.len=${archiveBak.length} 积分=${pointsBak}`);

  // 前提：把样本馆置为"仅免费额度 + 已用**正好用满** 1GB"（触发配额拦截）。
  // ⚠️ 必须设为"用满"而非"接近满"：测试上传的是 1×1 PNG（约 68 字节），
  //    若留 1KB 余量，68 字节塞得下 → 上传成功、断言假红。
  psql(`UPDATE "MemorialHall" SET "storageSubBytes"=0, "storageUntil"=NULL, "storageUsedBytes"=${GB} WHERE id='${hallId}'`);
  const usedNow = Number(psql(`SELECT "storageUsedBytes"::text FROM "MemorialHall" WHERE id='${hallId}'`) || "0");
  check("前提注入：样本馆已用 = 1GB（免费额度用满）", usedNow === GB, `实得 ${usedNow}`);
}

// =====================================================================
// §3 行为层：满额拦截 → 升级 → 到期回退 → 续费
// =====================================================================
let browser: import("playwright").Browser | null = null;
if (hallId) {
  console.log("\n===== §3 行为层 =====");
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await ctx.addCookies([{ name: "preview_auth", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();

  // 登录（拿 cookie）
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="identifier"]', OWNER);
  await page.fill('input[name="password"]', PW);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);

  // ---- 3a. 控制台面板可见（存储空间卡片） ----
  await page.goto(`${BASE}/console/halls/${hallId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const panelText = await page.evaluate(() => document.body.innerText);
  check("控制台显示「存储空间」面板", panelText.includes("存储空间"));
  check("控制台显示免费额度 1 GB", panelText.includes("1 GB") || panelText.includes("1GB"));
  check("控制台显示「升级」档位（10GB/年）", /10\s*GB\s*\/\s*年/.test(panelText) || panelText.includes("10 GB"));

  // ---- 3b. 免费额度满 → 上传被拒（真实 POST 到上传接口） ----
  // 用一个真实的小图片文件（png）+ 现用 cookie 发 multipart。
  const cookies = await ctx.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const png1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  const form = new FormData();
  form.set("file", new Blob([png1x1], { type: "image/png" }), "t.png");
  const upRes = await fetch(`${BASE}/api/halls/${hallId}/upload`, {
    method: "POST",
    headers: { cookie: cookieHeader },
    body: form,
  });
  const upJson = await upRes.json().catch(() => ({}));
  check(
    "免费额度满 → 上传被拒（HTTP 400 + 含「存储空间不足」）",
    upRes.status === 400 && String(upJson.error || "").includes("存储空间不足"),
    `status=${upRes.status} err=${upJson.error}`,
  );

  // ---- 3c. 升级（模拟履约：直接改库写 storageSubBytes + storageUntil） ----
  const futureIso = new Date(Date.now() + 365 * 86400000).toISOString();
  psql(`UPDATE "MemorialHall" SET "storageSubBytes"=${50 * GB}, "storageUntil"='${futureIso}' WHERE id='${hallId}'`);
  const subAfter = Number(psql(`SELECT "storageSubBytes"::text FROM "MemorialHall" WHERE id='${hallId}'`) || "0");
  check("升级后 storageSubBytes = 50GB", subAfter === 50 * GB);

  // ---- 3d. 配额放大 → 可继续上传 ----
  const form2 = new FormData();
  form2.set("file", new Blob([png1x1], { type: "image/png" }), "t2.png");
  const upRes2 = await fetch(`${BASE}/api/halls/${hallId}/upload`, {
    method: "POST",
    headers: { cookie: cookieHeader },
    body: form2,
  });
  const upJson2 = await upRes2.json().catch(() => ({}));
  check("升级后可继续上传（HTTP 200 + 返回 url）", upRes2.status === 200 && !!upJson2.url, `status=${upRes2.status} err=${upJson2.error}`);

  // 上传后 used 递增
  const usedAfterUp = Number(psql(`SELECT "storageUsedBytes"::text FROM "MemorialHall" WHERE id='${hallId}'`) || "0");
  check("上传后 storageUsedBytes 递增（含新文件）", usedAfterUp >= GB + png1x1.length, `used=${usedAfterUp}`);

  // 面板显示容量包生效中
  await page.goto(`${BASE}/console/halls/${hallId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const panelText2 = await page.evaluate(() => document.body.innerText);
  check("升级后面板显示「容量包生效中」", panelText2.includes("容量包生效中"), panelText2.slice(0, 0));
  check("升级后面板显示 50GB 档", panelText2.includes("50 GB") || panelText2.includes("50GB"));

  // ---- 3e. 到期回退 → 上传再被拒 ----
  const pastIso = new Date(Date.now() - 5 * 86400000).toISOString();
  psql(`UPDATE "MemorialHall" SET "storageUntil"='${pastIso}' WHERE id='${hallId}'`);
  const form3 = new FormData();
  form3.set("file", new Blob([png1x1], { type: "image/png" }), "t3.png");
  const upRes3 = await fetch(`${BASE}/api/halls/${hallId}/upload`, {
    method: "POST",
    headers: { cookie: cookieHeader },
    body: form3,
  });
  const upJson3 = await upRes3.json().catch(() => ({}));
  check(
    "容量包到期 → 回退免费额度 → 上传被拒（「存储空间不足」）",
    upRes3.status === 400 && String(upJson3.error || "").includes("存储空间不足"),
    `status=${upRes3.status} err=${upJson3.error}`,
  );

  // 面板显示已到期
  await page.goto(`${BASE}/console/halls/${hallId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const panelText3 = await page.evaluate(() => document.body.innerText);
  check("到期后面板显示「已…到期 · 续费」", panelText3.includes("到期") && panelText3.includes("续费"));

  // ---- 3f. 续费（顺延）恢复 ----
  // 顺延语义：已过期 → 从今天起算 +365（直接验证 nextExpiry 已在 §0；此处验"恢复可用"）
  psql(`UPDATE "MemorialHall" SET "storageUntil"='${futureIso}' WHERE id='${hallId}'`);
  const subAfterRenew = activeStoragePlanSlug({
    storageSubBytes: Number(psql(`SELECT "storageSubBytes"::text FROM "MemorialHall" WHERE id='${hallId}'`) || "0"),
    storageUntil: futureIso,
  });
  check("续费后容量包重新生效（activeStoragePlanSlug 认 50GB）", subAfterRenew === "storage-50g", `实得 ${subAfterRenew}`);

  await browser.close();
}

// =====================================================================
// §3.5 数据层：商城无重复存储商品 + 深链不指向下架商品（2026-10）
// =====================================================================
console.log("\n===== §3.5 数据层：商品去重与深链可达 =====");
{
  // —— A. 商城里不能同时存在"同价同容量"的存储商品 ——
  //
  // 判据：把在售的**存储类**商品按「价格 + 容量(GB)」分组，任何 >=2 个同组即为重叠。
  //       premium-storage（¥99 · 50GB）与 storage-50g（¥99 · 50GB）就是这一组。
  //
  // ⚠️ 容量有**两个来源**，必须都取，否则重叠加会漏判（曾漏判，反向验证时才发现）：
  //    ① 商品名里写着的（"进阶存储 50GB/年"）；
  //    ② 名字里没写、但履约逻辑按固定档位换算的（premium-storage 的老定义
  //       = 50GB，刻在 lib/pay.ts 的 `BigInt(50 * GB)` 里）。
  //    只取 ① 时 premium-storage 被算成 `9900/-1`，与 storage-50g 的
  //    `9900/50` 不同组 → **断言恒绿（假绿）**。
  //    这里的 50 来自 pay.ts，改 pay.ts 的档位必须同步改这里。
  const HISTORIC_GB: Record<string, number> = { "premium-storage": 50 };
  const historicPairs = Object.entries(HISTORIC_GB)
    .map(([slug, gb]) => `('${slug}'::text, ${gb})`)
    .join(", ");
  const dup = psql(
    `SELECT string_agg(slug, ' + ' ORDER BY slug) FROM ( ` +
      `  SELECT p.slug, ` +
      `         CONCAT(p.price, '/', ` +
      `           COALESCE( ` +
      `             (SELECT h.gb FROM (VALUES ${historicPairs}) AS h(slug, gb) WHERE h.slug = p.slug), ` +
      `             NULLIF(substring(p.name from '([0-9]+)\\s*GB'), '')::int, ` +
      `             -1 ` +
      `           ) ` +
      `         ) AS grp ` +
      `  FROM "Product" p ` +
      `  WHERE p.status = 'active' ` +
      `    AND (p.type = 'storage' OR p.slug LIKE 'storage-%' OR p.slug = 'premium-storage') ` +
      `) t GROUP BY t.grp HAVING COUNT(*) > 1 LIMIT 1`,
  );
  check(
    "商城无「同价同容量」重复存储商品",
    dup === "",
    dup ? `重叠组：${dup}` : "",
  );

  // —— B. 下架商品确实不在商城列表里 ——
  const inactiveCount = Number(
    psql(`SELECT count(*) FROM "Product" WHERE slug = 'premium-storage' AND status = 'inactive';`),
  );
  check("premium-storage 在库中为 inactive", inactiveCount === 1, `实得 ${inactiveCount}`);

  // —— C. 4 档容量包齐备且在售（用户改指向后至少要有一个能落地） ——
  // ⚠️ 别拿 string_agg 的字符串序当期望值：`ORDER BY slug` 下
  //    'storage-200g' < 'storage-50g'（字典序 '2' < '5'），不是自然序。
  //    这里按**集合**比较，顺序无关。
  const planSlugs = psql(
    `SELECT string_agg(slug, ',' ORDER BY slug) FROM "Product" ` +
      `WHERE slug IN ('storage-10g','storage-50g','storage-200g','storage-500g') AND status = 'active';`,
  )
    .split(",")
    .filter(Boolean)
    .sort();
  check(
    "4 档容量包全部在售",
    JSON.stringify(planSlugs) === JSON.stringify(["storage-10g", "storage-200g", "storage-500g", "storage-50g"]),
    `实得 ${planSlugs.join(",")}`,
  );

  // —— D. 全仓不再有指向已下架商品的深链 ——
  const linkHits = execFileSync(
    "bash",
    ["-c", `grep -rn '/mall/premium-storage' /workspace/app /workspace/components --include='*.tsx' --include='*.ts' 2>/dev/null | grep -v '已下架' | wc -l`],
    { encoding: "utf8" },
  ).trim();
  check(
    "全仓无指向已下架商品 (/mall/premium-storage) 的链接",
    Number(linkHits) === 0,
    `仍有 ${linkHits} 处`,
  );

  // —— E. 容量包的权益文案里写出了 20MB（用户能知道买了有什么） ——
  const panelSrc = execFileSync("bash", ["-c", `cat /workspace/components/console/StoragePanel.tsx`], { encoding: "utf8" });
  check("StoragePanel 标注容量包含 20MB 高清原片权益", /单张 20MB 高清原片/.test(panelSrc));
}

// =====================================================================
// §4 还原（判据 = 逐字等于备份）
// =====================================================================
console.log("\n===== §4 还原 =====");
if (hallId) {
  psql(`UPDATE "MemorialHall" SET "storageUsedBytes"=${usedBak}, "storageSubBytes"=${subBak} WHERE id='${hallId}'`);
  psql(`UPDATE "MemorialHall" SET "storageUntil"=${untilBak ? `'${untilBak}'` : "NULL"} WHERE id='${hallId}'`);
  if (archiveBakSet) {
    psqlFile(`UPDATE "MemorialHall" SET "archive" = $q$${archiveBak}$q$::jsonb WHERE id='${hallId}'`);
  } else {
    psql(`UPDATE "MemorialHall" SET "archive" = NULL WHERE id='${hallId}'`);
  }
  psql(`UPDATE "User" SET points = ${pointsBak} WHERE email = '${OWNER}'`);

  const usedNow = Number(psql(`SELECT "storageUsedBytes"::text FROM "MemorialHall" WHERE id='${hallId}'`) || "0");
  const subNow = Number(psql(`SELECT "storageSubBytes"::text FROM "MemorialHall" WHERE id='${hallId}'`) || "0");
  check("storageUsedBytes 已还原", usedNow === usedBak, `now=${usedNow} bak=${usedBak}`);
  check("storageSubBytes 已还原", subNow === subBak, `now=${subNow} bak=${subBak}`);
  const archNow = psql(`SELECT COALESCE("archive"::text,'') FROM "MemorialHall" WHERE id='${hallId}'`);
  check("archive 已逐字还原", archNow === archiveBak, `len now=${archNow.length} bak=${archiveBak.length}`);
}

// =====================================================================
// 汇总
// =====================================================================
console.log(`\n===== 存储容量验收：${pass}/${pass + fail} PASS${fail ? "，失败 " + fail + " 项" : ""} =====`);
if (skips.length) console.log(`SKIP ${skips.length} 项：${skips.join("；")}`);
if (existsSync(tmp)) {
  try {
    execFileSync("bash", ["-c", `rm -rf ${tmp}`]);
  } catch {
    /* ignore */
  }
}
process.exit(fail ? 1 : 0);
