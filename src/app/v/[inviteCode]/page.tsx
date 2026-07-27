import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getVacationPublic,
  getVacationWithDetails,
} from "@/actions/vacations";
import { createClient, getUser, getProfile } from "@/lib/supabase/server";
import { sortProperties } from "@/lib/sort-properties";
import { formatDateRange } from "@/lib/utils";
import { Header } from "@/components/header";
import { AuthForm } from "@/components/auth-form";
import { VacationHeader } from "@/components/vacation-header";
import { PropertyForm } from "@/components/property-form";
import { PropertyCard } from "@/components/property-card";
import { EmptyState } from "@/components/empty-state";
import { ProfileSetup } from "@/components/profile-setup";
import { Badge } from "@/components/ui/badge";
import { Home } from "lucide-react";
import type { ParticipantRole } from "@/lib/types";

interface PageProps {
  params: Promise<{ inviteCode: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { inviteCode } = await params;
  const publicData = await getVacationPublic(inviteCode);

  if (!publicData) {
    return { title: "Urlaub nicht gefunden" };
  }

  return {
    title: publicData.name,
    description: `${publicData.property_count} Häuser · ${publicData.participant_count} Teilnehmer · ${publicData.vote_count} Stimmen`,
    openGraph: {
      title: `${publicData.name} – HolidayVote`,
      description: `${publicData.property_count} Häuser · ${publicData.vote_count} von ${publicData.participant_count} haben abgestimmt`,
    },
  };
}

export default async function VacationPage({ params }: PageProps) {
  const { inviteCode } = await params;
  const publicData = await getVacationPublic(inviteCode);

  if (!publicData) notFound();

  const user = await getUser();

  // Not logged in: show invite landing
  if (!user) {
    return (
      <div className="min-h-screen">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
            <span className="font-semibold text-teal-700">HolidayVote</span>
          </div>
        </header>
        <main className="mx-auto max-w-lg px-4 py-8 space-y-6">
          <div className="text-center">
            <Badge variant="info" className="mb-3">
              Einladung
            </Badge>
            <h1 className="text-2xl font-bold">{publicData.name}</h1>
            {publicData.destination && (
              <p className="text-slate-500">{publicData.destination}</p>
            )}
            {publicData.start_date && (
              <p className="text-sm text-slate-400">
                {formatDateRange(publicData.start_date, publicData.end_date)}
              </p>
            )}
            <p className="mt-3 text-sm text-slate-500">
              {publicData.property_count} Häuser ·{" "}
              {publicData.participant_count} Teilnehmer
            </p>
          </div>
          <AuthForm
            redirectTo={`/v/${inviteCode}`}
            title="Mitmachen"
            description="Melde dich an, um Häuser zu bewerten und abzustimmen."
          />
        </main>
      </div>
    );
  }

  // Auto-join if not yet participant
  const details = await getVacationWithDetails(inviteCode);
  if (!details) notFound();

  if (!details.userRole) {
    // Join directly via RPC – server actions (revalidatePath) are not
    // allowed during render. The redirect below triggers a fresh render.
    const supabase = await createClient();
    const { error } = await supabase.rpc("join_vacation_by_invite", {
      p_invite_code: inviteCode,
    });
    if (error) notFound();
    redirect(`/v/${inviteCode}`);
  }

  const profile = await getProfile();
  if (!profile?.name) {
    return (
      <div className="min-h-screen">
        <Header userEmail={user.email} />
        <main className="mx-auto max-w-lg px-4 py-8">
          <ProfileSetup redirectTo={`/v/${inviteCode}`} />
        </main>
      </div>
    );
  }

  const sortedProperties = sortProperties(details.properties);
  const allVetoes = details.properties.flatMap((p) =>
    (p.vetoes ?? []).map((v) => ({
      property_id: v.property_id,
      user_id: v.user_id,
    }))
  );

  return (
    <div className="min-h-screen">
      <Header userEmail={user.email} />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <VacationHeader
          name={details.vacation.name}
          destination={details.vacation.destination}
          dateRange={formatDateRange(
            details.vacation.start_date,
            details.vacation.end_date
          )}
          inviteCode={inviteCode}
          participantCount={details.participants.length}
          propertyCount={details.properties.length}
        />

        <PropertyForm
          vacationId={details.vacation.id}
          inviteCode={inviteCode}
        />

        {sortedProperties.length === 0 ? (
          <EmptyState
            icon={Home}
            title="Noch keine Häuser"
            description="Füge den ersten Ferienhaus-Link ein – von Airbnb, Booking oder einer anderen Plattform."
          />
        ) : (
          <div className="space-y-4">
            {sortedProperties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                vacationId={details.vacation.id}
                inviteCode={inviteCode}
                userId={details.userId}
                userRole={details.userRole as ParticipantRole}
                participantCount={details.participants.length}
                allVetoes={allVetoes}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
