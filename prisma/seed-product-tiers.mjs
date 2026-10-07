/**
 * 产品体系与定价 —— 唯一事实来源（single source of truth）
 *
 * 背景：原先 `seed-products.mjs` 与 `seed-free-offerings.mjs` 都在写同一批 free-* 商品，
 * 谁后跑谁生效，价格与 isFree 会互相覆盖。这里把「哪些免费、哪些收费、各卖多少钱」
 * 收敛到本文件一处，其余 seed 一律从这里 import，不再自行定义。
 *
 * 两个概念必须分清（见 schema.prisma 的 Product.isRitual 注释）：
 *   isFree   —— 零元（商城标价 0）
 *   isRitual —— 礼器（可在纪念馆/宗祠一键祭拜、有动效）
 * 转收费的祭品是 isFree=false + isRitual=true：商城收钱，但祭拜面板的入口不能消失。
 *
 * 本脚本幂等：可重复执行，结果收敛。
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/** 免费祭品（严格 10 个）：基础六供 + 二礼仪 + 二互动，覆盖"香花烛果茶酒 + 净碑行礼 + 寄语乐祭" */
export const FREE_SLUGS = [
  "free-incense", // 上香
  "free-flower", // 献花
  "free-candle", // 点烛
  "free-fruit", // 供果
  "free-tea", // 清茶
  "free-wine", // 祭酒
  "free-clean", // 擦拭墓碑
  "free-bow", // 三鞠躬
  "free-message", // 留言追思
  "free-music", // 追思音乐
];

/**
 * 转收费的礼器（20 个）。价格按**动效视觉复杂度**分档。
 *
 * 2026-10 价格带重构（依据：市场对标 + 全库零销量事实）：
 *   改造前只有 5 个价位（2/3/5/6/8），且 **2 元 5 款 + 3 元 9 款 = 70% 挤在一起**，
 *   用户看不出"哪个更隆重"；8 元之上直接断掉，想办更完整的仪式没有入口。
 *   现在拉成 **7 个价位**：1 / 2 / 3 / 5 / 8 / 12 / 18，
 *   每个价位只有 1–5 款、语义边界清楚。
 *
 *   ⚠️ 改价前实测：20 款收费祭品 `salesCount` **全为 0**，真实订单仅 1 笔（测试留下的），
 *   **改价零风险** —— 不会让任何用户的已购权益贬值（这是本项目"不动存量价格"纪律的前提）。
 *   日后若已产生真实销量，改价必须慎重（AGENTS：「集体提价会让老用户已买权益贬值」）。
 *
 * 分档依据（动效视觉复杂度，用户能直接看到的那一层）：
 *   ¥1  单点淡入（最轻的一念）          ¥2  单元素位移 / 淡入
 *   ¥3  有运动轨迹或粒子                ¥5  多元素、有时长感
 *   ¥8  完整仪式（多幕次）              ¥12 持续动画（诵经 / 钟声，有"法事"感）
 *   ¥18 全屏级（烟花，商城旗舰）
 *
 * 积分价与价格 1:1（100 积分 = ¥1），沿用 seed-products.mjs 的既有口径。
 */
export const PAID_RITUALS = [
  // —— ¥1：最轻的一念（新增档位，拉低尝试门槛） ——
  ["free-star", 100, "点亮心星"],
  ["free-prayer", 100, "双手合十"],
  ["free-willow", 100, "插柳寄哀"],
  // —— ¥2：单元素位移 / 淡入 ——
  ["free-moon", 200, "望月寄思"],
  ["free-wreath", 200, "敬献花环"],
  // —— ¥3：有运动轨迹或粒子 ——
  ["free-kite", 300, "放飞纸鸢"],
  ["free-dove", 300, "放飞白鸽"],
  ["free-lotus", 300, "莲花灯"],
  ["free-song", 300, "为TA点歌"],
  ["free-bell", 300, "风铃祈愿"],
  ["free-food", 300, "时馐供奉"],
  ["free-rice", 300, "五谷敬供"],
  // —— ¥5：多元素、有时长感 ——
  ["free-lantern", 500, "放河灯"],
  ["free-tree", 500, "植树寄思"],
  ["free-story", 500, "分享往事"],
  // —— ¥8：完整仪式 ——
  ["free-poem", 800, "诵读祭文"],
  ["free-letter", 800, "天堂信箱"],
  // —— ¥12：持续动画（法事感） ——
  ["free-scripture", 1200, "诵经回向"],
  ["free-chime", 1200, "撞钟祈福"],
  // —— ¥18：全屏级旗舰 ——
  ["free-firework", 1800, "数字烟花"],
];

/** 五档价格体系：商城页的导航与文案都由这里驱动 */
export const TIER_SPECS = [
  { key: "free", label: "免费祭品", desc: "基础六供 + 行礼寄语 · 零门槛", accent: "green" },
  { key: "basic", label: "基础祭品", desc: "鲜花果品茶酒 · ¥1–9", accent: "brand" },
  { key: "advanced", label: "进阶供品", desc: "纸扎衣物、冥币、花圈 · ¥5–128", accent: "brand" },
  { key: "ceremony", label: "仪式体验", desc: "烟花、诵经、音乐仪式 · ¥2–128", accent: "brand" },
  { key: "custom", label: "场景定制", desc: "建馆、传记、域名、视频 · ¥6–198", accent: "brand" },
];

/** 老免费祭品的描述文案（沿用 seed-free-offerings.mjs，避免改价后描述与商品对不上） */
const DESCRIPTIONS = {
  "free-star": "夜空中的星，是最温柔的陪伴",
  "free-moon": "海上生明月，天涯共此时",
  "free-willow": "清明插柳，纪念先人",
  "free-wreath": "敬献素雅花环",
  "free-prayer": "合十默祷，心怀感恩",
  "free-kite": "清明放纸鸢，剪断烦恼丝",
  "free-dove": "愿安宁与思念一同飞翔",
  "free-lantern": "中元放河灯，照亮归途",
  "free-lotus": "一盏莲灯，一份清净",
  "free-tree": "种下一棵树，生命以另一种方式延续",
  "free-song": "点一首TA最爱的歌",
  "free-bell": "风铃轻响，思念悠长",
  "free-food": "敬供时令佳肴",
  "free-rice": "五谷丰登，感恩先人",
  "free-story": "讲一段与TA有关的故事",
  "free-poem": "宣读祭文，述说怀念",
  "free-letter": "寄一封信到天堂",
  "free-scripture": "诵经一卷，回向先人",
  "free-chime": "钟声悠远，告慰先灵",
  "free-firework": "一朵烟花，绽放思念（环保无烟）",
};

/**
 * 把定价体系写入数据库。幂等。
 * 注意：非 free-* 的老商品（纸钱、别墅、建馆服务、悄悄话商品等）价格**一律不动**，
 * 只补 isRitual=false，避免本次改造误伤 whisper 的 PLAN_SPECS 同步关系。
 */
export async function applyProductTiers() {
  const cat = await prisma.category.findFirst();
  if (!cat) throw new Error("无分类，请先执行 prisma/seed.mjs");

  // —— 1. 免费祭品 ——
  for (const slug of FREE_SLUGS) {
    await prisma.product.update({
      where: { slug },
      data: { isFree: true, isRitual: true, price: 0, pointsPrice: null, status: "active" },
    });
  }

  // —— 2. 转收费的礼器 ——
  for (const [slug, priceFen, name] of PAID_RITUALS) {
    await prisma.product.update({
      where: { slug },
      data: {
        name,
        price: priceFen,
        pointsPrice: priceFen, // 1:1（100 积分 = ¥1）
        isFree: false,
        isRitual: true,
        status: "active",
        ...(DESCRIPTIONS[slug] ? { description: DESCRIPTIONS[slug] } : {}),
      },
    });
  }

  // —— 3. 其余老商品：只确保 isRitual=false，价格不动 ——
  await prisma.product.updateMany({
    where: { slug: { notIn: [...FREE_SLUGS, ...PAID_RITUALS.map((r) => r[0])] } },
    data: { isRitual: false },
  });

  // —— 4. 对账 ——
  const [freeCount, ritualCount, paidRitualCount] = await Promise.all([
    prisma.product.count({ where: { isFree: true } }),
    prisma.product.count({ where: { isRitual: true } }),
    prisma.product.count({ where: { isRitual: true, isFree: false } }),
  ]);

  console.log(`免费祭品  ${freeCount} 个（期望 ${FREE_SLUGS.length}）`);
  console.log(`礼器总计  ${ritualCount} 个（免费 ${freeCount} + 收费 ${paidRitualCount}）`);
  console.log(`收费礼器  ${paidRitualCount} 个（期望 ${PAID_RITUALS.length}）`);

  if (freeCount !== FREE_SLUGS.length) {
    throw new Error(`免费祭品数量不符：实际 ${freeCount}，期望 ${FREE_SLUGS.length}`);
  }
  if (paidRitualCount !== PAID_RITUALS.length) {
    throw new Error(`收费礼器数量不符：实际 ${paidRitualCount}，期望 ${PAID_RITUALS.length}`);
  }

  const rows = await prisma.product.findMany({
    where: { isRitual: true },
    select: { slug: true, name: true, price: true, pointsPrice: true, isFree: true },
    orderBy: [{ isFree: "desc" }, { price: "asc" }],
  });
  console.table(
    rows.map((r) => ({
      礼器: r.name,
      价格: r.isFree ? "免费" : `¥${(r.price / 100).toFixed(2)}`,
      积分价: r.pointsPrice ?? "—",
    })),
  );
}

// 直接执行时才跑（被 import 时不跑）
if (import.meta.url === `file://${process.argv[1]}`) {
  applyProductTiers()
    .then(() => console.log("\n定价体系已应用。"))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
