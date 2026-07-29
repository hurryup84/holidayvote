"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number | null;
  onChange: (stars: number) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function StarRating({
  value,
  onChange,
  disabled,
  size = "md",
}: StarRatingProps) {
  const iconSize = size === "sm" ? "h-5 w-5" : "h-7 w-7";

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          className={cn(
            "transition-colors disabled:opacity-50",
            value && value >= star
              ? "text-amber-400"
              : "text-slate-300 hover:text-amber-300"
          )}
          aria-label={`${star} Stern${star > 1 ? "e" : ""}`}
        >
          <Star
            className={cn(iconSize, value && value >= star && "fill-current")}
          />
        </button>
      ))}
    </div>
  );
}

export function StarDisplay({ stars, max = 5 }: { stars: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5 text-amber-400">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={cn("h-4 w-4", i < stars && "fill-current")}
        />
      ))}
    </span>
  );
}

export function starsLabel(stars: number | null): string {
  if (!stars) return "";
  return "⭐".repeat(stars);
}