import { Header } from "@/components/header";
import { ProfileSettings } from "@/components/profile-settings";
import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/");

  return (
    <div className="min-h-screen">
      <Header userEmail={user.email} />
      <main className="mx-auto max-w-md px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Einstellungen</h1>
        <ProfileSettings />
      </main>
    </div>
  );
}