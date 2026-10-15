-- Etsy listing photos as mockup links, per seller, from the listings file they
-- keep current. Only SKU and IMAGE1 are taken from that file.
CREATE TABLE IF NOT EXISTS public."ListingMockupFile" (
    "id"         TEXT NOT NULL,
    "sellerId"   TEXT NOT NULL,
    "fileName"   TEXT NOT NULL,
    "rowCount"   INTEGER NOT NULL DEFAULT 0,
    "skuCount"   INTEGER NOT NULL DEFAULT 0,
    "uploadedBy" TEXT NOT NULL DEFAULT '',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingMockupFile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ListingMockupFile_sellerId_key" ON public."ListingMockupFile" ("sellerId");

CREATE TABLE IF NOT EXISTS public."ListingMockup" (
    "id"        TEXT NOT NULL,
    "sellerId"  TEXT NOT NULL,
    "skuKey"    TEXT NOT NULL,
    "sku"       TEXT NOT NULL,
    "imageUrl"  TEXT NOT NULL,
    "images"    TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingMockup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ListingMockup_sellerId_skuKey_key" ON public."ListingMockup" ("sellerId", "skuKey");
CREATE INDEX IF NOT EXISTS "ListingMockup_sellerId_idx" ON public."ListingMockup" ("sellerId");

-- Same lockdown as every other table in this schema.
ALTER TABLE public."ListingMockupFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ListingMockup" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ListingMockupFile" FROM anon, authenticated;
REVOKE ALL ON public."ListingMockup" FROM anon, authenticated;
