-- ============================================================
-- 午夜悄悄话：纯语音收敛 + 伦理审查 + 情感状态标记
--
-- 背景：按《"午夜悄悄话"纯语音对话系统规划设计方案》，
--       产品明确定位为「纯语音对话系统」，不做数字人形象。
--       数字人形象（口型/面部合成）涉及深度合成高风险，
--       在逝者场景下伦理与合规成本远超收益，故整体移除。
--
-- 本迁移：
--   1) 删除 WhisperAvatar 表与 WhisperProfile.avatarId 字段
--   2) WhisperProfile 新增伦理审查四字段
--   3) WhisperSession 新增 mood / moodNote
--   4) mode 字段保留（预留 voice），历史 'avatar' 值归一为 'voice'
-- ============================================================

-- 1) 删除数字人形象
ALTER TABLE "WhisperProfile" DROP COLUMN IF EXISTS "avatarId";
DROP TABLE IF EXISTS "WhisperAvatar";

-- 2) 伦理审查字段（涉及声音克隆时必须走伦理审查）
ALTER TABLE "WhisperProfile"
  ADD COLUMN IF NOT EXISTS "ethicsStatus"     TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS "ethicsReviewer"   TEXT,
  ADD COLUMN IF NOT EXISTS "ethicsReviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ethicsNote"       TEXT;

-- 3) 情感状态标记
ALTER TABLE "WhisperSession"
  ADD COLUMN IF NOT EXISTS "mood"     TEXT,
  ADD COLUMN IF NOT EXISTS "moodNote" TEXT;

-- 4) mode 归一：历史会话若为 avatar 模式，回落到 voice
UPDATE "WhisperSession" SET "mode" = 'voice' WHERE "mode" <> 'voice';
UPDATE "WhisperProfile" SET "mode" = 'voice' WHERE "mode" <> 'voice';
