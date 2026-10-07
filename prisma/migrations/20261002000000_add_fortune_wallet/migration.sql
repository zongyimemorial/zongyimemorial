-- ============================================================================
-- 用户钱包（福币）+ 双币种定价
--
-- 1 福币 = 1 人民币。福币存**整数**（Int），刻意不叫 fortuneFen
-- （本仓库在 priceFen 上踩过「字段是分、代码当元用」的坑）。
-- ============================================================================

-- 1) 用户福币余额
ALTER TABLE "User" ADD COLUMN "fortuneCoins" INTEGER NOT NULL DEFAULT 0;

-- 2) 福币流水表（刻意没有 expireAt/expired：福币是充值资产，不允许过期）
CREATE TABLE "FortuneLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FortuneLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FortuneLog_userId_createdAt_idx" ON "FortuneLog"("userId", "createdAt");

ALTER TABLE "FortuneLog" ADD CONSTRAINT "FortuneLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) 商品福币价（派生展示字段；price(分) 的语义不变，仍是人民币账本口径）
ALTER TABLE "Product" ADD COLUMN "fubPrice" INTEGER;

-- 回填：1 福币 = 1 人民币 → fubPrice = price / 100
-- 用 ROUND 而非整除，避免历史 ¥9.80 这类价格被截断成 9.80 → 9
UPDATE "Product" SET "fubPrice" = ROUND("price"::numeric / 100)::int WHERE "fubPrice" IS NULL;

-- 4) 新增商品类型：福币充值
-- （充值档位是代码常量，不落 Product 表；此枚举值用于 OrderItem.snapshot.type 与统计口径）
ALTER TYPE "ProductType" ADD VALUE 'fortune_topup';
