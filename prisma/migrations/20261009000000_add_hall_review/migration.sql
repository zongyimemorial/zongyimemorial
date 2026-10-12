-- ============================================================================
-- 建馆审核流程改造（多渠道替代核验 + 三通道分层 + 合规底线）
--
-- 1) MemorialHall / ClanHall 各加三列：reviewChannel / supplementDeadline / supplementedAt
--    - reviewChannel：standard | alternative | appeal（宗祠侧同样三通道，见 lib/hall-review.ts 的 CLAN_CHANNEL_META）
--    - supplementDeadline / supplementedAt：appeal 通道「60 天补传期」实时判定用，无 cron
-- 2) ClanHall.isPublic 默认值由 true 改 false —— 修掉「pending 却直接公开」的合规口子，
--    统一先审后显（建馆 pending → 后台通过 → isPublic=true）。
-- 3) 新增 HallReport 表（多态举报：对应纪念馆或宗祠），配套索引与级联外键。
-- 注：proofs 字段类型仍为 Json，仅结构升级（旧 {fireProof,...} 由 normalizeProofs 兼容），
--     故本迁移不改动 proofs 列。
-- ============================================================================

-- —— MemorialHall 三列 ——
ALTER TABLE "MemorialHall" ADD COLUMN "reviewChannel" TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "MemorialHall" ADD COLUMN "supplementDeadline" TIMESTAMP(3);
ALTER TABLE "MemorialHall" ADD COLUMN "supplementedAt" TIMESTAMP(3);

-- —— ClanHall 三列 + 修正 isPublic 默认 ——
ALTER TABLE "ClanHall" ADD COLUMN "reviewChannel" TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "ClanHall" ADD COLUMN "supplementDeadline" TIMESTAMP(3);
ALTER TABLE "ClanHall" ADD COLUMN "supplementedAt" TIMESTAMP(3);
ALTER TABLE "ClanHall" ALTER COLUMN "isPublic" SET DEFAULT false;

-- —— HallReport 表 ——
CREATE TABLE "HallReport" (
    "id"         TEXT NOT NULL,
    "reporterId" TEXT,
    "hallId"     TEXT,
    "clanHallId" TEXT,
    -- living(活人被祭拜) | fake(虚假馆) | other
    "kind"       TEXT NOT NULL DEFAULT 'living',
    "reason"     TEXT,
    "contact"    TEXT,
    -- pending | handled | dismissed
    "status"     TEXT NOT NULL DEFAULT 'pending',
    "handlerId"  TEXT,
    "handledAt"  TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HallReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HallReport_status_idx" ON "HallReport"("status");
CREATE INDEX "HallReport_hallId_idx" ON "HallReport"("hallId");
CREATE INDEX "HallReport_clanHallId_idx" ON "HallReport"("clanHallId");

-- 举报人注销则记录保留、归属清空（SET NULL）
ALTER TABLE "HallReport" ADD CONSTRAINT "HallReport_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 对应纪念馆删除则举报随之删除（Cascade，与全站副产物口径一致）
ALTER TABLE "HallReport" ADD CONSTRAINT "HallReport_hallId_fkey"
  FOREIGN KEY ("hallId") REFERENCES "MemorialHall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 对应宗祠删除则举报随之删除（Cascade）
ALTER TABLE "HallReport" ADD CONSTRAINT "HallReport_clanHallId_fkey"
  FOREIGN KEY ("clanHallId") REFERENCES "ClanHall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 处理人（管理员）注销则记录保留、归属清空（SET NULL）
ALTER TABLE "HallReport" ADD CONSTRAINT "HallReport_handlerId_fkey"
  FOREIGN KEY ("handlerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
