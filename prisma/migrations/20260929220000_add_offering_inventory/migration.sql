-- 供奉体系重构：消耗式库存 + 供台陈列
--
-- 只新增两张表，不改动任何现有列，因此对正在运行的旧代码完全向后兼容。
-- 上线顺序要求：先建表 → 回填历史已购 → 再切换读路径（详见 docs/供奉体系.md）。

-- ---------- 祭品持有量（消耗式库存）----------
CREATE TABLE "OfferingHolding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "freeTopUpDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferingHolding_pkey" PRIMARY KEY ("id")
);

-- 一件祭品在每个用户名下只有一行
CREATE UNIQUE INDEX "OfferingHolding_userId_productId_key" ON "OfferingHolding"("userId", "productId");
CREATE INDEX "OfferingHolding_userId_idx" ON "OfferingHolding"("userId");

ALTER TABLE "OfferingHolding" ADD CONSTRAINT "OfferingHolding_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfferingHolding" ADD CONSTRAINT "OfferingHolding_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------- 供台陈列 ----------
CREATE TABLE "OfferingOnAltar" (
    "id" TEXT NOT NULL,
    "hallId" TEXT,
    "clanHallId" TEXT,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "OfferingOnAltar_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OfferingOnAltar_hallId_clearedAt_createdAt_idx" ON "OfferingOnAltar"("hallId", "clearedAt", "createdAt");
CREATE INDEX "OfferingOnAltar_clanHallId_clearedAt_createdAt_idx" ON "OfferingOnAltar"("clanHallId", "clearedAt", "createdAt");
CREATE INDEX "OfferingOnAltar_userId_idx" ON "OfferingOnAltar"("userId");

ALTER TABLE "OfferingOnAltar" ADD CONSTRAINT "OfferingOnAltar_hallId_fkey"
    FOREIGN KEY ("hallId") REFERENCES "MemorialHall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfferingOnAltar" ADD CONSTRAINT "OfferingOnAltar_clanHallId_fkey"
    FOREIGN KEY ("clanHallId") REFERENCES "ClanHall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfferingOnAltar" ADD CONSTRAINT "OfferingOnAltar_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Restrict：防止删商品时静默清空供台（商品下架仍应保留"曾供过"的陈列）
ALTER TABLE "OfferingOnAltar" ADD CONSTRAINT "OfferingOnAltar_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
