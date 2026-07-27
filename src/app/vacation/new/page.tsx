import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { VacationForm } from "@/components/vacation-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewVacationPage() {
  const user = await getUser();
  if (!user) redirect("/");

  return (
    <div className="min-h-screen">
      <Header userEmail={user.email} />
      <main className="mx-auto max-w-lg px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Neuen Urlaub erstellen</CardTitle>
          </CardHeader>
          <CardContent>
            <VacationForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
