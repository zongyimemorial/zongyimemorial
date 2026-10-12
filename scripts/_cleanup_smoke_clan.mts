// 一次性清理：删除所有 smoke 测试遗留的宗祠（hallName 含「烟测」）
// 子表外键均为 onDelete: Cascade，DB 会级联；此处显式先删子表，双保险。
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const targets = await prisma.clanHall.findMany({
    where: { hallName: { contains: "烟测" } },
    select: { id: true, hallName: true, reviewChannel: true },
  });
  console.log(`找到 ${targets.length} 条测试宗祠:`);
  for (const t of targets) console.log(`  - ${t.id}  ${t.hallName}  [${t.reviewChannel}]`);
  if (targets.length === 0) return;

  const ids = targets.map((t) => t.id);
  // 显式子表清理（级联兜底）
  const r1 = await prisma.clanTribute.deleteMany({ where: { clanHallId: { in: ids } } });
  const r2 = await prisma.offeringOnAltar.deleteMany({ where: { clanHallId: { in: ids } } });
  const r3 = await prisma.hallReport.deleteMany({ where: { clanHallId: { in: ids } } });
  const r4 = await prisma.communityMember.deleteMany({ where: { clanHallId: { in: ids } } });
  console.log(`子表清理: tribute=${r1.count} altar=${r2.count} report=${r3.count} member=${r4.count}`);

  const del = await prisma.clanHall.deleteMany({ where: { id: { in: ids } } });
  console.log(`已删除宗祠 ${del.count} 条`);
}

main()
  .catch((e) => {
    console.error("cleanup error", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
