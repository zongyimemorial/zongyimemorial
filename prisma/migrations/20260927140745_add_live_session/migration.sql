-- CreateEnum
CREATE TYPE "LiveStatus" AS ENUM ('scheduled', 'live', 'ended');

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImage" TEXT,
    "status" "LiveStatus" NOT NULL DEFAULT 'scheduled',
    "streamUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "watchCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);
