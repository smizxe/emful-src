-- Add suspend / ban fields for user access control
ALTER TABLE "User"
ADD COLUMN "isBanned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "bannedAt" TIMESTAMP(3),
ADD COLUMN "bannedReason" TEXT,
ADD COLUMN "suspendedUntil" TIMESTAMP(3),
ADD COLUMN "suspensionReason" TEXT;
