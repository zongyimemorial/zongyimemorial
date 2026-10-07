-- ============================================================================
-- 电子讣告（memorial_service / e-obituary 商品的履约产物）
--
-- 商品「电子讣告发布」购买/积分兑换后 → 发放发布配额 → 控制台发布 → 公开缅怀页。
--
-- 配额语义：一次购买/兑换 = 可发布 1 份（单次服务，非订阅），消耗式
-- （与 OfferingHolding 同源：购买 increment，发布 decrement）。
-- ============================================================================

-- 1) 讣告主表
CREATE TABLE "Obituary" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "hallId" TEXT,
    "deceasedName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "deathDate" TIMESTAMP(3),
    "biography" TEXT,
    "funeralInfo" TEXT,
    "portraitImage" TEXT,
    "contactInfo" TEXT,
    -- 只存 bcrypt 哈希，绝非明文
    "passwordHash" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "allowMessages" BOOLEAN NOT NULL DEFAULT true,
    -- published（已发布）| unpublished（已下架）
    "status" TEXT NOT NULL DEFAULT 'published',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Obituary_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Obituary_ownerUserId_createdAt_idx" ON "Obituary"("ownerUserId", "createdAt");
CREATE INDEX "Obituary_hallId_idx" ON "Obituary"("hallId");
CREATE INDEX "Obituary_status_isPublic_idx" ON "Obituary"("status", "isPublic");

ALTER TABLE "Obituary" ADD CONSTRAINT "Obituary_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 挂馆可选；馆被删则讣告保留、归属清空（SET NULL）——「删馆不删讣告」
ALTER TABLE "Obituary" ADD CONSTRAINT "Obituary_hallId_fkey"
  FOREIGN KEY ("hallId") REFERENCES "MemorialHall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) 发布配额（一人一行；剩余 = purchased - used，代码现算）
CREATE TABLE "ObituaryQuota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purchased" INTEGER NOT NULL DEFAULT 0,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObituaryQuota_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ObituaryQuota_userId_key" ON "ObituaryQuota"("userId");

ALTER TABLE "ObituaryQuota" ADD CONSTRAINT "ObituaryQuota_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) 讣告留言
CREATE TABLE "ObituaryMessage" (
    "id" TEXT NOT NULL,
    "obituaryId" TEXT NOT NULL,
    "userId" TEXT,
    "content" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '匿名亲友',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObituaryMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ObituaryMessage_obituaryId_createdAt_idx" ON "ObituaryMessage"("obituaryId", "createdAt");

ALTER TABLE "ObituaryMessage" ADD CONSTRAINT "ObituaryMessage_obituaryId_fkey"
  FOREIGN KEY ("obituaryId") REFERENCES "Obituary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 留言人注销则保留留言、清空归属（SET NULL），公开页仍可见脱敏名号
ALTER TABLE "ObituaryMessage" ADD CONSTRAINT "ObituaryMessage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
