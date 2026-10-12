-- ============================================================================
-- 公益纪念堂·平台赠礼 + 公众免费祭献
--
-- 1) PublicMemorial 增加：giftSuiteId（赠顶级装修方案 id）、giftStorageGb
--    （赠旗舰存储 GB）、offeringCount（公众免费祭品计数）
-- 2) PublicMemorialWreath：公众免费敬献大花圈（免登录、免付费、同馆最多 2 个）
-- 3) PublicMemorialOffering：公众免费祭品（免登录、随时可献、无每日上限）
--
-- 幂等：列用 DO $$ 守卫（ADD COLUMN 若已存在则跳过），表/索引用 IF NOT EXISTS。
-- ============================================================================

-- —— PublicMemorial 赠礼字段（默认赠「传世典藏」尊享层 + 旗舰存储 500GB）——
DO $$ BEGIN
  ALTER TABLE "PublicMemorial" ADD COLUMN "giftSuiteId" TEXT NOT NULL DEFAULT 'suite-hall-prem-ultimate';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PublicMemorial" ADD COLUMN "giftStorageGb" INTEGER NOT NULL DEFAULT 500;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PublicMemorial" ADD COLUMN "offeringCount" INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- —— 公众敬献大花圈 ——
CREATE TABLE IF NOT EXISTS "PublicMemorialWreath" (
  "id"         TEXT NOT NULL,
  "memorialId" TEXT NOT NULL,
  "nickname"   TEXT,
  "message"    TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "removedAt"  TIMESTAMP(3),

  CONSTRAINT "PublicMemorialWreath_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PublicMemorialWreath_memorialId_removedAt_expiresAt_idx"
  ON "PublicMemorialWreath" ("memorialId", "removedAt", "expiresAt");

-- —— 公众免费祭品 ——
CREATE TABLE IF NOT EXISTS "PublicMemorialOffering" (
  "id"        TEXT NOT NULL,
  "memorialId" TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "nickname"  TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PublicMemorialOffering_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PublicMemorialOffering_memorialId_createdAt_idx"
  ON "PublicMemorialOffering" ("memorialId", "createdAt");

-- —— 外键（幂等）——
DO $$ BEGIN
  ALTER TABLE "PublicMemorialWreath"
    ADD CONSTRAINT "PublicMemorialWreath_memorialId_fkey"
    FOREIGN KEY ("memorialId") REFERENCES "PublicMemorial" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PublicMemorialOffering"
    ADD CONSTRAINT "PublicMemorialOffering_memorialId_fkey"
    FOREIGN KEY ("memorialId") REFERENCES "PublicMemorial" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
