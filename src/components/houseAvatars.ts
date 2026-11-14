/** Icon for a house whose page has no preview picture (picked in the house form). Emoji: no image files. */
export const HOUSE_AVATARS = [
  { id: 'house', icon: '🏠' },
  { id: 'beach', icon: '🏖️' },
  { id: 'mountain', icon: '🏔️' },
  { id: 'cabin', icon: '🛖' },
  { id: 'villa', icon: '🏛️' },
  { id: 'forest', icon: '🌲' },
  { id: 'city', icon: '🏙️' },
  { id: 'castle', icon: '🏰' },
  { id: 'farm', icon: '🌾' },
  { id: 'boat', icon: '⛵' },
  { id: 'lake', icon: '🏞️' },
  { id: 'tent', icon: '⛺' },
] as const;

export function avatarIcon(id: string | null | undefined): string {
  return HOUSE_AVATARS.find((a) => a.id === id)?.icon ?? '🏠';
}
