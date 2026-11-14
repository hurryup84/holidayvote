// Live preview of a holiday-home link for the BROWSER build (development, e2e): the WebView/browser can't
// fetch other sites because of CORS. Phones fetch the page themselves (src/native/linkPreview.ts).
// Returns only the parsed fields {title, description, image (URL), siteName} – nothing is stored, the
// picture itself is never downloaded here.
//   POST { url } → LinkPreview | { error }
// Called with the app's key / user token (default JWT check on). Deploy: npx supabase functions deploy link-preview
import { parsePreview } from '../_shared/ogParse.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Only public web pages: http(s), a host name (no IP literals, no localhost / internal names). */
function allowed(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const h = u.hostname.toLowerCase();
    if (!h.includes('.') || h.endsWith('.local') || h.endsWith('.internal') || h === 'localhost') return null;
    if (/^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return null;
    return u;
  } catch {
    return null;
  }
}

const MAX_BYTES = 1_500_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  const u = allowed(String(url ?? ''));
  if (!u) return json({ error: 'bad_url' }, 400);
  try {
    const res = await fetch(u, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HolidayVote link preview)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': req.headers.get('accept-language') ?? 'de,en;q=0.8',
      },
    });
    if (!res.ok || !/html/i.test(res.headers.get('content-type') ?? 'text/html')) return json({ error: 'not_html' }, 502);
    // Read at most MAX_BYTES (the <head> is all we need).
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => undefined);
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.length;
    }
    const html = new TextDecoder().decode(bytes);
    return json(parsePreview(html, res.url || u.toString()));
  } catch (e) {
    return json({ error: 'fetch_failed', detail: String((e as Error)?.message ?? e) }, 502);
  }
});
