import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { HomeLocation } from '../../app/AppContext';
import { avatarIcon } from '../../components/houseAvatars';
import { APP_CONFIG } from '../../core/config';
import type { PropertyWithStats } from '../../domain/models';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Houses with an address on an OpenStreetMap map (+ my home, if set). Markers are emoji – no image files. */
export function MapView({ houses, home, onOpen }: { houses: PropertyWithStats[]; home: HomeLocation | null; onOpen(id: string): void }) {
  const { t } = useTranslation();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([51, 10], 4);
    L.tileLayer(APP_CONFIG.tileUrl, {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    // The map is created while its tab may still be hidden: measure again once it's visible.
    const timer = window.setTimeout(() => m.invalidateSize(), 250);
    return () => {
      window.clearTimeout(timer);
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const points: L.LatLngExpression[] = [];
    for (const h of houses) {
      if (h.lat === null || h.lng === null) continue;
      const marker = L.marker([h.lat, h.lng], {
        icon: L.divIcon({
          className: `map-pin status-${h.status}`,
          html: `<span>${avatarIcon(h.avatar)}</span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
        title: h.title ?? '',
      });
      const label = escapeHtml(h.title || h.provider || h.url);
      marker.bindPopup(`<button class="map-popup" data-id="${h.id}">${label}</button>`);
      marker.on('popupopen', (e) => {
        const btn = (e.popup.getElement() as HTMLElement | undefined)?.querySelector('button');
        if (btn) btn.onclick = () => openRef.current(h.id);
      });
      marker.addTo(g);
      points.push([h.lat, h.lng]);
    }
    if (home) {
      L.marker([home.lat, home.lng], {
        icon: L.divIcon({ className: 'map-pin home', html: '<span>📍</span>', iconSize: [32, 32], iconAnchor: [16, 30] }),
        title: t('map.home'),
      }).addTo(g);
    }
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      if (home) bounds.extend([home.lat, home.lng]);
      if (points.length === 1 && !home) m.setView(points[0], 11);
      else m.fitBounds(bounds, { padding: [40, 40] });
    } else if (home) {
      m.setView([home.lat, home.lng], 6);
    }
  }, [houses, home, t]);

  return <div ref={el} className="map-view" />;
}
