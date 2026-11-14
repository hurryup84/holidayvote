-- Scheduled jobs (Supabase only: pg_cron, pg_net, Vault – skipped in the PGlite tests).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule('holidayvote-purge-sync-deletes', '30 3 * * *', $$select public.purge_sync_deletes()$$);
select cron.schedule('holidayvote-prune-recovery-attempts', '40 3 * * *', $$select public.prune_recovery_attempts()$$);
select cron.schedule('holidayvote-prune-tombstones', '50 3 * * *', $$select public.prune_tombstones()$$);

-- Daily e-mail about new content reports: calls the Edge Function report-digest at 07:00 UTC. Needs two
-- Vault secrets (supabase/README.md "Report e-mail"): project_url, report_digest_secret. Without them: nothing.
select cron.schedule('holidayvote-report-digest', '0 7 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/report-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-digest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'report_digest_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'report_digest_secret')
    and exists (select 1 from vault.decrypted_secrets where name = 'project_url');
$$);
