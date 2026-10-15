-- Who makes the artwork when an imported order did not carry one.
-- '' not answered yet, 'SELLER' the seller will send it, 'EM' we design it.
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "designBy" TEXT NOT NULL DEFAULT '';
