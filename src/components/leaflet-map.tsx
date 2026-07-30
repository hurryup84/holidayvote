"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";

interface PropertyMarker {
  id: string;
  title: string | null;
  url: string;
  lat: number;
  lng: number;
  image_url?: string | null;
}

interface LeafletMapProps {
  properties: PropertyMarker[];
  height?: string;
  className?: string;
}

export function LeafletMap({ properties, height = "500px", className = "" }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Inject Leaflet CSS and fix marker icons on client side
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Inject Leaflet CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }

    // Fix Leaflet marker icon paths
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  useEffect(() => {
    if (!mapRef.current || map.current || properties.length === 0) return;

    try {
      map.current = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map.current);

      const bounds: L.LatLngTuple[] = [];

      properties.forEach((prop) => {
        if (prop.lat == null || prop.lng == null) return;

        const marker = L.marker([prop.lat, prop.lng])
          .bindPopup(
            `<div style="min-width: 200px;">
              <strong>${prop.title || "Haus"}</strong>
              ${prop.image_url ? `<br><img src="${prop.image_url}" alt="" style="max-width: 200px; max-height: 150px; object-fit: cover; border-radius: 4px;">` : ""}
              <br><br>
              <a href="${prop.url}" target="_blank" rel="noopener noreferrer" style="color: #0d9488; text-decoration: underline;">
                Auf Originalseite ansehen &rarr;
              </a>
            </div>`,
            { maxWidth: 300 }
          )
          .addTo(map.current!);

        markersRef.current.push(marker);
        bounds.push([prop.lat, prop.lng]);
      });

      if (bounds.length > 0) {
        const latLngBounds = L.latLngBounds(bounds);
        map.current.fitBounds(latLngBounds, { padding: [50, 50], maxZoom: 15 });
      }

      setError(null);
    } catch (err) {
      console.error("Map initialization error:", err);
      setError("Karte konnte nicht geladen werden");
    }

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [properties]);

  if (error) {
    return (
      <div className={className} style={{ height, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", borderRadius: "12px" }}>
        <p className="text-red-600 text-center px-4">{error}</p>
      </div>
    );
  }

  return (
    <div ref={mapRef} className={className} style={{ height, width: "100%", borderRadius: "12px", overflow: "hidden" }} />
  );
}