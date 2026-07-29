"use client";

import { useState, useEffect } from "react";
import {
  updateVacationFieldConfig,
  getVacationFieldConfig,
  type VacationFieldConfig,
} from "@/actions/vacations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { GripVertical, Eye, EyeOff, Settings } from "lucide-react";

interface FieldConfigManagerProps {
  vacationId: string;
  inviteCode: string;
}

const FIELD_DEFINITIONS: Record<string, { label: string; description: string; defaultOrder: number }> = {
  title: { label: "Titel", description: "Name des Ferienhauses", defaultOrder: 1 },
  address: { label: "Adresse", description: "Für Kartenansicht", defaultOrder: 2 },
  description: { label: "Beschreibung", description: "Details zum Haus", defaultOrder: 3 },
  image_url: { label: "Bild", description: "Vorschau-Bild", defaultOrder: 4 },
  price: { label: "Gesamtpreis", description: "Gesamtkosten", defaultOrder: 5 },
  bedrooms: { label: "Schlafzimmer", description: "Anzahl Zimmer", defaultOrder: 6 },
  beds: { label: "Betten", description: "Anzahl Betten", defaultOrder: 7 },
  bathrooms: { label: "Badezimmer", description: "Anzahl Bäder", defaultOrder: 8 },
  has_pool: { label: "Pool", description: "Pool vorhanden", defaultOrder: 9 },
  provider: { label: "Plattform", description: "Airbnb, Booking, etc.", defaultOrder: 10 },
};

const FIELD_ORDER = [
  "title",
  "address",
  "description",
  "image_url",
  "price",
  "bedrooms",
  "beds",
  "bathrooms",
  "has_pool",
  "provider",
];

export function FieldConfigManager({ vacationId, inviteCode }: FieldConfigManagerProps) {
  const [configs, setConfigs] = useState<VacationFieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    loadConfigs();
  }, [vacationId]);

  async function loadConfigs() {
    setLoading(true);
    const data = await getVacationFieldConfig(vacationId);
    setConfigs(data);
    setLoading(false);
  }

  async function handleToggle(fieldName: string, enabled: boolean) {
    const config = configs.find((c) => c.field_name === fieldName);
    const order = config?.display_order ?? FIELD_ORDER.indexOf(fieldName) + 1;

    setSaving(fieldName);
    const result = await updateVacationFieldConfig(vacationId, fieldName, enabled, order);

    if (result.success) {
      setConfigs((prev) =>
        prev.map((c) =>
          c.field_name === fieldName ? { ...c, is_enabled: enabled } : c
        )
      );
    }
    setSaving(null);
  }

  async function handleReorder(fieldName: string, newOrder: number) {
    const config = configs.find((c) => c.field_name === fieldName);
    if (!config) return;

    setSaving(fieldName);
    const result = await updateVacationFieldConfig(
      vacationId,
      fieldName,
      config.is_enabled,
      newOrder
    );

    if (result.success) {
      // Re-sort locally
      setConfigs((prev) =>
        prev.map((c) =>
          c.field_name === fieldName ? { ...c, display_order: newOrder } : c
        ).sort((a, b) => a.display_order - b.display_order)
      );
    }
    setSaving(null);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const sortedFields = FIELD_ORDER.map((fieldName) => {
    const config = configs.find((c) => c.field_name === fieldName);
    const def = FIELD_DEFINITIONS[fieldName];
    return {
      fieldName,
      label: def?.label ?? fieldName,
      description: def?.description ?? "",
      isEnabled: config?.is_enabled ?? true,
      displayOrder: config?.display_order ?? def?.defaultOrder ?? 99,
      isRequired: fieldName === "title",
    };
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Felder für dieses Ferienhaus
        </CardTitle>
        <span className="text-xs text-slate-500">
          {FIELD_ORDER.filter((f) => {
            const c = configs.find((c) => c.field_name === f);
            return c?.is_enabled ?? true;
          }).length} von {FIELD_ORDER.length} aktiv
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500">
          Wähle, welche Felder beim Hinzufügen eines Ferienhauses angezeigt werden.
          Deaktivierte Felder werden ausgeblendet. Änderungen gelten sofort.
        </p>

        <div className="space-y-2">
          {sortedFields.map((field) => (
            <div
              key={field.fieldName}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                field.isRequired ? "bg-teal-50 border-teal-200" : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <GripVertical className="h-5 w-5 text-slate-400 cursor-grab opacity-50 hover:opacity-100" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Label htmlFor={field.fieldName} className="font-medium text-slate-900">
                    {field.label}
                    {field.isRequired && (
                      <span className="text-xs text-teal-600 bg-teal-100 px-1.5 py-0.5 rounded">Pflicht</span>
                    )}
                  </Label>
                </div>
                <p className="text-xs text-slate-500 truncate">{field.description}</p>
              </div>

              <Switch
                id={field.fieldName}
                checked={field.isEnabled}
                disabled={field.isRequired || saving === field.fieldName}
                onCheckedChange={(checked: boolean) => handleToggle(field.fieldName, checked)}
              />

              {field.isRequired && (
                <Eye className="h-4 w-4 text-teal-500" aria-label="Pflichtfeld - immer sichtbar" />
              )}
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            <strong>Hinweis:</strong> Der Titel ist immer erforderlich. Andere Felder können
            für jedes Ferienhaus individuell angepasst werden. Änderungen werden sofort
            gespeichert und gelten für alle Teilnehmer dieses Urlaubs.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}