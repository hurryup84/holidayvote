"use client";

import { useState } from "react";
import { Users, ChevronDown } from "lucide-react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { ShareButton } from "@/components/share-button";
import { ParticipantsList } from "@/components/participants-list";
import { Button } from "@/components/ui/button";
import type { Participant, Property } from "@/lib/types";

interface VacationHeaderProps {
  name: string;
  destination?: string | null;
  dateRange?: string;
  inviteCode: string;
  participantCount: number;
  propertyCount: number;
  participants?: Participant[];
  properties?: Property[];
  currentUserId?: string | null;
}

export function VacationHeader({
  name,
  destination,
  dateRange,
  inviteCode,
  participantCount,
  propertyCount,
  participants,
  properties,
  currentUserId,
}: VacationHeaderProps) {
  const [showParticipants, setShowParticipants] = useState(false);

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
        {participants && participants.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowParticipants(true)}
            className="gap-1 h-8 px-3"
          >
            <Users className="h-4 w-4" />
            <span>{participantCount} Teilnehmer</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        ) : (
          <span>{participantCount} Teilnehmer</span>
        )}
        <ShareButton inviteCode={inviteCode} vacationName={name} />
        <Link
          href={`/v/${inviteCode}/map`}
          className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <MapPin className="h-4 w-4" />
          <span>Karte</span>
        </Link>
      </div>

      {showParticipants && participants && (
        <ParticipantsList
          participants={participants}
          properties={properties ?? []}
          currentUserId={currentUserId ?? null}
          onClose={() => setShowParticipants(false)}
        />
      )}
    </div>
  );
}
