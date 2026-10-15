-- One finished file per position on a design request, so a job with a centre
-- chest and a sleeve gets a link for each instead of only the first.
ALTER TABLE public."DesignRequest" ADD COLUMN IF NOT EXISTS "fileLinks" TEXT NOT NULL DEFAULT '[]';
