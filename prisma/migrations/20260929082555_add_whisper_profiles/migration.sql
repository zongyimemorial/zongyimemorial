-- CreateTable
CREATE TABLE "WhisperProfile" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "hallId" TEXT NOT NULL,
    "personaName" TEXT NOT NULL,
    "personTitle" TEXT,
    "bio" TEXT,
    "traits" JSONB,
    "speechStyle" JSONB,
    "memories" JSONB,
    "relationships" JSONB,
    "systemPrompt" TEXT,
    "promptVersion" INTEGER NOT NULL DEFAULT 1,
    "voiceId" TEXT,
    "avatarId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'voice',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "HallStatus" NOT NULL DEFAULT 'pending',
    "engineLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhisperProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhisperVoice" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerVoiceId" TEXT,
    "sampleUrl" TEXT,
    "sampleSeconds" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failReason" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "points" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhisperVoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhisperAvatar" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "style" TEXT NOT NULL DEFAULT 'portrait',
    "imageUrl" TEXT,
    "preset" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "points" INTEGER,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhisperAvatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhisperSession" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'voice',
    "minutesUsed" INTEGER NOT NULL DEFAULT 0,
    "roundsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "WhisperSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhisperMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "audioUrl" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiLabel" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhisperMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhisperConsent" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "applicantName" TEXT NOT NULL,
    "applicantIdNo" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "relationProof" TEXT,
    "otherHeirsAck" BOOLEAN NOT NULL DEFAULT false,
    "deceasedWill" TEXT,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "WhisperConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhisperQuota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "monthlyMins" INTEGER NOT NULL DEFAULT 30,
    "usedMins" INTEGER NOT NULL DEFAULT 0,
    "monthlyRounds" INTEGER NOT NULL DEFAULT 30,
    "usedRounds" INTEGER NOT NULL DEFAULT 0,
    "extraMins" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhisperQuota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhisperProfile_hallId_key" ON "WhisperProfile"("hallId");

-- CreateIndex
CREATE INDEX "WhisperProfile_ownerUserId_idx" ON "WhisperProfile"("ownerUserId");

-- CreateIndex
CREATE INDEX "WhisperProfile_status_idx" ON "WhisperProfile"("status");

-- CreateIndex
CREATE INDEX "WhisperVoice_profileId_idx" ON "WhisperVoice"("profileId");

-- CreateIndex
CREATE INDEX "WhisperAvatar_profileId_idx" ON "WhisperAvatar"("profileId");

-- CreateIndex
CREATE INDEX "WhisperSession_profileId_userId_idx" ON "WhisperSession"("profileId", "userId");

-- CreateIndex
CREATE INDEX "WhisperSession_userId_createdAt_idx" ON "WhisperSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WhisperMessage_sessionId_createdAt_idx" ON "WhisperMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhisperConsent_profileId_key" ON "WhisperConsent"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "WhisperQuota_userId_key" ON "WhisperQuota"("userId");

-- AddForeignKey
ALTER TABLE "WhisperProfile" ADD CONSTRAINT "WhisperProfile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhisperProfile" ADD CONSTRAINT "WhisperProfile_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "MemorialHall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhisperVoice" ADD CONSTRAINT "WhisperVoice_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WhisperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhisperAvatar" ADD CONSTRAINT "WhisperAvatar_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WhisperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhisperSession" ADD CONSTRAINT "WhisperSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WhisperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhisperSession" ADD CONSTRAINT "WhisperSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhisperMessage" ADD CONSTRAINT "WhisperMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhisperSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhisperConsent" ADD CONSTRAINT "WhisperConsent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WhisperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhisperQuota" ADD CONSTRAINT "WhisperQuota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

