import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVacationPublic, getVacationWithDetails } from "@/actions/vacations";
import { LeafletMap } from "@/components/leaflet-map";
import { Header } from "@/components/header";
import { getUser, getProfile } from "@/lib/supabase/server";
import { formatDateRange } from "@/lib/utils";
import { ArrowLeft, MapPin, Home } from "lucide-react";
import Link from "next/link";

interface PageProps {
  params: Promise<{ inviteCode: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { inviteCode } = await params;
  const publicData = await getVacationPublic(inviteCode);

  if (!publicData) return { title: "Karte nicht gefunden" };

  return {
    title: `${publicData.name} – Karte`,
    description: `${publicData.property_count} Häuser auf der Karte`,
    openGraph: {
      title: `${publicData.name} – Karte`,
      description: `${publicData.property_count} Ferienhäuser`,
    },
  };
}

export default async function MapPage({ params }: PageProps) {
  const { inviteCode } = await params;
  const publicData = await getVacationPublic(inviteCode);

  if (!publicData) notFound();

  // Try to get detailed data if user is logged in, otherwise use public data
  const user = await getUser();
  const details = user ? await getVacationWithDetails(inviteCode) : null;
  const profile = user ? await getProfile() : null;

  // Use public data as fallback if no details available
  const properties = details?.properties ?? [];
  const propertiesWithCoords = properties
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      id: p.id,
      title: p.title,
      url: p.url,
      lat: p.lat!,
      lng: p.lng!,
      image_url: p.image_url,
    }));

  // Prepare home location for map
  const homeLocation = profile?.home_lat != null && profile?.home_lng != null
    ? { lat: profile.home_lat, lng: profile.home_lng }
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header userEmail={user?.email} />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href={`/v/${inviteCode}`}
            className="flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <MapPin className="text-2xl" />
            <span className="text-slate-500">Zurück zum Urlaub</span>
          </Link>
          <div className="flex-1" />
          <div className="text-right">
            <p className="text-sm font-medium text-slate-900">{publicData.name}</p>
            {publicData.destination && (
              <p className="text-sm text-slate-500">{publicData.destination}</p>
            )}
            {publicData.start_date && (
              <p className="text-sm text-slate-500">
                {formatDateRange(publicData.start_date, publicData.end_date)}
              </p>
            )}
          </div>
        </div>

        {details?.properties.length === 0 && publicData.property_count === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <Home className="mx-auto h-12 w-12 text-slate-300" />
            <h2 className="mt-4 text-lg font-semibold text-slate-900">Noch keine Häuser</h2>
            <p className="mt-2 text-slate-500">
              Füge das erste Ferienhaus hinzu, um es auf der Karte zu sehen.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <p className="text-sm text-slate-600">
                {propertiesWithCoords.length} von {publicData.property_count} Häuser mit
                Koordinaten
              </p>
              {publicData.property_count > propertiesWithCoords.length && (
                <p className="text-sm text-amber-600 mt-1">
                  {publicData.property_count - propertiesWithCoords.length} Häuser ohne
                  Adresse – auf der Karte nicht sichtbar
                </p>
              )}
              {homeLocation && (
                <p className="text-sm text-blue-600 mt-1 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  Dein Zuhause wird angezeigt
                </p>
              )}
            </div>
            <LeafletMap
              properties={propertiesWithCoords}
              homeLocation={homeLocation}
              height="600px"
            />
          </div>
        )}
      </main>
    </div>
  );
}