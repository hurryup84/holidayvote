import type { Property, Profile } from "./types";
import { haversineDistance } from "@/lib/utils";

export function getPropertyStats(
  property: Property,
  userId: string | undefined,
  allVetoes: { property_id: string; user_id: string }[],
  userProfile?: Profile | null
) {
  const votes = property.votes ?? [];
  const vetoes = property.vetoes ?? [];
  const totalStars = votes.reduce((sum, v) => sum + v.stars, 0);
  const voteCount = votes.length;
  const vetoCount = vetoes.length;
  const userVote = votes.find((v) => v.user_id === userId)?.stars ?? null;
  const userVeto = vetoes.some((v) => v.user_id === userId);
  const userVetoPropertyId =
    allVetoes.find((v) => v.user_id === userId)?.property_id ?? null;

  // Calculate distance from user's home location
  let distanceFromHome: number | null = null;
  if (
    userProfile?.home_lat != null &&
    userProfile?.home_lng != null &&
    property.lat != null &&
    property.lng != null
  ) {
    distanceFromHome = haversineDistance(
      userProfile.home_lat,
      userProfile.home_lng,
      property.lat,
      property.lng
    );
  }

  // Calculate vote distribution
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  votes.forEach((v) => {
    if (v.stars >= 1 && v.stars <= 5) {
      distribution[v.stars] = (distribution[v.stars] ?? 0) + 1;
    }
  });

  return {
    totalStars,
    voteCount,
    vetoCount,
    averageStars: voteCount > 0 ? totalStars / voteCount : 0,
    userVote,
    userVeto,
    userVetoPropertyId,
    distribution,
    distanceFromHome,
  };
}

export function sortProperties(properties: Property[]): Property[] {
  return [...properties].sort((a, b) => {
    // 1. Status priority: booked > active > eliminated
    const statusOrder = { booked: 0, active: 1, eliminated: 2 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;

    // 2. Average stars (higher first)
    const aAvg = a.votes?.length ? a.votes.reduce((s, v) => s + v.stars, 0) / a.votes.length : 0;
    const bAvg = b.votes?.length ? b.votes.reduce((s, v) => s + v.stars, 0) / b.votes.length : 0;
    if (bAvg !== aAvg) return bAvg - aAvg;

    // 3. Vote count (more votes = higher confidence)
    const aCount = a.votes?.length ?? 0;
    const bCount = b.votes?.length ?? 0;
    if (bCount !== aCount) return bCount - aCount;

    // 4. Total stars (sum of all stars)
    const aTotal = a.votes?.reduce((s, v) => s + v.stars, 0) ?? 0;
    const bTotal = b.votes?.reduce((s, v) => s + v.stars, 0) ?? 0;
    if (bTotal !== aTotal) return bTotal - aTotal;

    // 5. Fewer vetoes first
    const aVetos = (a.vetoes ?? []).length;
    const bVetos = (b.vetoes ?? []).length;
    if (aVetos !== bVetos) return aVetos - bVetos;

    // 6. Lower price first
    const aPrice = a.price ?? Infinity;
    const bPrice = b.price ?? Infinity;
    return aPrice - bPrice;
  });
}