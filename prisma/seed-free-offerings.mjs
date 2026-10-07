// 纪念馆高级功能订阅商品
//
// 注意：原先这里定义过 30 套免费祭品。产品体系重构后（免费收敛至 10 个、
// 其余 20 个转收费），免费/收费的归属与定价已全部收敛到 prisma/seed-product-tiers.mjs，
// 本文件不再重复定义，只在**商品尚未存在时**补建基础记录，避免两处互相覆盖。
import { PrismaClient } from "@prisma/client";
import { FREE_SLUGS, PAID_RITUALS } from "./seed-product-tiers.mjs";
const prisma = new PrismaClient();

/** 礼器的初始元数据（注册用；价格与 isFree/isRitual 由 seed-product-tiers.mjs 裁决） */
const RITUAL_META = {
  "free-incense": ["上香", "tribute_item", "both"],
  "free-flower": ["献花", "virtual_flower", "both"],
  "free-candle": ["点烛", "tribute_item", "both"],
  "free-fruit": ["供果", "tribute_item", "both"],
  "free-wine": ["祭酒", "tribute_item", "both"],
  "free-tea": ["清茶", "tribute_item", "both"],
  "free-clean": ["擦拭墓碑", "tribute_item", "both"],
  "free-music": ["追思音乐", "tribute_item", "both"],
  "free-message": ["留言追思", "tribute_item", "both"],
  "free-letter": ["天堂信箱", "tribute_item", "both"],
  "free-lantern": ["放河灯", "tribute_item", "both"],
  "free-lotus": ["莲花灯", "tribute_item", "civilized"],
  "free-kite": ["放飞纸鸢", "tribute_item", "civilized"],
  "free-dove": ["放飞白鸽", "tribute_item", "civilized"],
  "free-tree": ["植树寄思", "tribute_item", "civilized"],
  "free-willow": ["插柳寄哀", "tribute_item", "both"],
  "free-wreath": ["敬献花环", "tribute_item", "civilized"],
  "free-bell": ["风铃祈愿", "tribute_item", "both"],
  "free-chime": ["撞钟祈福", "tribute_item", "both"],
  "free-bow": ["三鞠躬", "tribute_item", "both"],
  "free-prayer": ["双手合十", "tribute_item", "both"],
  "free-scripture": ["诵经回向", "tribute_item", "both"],
  "free-poem": ["诵读祭文", "tribute_item", "both"],
  "free-story": ["分享往事", "tribute_item", "both"],
  "free-star": ["点亮心星", "tribute_item", "civilized"],
  "free-moon": ["望月寄思", "tribute_item", "civilized"],
  "free-firework": ["数字烟花", "tribute_item", "civilized"],
  "free-food": ["时馐供奉", "tribute_item", "both"],
  "free-rice": ["五谷敬供", "tribute_item", "both"],
  "free-song": ["为TA点歌", "tribute_item", "both"],
};

/*
  纪念馆高级功能订阅（收费模式：高级功能订阅，不设香火排行榜等诱导消费）

  数组第 9 位 = `status`（2026-10 新增）。

  ⚠️ `premium-storage` 已**下架**（inactive），别再改回 active：
  它的老定义是"¥99/年 · 50GB"，与容量包 `storage-50g`（¥99/年 · 50GB）
  **同价同容量并列在商城里** —— 用户无法二选一，且一个能积分兑（9900 积分）
  一个不能。根因是它属于"premium 时代"的商品：容量由 `premiumUntil` 隐式推导，
  是 `lib/storage.ts` 之外的第二判据（本仓库的老毛病）。
  现在容量判据只有 `lib/storage.ts` 一处，售卖入口只有 4 档容量包。
  See: lib/pay.ts 兼容分支（延续已购用户的 20MB 高清原片权益）、
       docs/存储容量与定价.md
*/
const subscriptions = [
  ["premium-storage", "纪念馆大容量存储（年订）", "subscription", 9900, "custom", "both", false,
    "（已下架）容量已并入「存储空间容量包」，请在商城存储专区选购。", "inactive"],
  ["premium-domain", "纪念馆专属域名（年订）", "subscription", 4900, "custom", "both", false,
    "专属纪念域名地址，方便亲友直达纪念馆，彰显专属纪念空间"],
  ["premium-family", "家族共享席位（年订）", "subscription", 6900, "custom", "both", false,
    "支持50位家族成员共同管理纪念馆、协同编辑故人数字档案与族谱关联"],
];

async function main() {
  const cat = await prisma.category.findFirst();
  if (!cat) throw new Error("无分类");

  // —— 礼器：仅补建缺失的商品记录，不写价格/isFree/isRitual ——
  // 免费 10 个 + 收费 20 个，合计 30 个礼器。
  const ritualSlugs = [...FREE_SLUGS, ...PAID_RITUALS.map((r) => r[0])];
  let created = 0;
  for (const slug of ritualSlugs) {
    const meta = RITUAL_META[slug];
    if (!meta) continue;
    const [name, type, mode] = meta;
    const exists = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (exists) continue;
    await prisma.product.create({
      data: {
        slug,
        name,
        type,
        price: 0, // 占位，随后由 seed-product-tiers.mjs 裁决
        tier: "basic",
        ritualMode: mode,
        isFree: false,
        isRitual: true,
        categoryId: cat.id,
        status: "active",
        stockType: "unlimited",
      },
    });
    created++;
  }
  console.log(`礼器注册：新建 ${created} 个，已存在 ${ritualSlugs.length - created} 个`);

  for (const [slug, name, type, price, tier, mode, isFree, description, status = "active"] of subscriptions) {
    await prisma.product.upsert({
      where: { slug },
      update: { description, status, type },
      create: {
        slug, name, type, price, tier, description,
        ritualMode: mode, isFree,
        categoryId: cat.id,
        status,
        stockType: "unlimited",
      },
    });
  }
  console.log(`高级订阅商品 ${subscriptions.length} 个`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
