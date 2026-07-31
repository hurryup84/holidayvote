"use server";

export interface GeocodeResult {
  success: boolean;
  lat?: number;
  lng?: number;
  error?: string;
}

/**
 * Geocode an address using Nominatim (OpenStreetMap)
 * Free, no API key required, but has rate limits (1 req/sec)
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (!address.trim()) {
    return { success: false, error: "Adresse ist leer" };
  }

  try {
    const encodedAddress = encodeURIComponent(address.trim());
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Ferienhaus-App/1.0 (https://github.com/ferienhaus-app)",
        Accept: "application/json",
      },
      // Cache for 24 hours to reduce API calls
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return { success: false, error: "Geocoding-Dienst nicht erreichbar" };
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return { success: false, error: "Adresse nicht gefunden" };
    }

    const result = data[0];
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    if (isNaN(lat) || isNaN(lng)) {
      return { success: false, error: "Ungültige Koordinaten" };
    }

    return { success: true, lat, lng };
  } catch (err) {
    console.error("Geocoding error:", err);
    return { success: false, error: "Fehler beim Geocoding" };
  }
}