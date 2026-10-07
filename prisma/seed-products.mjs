// 按《技术标准 3.4 虚拟祭品产品线》补充产品线：
// 四大类（基础祭品/进阶供品/仪式体验/场景定制）+ 免费祭品 + 节日/地域/宗教限定 + 传统·文明模式标注
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// [slug, name, type, price(分), tier, ritualMode, isFree, description]
const products = [
  // ===== 免费祭品（约10种，降低使用门槛）=====
  ["free-incense", "免费上香", "tribute_item", 0, "basic", "civilized", true, "免费为逝者上一炷香，袅袅青烟寄托哀思。"],
  ["free-flower", "免费献花", "virtual_flower", 0, "basic", "civilized", true, "免费献上一束白菊，鲜花祭扫文明环保。"],
  ["free-candle", "免费点烛", "tribute_item", 0, "basic", "civilized", true, "免费点燃一支蜡烛，烛光摇曳思念长明。"],
  ["free-wine", "免费祭酒", "tribute_item", 0, "basic", "both", true, "免费斟一杯清酒，敬献故人。"],
  ["free-fruit", "免费供果", "tribute_item", 0, "basic", "both", true, "免费供奉时令果盘，追忆往昔。"],
  ["free-tea", "免费清茶", "tribute_item", 0, "basic", "both", true, "免费敬一杯清茶，淡淡茶香诉思念。"],
  ["free-message", "免费留言追思", "tribute_item", 0, "basic", "civilized", true, "免费写下一段追思留言，字字真情。"],
  ["free-letter", "天堂信箱", "tribute_item", 0, "basic", "civilized", true, "给天堂的亲人写一封信，见字如面。"],
  ["free-clean", "虚拟擦拭墓碑", "tribute_item", 0, "basic", "civilized", true, "免费为虚拟墓碑拂尘擦拭，维护整洁。"],
  ["free-music", "免费追思音乐", "tribute_item", 0, "ceremony", "both", true, "免费播放一段追思音乐，寄托哀思。"],

  // ===== 基础祭品类（1-5元，高频消耗品，走量）=====
  ["flower-chrysanthemum", "虚拟鲜花·白菊", "virtual_flower", 200, "basic", "civilized", false, "一束素雅白菊，经典祭扫之选。"],
  ["flower-lily", "虚拟鲜花·百合", "virtual_flower", 300, "basic", "civilized", false, "百合寓意纯洁安息，慎终追远。"],
  ["fruit-basket", "虚拟水果供盘", "tribute_item", 300, "basic", "both", false, "时令鲜果拼盘，供奉于纪念堂前。"],
  ["pastry-plate", "虚拟糕点", "tribute_item", 200, "basic", "both", false, "传统糕点供品，记忆中的味道。"],
  ["incense-candle", "虚拟香烛", "tribute_item", 100, "basic", "both", false, "一炷香、一支烛，香火绵延。"],
  ["tea-cup", "虚拟清茶", "tribute_item", 100, "basic", "both", false, "敬一杯清茶，以茶代酒亦见诚心。"],
  ["wine-cup", "虚拟祭酒", "tribute_item", 200, "basic", "both", false, "洒一杯薄酒，遥寄哀思。"],

  // ===== 进阶供品类（5-20元，高价值虚拟商品，传统祭扫模式）=====
  ["paper-money", "纸钱冥币", "tribute_item", 500, "advanced", "traditional", false, "传统祭祀用品，仅在传统祭扫模式下展示。"],
  ["paper-clothes", "纸制衣物", "tribute_item", 600, "advanced", "traditional", false, "为故人焚送四季衣物（传统模式）。"],
  ["paper-car", "纸汽车", "tribute_item", 1000, "advanced", "traditional", false, "传统纸扎汽车（传统模式）。"],
  ["paper-villa", "纸别墅", "tribute_item", 1500, "advanced", "traditional", false, "传统纸扎别墅（传统模式）。"],
  ["paper-phone", "纸手机", "tribute_item", 800, "advanced", "traditional", false, "传统纸扎手机（传统模式）。"],
  ["paper-appliance", "纸家电套装", "tribute_item", 1200, "advanced", "traditional", false, "传统纸扎家电四件套（传统模式）。"],

  // ===== 仪式体验类（2-10元，沉浸式体验）=====
  ["firecracker", "虚拟鞭炮", "tribute_item", 200, "ceremony", "traditional", false, "模拟鞭炮声光效果，仅在传统祭扫模式下展示。"],
  ["fireworks", "虚拟烟花", "tribute_item", 300, "ceremony", "traditional", false, "夜空绽放的思念烟花（传统模式）。"],
  ["sutra-play", "经文播放·佛教", "tribute_item", 500, "ceremony", "both", false, "播放往生咒等经文，庄严殊胜。"],
  ["music-ceremony", "追思音乐仪式", "tribute_item", 300, "ceremony", "both", false, "专业追思音乐曲目，营造宁静氛围。"],
  ["river-lamp", "中元限定·河灯", "tribute_item", 300, "ceremony", "both", false, "节日限定：中元节放一盏河灯，照亮归途。"],

  // ===== 场景定制类（10-50元，个性化定制）=====
  ["hall-template-elegant", "专属纪念馆模板·素雅风", "memorial_hall", 2000, "custom", "civilized", false, "为纪念馆换上素雅纪念风格模板。"],
  ["tombstone-style", "墓碑样式更换", "memorial_service", 1500, "custom", "both", false, "多款墓碑样式可选，庄重铭刻。"],
  ["homepage-style", "纪念馆首页风格定制", "memorial_service", 3000, "custom", "both", false, "个性化定制纪念馆首页风格。"],

  // ===== 节日 / 地域限定 =====
  ["qingming-qingtuan", "清明限定·青团", "tribute_item", 200, "basic", "both", false, "节日限定：清明时节的青团，江南风味。"],
  ["dongzhi-dumpling", "冬至限定·饺子", "tribute_item", 200, "basic", "both", false, "节日限定：冬至的饺子，北方风味。"],
  ["duanwu-zongzi", "端午限定·粽子", "tribute_item", 200, "basic", "both", false, "节日限定：端午的粽子，南方风味。"],
];

const CATEGORY_SLUGS = { virtual: "虚拟纪念", supplies: "祭祀用品" };

async function main() {
  const virtualCat = await prisma.category.findUnique({ where: { slug: "virtual" } });
  if (!virtualCat) throw new Error("虚拟纪念分类不存在");

  // 更新现有商品的 tier / ritualMode
  const tierMap = {
    "online-lamp": ["basic", "civilized"],
    "virtual-flower": ["basic", "civilized"],
    "virtual-wreath": ["basic", "civilized"],
    "lamp-year": ["basic", "civilized"],
    "e-obituary": ["custom", "both"],
    "cloud-worship": ["custom", "both"],
    "qr-tombstone": ["custom", "both"],
    "memorial-renew": ["custom", "both"],
    "memorial-video": ["custom", "both"],
    "incense-offering": ["advanced", "traditional"],
    "digital-memorial-hall": ["custom", "both"],
    "online-memorial-meeting": ["ceremony", "both"],
    "flower-basket": ["advanced", "traditional"],
    "family-memorial-hall": ["custom", "both"],
    "bio-writing": ["custom", "both"],
  };
  for (const [slug, [tier, mode]] of Object.entries(tierMap)) {
    await prisma.product.updateMany({
      where: { slug },
      data: { tier, ritualMode: mode },
    });
  }

  // 新增商品
  for (const [slug, name, type, price, tier, mode, isFree, description] of products) {
    await prisma.product.upsert({
      where: { slug },
      // 注意：价格 / isFree / pointsPrice 的最终裁决权在 seed-product-tiers.mjs，
      // 这里只在**首次创建**时给个初值。若在 update 里写 isFree/price，
      // 与 seed-free-offerings.mjs 同时存在时会互相覆盖（谁后跑谁生效）。
      update: { tier, ritualMode: mode },
      create: {
        slug,
        name,
        type,
        price,
        tier,
        ritualMode: mode,
        isFree,
        isRitual: isFree,
        description,
        categoryId: virtualCat.id,
        status: "active",
        stockType: "unlimited",
        pointsPrice: price > 0 ? price : null,
      },
    });
  }

  const total = await prisma.product.count();
  console.log(`完成：新增 ${products.length} 个商品，全站共 ${total} 个商品`);
  console.log("提示：价格与免费/礼器归属以 seed-product-tiers.mjs 为准，请在其后执行该脚本。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
