const KNOWN: [RegExp, string][] = [
  [/airbnb\./, 'Airbnb'],
  [/booking\./, 'Booking.com'],
  [/fewo-direkt\.|vrbo\.|homeaway\./, 'FeWo-direkt / Vrbo'],
  [/novasol\./, 'Novasol'],
  [/traum-ferienwohnungen\.|traumferienwohnungen\./, 'Traum-Ferienwohnungen'],
  [/ferienwohnungen\.de/, 'Ferienwohnungen.de'],
  [/holidu\./, 'Holidu'],
  [/interhome\./, 'Interhome'],
  [/hometogo\./, 'HomeToGo'],
  [/e-domizil\./, 'e-domizil'],
  [/dancenter\./, 'DanCenter'],
  [/sonnenklar\.|tui\./, 'TUI'],
];

/** "Airbnb", "Booking.com" … or the plain host name. */
export function detectProvider(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return KNOWN.find(([re]) => re.test(host))?.[1] ?? host;
  } catch {
    return null;
  }
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** First http(s) link in a pasted text ("Look at this: https://…"). */
export function extractUrl(text: string): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text);
  if (m) return m[0].replace(/[).,;!?]+$/, '');
  const bare = text.trim();
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(bare)) return `https://${bare}`;
  return null;
}
