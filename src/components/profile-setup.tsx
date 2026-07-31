"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfileName, updateProfileHomeLocation } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MapPin, CheckCircle2 } from "lucide-react";

interface ProfileSetupProps {
  redirectTo?: string;
}

export function ProfileSetup({ redirectTo }: ProfileSetupProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressSaved, setAddressSaved] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    const result = await updateProfileName(name.trim());
    setLoading(false);

    if (result?.error) {
      setError(result.error);
    } else {
      router.refresh();
      if (redirectTo) router.push(redirectTo);
    }
  }

  async function handleAddressSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;

    setAddressLoading(true);
    const result = await updateProfileHomeLocation(address.trim());
    setAddressLoading(false);

    if (result?.error) {
      setError(result.error);
    } else {
      setAddressSaved(true);
      setError(null);
      // Clear error after showing success
      setTimeout(() => setAddressSaved(false), 3000);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil einrichten</CardTitle>
        <p className="text-sm text-slate-500">
          Dein Name wird anderen Teilnehmern angezeigt.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Max"
              required
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Weiter
          </Button>
        </form>

        <hr className="my-6" />

        {/* Home Address Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-slate-500" />
            <h4 className="font-medium text-slate-900">Heimatadresse (optional)</h4>
          </div>
          <p className="text-sm text-slate-500">
            Wir speichern nur die Koordinaten (nicht die Adresse), um dir die
            Luftlinie zu den Häusern anzuzeigen.
          </p>

          <form onSubmit={handleAddressSubmit} className="space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="address">Adresse</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="z.B. Musterstraße 12, 12345 Berlin"
                disabled={addressSaved}
              />
            </div>
            {addressSaved && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>Gespeichert! Nur du siehst die Entfernungen.</span>
              </div>
            )}
            {error && !addressSaved && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={addressLoading || addressSaved || !address.trim()}
            >
              {addressLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {addressSaved ? "Gespeichert" : "Koordinaten speichern"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
