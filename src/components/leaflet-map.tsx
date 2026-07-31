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

interface HomeLocation {
  lat: number;
  lng: number;
}

interface LeafletMapProps {
  properties: PropertyMarker[];
  homeLocation?: HomeLocation | null;
  height?: string;
  className?: string;
}

export function LeafletMap({ properties, homeLocation, height = "500px", className = "" }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const homeMarkerRef = useRef<L.Marker | null>(null);
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

      // Add home location marker first (if available)
      if (homeLocation?.lat != null && homeLocation?.lng != null) {
        const homeIcon = L.divIcon({
          className: "home-marker",
          html: `<div style="
            width: 32px; height: 32px;
            background: #3b82f6;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

        homeMarkerRef.current = L.marker([homeLocation.lat, homeLocation.lng], { icon: homeIcon })
          .bindPopup("<strong>Dein Zuhause</strong>", { maxWidth: 200 })
          .addTo(map.current!);

        bounds.push([homeLocation.lat, homeLocation.lng]);
      }

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
      if (homeMarkerRef.current) {
        homeMarkerRef.current.remove();
        homeMarkerRef.current = null;
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [properties, homeLocation]);

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