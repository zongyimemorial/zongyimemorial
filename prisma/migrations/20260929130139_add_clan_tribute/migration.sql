-- CreateEnum
CREATE TYPE "ClanOfferingType" AS ENUM ('incense', 'flower', 'candle', 'offering', 'wine', 'message', 'music');

-- CreateTable
CREATE TABLE "ClanTribute" (
    "id" TEXT NOT NULL,
    "clanHallId" TEXT NOT NULL,
    "userId" TEXT,
    "productId" TEXT,
    "type" "ClanOfferingType" NOT NULL DEFAULT 'incense',
    "displayName" TEXT NOT NULL,
    "realNameSnap" TEXT,
    "contactSnap" TEXT,
    "amountFen" INTEGER NOT NULL DEFAULT 0,
    "pointsCost" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClanTribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClanTribute_clanHallId_createdAt_idx" ON "ClanTribute"("clanHallId", "createdAt");

-- CreateIndex
CREATE INDEX "ClanTribute_userId_createdAt_idx" ON "ClanTribute"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClanTribute" ADD CONSTRAINT "ClanTribute_clanHallId_fkey" FOREIGN KEY ("clanHallId") REFERENCES "ClanHall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanTribute" ADD CONSTRAINT "ClanTribute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanTribute" ADD CONSTRAINT "ClanTribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

