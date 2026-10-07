-- 新增 Product.isRitual：把「能否一键祭拜」从「是否免费」里拆出来。
-- 存量数据里，原来的免费祭品就是全部礼器，先按此回填。
ALTER TABLE "Product" ADD COLUMN "isRitual" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Product" SET "isRitual" = true WHERE "isFree" = true;
