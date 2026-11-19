import { CapacitorHttp } from '@capacitor/core';
import { APP_CONFIG } from '../core/config';
import { isNative } from './platform';

const LOOKUP_TIMEOUT_MS = 5000;

async function nativeLookup(url: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      CapacitorHttp.get({
        url,
        connectTimeout: LOOKUP_TIMEOUT_MS,
        readTimeout: LOOKUP_TIMEOUT_MS,
        headers: { 'User-Agent': `HolidayVote/${__APP_VERSION__} (${APP_CONFIG.supportUrl})`, Accept: 'application/json' },
      }),
      // Transport timeouts do not cover a native bridge call that never settles.
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Address lookup timed out')), LOOKUP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Address → coordinates with OpenStreetMap Nominatim (no key; max. 1 request per second – only
 * on an explicit action). Sends only the typed address, nothing about the user.
 */
export async function geocode(address: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = address.trim();
  if (!q) return null;
  const url = `${APP_CONFIG.geocodeUrl}?format=json&limit=1&q=${encodeURIComponent(q)}`;
  try {
    let data: unknown;
    if (isNative) {
      const r = await nativeLookup(url);
      if (r.status >= 400) throw new Error(`Address lookup returned HTTP ${r.status}`);
      data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    } else {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
      if (!r.ok) throw new Error(`Address lookup returned HTTP ${r.status}`);
      data = await r.json();
    }
    const first = (data as { lat: string; lon: string; display_name: string }[])[0];
    if (!first) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, label: first.display_name } : null;
  } catch (e) {
    console.warn('[geocode]', e);
    return null;
  }
}
