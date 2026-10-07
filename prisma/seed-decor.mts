/**
 * 空间装修商品 seed（2026-10）
 *
 * 口径（用户已确认）：
 *   「设计成商城里的独立商品」「付费是指可以积分兑换也可以用货币支付」
 *
 * 生成内容（**数量不写死在这里** —— 加了商品就该自动跟上，写死必然过期）：
 *   1. 分类 `decor`（空间装修）
 *   2. 纪念馆：全部收费模板 + 装饰套件 + 典藏礼包
 *   3. 宗祠：  全部收费模板 + 装饰套件
 *
 * 定价：
 *   - 模板 ¥5–99（points 同步给出，100 积分 = ¥1 的平台口径）
 *   - 套件 ¥5–69，礼包 ¥79–199
 *   - 赠品模板（tpl-niche / clan-tpl-ancestral）**不进商城** ——
 *     它是建馆送的，卖它等于把赠品变成商品，自相矛盾。
 *
 * 幂等：全部走 upsert，可反复执行。
 *
 * 用法：npx tsx prisma/seed-decor.mts
 */
import { PrismaClient } from "@prisma/client";
import {
  BUNDLES,
  TEMPLATES,
  KITS,
  HALL_GRANT_TEMPLATE,
} from "../lib/hall-decor";
import { CLAN_TEMPLATES, CLAN_KITS, CLAN_GRANT_TEMPLATE } from "../lib/clan-decor";

const prisma = new PrismaClient();

/*
  商品 slug 命名：`decor-` [clan-] (`tpl-` | `kit-` | `bundle-`) <短名>
  短名 = 素材 id 去掉 `clan-` 与 `tpl-` / `kit-` / `bundle-` 前缀 ——
  否则模板 id 本身已带 `tpl-`，拼出来会变成 `tpl-tpl-inkwash`（已踩过）。

  ⚠️ 礼包的 id 是 `decor-bundle-imperial` —— 它**自带 `decor-` 前缀**
     （与模板 id `tpl-*` 的形态不同）。只剥 `bundle-` 会得到
     `decor-bundle-decor-bundle-imperial`（三重前缀，实测踩到）。
     所以这里必须先把 `decor-` 也剥掉。
  resolveDecorEntitlement() 里对这些形态都能反查，所以改名不会打破发货。
*/
function shortId(id) {
  return id.replace(/^decor-/, "").replace(/^clan-/, "").replace(/^(tpl|kit|bundle)-/, "");
}

/** 由模板/套件/礼包对象生成商品字段 */
function toProduct(kind, target, entry) {
  const isClan = target === "clan";
  const seg = kind === "template" ? "tpl" : kind === "kit" ? "kit" : "bundle";
  const slug = `decor-${isClan ? "clan-" : ""}${seg}-${shortId(entry.id)}`;

  const kindNote =
    kind === "kit"
      ? " · 含多件装饰素材"
      : kind === "bundle"
        ? ` · 典藏礼包，含 ${entry.includes.length} 套方案（原价 ¥${(entry.listPriceFen / 100).toFixed(0)}）`
        : " · 一键应用整套搭配";

  return {
    slug,
    name: `${entry.name}${
      kind === "kit" ? "（装饰套件）" : kind === "bundle" ? "（典藏礼包）" : "（空间模板）"
    }`,
    type: "decor",
    /*
      货币价：优先用条目显式给的 priceFen；老条目（只有积分价）按
      平台既有口径 100 积分 = ¥1 反推 —— 否则会以 ¥0 挂进商城，
      等于白送（已踩过：4 个老模板价格是 0）。
    */
    price: entry.priceFen ?? entry.points ?? 0,
    pointsPrice: entry.points && entry.points > 0 ? entry.points : null,
    description:
      `${entry.desc}` +
      (isClan ? " · 宗祠专用" : " · 纪念馆专用") +
      kindNote +
      " · 购买后永久可用，也可用积分兑换",
    tier: "custom",
    ritualMode: "both",
    isFree: false,
    isRitual: false,
    status: "active",
    stockType: "unlimited",
  };
}

async function main() {
  // ---------- 分类 ----------
  const cat = await prisma.category.upsert({
    where: { slug: "decor" },
    update: { name: "空间装修", isActive: true, sort: 5 },
    create: { slug: "decor", name: "空间装修", sort: 5, isActive: true },
  });
  console.log(`分类：空间装修(${cat.id})`);

  const rows = [];

  // ---------- 纪念馆 ----------
  for (const t of TEMPLATES) {
    if (t.id === HALL_GRANT_TEMPLATE) continue; // 赠品不进商城
    if (t.tier === "free") continue;
    rows.push(toProduct("template", "hall", t));
  }
  for (const k of KITS) {
    if (k.tier === "free") continue;
    rows.push(toProduct("kit", "hall", k));
  }

  // ---------- 宗祠 ----------
  for (const t of CLAN_TEMPLATES) {
    if (t.id === CLAN_GRANT_TEMPLATE) continue;
    if (t.tier === "free") continue;
    rows.push(toProduct("template", "clan", t));
  }
  for (const k of CLAN_KITS) {
    if (k.tier === "free") continue;
    rows.push(toProduct("kit", "clan", k));
  }

  // ---------- 典藏礼包（目前只在纪念馆侧） ----------
  for (const b of BUNDLES) {
    if (b.tier === "free") continue;
    rows.push(toProduct("bundle", "hall", b));
  }

  let created = 0;
  for (const r of rows) {
    const exists = await prisma.product.findUnique({ where: { slug: r.slug }, select: { id: true } });
    await prisma.product.upsert({
      where: { slug: r.slug },
      update: {
        name: r.name,
        price: r.price,
        pointsPrice: r.pointsPrice,
        description: r.description,
        type: "decor",
        status: "active",
        categoryId: cat.id,
      },
      create: { ...r, categoryId: cat.id },
    });
    if (!exists) created++;
  }

  console.log(`装修商品：新建 ${created} 个，更新 ${rows.length - created} 个，合计 ${rows.length} 个`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
