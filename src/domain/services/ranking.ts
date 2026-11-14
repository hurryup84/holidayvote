import type { PropertyWithStats } from '../models';

const STATUS_ORDER = { booked: 0, active: 1, eliminated: 2 } as const;

/**
 * Default order of the houses (concept: "highest rating → fewest vetoes → lowest price"):
 * booked first, eliminated last; then average stars, number of votes, fewer vetoes, more favourites,
 * lower price, older first (stable).
 */
export function rankProperties<T extends PropertyWithStats>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s) return s;
    const avg = (b.voteAvg ?? 0) - (a.voteAvg ?? 0);
    if (avg) return avg;
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    if (a.vetoCount !== b.vetoCount) return a.vetoCount - b.vetoCount;
    if (b.favoriteCount !== a.favoriteCount) return b.favoriteCount - a.favoriteCount;
    const price = (a.price ?? Infinity) - (b.price ?? Infinity);
    if (price && Number.isFinite(price)) return price;
    if (a.price === null && b.price !== null) return 1;
    if (b.price === null && a.price !== null) return -1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export type SortKey = 'rank' | 'price' | 'newest' | 'distance';

export function sortProperties<T extends PropertyWithStats>(list: T[], key: SortKey, distance?: (p: T) => number | null): T[] {
  if (key === 'rank') return rankProperties(list);
  const copy = [...list];
  if (key === 'newest') return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (key === 'price') return copy.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return copy.sort((a, b) => (distance?.(a) ?? Infinity) - (distance?.(b) ?? Infinity));
}
