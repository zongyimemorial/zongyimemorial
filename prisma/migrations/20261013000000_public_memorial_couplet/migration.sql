-- ============================================================================
-- 公益纪念堂·挽联配置
--
-- PublicMemorial 增加 couplet（JSONB）：上联 / 下联 / 横批，
-- 与收费纪念馆 MemorialHall.couplet 同结构，由平台在馆务管理页统一配置。
--
-- 幂等：列用 DO $$ 守卫（ADD COLUMN 若已存在则跳过）。
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE "PublicMemorial" ADD COLUMN "couplet" JSONB;
EXCEPTION WHEN duplicate_column THEN null; END $$;
