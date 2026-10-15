-- Run this in Supabase SQL editor after deploying the Edge Function.
-- Replace the placeholder secret once with the same value as EDGE_SYNC_SECRET.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- If the secret already exists, skip the next line or rotate it manually in Supabase Vault.
select vault.create_secret(
  'REPLACE_WITH_EDGE_SYNC_SECRET',
  'shipping_status_sync_secret'
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'sync-shipping-status-hourly';

select cron.schedule(
  'sync-shipping-status-hourly',
  '0 * * * *',
  $$
  select
    net.http_post(
      url := 'https://your-project-ref.supabase.co/functions/v1/sync-shipping-status',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'shipping_status_sync_secret')
      ),
      body := jsonb_build_object(
        'source', 'cron'
      )
    );
  $$
);
