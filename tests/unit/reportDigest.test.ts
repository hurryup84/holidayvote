import { describe, expect, it } from 'vitest';
import { reportDigest } from '../../supabase/functions/_shared/reportDigest';

/** Daily report e-mail (Edge Function report-digest): only when something is new, never with content. */
const url = 'https://supabase.com/dashboard/project/x/sql/new';

describe('daily report e-mail', () => {
  it('no new reports → no e-mail', () => {
    expect(reportDigest([], 3, url)).toBeNull();
  });

  it('counts by kind and reason, plus how many are open', () => {
    const mail = reportDigest(
      [
        { target_type: 'comment', reason: 'offensive', created_at: '2026-11-09T10:00:00Z' },
        { target_type: 'comment', reason: 'spam', created_at: '2026-11-09T11:00:00Z' },
        { target_type: 'property', reason: 'offensive', created_at: '2026-11-09T12:00:00Z' },
      ],
      4,
      url,
      'https://x/moderation#t=1.ab',
    )!;
    expect(mail.subject).toBe('HolidayVote: 3 neue Meldungen');
    expect(mail.text).toContain('Art: Kommentar: 2, Ferienhaus: 1');
    expect(mail.text).toContain('Grund: anstößig: 2, Spam: 1');
    expect(mail.text).toContain('Offen insgesamt: 4');
    expect(mail.text).toContain('https://x/moderation#t=1.ab');
  });

  it('illegal content is marked urgent; no note or names are included', () => {
    const mail = reportDigest([{ target_type: 'member', reason: 'illegal', created_at: '', note: 'Oma Meier …' } as never], 1, url)!;
    expect(mail.subject).toBe('DRINGEND – HolidayVote: 1 neue Meldung');
    expect(JSON.stringify(mail)).not.toContain('Meier');
  });
});
