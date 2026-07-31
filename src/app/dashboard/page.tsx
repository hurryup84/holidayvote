import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserVacations } from "@/actions/vacations";
import { getUser } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateRange } from "@/lib/utils";
import { Plus, Palmtree, Home, CheckCircle2, CalendarX } from "lucide-react";

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect("/");

  const vacations = await getUserVacations();

  return (
    <div className="min-h-screen">
      <Header userEmail={user.email} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Meine Urlaube</h1>
          <Link href="/vacation/new">
            <Button>
              <Plus className="h-4 w-4" />
              Neuer Urlaub
            </Button>
          </Link>
        </div>

        {vacations.length === 0 ? (
          <EmptyState
            icon={Palmtree}
            title="Noch keine Urlaube"
            description="Erstelle deinen ersten Urlaub und lade deine Gruppe ein."
            action={
              <Link href="/vacation/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Urlaub erstellen
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {vacations.map((vacation) => {
              const ended = vacation.end_date && new Date(vacation.end_date) < new Date();
              const bookedCount = vacation.booked_count ?? 0;
              return (
                <Link key={vacation.id} href={`/v/${vacation.invite_code}`}>
                  <Card className="transition-shadow hover:shadow-md">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="font-semibold text-slate-900 truncate">
                            {vacation.name}
                          </h2>
                          <p className="text-sm text-slate-500">
                            {[vacation.destination, formatDateRange(vacation.start_date, vacation.end_date)]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {ended && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <CalendarX className="h-3.5 w-3.5" />
                              Abgeschlossen
                            </span>
                          )}
                          {bookedCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {bookedCount} gebucht
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                        <Home className="h-3 w-3" />
                        <span>{vacation.property_count ?? 0} Haus{((vacation.property_count ?? 0) !== 1 ? "er" : "")}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
