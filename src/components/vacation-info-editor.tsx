"use client";

import { useState, useTransition } from "react";
import { updateVacation } from "@/actions/vacations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, X, Save } from "lucide-react";

interface VacationInfoEditorProps {
  vacationId: string;
  name: string;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export function VacationInfoEditor({
  vacationId,
  name,
  destination,
  startDate,
  endDate,
}: VacationInfoEditorProps) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formName, setFormName] = useState(name);
  const [formDestination, setFormDestination] = useState(destination ?? "");
  const [formStartDate, setFormStartDate] = useState(
    startDate ?? ""
  );
  const [formEndDate, setFormEndDate] = useState(endDate ?? "");

  if (!editing) {
    return (
      <div className="p-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          disabled={pending}
          className="w-full justify-start"
        >
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Urlaub bearbeiten
        </Button>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateVacation(vacationId, new FormData(e.currentTarget));
      if (result?.error) {
        setError(result.error);
      } else {
        setEditing(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 pt-0">
      <div className="space-y-1">
        <Label htmlFor="vacation-name" className="text-xs">Titel</Label>
        <Input
          id="vacation-name"
          name="name"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="Urlaubsname"
          className="text-sm"
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="vacation-destination" className="text-xs">Reiseziel</Label>
        <Input
          id="vacation-destination"
          name="destination"
          value={formDestination}
          onChange={(e) => setFormDestination(e.target.value)}
          placeholder="z. B. Mallorca, Italien"
          className="text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="vacation-start" className="text-xs">Von</Label>
          <Input
            id="vacation-start"
            name="start_date"
            type="date"
            value={formStartDate}
            onChange={(e) => setFormStartDate(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="vacation-end" className="text-xs">Bis</Label>
          <Input
            id="vacation-end"
            name="end_date"
            type="date"
            value={formEndDate}
            onChange={(e) => setFormEndDate(e.target.value)}
            className="text-sm"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-1.5 pt-1">
        <Button type="submit" size="sm" disabled={pending} className="flex-1">
          <Save className="h-3.5 w-3.5 mr-1" />
          Speichern
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="flex-1"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
