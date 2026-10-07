-- AlterEnum
ALTER TYPE "ProductType" ADD VALUE 'physical_goods';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shipStatus" TEXT,
ADD COLUMN     "shippingAddress" JSONB;
