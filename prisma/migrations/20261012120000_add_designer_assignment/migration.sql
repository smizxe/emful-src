-- Route a design request to the designer who looks after that seller.
ALTER TABLE public."DesignRequest"
    ADD COLUMN IF NOT EXISTS "assignedDesignerId" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "assignedDesignerName" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public."DesignerAssignment" (
    "id"         TEXT NOT NULL,
    "sellerId"   TEXT NOT NULL,
    "designerId" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesignerAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DesignerAssignment_sellerId_key"
    ON public."DesignerAssignment" ("sellerId");
CREATE INDEX IF NOT EXISTS "DesignerAssignment_designerId_idx"
    ON public."DesignerAssignment" ("designerId");

-- Same lockdown as the rest of the schema: Prisma connects as the owner and
-- bypasses RLS, so this only shuts the anon/authenticated PostgREST door.
ALTER TABLE public."DesignerAssignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."DesignerAssignment" FROM anon, authenticated;
