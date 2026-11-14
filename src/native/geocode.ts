import { CapacitorHttp } from '@capacitor/core';
import { APP_CONFIG } from '../core/config';
import { isNative } from './platform';

/**
 * Address → coordinates with OpenStreetMap Nominatim (no key; max. 1 request per second – only
 * on an explicit tap). Sends only the typed address, nothing about the user.
 */
export async function geocode(address: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = address.trim();
  if (!q) return null;
  const url = `${APP_CONFIG.geocodeUrl}?format=json&limit=1&q=${encodeURIComponent(q)}`;
  try {
    let data: unknown;
    if (isNative) {
      const r = await CapacitorHttp.get({ url, headers: { 'User-Agent': `HolidayVote/${__APP_VERSION__} (${APP_CONFIG.supportUrl})`, Accept: 'application/json' } });
      data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    } else {
      data = await (await fetch(url, { headers: { Accept: 'application/json' } })).json();
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
