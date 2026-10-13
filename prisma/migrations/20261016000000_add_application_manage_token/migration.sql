-- 公益纪念堂申请增加「申请人管理凭证」字段（免登录撤回/删除用）
-- 可空唯一：存量与种子行无需补值；PostgreSQL 允许多个 NULL 共存。
ALTER TABLE "PublicMemorialApplication" ADD COLUMN "manageToken" TEXT;

CREATE UNIQUE INDEX "PublicMemorialApplication_manageToken_key"
  ON "PublicMemorialApplication"("manageToken");
