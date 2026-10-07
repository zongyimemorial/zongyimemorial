/**
 * 存量馆补发建馆赠品（一次性数据迁移，幂等）。
 *
 * 背景：改版后「免费」只剩一个入口 —— 新建馆时自动获赠一套模板。
 * 存量馆（建馆早于本机制）若不补发，老用户进装修工坊会看到
 * **连原来能用的免费模板都被锁了**，体感是"平台把我的权益收回了"。
 * 这是改文案解决不了的，必须补数据。
 *
 * 用法：npx tsx scripts/backfill-decor-grant.mts
 *       npx tsx scripts/backfill-decor-grant.mts --dry
 */
import { prisma } from "../lib/db";
import { backfillGrants, grantTemplateId } from "../lib/decor-grant";

const DRY = process.argv.includes("--dry");

async function main() {
  const halls = await prisma.memorialHall.findMany({
    select: { id: true, name: true, templateConfig: true },
  });
  const clans = await prisma.clanHall.findMany({
    select: { id: true, hallName: true, templateConfig: true },
  });

  console.log(`存量：纪念馆 ${halls.length} 座 / 宗祠 ${clans.length} 座`);
  console.log(`赠品模板：纪念馆 ${grantTemplateId("hall")} / 宗祠 ${grantTemplateId("clan")}`);

  const before = {
    halls: halls.filter((h) => {
      const g = (h.templateConfig as { decor?: { granted?: string[] } } | null)?.decor?.granted;
      return Array.isArray(g) && g.length > 0;
    }).length,
    clans: clans.filter((h) => {
      const g = (h.templateConfig as { decor?: { granted?: string[] } } | null)?.decor?.granted;
      return Array.isArray(g) && g.length > 0;
    }).length,
  };
  console.log(`已发放过：纪念馆 ${before.halls} 座 / 宗祠 ${before.clans} 座`);

  if (DRY) {
    console.log("[dry-run] 不写入");
    return;
  }

  const r = await backfillGrants();
  console.log(`本次补发：纪念馆 ${r.halls} 座 / 宗祠 ${r.clans} 座`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
