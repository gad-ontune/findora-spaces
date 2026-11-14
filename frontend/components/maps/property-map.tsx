"use client";

import { useEffect, useRef, useState } from "react";
import { MapPinOff } from "lucide-react";

import { cn, formatKes } from "@/lib/utils";

export type MapMarker = {
  id: string;
  title: string;
  rent: number | null;
  latitude: number;
  longitude: number;
  href: string;
  featured?: boolean;
};

type MapLibreModule = typeof import("maplibre-gl");

const DEFAULT_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export function PropertyMap({
  markers,
  className,
  styleUrl = DEFAULT_STYLE,
  approximateRadiusM,
  singleMarker = false,
}: {
  markers: MapMarker[];
  className?: string;
  styleUrl?: string;
  approximateRadiusM?: number;
  singleMarker?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const libRef = useRef<MapLibreModule | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;

    async function boot() {
      try {
        const maplibregl = (await import("maplibre-gl")) as MapLibreModule;
        if (cancelled || !containerRef.current) return;
        libRef.current = maplibregl;
        map = new maplibregl.Map({
          container: containerRef.current,
          style: styleUrl,
          center:
            markers.length > 0
              ? [markers[0].longitude, markers[0].latitude]
              : [34.6181, -1.2466],
          zoom: markers.length > 1 ? 12 : 14,
          attributionControl: false,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(
          new maplibregl.AttributionControl({ compact: true, customAttribution: "© OpenStreetMap contributors" }),
          "bottom-right",
        );
        mapRef.current = map;

        map.on("load", () => {
          if (!map) return;
          if (approximateRadiusM && markers.length === 1) {
            const point = [markers[0].longitude, markers[0].latitude];
            map.addSource("approximate-area", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Polygon",
                  coordinates: [circlePolygon(point[0], point[1], approximateRadiusM)],
                },
              },
            });
            map.addLayer({
              id: "approximate-area-fill",
              type: "fill",
              source: "approximate-area",
              paint: { "fill-color": "#2C776E", "fill-opacity": 0.12 },
            });
            map.addLayer({
              id: "approximate-area-line",
              type: "line",
              source: "approximate-area",
              paint: { "line-color": "#2C776E", "line-width": 1.5, "line-dasharray": [2, 2] },
            });
          }
        });

        markersRef.current = markers.map((marker) => {
          const element = document.createElement("a");
          element.href = marker.href;
          element.className = "group block";
          element.setAttribute("aria-label", `${marker.title}, ${formatKes(marker.rent)}`);
          const pin = document.createElement("span");
          pin.className = marker.featured
            ? "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-terracotta-500 text-white shadow-lg transition group-hover:scale-110"
            : "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-teal-700 text-white shadow-lg transition group-hover:scale-110";
          pin.innerHTML =
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>';
          element.appendChild(pin);

          const popup = new maplibregl.Popup({ offset: 18, closeButton: true }).setHTML(
            `<div style="font-weight:700;font-size:13px;color:#111C1A;max-width:210px;line-height:1.35">${escapeHtml(marker.title)}</div>
             <div style="margin-top:4px;font-size:12px;color:#2C776E;font-weight:600">${formatKes(marker.rent)} / month</div>
             <div style="margin-top:6px;font-size:11px;color:#71817D">Location is approximate.</div>`,
          );
          const instance = new maplibregl.Marker({ element, anchor: "center" })
            .setLngLat([marker.longitude, marker.latitude])
            .setPopup(popup)
            .addTo(map as import("maplibre-gl").Map);
          return instance;
        });

        if (markers.length > 1) {
          const bounds = new maplibregl.LngLatBounds();
          for (const marker of markers) bounds.extend([marker.longitude, marker.latitude]);
          map.fitBounds(bounds, { padding: 50, maxZoom: 14.5, duration: 0 });
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    boot();

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map?.remove();
      mapRef.current = null;
    };
    // The map is intentionally recreated only when the style changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  useEffect(() => {
    const maplibregl = libRef.current;
    const map = mapRef.current;
    if (!maplibregl || !map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = markers.map((marker) => {
      const element = document.createElement("a");
      element.href = marker.href;
      element.className = "group block";
      const pin = document.createElement("span");
      pin.className = marker.featured
        ? "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-terracotta-500 text-white shadow-lg transition group-hover:scale-110"
        : "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-teal-700 text-white shadow-lg transition group-hover:scale-110";
      pin.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>';
      element.appendChild(pin);
      const popup = new maplibregl.Popup({ offset: 18, closeButton: true }).setHTML(
        `<div style="font-weight:700;font-size:13px;color:#111C1A;max-width:210px;line-height:1.35">${escapeHtml(marker.title)}</div>
         <div style="margin-top:4px;font-size:12px;color:#2C776E;font-weight:600">${formatKes(marker.rent)} / month</div>`,
      );
      return new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([marker.longitude, marker.latitude])
        .setPopup(popup)
        .addTo(map);
    });
    if (markers.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const marker of markers) bounds.extend([marker.longitude, marker.latitude]);
      map.fitBounds(bounds, { padding: 50, maxZoom: 14.5, duration: 400 });
    } else if (markers.length === 1 && !singleMarker) {
      map.easeTo({ center: [markers[0].longitude, markers[0].latitude], zoom: 14, duration: 300 });
    }
  }, [markers, singleMarker]);

  if (failed) {
    return (
      <div
        className={cn(
          "flex min-h-64 flex-col items-center justify-center rounded-2xl border border-ink-900/10 bg-ivory-100 p-6 text-center",
          className,
        )}
      >
        <MapPinOff className="h-8 w-8 text-ink-300" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-ink-700">The map could not load</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-ink-500">
          The listing still works without the map. Locations are approximate to protect occupants.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("min-h-64 w-full overflow-hidden rounded-2xl border border-ink-900/10 bg-ivory-200", className)}
      role="region"
      aria-label="Property map. Locations are approximate."
    />
  );
}

function circlePolygon(lng: number, lat: number, radiusM: number): number[][] {
  const points: number[][] = [];
  const earth = 6_371_000;
  const angular = radiusM / earth;
  const latRad = (lat * Math.PI) / 180;
  for (let i = 0; i <= 64; i += 1) {
    const bearing = (i / 64) * 2 * Math.PI;
    const pointLat = Math.asin(
      Math.sin(latRad) * Math.cos(angular) +
        Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing),
    );
    const pointLng =
      ((lng * Math.PI) / 180 +
        Math.atan2(
          Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
          Math.cos(angular) - Math.sin(latRad) * Math.sin(pointLat),
        )) *
      (180 / Math.PI);
    points.push([pointLng, (pointLat * 180) / Math.PI]);
  }
  return points;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
