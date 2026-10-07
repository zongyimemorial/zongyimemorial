-- AlterEnum
ALTER TYPE "ProductType" ADD VALUE 'storage';

-- AlterTable
-- 注意：storageSubBytes / storageUsedBytes 是**字节数**，必须 BIGINT。
-- 500GB = 536,870,912,000 字节，远超 INTEGER 上限 2,147,483,647
-- （用 INTEGER 会让 200GB/500GB 两档写入直接 `integer out of range`）。
ALTER TABLE "ClanHall" ADD COLUMN     "storageSubBytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "storageUntil" TIMESTAMP(3),
ADD COLUMN     "storageUsedBytes" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MemorialHall" ADD COLUMN     "storageSubBytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "storageUntil" TIMESTAMP(3),
ADD COLUMN     "storageUsedBytes" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "targetHallId" TEXT,
ADD COLUMN     "targetKind" TEXT;
