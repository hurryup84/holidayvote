"use client";

import { useState } from "react";
import { addProperty } from "@/actions/properties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Link2, AlertCircle, MapPin } from "lucide-react";
import type { OpenGraphData } from "@/lib/types";

interface PropertyFormProps {
  vacationId: string;
  inviteCode: string;
}

export function PropertyForm({ vacationId, inviteCode }: PropertyFormProps) {
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ogData, setOgData] = useState<OpenGraphData | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleFetchOg() {
    if (!url.trim()) return;
    setFetching(true);
    setFetchError(null);
    setOgData(null);

    try {
      const res = await fetch("/api/og-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      setOgData(data);
      if (data.error) setFetchError(data.error);
      setShowForm(true);
    } catch {
      setFetchError("Daten konnten nicht geladen werden");
      setShowForm(true);
    } finally {
      setFetching(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("url", url.trim());

    const result = await addProperty(vacationId, inviteCode, formData);

    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    } else {
      setUrl("");
      setOgData(null);
      setShowForm(false);
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-teal-600" />
          Ferienhaus hinzufügen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="https://www.airbnb.de/rooms/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleFetchOg())}
          />
          <Button
            type="button"
            onClick={handleFetchOg}
            disabled={fetching || !url.trim()}
            variant="secondary"
          >
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Laden"}
          </Button>
        </div>

        {fetchError && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{fetchError}. Bitte Felder manuell ausfüllen.</span>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-4 border-t pt-4">
            {ogData?.image && (
              <img
                src={ogData.image}
                alt="Vorschau"
                className="h-40 w-full rounded-xl object-cover"
              />
            )}

            <div className="space-y-2">
              <Label htmlFor="title">Titel</Label>
              <Input
                id="title"
                name="title"
                defaultValue={ogData?.title ?? ""}
                placeholder="Villa am Meer"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">
                <MapPin className="h-4 w-4 inline mr-1" />
                Adresse (optional – für Kartenansicht)
              </Label>
              <Input
                id="address"
                name="address"
                placeholder="z.B. Musterstraße 12, 12345 Berlin"
              />
            </div>

            <input type="hidden" name="description" value={ogData?.description ?? ""} />
            <input type="hidden" name="image_url" value={ogData?.image ?? ""} />
            <input type="hidden" name="provider" value={ogData?.provider ?? ""} />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="price">Gesamtpreis (€)</Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="2500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bedrooms">Schlafzimmer</Label>
                <Input
                  id="bedrooms"
                  name="bedrooms"
                  type="number"
                  min="0"
                  placeholder="3"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="beds">Betten</Label>
                <Input id="beds" name="beds" type="number" min="0" placeholder="6" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bathrooms">Badezimmer</Label>
                <Input
                  id="bathrooms"
                  name="bathrooms"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="2"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="has_pool" className="rounded" />
              Pool vorhanden
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Haus hinzufügen
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
