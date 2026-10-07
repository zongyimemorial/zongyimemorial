// 一次性回填：按磁盘实际大小累加各馆/祠的 storageUsedBytes。
//
// 为什么必须回填：新增 storageUsedBytes 默认 0，而现有馆的 archive.photos 里
// 已有大量图片。若不回填，老馆的"已用"从 0 起算 → 一上传就可能超免费额度被判"满"
// （用户观感："我明明没传几张，怎么说满了"）。
//
// 口径：只统计**本系统托管**的图片（/uploads/halls、/uploads/clan-halls、/uploads/community），
// 外链（https://…）不占本平台存储，不计入。与 lib/upload.ts 的 MANAGED_UPLOAD_PREFIXES 一致。
//
// 幂等：直接**覆盖** storageUsedBytes 为现算值（不是 increment），可反复跑。
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const MANAGED = ["/uploads/halls/", "/uploads/clan-halls/", "/uploads/community/"];

function sizeOf(url) {
  if (typeof url !== "string") return 0;
  if (!MANAGED.some((p) => url.startsWith(p))) return 0; // 外链不计
  const rel = url.slice("/uploads/".length);
  const target = path.join(UPLOAD_ROOT, rel);
  if (!target.startsWith(UPLOAD_ROOT)) return 0;
  try {
    return fs.statSync(target).size;
  } catch {
    return 0;
  }
}

function photosOf(archive) {
  const arr = archive && typeof archive === "object" ? archive.photos : null;
  return Array.isArray(arr) ? arr : [];
}

async function main() {
  // 纪念馆
  const halls = await prisma.memorialHall.findMany({ select: { id: true, archive: true } });
  let hallTotal = 0;
  for (const h of halls) {
    const used = photosOf(h.archive).reduce((s, u) => s + sizeOf(u), 0);
    // ⚠️ storageUsedBytes 是 BigInt 列，写入须传 BigInt
    await prisma.memorialHall.update({ where: { id: h.id }, data: { storageUsedBytes: BigInt(used) } });
    hallTotal += used;
  }

  // 宗祠
  const clans = await prisma.clanHall.findMany({ select: { id: true, archive: true } });
  let clanTotal = 0;
  for (const c of clans) {
    const used = photosOf(c.archive).reduce((s, u) => s + sizeOf(u), 0);
    await prisma.clanHall.update({ where: { id: c.id }, data: { storageUsedBytes: BigInt(used) } });
    clanTotal += used;
  }

  console.log(
    `回填完成：纪念馆 ${halls.length} 座 / 宗祠 ${clans.length} 座`,
  );
  console.log(
    `已用合计：纪念馆 ${(hallTotal / 1024 / 1024).toFixed(2)} MB，宗祠 ${(clanTotal / 1024 / 1024).toFixed(2)} MB`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
