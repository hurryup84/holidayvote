// Daily e-mail about new content reports (Edge Function report-digest). Deliberately without content:
// no house titles, comments or names leave the database – only how many, what kind and why.
export interface ReportRow {
  target_type: string;
  reason: string;
  created_at: string;
}

const TARGET: Record<string, string> = { property: 'Ferienhaus', comment: 'Kommentar', member: 'Person' };
const REASON: Record<string, string> = { offensive: 'anstößig', illegal: 'rechtswidrig', spam: 'Spam', other: 'sonstiges' };

export function reportDigest(
  rows: ReportRow[],
  openCount: number,
  sqlEditorUrl: string,
  moderationUrl?: string,
): { subject: string; text: string } | null {
  if (!rows.length) return null;
  const count = (key: (r: ReportRow) => string, names: Record<string, string>) =>
    Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => ((acc[key(r)] = (acc[key(r)] ?? 0) + 1), acc), {}),
    )
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${names[k] ?? k}: ${n}`)
      .join(', ');
  const illegal = rows.some((r) => r.reason === 'illegal');
  return {
    subject: `${illegal ? 'DRINGEND – ' : ''}HolidayVote: ${rows.length} neue Meldung${rows.length === 1 ? '' : 'en'}`,
    text: [
      `Seit der letzten E-Mail ${rows.length === 1 ? 'ist 1 neue Meldung' : `sind ${rows.length} neue Meldungen`} eingegangen.`,
      `Art: ${count((r) => r.target_type, TARGET)}`,
      `Grund: ${count((r) => r.reason, REASON)}`,
      `Offen insgesamt: ${openCount}`,
      '',
      'Bitte innerhalb von 24 Stunden prüfen (App Store / Google Play erwarten das):',
      ...(moderationUrl ? [`Ansehen und entscheiden (Link 7 Tage gültig): ${moderationUrl}`, '', 'Oder im SQL-Editor:'] : []),
      `${sqlEditorUrl}`,
      '  select * from moderation_queue;',
      "  -- entfernen / sperren: select moderate_report('<id>', 'remove' | 'ban' | 'dismiss');",
      "  -- erledigt:  update content_reports set status = 'removed' | 'dismissed', handled_at = now() where id = '<id>';",
    ].join('\n'),
  };
}
