-- ============================================================================
-- 宗族活动 · 发布归属 + 审核态
--
-- ClanActivity 增加：
--   clanHallId      主办宗祠（可空=平台级活动）
--   createdByUserId 发布者（祠主或平台管理员）
--   reviewStatus    审核态（复用 ModerationStatus；存量默认 approved，新发布 pending）
--   reviewedAt / reviewNote  审核留痕
-- 并补两个查询索引与外键。
--
-- 幂等：列用 DO $$ 守卫（duplicate_column）；索引/外键用 IF NOT EXISTS / duplicate_object。
-- 与 schema.prisma 的 ClanActivity 保持一致。
-- ============================================================================

-- 列
DO $$ BEGIN
  ALTER TABLE "ClanActivity" ADD COLUMN "clanHallId" TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ClanActivity" ADD COLUMN "createdByUserId" TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ClanActivity" ADD COLUMN "reviewStatus" "ModerationStatus" NOT NULL DEFAULT 'approved';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ClanActivity" ADD COLUMN "reviewedAt" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ClanActivity" ADD COLUMN "reviewNote" TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- 索引
CREATE INDEX IF NOT EXISTS "ClanActivity_clanHallId_reviewStatus_idx" ON "ClanActivity"("clanHallId", "reviewStatus");
CREATE INDEX IF NOT EXISTS "ClanActivity_reviewStatus_startAt_idx" ON "ClanActivity"("reviewStatus", "startAt");

-- 外键
DO $$ BEGIN
  ALTER TABLE "ClanActivity" ADD CONSTRAINT "ClanActivity_clanHallId_fkey" FOREIGN KEY ("clanHallId") REFERENCES "ClanHall"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ClanActivity" ADD CONSTRAINT "ClanActivity_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
