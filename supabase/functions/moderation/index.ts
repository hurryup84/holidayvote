// Moderation page backend (website/moderation.html): open reports with details + actions, without
// joining the vacation. Access only with a signed link (see ../_shared/moderationToken.ts), created by the
// daily report e-mail or by hand in the SQL editor (supabase/README.md "Moderation").
//   GET  → { reports: [...] }
//   POST { report, action: 'dismiss' | 'remove' | 'ban' } → { status }
// Header: x-moderation-token: <token>.  Secrets: REPORT_DIGEST_SECRET (signs the links).
// Deploy: npx supabase functions deploy moderation --no-verify-jwt
import { createClient } from '@supabase/supabase-js';
import { checkModerationToken } from '../_shared/moderationToken.ts';

const env = (k: string) => (Deno.env.get(k) ?? '').trim();
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const ORIGIN = env('WEBSITE_ORIGIN') || 'https://holidayvote.support-moidev.workers.dev';

const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-moderation-token',
  'Cache-Control': 'no-store',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// HolidayVote stores no pictures: reports carry only text (house title / link, comment text, person).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const secret = env('REPORT_DIGEST_SECRET');
  if (!secret || !(await checkModerationToken(secret, req.headers.get('x-moderation-token')?.trim()))) {
    return json({ error: 'link_invalid_or_expired' }, 401);
  }
  try {
    if (req.method === 'GET') {
      const { data, error } = await admin.rpc('moderation_report_details');
      if (error) return json({ error: error.message }, 500);
      return json({ reports: data ?? [] });
    }
    if (req.method === 'POST') {
      const { report, action } = (await req.json().catch(() => ({}))) as { report?: string; action?: string };
      if (!report || !['dismiss', 'remove', 'ban'].includes(action ?? '')) return json({ error: 'bad_request' }, 400);
      const { data, error } = await admin.rpc('moderate_report', { p_report: report, p_action: action });
      if (error) return json({ error: error.message }, 400);
      console.log('[moderation]', action, report);
      return json({ status: (data as { status: string }).status });
    }
    return json({ error: 'method' }, 405);
  } catch (e) {
    console.error('[moderation]', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
