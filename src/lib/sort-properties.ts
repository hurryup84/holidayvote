import type { Property } from "./types";

export function getPropertyStats(
  property: Property,
  userId: string | undefined,
  allVetoes: { property_id: string; user_id: string }[]
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

  return {
    totalStars,
    voteCount,
    vetoCount,
    averageStars: voteCount > 0 ? totalStars / voteCount : 0,
    userVote,
    userVeto,
    userVetoPropertyId,
  };
}

export function sortProperties(properties: Property[]): Property[] {
  return [...properties].sort((a, b) => {
    // Booked first, then active, eliminated last
    const statusOrder = { booked: 0, active: 1, eliminated: 2 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;

    const aStars = (a.votes ?? []).reduce((s, v) => s + v.stars, 0);
    const bStars = (b.votes ?? []).reduce((s, v) => s + v.stars, 0);
    if (bStars !== aStars) return bStars - aStars;

    const aVetos = (a.vetoes ?? []).length;
    const bVetos = (b.vetoes ?? []).length;
    if (aVetos !== bVetos) return aVetos - bVetos;

    const aPrice = a.price ?? Infinity;
    const bPrice = b.price ?? Infinity;
    return aPrice - bPrice;
  });
}
