/** Provider name derived from the link's host (e.g. "airbnb.de", "booking.com"). No hardcoded list. */
export function detectProvider(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
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
