// New house added to a vacation: notify all other participants via Apple Push (iOS) or Firebase Cloud Messaging (Android).
// Called by pg_cron (migration *_push_cron.sql) every 5 minutes when something is due.
//
// Secrets (npx supabase secrets set …):
//   REPORT_DIGEST_SECRET  the cron secret (shared with report-digest)
//   APNS_KEY_P8           content of AuthKey_XXXXXXXXXX.p8
//   APNS_KEY_ID           the 10-character Key ID
//   APNS_TEAM_ID          the 10-character Team ID
//   FIREBASE_SERVICE_ACCOUNT  service-account JSON (project_id, client_email, private_key)
// Deploy: npx supabase functions deploy push-houses --no-verify-jwt
import { createClient } from '@supabase/supabase-js';
import { apnsJwt, apnsPayload, sendApns, type ApnsEnvironment, type SendResult } from '../_shared/apns.ts';
import { createFcmClient, type FcmResult } from '../_shared/fcm.ts';

const env = (k: string) => (Deno.env.get(k) ?? '').trim();
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const TOPIC = 'com.moidev.holidayvote'; // the app's bundle id
let fcm: ReturnType<typeof createFcmClient> | undefined;

interface Due {
  device_id: string;
  token: string;
  environment: ApnsEnvironment | null;
  platform: 'ios' | 'android';
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
  const { data, error } = await admin.rpc('push_due_house');
  if (error) return new Response(`push_due_house failed: ${error.message}`, { status: 500 });
  const due = (data ?? []) as Due[];
  if (!due.length) return new Response('nothing due');

  let sent = 0;
  let gone = 0;
  let failed = 0;

  let jwt: Promise<string> | undefined;

  for (const d of due) {
    try {
      let r: SendResult | FcmResult;
      if (d.platform === 'ios') {
        for (const key of ['APNS_KEY_P8', 'APNS_KEY_ID', 'APNS_TEAM_ID']) {
          if (!env(key)) throw new Error(`Missing secret ${key}`);
        }
        jwt ??= apnsJwt(env('APNS_KEY_P8'), env('APNS_KEY_ID'), env('APNS_TEAM_ID'));
        r = await sendApns({
          token: d.token,
          environment: d.environment,
          jwt: await jwt,
          topic: TOPIC,
          payload: apnsPayload(d.title, d.body, d.route),
          collapseId: `house-${d.local_date}`,
        });
      } else if (d.platform === 'android') {
        if (!env('FIREBASE_SERVICE_ACCOUNT')) throw new Error('Missing secret FIREBASE_SERVICE_ACCOUNT');
        fcm ??= createFcmClient(env('FIREBASE_SERVICE_ACCOUNT'));
        r = await fcm.send(d);
      } else {
        throw new Error('Missing or unsupported push platform; apply the Android push migration');
      }
      if (r.ok) {
        const { error } = await admin.rpc('push_mark_sent', {
          p_device: d.device_id, p_kind: d.kind, p_date: d.local_date,
          p_environment: 'environment' in r ? r.environment : null,
        });
        if (error) throw new Error(`push_mark_sent: ${error.message}`);
        sent++;
      } else if (r.gone) {
        const { error } = await admin.rpc('push_forget_device', { p_device: d.device_id });
        if (error) throw new Error(`push_forget_device: ${error.message}`);
        gone++;
      } else {
        console.error('[push-houses]', d.platform, r.status, r.reason);
        failed++;
      }
    } catch (e) {
      console.error('[push-houses]', d.platform, d.device_id, e);
      failed++;
    }
  }
  console.log('[push-houses]', due.length, 'due,', sent, 'sent,', gone, 'gone,', failed, 'failed');
  return new Response(`${sent} sent, ${gone} gone, ${failed} failed`, { status: failed ? 500 : 200 });
}
