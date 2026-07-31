"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const AVATARS = [
  { id: "default", label: "Standard", icon: "🏠" },
  { id: "beach", label: "Strandhaus", icon: "🏖️" },
  { id: "mountain", label: "Berghütte", icon: "🏔️" },
  { id: "villa", label: "Villa", icon: "🏛️" },
  { id: "cottage", label: "Ferienhütte", icon: "🛖" },
  { id: "treehouse", label: "Baumhaus", icon: "🌲" },
  { id: "city", label: "Stadtwohnung", icon: "🏙️" },
  { id: "luxury", label: "Luxus", icon: "🏰" },
  { id: "farm", label: "Bauernhof", icon: "🌾" },
  { id: "sail", label: "Hausboot", icon: "⛵" },
  { id: "igloo", label: "Igloo", icon: "🧊" },
  { id: "tent", label: "Zelt", icon: "⛺" },
];

interface PropertyAvatarPickerProps {
  value?: string | null;
  onChange?: (avatar: string) => void;
}

export function PropertyAvatarPicker({ value, onChange }: PropertyAvatarPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = AVATARS.find((a) => a.id === value) ?? AVATARS[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
      >
        <span className="text-4xl">{selected.icon}</span>
        <span className="text-slate-500">{selected.label}</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-20 mt-1 grid grid-cols-4 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            {AVATARS.map((avatar) => (
              <button
                key={avatar.id}
                type="button"
                onClick={() => {
                  onChange?.(avatar.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg p-2 hover:bg-slate-50 transition-colors",
                  value === avatar.id && "bg-teal-50 ring-1 ring-teal-300"
                )}
              >
                <span className="text-3xl">{avatar.icon}</span>
                <span className="text-[10px] text-slate-500">{avatar.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
