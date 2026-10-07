-- 纪念馆追思记录：补上身份快照（displayName / realNameSnap / contactSnap）
--
-- 背景（隐私缺陷修复）：
--   MemorialTribute 早先没有快照字段，前台为了显示"是谁献祭的"，
--   只能 include 活用户表读取 User.realName 并**原样渲染**，
--   于是任何访客打开纪念馆都能看到献祭者的完整真实姓名。
--   宗祠侧的 ClanTribute 早已用"冻结快照 + 前台只读 displayName"解决，
--   这次把纪念馆拉到同一口径。
--
-- 只新增列，不改动现有列 → 对正在运行的旧代码完全向后兼容。
-- 上线顺序：加列 → 回填历史 → 再切换读路径（读路径在应用层，无需停机）。

ALTER TABLE "MemorialTribute" ADD COLUMN "displayName" TEXT NOT NULL DEFAULT '匿名宗亲';
ALTER TABLE "MemorialTribute" ADD COLUMN "realNameSnap" TEXT;
ALTER TABLE "MemorialTribute" ADD COLUMN "contactSnap" TEXT;

-- ---------- 回填历史记录 ----------
--
-- 规则与 lib/mask.ts 的 maskIdentity() 严格一致，优先级 realName > phone > email > '匿名宗亲'。
-- 三个坑：
--   1) 中文名脱敏规则：2 字 → 首字 + '*'；3 字 → 首 + '*' + 尾；≥4 字 → 首 + '*'*(n-2) + 尾。
--      用 PostgreSQL 的字符语义（LEFT/RIGHT 按字符而非字节）实现，避免多字节姓名被切坏。
--   2) 没有 userId 或用户已被删除的记录 → 保持默认值 '匿名宗亲'，**绝不留空**
--      （空字符串会在页面上渲染成"只有图标没有名字"的记录）。
--   3) phrase 含 CJK 时走中文规则，否则走拉丁规则（首字母 + 最多 3 个 '*'）。

-- 先回填快照（完整值），仅供馆主/管理台使用
UPDATE "MemorialTribute" t
SET "realNameSnap" = NULLIF(BTRIM(u."realName"), '')
FROM "User" u
WHERE t."userId" = u."id" AND NULLIF(BTRIM(u."realName"), '') IS NOT NULL;

UPDATE "MemorialTribute" t
SET "contactSnap" = COALESCE(
      NULLIF(BTRIM(u."phone"), ''),
      NULLIF(BTRIM(u."email"), '')
    )
FROM "User" u
WHERE t."userId" = u."id";

-- 再回填脱敏展示名（中文名）
UPDATE "MemorialTribute" t
SET "displayName" = CASE
      WHEN CHAR_LENGTH(BTRIM(u."realName")) <= 1 THEN BTRIM(u."realName")
      WHEN CHAR_LENGTH(BTRIM(u."realName")) = 2
        THEN LEFT(BTRIM(u."realName"), 1) || '*'
      WHEN CHAR_LENGTH(BTRIM(u."realName")) = 3
        THEN LEFT(BTRIM(u."realName"), 1) || '*' || RIGHT(BTRIM(u."realName"), 1)
      ELSE LEFT(BTRIM(u."realName"), 1)
           || REPEAT('*', CHAR_LENGTH(BTRIM(u."realName")) - 2)
           || RIGHT(BTRIM(u."realName"), 1)
    END
FROM "User" u
WHERE t."userId" = u."id"
  AND NULLIF(BTRIM(u."realName"), '') IS NOT NULL
  AND BTRIM(u."realName") ~ '[\u4e00-\u9fa5]';

-- 拉丁/英文名：首字母 + 最多 3 个 '*'
UPDATE "MemorialTribute" t
SET "displayName" = CASE
      WHEN CHAR_LENGTH(BTRIM(u."realName")) <= 1 THEN BTRIM(u."realName")
      WHEN CHAR_LENGTH(BTRIM(u."realName")) = 2
        THEN LEFT(BTRIM(u."realName"), 1) || '*'
      ELSE LEFT(BTRIM(u."realName"), 1)
           || REPEAT('*', LEAST(CHAR_LENGTH(BTRIM(u."realName")) - 1, 3))
    END
FROM "User" u
WHERE t."userId" = u."id"
  AND NULLIF(BTRIM(u."realName"), '') IS NOT NULL
  AND BTRIM(u."realName") !~ '[\u4e00-\u9fa5]';

-- 无实名 → 退手机号：「13812345678」→「138****5678」
UPDATE "MemorialTribute" t
SET "displayName" = CASE
      WHEN CHAR_LENGTH(REGEXP_REPLACE(u."phone", '\D', '', 'g')) < 7
        THEN CASE
               WHEN CHAR_LENGTH(REGEXP_REPLACE(u."phone", '\D', '', 'g')) <= 3
                 THEN REPEAT('*', CHAR_LENGTH(REGEXP_REPLACE(u."phone", '\D', '', 'g')))
               ELSE LEFT(REGEXP_REPLACE(u."phone", '\D', '', 'g'), 3) || '****'
             END
      ELSE LEFT(REGEXP_REPLACE(u."phone", '\D', '', 'g'), 3)
           || '****'
           || RIGHT(REGEXP_REPLACE(u."phone", '\D', '', 'g'), 4)
    END
FROM "User" u
WHERE t."userId" = u."id"
  AND NULLIF(BTRIM(u."realName"), '') IS NULL
  AND NULLIF(BTRIM(u."phone"), '') IS NOT NULL;

-- 无实名无手机 → 退邮箱：「user@test.com」→「us***@test.com」
UPDATE "MemorialTribute" t
SET "displayName" = CASE
      WHEN POSITION('@' IN BTRIM(u."email")) <= 1
        THEN LEFT(BTRIM(u."email"), 1)
             || REPEAT('*', LEAST(GREATEST(CHAR_LENGTH(BTRIM(u."email")) - 1, 1), 3))
      ELSE LEFT(BTRIM(u."email"), 2)
           || REPEAT('*', GREATEST(3, LEAST(GREATEST(CHAR_LENGTH(SPLIT_PART(BTRIM(u."email"), '@', 1)) - 2, 1), 4)))
           || SUBSTRING(BTRIM(u."email") FROM POSITION('@' IN BTRIM(u."email")))
    END
FROM "User" u
WHERE t."userId" = u."id"
  AND NULLIF(BTRIM(u."realName"), '') IS NULL
  AND NULLIF(BTRIM(u."phone"), '') IS NULL
  AND NULLIF(BTRIM(u."email"), '') IS NOT NULL;

-- 兜底：仍未回填（无 userId / 用户已删 / 身份全空）的一律标记为匿名，
-- 保证 displayName 永远非空、页面上不会出现"无名记录"。
UPDATE "MemorialTribute"
SET "displayName" = '匿名宗亲'
WHERE "displayName" IS NULL OR BTRIM("displayName") = '';

-- 常用查询：按馆查记录、按人查记录
CREATE INDEX "MemorialTribute_hallId_createdAt_idx" ON "MemorialTribute"("hallId", "createdAt");
CREATE INDEX "MemorialTribute_userId_createdAt_idx" ON "MemorialTribute"("userId", "createdAt");
