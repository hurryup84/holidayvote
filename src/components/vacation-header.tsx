"use client";

import { ShareButton } from "@/components/share-button";

interface VacationHeaderProps {
  name: string;
  destination?: string | null;
  dateRange?: string;
  inviteCode: string;
  participantCount: number;
  propertyCount: number;
}

export function VacationHeader({
  name,
  destination,
  dateRange,
  inviteCode,
  participantCount,
  propertyCount,
}: VacationHeaderProps) {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{name}</h1>
        {(destination || dateRange) && (
          <p className="text-slate-500">
            {[destination, dateRange].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <span>{propertyCount} Häuser</span>
        <span>·</span>
        <span>{participantCount} Teilnehmer</span>
        <ShareButton inviteCode={inviteCode} vacationName={name} />
      </div>
    </div>
  );
}
