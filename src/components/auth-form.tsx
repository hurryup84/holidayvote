"use client";

import { useState } from "react";
import { signInWithMagicLink } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Loader2 } from "lucide-react";

interface AuthFormProps {
  redirectTo?: string;
  title?: string;
  description?: string;
}

export function AuthForm({
  redirectTo = "/dashboard",
  title = "Anmelden",
  description = "Wir senden dir einen Magic Link per E-Mail – kein Passwort nötig.",
}: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("email", email);
    formData.set("redirectTo", redirectTo);

    const result = await signInWithMagicLink(formData);
    setLoading(false);

    if (result?.error) {
      setError(result.error);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>E-Mail gesendet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Wir haben einen Login-Link an <strong>{email}</strong> gesendet.
            Klicke auf den Link in der E-Mail, um fortzufahren.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-slate-500">{description}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="deine@email.de"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Magic Link senden
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
