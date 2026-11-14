export interface LatLng {
  lat: number;
  lng: number;
}

/** Distance in km (great circle). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function fmtDistance(km: number, lang: string): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  const n = new Intl.NumberFormat(lang, { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km);
  return `${n} km`;
}
