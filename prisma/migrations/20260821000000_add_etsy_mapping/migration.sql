-- Etsy direct-import per-seller mapping tables (idempotent).

CREATE TABLE IF NOT EXISTS "EtsyDesignMap" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "etsySku" TEXT NOT NULL,
    "designLink" TEXT NOT NULL,
    "position" TEXT NOT NULL DEFAULT 'CENTER_CHEST',
    "mockup" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'Embroidery',
    "productSku" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EtsyDesignMap_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EtsyDesignMap_sellerId_etsySku_key" ON "EtsyDesignMap"("sellerId", "etsySku");
CREATE INDEX IF NOT EXISTS "EtsyDesignMap_sellerId_idx" ON "EtsyDesignMap"("sellerId");

CREATE TABLE IF NOT EXISTS "EtsyStyleMap" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EtsyStyleMap_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EtsyStyleMap_sellerId_style_key" ON "EtsyStyleMap"("sellerId", "style");
CREATE INDEX IF NOT EXISTS "EtsyStyleMap_sellerId_idx" ON "EtsyStyleMap"("sellerId");

CREATE TABLE IF NOT EXISTS "EtsyColorMap" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "etsyColor" TEXT NOT NULL,
    "internalColor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EtsyColorMap_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EtsyColorMap_sellerId_etsyColor_key" ON "EtsyColorMap"("sellerId", "etsyColor");
CREATE INDEX IF NOT EXISTS "EtsyColorMap_sellerId_idx" ON "EtsyColorMap"("sellerId");
