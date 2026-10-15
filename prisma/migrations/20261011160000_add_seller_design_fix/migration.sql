-- Designs the shop has corrected for a seller, remembered against that seller's
-- own SKU so they can look the fixed file up next time.
CREATE TABLE IF NOT EXISTS public."SellerDesignFix" (
    "id"        TEXT NOT NULL,
    "sellerId"  TEXT NOT NULL,
    "sellerSku" TEXT NOT NULL,
    "fileLink"  TEXT NOT NULL,
    "sku"       TEXT NOT NULL DEFAULT '',
    "orderCode" TEXT NOT NULL DEFAULT '',
    "note"      TEXT NOT NULL DEFAULT '',
    "jobId"     TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SellerDesignFix_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SellerDesignFix_sellerId_sellerSku_key"
    ON public."SellerDesignFix" ("sellerId", "sellerSku");
CREATE INDEX IF NOT EXISTS "SellerDesignFix_sellerId_idx"
    ON public."SellerDesignFix" ("sellerId");

-- Same lockdown every other table in this schema has: Prisma connects as the
-- owner and bypasses RLS, so this only shuts the anon/authenticated PostgREST
-- door. Leaving it off is what tripped the Supabase rls_disabled_in_public alert.
ALTER TABLE public."SellerDesignFix" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."SellerDesignFix" FROM anon, authenticated;
