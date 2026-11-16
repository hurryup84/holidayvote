// New house added to a vacation: notify all other participants via Apple Push.
// Called by pg_cron (migration *_push_cron.sql) every 5 minutes when something is due.
// Android doesn't use this yet.
//
// Secrets (npx supabase secrets set …):
//   REPORT_DIGEST_SECRET  the cron secret (shared with report-digest)
//   APNS_KEY_P8           content of AuthKey_XXXXXXXXXX.p8
//   APNS_KEY_ID           the 10-character Key ID
//   APNS_TEAM_ID          the 10-character Team ID
// Deploy: npx supabase functions deploy push-houses --no-verify-jwt
import { createClient } from '@supabase/supabase-js';
import { apnsJwt, apnsPayload, sendApns, type ApnsEnvironment } from '../_shared/apns.ts';

const env = (k: string) => (Deno.env.get(k) ?? '').trim();
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const TOPIC = 'com.moidev.holidayvote'; // the app's bundle id

interface Due {
  device_id: string;
  token: string;
  environment: ApnsEnvironment | null;
  kind: string;
  local_date: string;
  title: string;
  body: string;
  route: string;
}

Deno.serve(async (req) => {
  if (!env('REPORT_DIGEST_SECRET') || req.headers.get('x-cron-secret')?.trim() !== env('REPORT_DIGEST_SECRET')) {
    return new Response('unauthorized', { status: 401 });
  }
  try {
    return await run();
  } catch (e) {
    console.error('[push-houses]', e);
    return new Response(`push-houses failed: ${String((e as Error)?.stack ?? e)}`, { status: 500 });
  }
});

async function run(): Promise<Response> {
  for (const k of ['APNS_KEY_P8', 'APNS_KEY_ID', 'APNS_TEAM_ID']) {
    if (!env(k)) return new Response(`missing secret ${k}`, { status: 500 });
  }
  const { data, error } = await admin.rpc('push_due_house');
  if (error) return new Response(`push_due_house failed: ${error.message}`, { status: 500 });
  const due = (data ?? []) as Due[];
  if (!due.length) return new Response('nothing due');

  const jwt = await apnsJwt(env('APNS_KEY_P8'), env('APNS_KEY_ID'), env('APNS_TEAM_ID'));
  let sent = 0;
  let gone = 0;
  for (const d of due) {
    const r = await sendApns({
      token: d.token,
      environment: d.environment,
      jwt,
      topic: TOPIC,
      payload: apnsPayload(d.title, d.body, d.route),
      collapseId: `house-${d.local_date}`,
    });
    if (r.ok) {
      sent++;
      await admin.rpc('push_mark_sent', { p_device: d.device_id, p_kind: d.kind, p_date: d.local_date, p_environment: r.environment });
    } else if (r.gone) {
      gone++;
      await admin.rpc('push_forget_device', { p_device: d.device_id });
    } else {
      console.error('[push-houses] APNs', r.status, r.reason);
    }
  }
  console.log('[push-houses]', due.length, 'due,', sent, 'sent,', gone, 'gone');
  return new Response(`${sent} sent, ${gone} gone, ${due.length - sent - gone} failed`);
}
