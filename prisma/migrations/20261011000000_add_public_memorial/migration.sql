-- ============================================================================
-- 公益纪念堂（Public Welfare Memorial）模块
--
-- 1) 枚举 MemorialCategory（名人/见义勇为/好人好事）、
--    PublicMemorialStatus（PENDING/APPROVED/REJECTED/TAKEN_DOWN）
-- 2) PublicMemorialApplication（家属申请，进审核队列，consentConfirmed 必为 true）
-- 3) PublicMemorial（通过后生成，对公众公开缅怀，grade=imperial 最高级别视觉）
-- 4) PublicMemorialMessage（公众留言，先审后发 pending→APPROVED 才展示）
--
-- 合规隔离：与收费纪念馆体系解耦，纯公益、零付费引导；需家属授权 +
-- 权威来源核验 + 人工审核 + 可撤回下架（详见 lib/memorial-review.ts）。
-- ============================================================================

-- —— 枚举 ——
DO $$ BEGIN
  CREATE TYPE "MemorialCategory" AS ENUM ('CELEBRITY', 'HEROIC', 'GOOD_DEED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PublicMemorialStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'TAKEN_DOWN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- —— 申请 ——
CREATE TABLE IF NOT EXISTS "PublicMemorialApplication" (
  "id"               TEXT NOT NULL,
  "applicantName"    TEXT NOT NULL,
  "applicantRelation" TEXT NOT NULL,
  "applicantContact" TEXT NOT NULL,
  "consentConfirmed" BOOLEAN NOT NULL,
  "deceasedName"     TEXT NOT NULL,
  "category"         "MemorialCategory" NOT NULL,
  "birthYear"        INTEGER,
  "deathYear"        INTEGER,
  "honorTitle"       TEXT NOT NULL,
  "summary"          TEXT NOT NULL,
  "story"            TEXT NOT NULL,
  "sourceUrl"        TEXT,
  "portraitUrl"      TEXT,
  "status"           "PublicMemorialStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNote"       TEXT,
  "reviewedById"     TEXT,
  "reviewedAt"       TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "memorialId"       TEXT,
  CONSTRAINT "PublicMemorialApplication_pkey" PRIMARY KEY ("id")
);

-- —— 纪念堂 ——
CREATE TABLE IF NOT EXISTS "PublicMemorial" (
  "id"          TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "category"    "MemorialCategory" NOT NULL,
  "birthYear"   INTEGER,
  "deathYear"   INTEGER,
  "honorTitle"  TEXT NOT NULL,
  "summary"     TEXT NOT NULL,
  "story"       TEXT NOT NULL,
  "sourceUrl"   TEXT,
  "portraitUrl" TEXT,
  "grade"       TEXT NOT NULL DEFAULT 'imperial',
  "lightCount"  INTEGER NOT NULL DEFAULT 0,
  "viewCount"   INTEGER NOT NULL DEFAULT 0,
  "status"      "PublicMemorialStatus" NOT NULL DEFAULT 'APPROVED',
  "takedownReason" TEXT,
  "approvedById" TEXT,
  "approvedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicMemorial_pkey" PRIMARY KEY ("id")
);

-- —— 留言 ——
CREATE TABLE IF NOT EXISTS "PublicMemorialMessage" (
  "id"          TEXT NOT NULL,
  "memorialId"  TEXT NOT NULL,
  "nickname"    TEXT,
  "content"     TEXT NOT NULL,
  "status"      "PublicMemorialStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicMemorialMessage_pkey" PRIMARY KEY ("id")
);

-- —— 外键 / 唯一 / 索引 ——
ALTER TABLE "PublicMemorialApplication"
  ADD CONSTRAINT "PublicMemorialApplication_memorialId_fkey"
  FOREIGN KEY ("memorialId") REFERENCES "PublicMemorial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PublicMemorialMessage"
  ADD CONSTRAINT "PublicMemorialMessage_memorialId_fkey"
  FOREIGN KEY ("memorialId") REFERENCES "PublicMemorial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "PublicMemorialApplication_memorialId_key"
  ON "PublicMemorialApplication"("memorialId");
CREATE UNIQUE INDEX IF NOT EXISTS "PublicMemorial_slug_key" ON "PublicMemorial"("slug");
CREATE INDEX IF NOT EXISTS "PublicMemorialApplication_status_createdAt_idx"
  ON "PublicMemorialApplication"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PublicMemorial_status_idx" ON "PublicMemorial"("status");
CREATE INDEX IF NOT EXISTS "PublicMemorial_category_status_idx"
  ON "PublicMemorial"("category", "status");
CREATE INDEX IF NOT EXISTS "PublicMemorialMessage_memorialId_status_idx"
  ON "PublicMemorialMessage"("memorialId", "status");
