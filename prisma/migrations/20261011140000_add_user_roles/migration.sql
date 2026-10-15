-- A user can hold more than one role (e.g. staff who also designs).
-- `role` stays the primary role so existing checks and the session cookie keep
-- working; `roles` lists everything they hold. Empty means "just the primary".
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
