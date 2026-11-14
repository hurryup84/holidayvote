// Once a day (pg_cron, migration *_report_digest_cron.sql): an e-mail if new content reports came in
// since the last one – so they get handled within 24 h (App Store guideline 1.2, Google Play UGC policy).
// No e-mail on days without new reports. The e-mail contains no report content (see reportDigest.ts).
//
// Secrets (npx supabase secrets set …):
//   REPORT_DIGEST_SECRET  random string; the same value goes into the Vault (see supabase/README.md)
//   RESEND_API_KEY        https://resend.com (free: 100 e-mails/day)
//   REPORT_EMAIL_TO       where the e-mail goes (without own domain: the address of the Resend account)
//   REPORT_EMAIL_FROM     optional, e.g. "HolidayVote <reports@your-domain>" (default: onboarding@resend.dev)
// Deploy: npx supabase functions deploy report-digest --no-verify-jwt
import { createClient } from '@supabase/supabase-js';
import { createModerationToken } from '../_shared/moderationToken.ts';
import { reportDigest, type ReportRow } from '../_shared/reportDigest.ts';

// Trimmed: a line break pasted along with a secret made fetch() throw ("invalid header value").
const env = (k: string) => (Deno.env.get(k) ?? '').trim();
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const projectRef = new URL(env('SUPABASE_URL')).hostname.split('.')[0];

Deno.serve(async (req) => {
  if (!env('REPORT_DIGEST_SECRET') || req.headers.get('x-digest-secret')?.trim() !== env('REPORT_DIGEST_SECRET')) {
    return new Response('unauthorized', { status: 401 });
  }
  try {
    return await digest();
  } catch (e) {
    // The text ends up in net._http_response.content – visible from the SQL editor.
    console.error('[report-digest]', e);
    return new Response(`report-digest failed: ${String((e as Error)?.stack ?? e)}`, { status: 500 });
  }
});

async function digest(): Promise<Response> {
  for (const k of ['RESEND_API_KEY', 'REPORT_EMAIL_TO']) {
    if (!env(k)) return new Response(`missing secret ${k}`, { status: 500 });
  }
  // The key goes into an HTTP header: only plain ASCII. "…" from an example, typographic quotes or an
  // invisible character copied along make fetch() fail ("not a valid ByteString").
  if (!/^[\x21-\x7e]+$/.test(env('RESEND_API_KEY'))) {
    return new Response('RESEND_API_KEY contains characters that are not allowed (e.g. "…", quotes, spaces) – set it again: npx supabase secrets set RESEND_API_KEY=re_xxxxxxxx', { status: 500 });
  }
  // Since the last sent e-mail; none sent yet (first run, or every run failed so far): all reports.
  const { data: cfg } = await admin.from('app_config').select('value').eq('key', 'report_digest_last_at').maybeSingle();
  const since = typeof cfg?.value === 'string' ? cfg.value : '1970-01-01T00:00:00Z';
  const now = new Date().toISOString();

  const { data: rows, error } = await admin
    .from('content_reports')
    .select('target_type, reason, created_at')
    .gt('created_at', since)
    .lte('created_at', now);
  if (error) return new Response(`reports query failed: ${error.message}`, { status: 500 });
  const { count: open } = await admin.from('content_reports').select('id', { count: 'exact', head: true }).eq('status', 'open');

  const site = env('WEBSITE_ORIGIN') || 'https://holidayvote.support-moidev.workers.dev';
  const pageUrl = `${site}/moderation#t=${await createModerationToken(env('REPORT_DIGEST_SECRET'))}`;
  const mail = reportDigest((rows ?? []) as ReportRow[], open ?? 0, `https://supabase.com/dashboard/project/${projectRef}/sql/new`, pageUrl);
  if (!mail) return new Response('no new reports');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env('REPORT_EMAIL_FROM') || 'HolidayVote <onboarding@resend.dev>',
      to: [env('REPORT_EMAIL_TO')],
      subject: mail.subject,
      text: mail.text,
    }),
  });
  if (!res.ok) {
    // Not marked as sent → tomorrow's e-mail includes these reports again.
    const detail = await res.text();
    console.error('[report-digest] e-mail failed', res.status, detail);
    return new Response(`e-mail failed (Resend ${res.status}): ${detail}`, { status: 502 });
  }
  const { error: saveError } = await admin.from('app_config').upsert({ key: 'report_digest_last_at', value: now });
  if (saveError) console.error('[report-digest] could not save the time of this e-mail', saveError.message);
  console.log('[report-digest] sent', rows?.length, 'new,', open, 'open');
  return new Response('sent');
}
