-- Re-apply the public-schema lockdown.
--
-- 20260408170000_lock_down_public_schema_rls enabled RLS on every table that
-- existed at the time. Tables added afterwards (ApiKey, EtsyColorMap,
-- EtsyDesignMap, EtsyStyleMap) were created directly with SQL and so missed it,
-- and Supabase's default privileges granted anon/authenticated access to them -
-- which is what tripped Supabase's "Table publicly accessible / rls_disabled_in_public"
-- alert. ApiKey in particular stores seller API key hashes.
--
-- This re-runs the same lockdown (idempotent) and additionally fixes the default
-- privileges, so any table created from now on is locked down automatically.
--
-- Safe for the app: Prisma connects as the table owner (postgres) and the edge
-- functions use the service role - both bypass RLS. Only anonymous PostgREST
-- access is blocked, which is the point.

DO $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename <> '_prisma_migrations'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', table_record.tablename);
    END LOOP;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;';
        EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated;';
        EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated;';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;';
    END IF;
END $$;
