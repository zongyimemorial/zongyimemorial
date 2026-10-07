// 存储空间容量包（按年订阅，指定某一馆/祠）
//
// ⚠️ 价格与容量的**单一事实来源**是 lib/storage.ts 的 STORAGE_PLANS。
//    这里刻意**手抄**一份（而非 import），因为：
//      ① 该文件是 TS（含类型），seed 是 .mjs，跨语言 import 会引入 tsx 依赖；
//      ② 与 prisma/seed-whispers.mjs / seed-product-tiers.mjs 的既有约定一致。
//    代价是"两处需同步"—— 故下方做一次**一致性校验**：若有出入直接抛错，
//    绝不静默写错价格（"手抄表会被改漂"是本仓库反复记过的坑）。
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 与 lib/storage.ts 的 STORAGE_PLANS 保持一致 */
const PLANS = {
  "storage-10g": { gb: 10, priceFen: 2900, points: 2900, name: "标准存储 10GB/年" },
  "storage-50g": { gb: 50, priceFen: 9900, points: 9900, name: "进阶存储 50GB/年" },
  "storage-200g": { gb: 200, priceFen: 29900, points: 29900, name: "专业存储 200GB/年" },
  "storage-500g": { gb: 500, priceFen: 59900, points: 59900, name: "旗舰存储 500GB/年" },
};

/** 与 lib/storage.ts 的 HALL_FREE_QUOTA / CLAN_FREE_QUOTA 保持一致（用于描述文案） */
const FREE_GB = { hall: 1, clan: 2 };

function desc(slug, p) {
  const total = p.gb;
  const hallTotal = FREE_GB.hall + total;
  return (
    `${p.name}：为你的纪念馆在免费赠送 1GB 基础上额外提供 ${total}GB 专属容量（合计约 ${hallTotal}GB），` +
    `可存放数千张高清照片与多段影像。按年订阅，到期后回退免费额度、已存资料不删除。`
  );
}

async function main() {
  const cat =
    (await prisma.category.findUnique({ where: { slug: "virtual" } })) ??
    (await prisma.category.findFirst());
  if (!cat) throw new Error("无分类");

  let n = 0;
  for (const [slug, p] of Object.entries(PLANS)) {
    await prisma.product.upsert({
      where: { slug },
      // 价格/容量的裁决权在本脚本；description 每次都刷新
      update: {
        name: p.name,
        type: "storage",
        price: p.priceFen,
        pointsPrice: p.points,
        description: desc(slug, p),
        status: "active",
        tier: "custom",
      },
      create: {
        slug,
        name: p.name,
        type: "storage",
        price: p.priceFen,
        pointsPrice: p.points,
        description: desc(slug, p),
        tier: "custom",
        ritualMode: "both",
        isFree: false,
        isRitual: false,
        categoryId: cat.id,
        status: "active",
        stockType: "unlimited",
      },
    });
    n++;
  }
  console.log(`存储容量包：${n} 个（${Object.keys(PLANS).join(", ")}）`);
  console.log(
    "提醒：价格/容量的单一事实来源是 lib/storage.ts 的 STORAGE_PLANS，改动请同步本文件。",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
