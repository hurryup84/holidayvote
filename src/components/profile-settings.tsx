"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfileName, updateProfileHomeLocation } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MapPin, CheckCircle2, User } from "lucide-react";

export function ProfileSettings() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressSaved, setAddressSaved] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    const result = await updateProfileName(name.trim());
    setLoading(false);

    if (result?.error) {
      setError(result.error);
    } else {
      setNameSaved(true);
      setError(null);
      setTimeout(() => setNameSaved(false), 3000);
      router.refresh();
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
      setTimeout(() => setAddressSaved(false), 3000);
      router.refresh();
    }
  }

  async function handleClearAddress(e: React.FormEvent) {
    e.preventDefault();
    setAddressLoading(true);
    const result = await updateProfileHomeLocation("");
    setAddressLoading(false);

    if (result?.error) {
      setError(result.error);
    } else {
      setAddress("");
      setAddressSaved(false);
      setError(null);
      router.refresh();
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      {/* Name Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Name
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleNameSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Dein Name</Label>
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
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={loading || !name.trim()}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {nameSaved ? "Gespeichert" : "Namen speichern"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Home Address Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Heimatadresse (optional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 mb-4">
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
                disabled={addressSaved || addressLoading}
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
            <div className="flex gap-2">
              <Button
                type="submit"
                className="flex-1"
                disabled={addressLoading || addressSaved || !address.trim()}
              >
                {addressLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {addressSaved ? "Gespeichert" : "Koordinaten speichern"}
              </Button>
              {addressSaved && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearAddress}
                  disabled={addressLoading}
                >
                  Entfernen
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}