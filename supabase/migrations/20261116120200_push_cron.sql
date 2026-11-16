-- House-addition push notifications: every 5 minutes, call the Edge Function push-houses
-- to send any due iOS notifications. Android not yet (phones poll locally or nothing).
select cron.schedule('holidayvote-push-houses', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/push-houses',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'report_digest_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where jsonb_array_length(public.push_due_house()) > 0
    and exists (select 1 from vault.decrypted_secrets where name = 'report_digest_secret')
    and exists (select 1 from vault.decrypted_secrets where name = 'project_url')
$$);
