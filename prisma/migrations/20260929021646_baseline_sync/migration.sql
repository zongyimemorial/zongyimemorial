-- AlterEnum
ALTER TYPE "ProductType" ADD VALUE 'subscription';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TributeType" ADD VALUE 'offering';
ALTER TYPE "TributeType" ADD VALUE 'music';

-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN     "category" TEXT,
ADD COLUMN     "embedType" TEXT NOT NULL DEFAULT 'video';

-- AlterTable
ALTER TABLE "MemorialHall" ADD COLUMN     "archive" JSONB,
ADD COLUMN     "couplet" JSONB,
ADD COLUMN     "premiumUntil" TIMESTAMP(3),
ADD COLUMN     "proofs" JSONB;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "hallInfo" JSONB;

-- AlterTable
ALTER TABLE "PointLog" ADD COLUMN     "expireAt" TIMESTAMP(3),
ADD COLUMN     "expired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isFree" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ritualMode" TEXT NOT NULL DEFAULT 'both',
ADD COLUMN     "tier" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inviteCode" TEXT,
ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "premiumUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ArticleComment" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallReservation" (
    "id" TEXT NOT NULL,
    "hallId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HallReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Genealogy" (
    "id" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "hallName" TEXT,
    "origin" TEXT,
    "lineage" TEXT,
    "migration" TEXT,
    "membersJson" JSONB,
    "chartType" TEXT NOT NULL DEFAULT 'ou',
    "chartConfig" JSONB,
    "chartUnlocked" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fileUrl" TEXT,
    "coverImage" TEXT,
    "ownerId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "status" "ModerationStatus" NOT NULL DEFAULT 'pending',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Genealogy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanHall" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "hallName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin" TEXT,
    "ancestorName" TEXT,
    "ancestorTitle" TEXT,
    "description" TEXT,
    "generationPoem" TEXT,
    "templateConfig" JSONB,
    "coverImage" TEXT,
    "archive" JSONB,
    "proofs" JSONB,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "status" "HallStatus" NOT NULL DEFAULT 'pending',
    "premiumUntil" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClanHall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'pending',
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClanPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanPostReply" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClanPostReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanActivity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "surname" TEXT,
    "kind" TEXT NOT NULL DEFAULT '祭祖大典',
    "location" TEXT NOT NULL,
    "onlineLink" TEXT,
    "coverImage" TEXT,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "signupCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClanActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanActivitySignup" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClanActivitySignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticleComment_articleId_status_idx" ON "ArticleComment"("articleId", "status");

-- CreateIndex
CREATE INDEX "HallReservation_hallId_date_idx" ON "HallReservation"("hallId", "date");

-- CreateIndex
CREATE INDEX "Genealogy_surname_idx" ON "Genealogy"("surname");

-- CreateIndex
CREATE INDEX "ClanHall_surname_status_idx" ON "ClanHall"("surname", "status");

-- CreateIndex
CREATE INDEX "ClanHall_ownerUserId_idx" ON "ClanHall"("ownerUserId");

-- CreateIndex
CREATE INDEX "ClanPost_surname_status_idx" ON "ClanPost"("surname", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClanActivitySignup_activityId_userId_key" ON "ClanActivitySignup"("activityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteCode_key" ON "User"("inviteCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallReservation" ADD CONSTRAINT "HallReservation_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "MemorialHall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallReservation" ADD CONSTRAINT "HallReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Genealogy" ADD CONSTRAINT "Genealogy_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanHall" ADD CONSTRAINT "ClanHall_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanPost" ADD CONSTRAINT "ClanPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanPostReply" ADD CONSTRAINT "ClanPostReply_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ClanPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanPostReply" ADD CONSTRAINT "ClanPostReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanActivitySignup" ADD CONSTRAINT "ClanActivitySignup_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ClanActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanActivitySignup" ADD CONSTRAINT "ClanActivitySignup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

