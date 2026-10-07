-- ============================================================================
-- 服务受理（人工服务类商品的履约载体）
--
-- 商品「云祭扫服务」「纪念服务（传记/追思会/视频/云碑等，非电子讣告）」购买/积分兑换后，
-- 平台没有自动履约能力（人工服务），故支付成功后自动建一张 `pending` 受理单，
-- 用户随后在控制台「我的服务」提交需求资料，管理员在后台「服务工单」受理/完成。
--
-- 范围：isServiceProduct(p) = p.type === "cloud_worship"
--        || (p.type === "memorial_service" && p.slug !== "e-obituary")
-- 电子讣告（e-obituary）走自身 ObituaryQuota 通道，不在此表。
-- ============================================================================

CREATE TABLE "ServiceFulfillment" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "orderId"      TEXT,
    "redemptionId" TEXT,
    "productId"    TEXT,
    -- 去规范化：slug / productName / type 冗余落库，便于后台工单展示与路由
    "slug"         TEXT NOT NULL,
    "productName"  TEXT NOT NULL,
    "type"         TEXT NOT NULL,
    -- pending（待提交/待受理）| processing（受理中）| done（已完成）| rejected（已驳回）
    "status"       TEXT NOT NULL DEFAULT 'pending',
    "intake"       TEXT,
    "contact"      TEXT,
    "adminNote"    TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceFulfillment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceFulfillment_userId_createdAt_idx" ON "ServiceFulfillment"("userId", "createdAt");
CREATE INDEX "ServiceFulfillment_status_idx" ON "ServiceFulfillment"("status");

-- 用户注销则受理单随用户删除（Cascade，与全站用户副产物口径一致）
ALTER TABLE "ServiceFulfillment" ADD CONSTRAINT "ServiceFulfillment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 关联订单被删则受理单保留、归属清空（SET NULL）——「删单不删受理记录」
ALTER TABLE "ServiceFulfillment" ADD CONSTRAINT "ServiceFulfillment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 关联商品下架/删除则受理单保留、商品归属清空（SET NULL）
ALTER TABLE "ServiceFulfillment" ADD CONSTRAINT "ServiceFulfillment_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 注：redemptionId 不建外键 —— PointRedemption 可能被删，仅存 id 字符串供溯源。
