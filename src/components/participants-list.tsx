"use client";

import { X, Star, Crown, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Participant, Property } from "@/lib/types";

interface ParticipantsListProps {
  participants: Participant[];
  properties: Property[];
  currentUserId: string | null;
  onClose: () => void;
}

export function ParticipantsList({
  participants,
  properties,
  currentUserId,
  onClose,
}: ParticipantsListProps) {
  // Calculate vote counts per participant
  const participantStats = participants.map((participant) => {
    let totalStars = 0;
    let voteCount = 0;

    properties.forEach((property) => {
      property.votes?.forEach((vote) => {
        if (vote.user_id === participant.user_id) {
          totalStars += vote.stars;
          voteCount++;
        }
      });
    });

    const averageStars = voteCount > 0 ? totalStars / voteCount : 0;

    return {
      ...participant,
      totalStars,
      voteCount,
      averageStars,
      isCurrentUser: participant.user_id === currentUserId,
      isOwner: participant.role === "owner",
    };
  });

  // Sort: current user first, then owner, then by vote count desc
  participantStats.sort((a, b) => {
    if (a.isCurrentUser) return -1;
    if (b.isCurrentUser) return 1;
    if (a.isOwner && !b.isOwner) return -1;
    if (!a.isOwner && b.isOwner) return 1;
    return b.voteCount - a.voteCount;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
          <CardTitle className="text-lg">Teilnehmer</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {participantStats.map((p) => (
            <div
              key={p.user_id}
              className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                p.isCurrentUser ? "bg-teal-50 ring-2 ring-teal-200" : "hover:bg-slate-50"
              }`}
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={p.profile?.email ? `https://api.dicebear.com/7.x/initials/svg?seed=${p.profile.email}` : undefined} alt={p.profile?.name ?? "User"} />
                <AvatarFallback>
                  {p.profile?.name?.[0]?.toUpperCase() ?? p.profile?.email?.[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">
                    {p.profile?.name ?? "Unbekannt"}
                    {p.isCurrentUser && <span className="text-xs text-teal-600">(Du)</span>}
                    {/* p.isOwner && <Crown className="h-4 w-4 text-amber-500" title="Ersteller" /> */}
                    {p.isOwner && (
                      <span title="Ersteller">
                        <Crown className="h-4 w-4 text-amber-500" />
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                    {p.averageStars > 0 ? p.averageStars.toFixed(1) : "—"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Trophy className="h-3 w-3" />
                    {p.voteCount} {p.voteCount === 1 ? "Stimme" : "Stimmen"}
                  </span>
                </div>
              </div>

              {p.isOwner && !p.isCurrentUser && (
                <Badge variant="secondary" className="text-xs">
                  Owner
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </div>
    </div>
  );
}