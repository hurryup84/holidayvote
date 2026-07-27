"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfileName } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface ProfileSetupProps {
  redirectTo?: string;
}

export function ProfileSetup({ redirectTo }: ProfileSetupProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wie heißt du?</CardTitle>
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
      </CardContent>
    </Card>
  );
}
