import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { AuthForm } from "@/components/auth-form";
import { Palmtree, Users, Star, Share2 } from "lucide-react";

export default async function HomePage() {
  const user = await getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <div className="flex items-center gap-2 font-semibold text-teal-700">
            <Palmtree className="h-5 w-5" />
            HolidayVote
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-4 py-12 text-center sm:py-20">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Gemeinsam das perfekte
            <span className="text-teal-600"> Ferienhaus </span>
            finden
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Sammle Links, bewerte mit Sternen, setze Vetos – und findet schneller
            eure Traumunterkunft. Ohne Excel, ohne Chat-Chaos.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="#anmelden"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-teal-600 px-6 text-base font-medium text-white hover:bg-teal-700"
            >
              Jetzt starten
            </a>
            <a
              href="#so-funktionierts"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-base font-medium hover:bg-slate-50"
            >
              So funktioniert&apos;s
            </a>
          </div>
        </section>

        <section
          id="so-funktionierts"
          className="border-y border-slate-200 bg-white py-12"
        >
          <div className="mx-auto grid max-w-5xl gap-8 px-4 sm:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100">
                <Share2 className="h-6 w-6 text-teal-600" />
              </div>
              <h3 className="font-semibold">Link teilen</h3>
              <p className="mt-1 text-sm text-slate-500">
                Erstelle einen Urlaub und lade deine Gruppe per WhatsApp ein.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100">
                <Users className="h-6 w-6 text-teal-600" />
              </div>
              <h3 className="font-semibold">Häuser sammeln</h3>
              <p className="mt-1 text-sm text-slate-500">
                Fügt Ferienhaus-Links ein – Titel und Bild werden automatisch geladen.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100">
                <Star className="h-6 w-6 text-teal-600" />
              </div>
              <h3 className="font-semibold">Abstimmen</h3>
              <p className="mt-1 text-sm text-slate-500">
                Bewertet mit Sternen, setzt Vetos – die beste Option steht oben.
              </p>
            </div>
          </div>
        </section>

        <section id="anmelden" className="mx-auto max-w-md px-4 py-12">
          <AuthForm />
        </section>
      </main>
    </div>
  );
}
