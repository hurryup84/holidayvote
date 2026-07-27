import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserVacations } from "@/actions/vacations";
import { getUser } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateRange } from "@/lib/utils";
import { Plus, Palmtree } from "lucide-react";

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
            {vacations.map((vacation) => (
              <Link key={vacation.id} href={`/v/${vacation.invite_code}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <h2 className="font-semibold text-slate-900">
                      {vacation.name}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {[vacation.destination, formatDateRange(vacation.start_date, vacation.end_date)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
