"use client";

import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import { StarRating } from "@/components/star-rating";

interface VotingResultsProps {
  stats: ReturnType<typeof import("@/lib/sort-properties").getPropertyStats>;
  userVote: number | null;
  onVoteChange: (stars: number) => void;
  disabled?: boolean;
  canVote?: boolean;
}

export function VotingResults({
  stats,
  userVote,
  onVoteChange,
  disabled = false,
  canVote = true,
}: VotingResultsProps) {
  const { voteCount, averageStars, totalStars } = stats;
  const hasVotes = voteCount > 0;

  return (
    <div className="border-t border-slate-200 pt-4">




        
          <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <svg className="h-4 w-4 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 20V10" />
              <path d="M12 20V4" />
              <path d="M6 20v-6" />
            </svg>
            <span>Gesamtergebnis</span>
            <span className="text-xs text-slate-500 ml-2">
              {stats.voteCount} {stats.voteCount === 1 ? "Stimme" : "Stimmen"}
            </span>
          </h4>

          <div className="space-y-4">
            {/* Average Rating Display */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-amber-500">
                  {stats.averageStars > 0 ? stats.averageStars.toFixed(1) : "–"}
                </span>
                <span className="text-slate-500">/ 5</span>
              </div>
              <span className="text-sm text-slate-500">
                {stats.voteCount} {stats.voteCount === 1 ? "Stimme" : "Stimmen"}
              </span>
            </div>

            {/* Distribution Bars 
            <div className="space-y-2 mt-3">
              {[5, 4, 3, 2, 1].map((star) => (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-5 text-right">
                    {star} ⭐
                  </span>
                  <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-300"
                      style={{ width: "0%" }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 w-10 text-right">
                    0
                  </span>
                </div>
              ))}
            </div>*/}
          </div>
      <div className="space-y-4">
        <div className="border-t border-slate-200 pt-4">
        {/* User's Current Vote - Interactive Star Rating */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {userVote === null ? "Deine Bewertung:" : "Deine Bewertung:"}
          </label>
          <div className="flex items-center gap-2">
            <StarRating
              value={userVote}
              onChange={(stars) => onVoteChange(stars)}
              disabled={false}
              size="md"
            />
            {/* 
            <p className="text-xs text-teal-600 ml-2 mt-1">
              {userVote !== null ? "Klicke zum Ändern" : "Klicke zum Bewerten"}
            </p>*/}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}