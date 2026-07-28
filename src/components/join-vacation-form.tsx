"use client";

import { useState } from "react";
import { joinVacation } from "@/actions/vacations";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CheckCircle, AlertCircle } from "lucide-react";

interface JoinVacationFormProps {
  inviteCode: string;
}

export function JoinVacationForm({ inviteCode }: JoinVacationFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setLoading(true);
    setError(null);

    const result = await joinVacation(inviteCode);
    setLoading(false);

    if (result?.error) {
      setError(result.error);
    } else {
      redirect(`/v/${inviteCode}`);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-100">
          <Users className="h-6 w-6 text-teal-600" />
        </div>
        <CardTitle>Diesem Urlaub beitreten?</CardTitle>
        <p className="text-sm text-slate-500">
          Du wirst als Teilnehmer hinzugefügt und kannst Häuser bewerten, Stimmen
          vergeben und Vetos setzen.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-xl">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <Button
          className="w-full"
          size="lg"
          onClick={handleJoin}
          disabled={loading}
        >
          {loading ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2 animate-spin" />
              Wird beigetreten...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Beitreten
            </>
          )}
        </Button>
        <p className="text-xs text-slate-400 text-center">
          Du kannst den Urlaub jederzeit wieder verlassen.
        </p>
      </CardContent>
    </Card>
  );
}