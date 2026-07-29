import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVacationPublic, getVacationWithDetails, getVacationFieldConfig } from "@/actions/vacations";
import { Header } from "@/components/header";
import { getUser } from "@/lib/supabase/server";
import { formatDateRange } from "@/lib/utils";
import { ArrowLeft, MapPin, Settings } from "lucide-react";
import Link from "next/link";
import { FieldConfigManager } from "@/components/field-config-manager";

interface PageProps {
  params: Promise<{ inviteCode: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ inviteCode: string }> }): Promise<Metadata> {
  const { inviteCode } = await params;
  const publicData = await getVacationPublic(inviteCode);

  if (!publicData) return { title: "Einstellungen nicht gefunden" };

  return {
    title: `${publicData.name} – Einstellungen`,
    description: `Felder für ${publicData.name} konfigurieren`,
  };
}

export default async function SettingsPage({ params }: { params: Promise<{ inviteCode: string }> }) {
  const { inviteCode } = await params;
  const publicData = await getVacationPublic(inviteCode);

  if (!publicData) notFound();

  const user = await getUser();
  const details = user ? await getVacationWithDetails(inviteCode) : null;

  if (!details) notFound();

  // Only owner can access settings
  if (details.userRole !== "owner") {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header userEmail={user?.email} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href={`/v/${inviteCode}`}
            className="flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <span className="text-2xl">←</span>
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

        <div className="rounded-2xl bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-teal-600" />
              <h2 className="text-lg font-semibold">Feld-Einstellungen</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Wähle, welche Felder beim Hinzufügen eines Ferienhauses angezeigt werden.
            </p>
          </div>
          <FieldConfigManager vacationId={details.vacation.id} inviteCode={inviteCode} />
        </div>
      </main>
    </div>
  );
}