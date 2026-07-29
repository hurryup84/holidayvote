"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// Import leaflet only on client side
const LeafletMap = dynamic(
  () => import("./leaflet-map").then((mod) => mod.LeafletMap),
  { ssr: false, loading: () => <div className="h-[500px] w-full animate-pulse bg-slate-100 rounded-xl" /> }
);

interface PropertyMarker {
  id: string;
  title: string | null;
  url: string;
  lat: number;
  lng: number;
  image_url?: string | null;
}

interface MapProps {
  properties: PropertyMarker[];
  height?: string;
  className?: string;
}

export function Map({ properties, height = "500px", className = "" }: MapProps) {
  return (
    <LeafletMap
      properties={properties}
      height={height}
      className={className}
    />
  );
}