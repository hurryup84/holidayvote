import { CapacitorHttp } from '@capacitor/core';
import { parsePreview, type LinkPreview } from '../core/ogParse';
import { supabase, syncConfigured } from '../data/sync/supabase';
import { isNative } from './platform';

export type { LinkPreview } from '../core/ogParse';

/**
 * Reads the preview of a holiday-home link (title, text, picture URL) from the page – no caching here;
 * src/data/media/previewCache.ts keeps the result on this phone.
 *
 * Phones fetch the page themselves (native HTTP, no CORS; the provider sees a normal phone).
 * The browser (development, e2e) can't because of CORS and asks the Edge Function `link-preview`,
 * which does the same and returns only the parsed fields.
 */
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function fetchNative(url: string): Promise<LinkPreview | null> {
  const r = await CapacitorHttp.get({
    url,
    responseType: 'text',
    connectTimeout: 8000,
    readTimeout: 8000,
    headers: { 'User-Agent': MOBILE_UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': navigator.language || 'de' },
  });
  if (r.status >= 400) return null;
  return parsePreview(String(r.data ?? ''), r.url || url);
}

async function fetchViaFunction(url: string): Promise<LinkPreview | null> {
  if (!syncConfigured) return null;
  const { data, error } = await supabase().functions.invoke('link-preview', { body: { url } });
  if (error || !data || (data as { error?: string }).error) return null;
  return data as LinkPreview;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    return await (isNative ? fetchNative(url) : fetchViaFunction(url));
  } catch (e) {
    console.warn('[preview]', url, e);
    return null;
  }
}

/** Phones: the picture as base64 JPEG, at most `maxPx` wide/high (keeps the cache small). Null on failure. */
export async function downloadImage(url: string, maxPx = 1200): Promise<string | null> {
  if (!isNative) return null;
  try {
    const r = await CapacitorHttp.get({ url, responseType: 'blob', connectTimeout: 8000, readTimeout: 15000, headers: { 'User-Agent': MOBILE_UA } });
    if (r.status >= 400 || typeof r.data !== 'string' || !r.data) return null;
    const type = String(r.headers?.['Content-Type'] ?? r.headers?.['content-type'] ?? 'image/jpeg').split(';')[0];
    return await shrink(`data:${type};base64,${r.data}`, maxPx);
  } catch (e) {
    console.warn('[preview] image', url, e);
    return null;
  }
}

/** Re-encodes on a canvas: smaller file, no metadata. Returns base64 (without the data: prefix). */
function shrink(dataUrl: string, maxPx: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1] ?? null);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
