-- Design requests: artwork the shop needs a designer to make or fix for a job.
-- Idempotent so it is safe to run against the live database more than once.

CREATE TABLE IF NOT EXISTS public."DesignRequest" (
    "id"           TEXT PRIMARY KEY,
    "jobId"        TEXT NOT NULL,
    "orderId"      TEXT NOT NULL,
    "orderCode"    TEXT NOT NULL,
    "sellerId"     TEXT NOT NULL,
    "sellerName"   TEXT NOT NULL DEFAULT '',
    "customerName" TEXT NOT NULL DEFAULT '',
    "sku"          TEXT NOT NULL DEFAULT '',
    "sellerSku"    TEXT NOT NULL DEFAULT '',
    "type"         TEXT NOT NULL DEFAULT 'NEW',
    "designLink"   TEXT NOT NULL DEFAULT '',
    "status"       TEXT NOT NULL DEFAULT 'PENDING',
    "fileLink"     TEXT NOT NULL DEFAULT '',
    "price"        DOUBLE PRECISION,
    "note"         TEXT NOT NULL DEFAULT '',
    "createdBy"    TEXT NOT NULL DEFAULT '',
    "finishedAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One open request per job.
CREATE UNIQUE INDEX IF NOT EXISTS "DesignRequest_jobId_key"    ON public."DesignRequest" ("jobId");
CREATE INDEX        IF NOT EXISTS "DesignRequest_sellerId_idx" ON public."DesignRequest" ("sellerId");
CREATE INDEX        IF NOT EXISTS "DesignRequest_status_idx"   ON public."DesignRequest" ("status");
CREATE INDEX        IF NOT EXISTS "DesignRequest_orderId_idx"  ON public."DesignRequest" ("orderId");

-- Lock it down from the start. Tables added by hand previously missed this and
-- tripped Supabase's "Table publicly accessible" alert. Prisma (owner) and the
-- service role both bypass RLS, so the app is unaffected.
ALTER TABLE public."DesignRequest" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON public."DesignRequest" FROM anon;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON public."DesignRequest" FROM authenticated;';
    END IF;
END $$;
