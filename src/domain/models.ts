import type { IsoDate } from '../core/dates';

/** Who is using the app on this device: a local placeholder id until the account exists, then the auth user id. */
export interface Session {
  userId: string;
}

export type PropertyStatus = 'active' | 'eliminated' | 'booked';
export type Role = 'owner' | 'member';

/** Optional fields of a house; the owner switches them on / off per vacation. */
export const OPTIONAL_FIELDS = ['price', 'bedrooms', 'beds', 'bathrooms', 'has_pool', 'address', 'description'] as const;
export type OptionalField = (typeof OPTIONAL_FIELDS)[number];

export interface VacationSettings {
  /** Fields shown in the house form and on the cards. Missing key = shown. */
  fields: Partial<Record<OptionalField, boolean>>;
}

export interface Vacation {
  id: string;
  name: string;
  description: string | null;
  destination: string | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  ownerId: string;
  settings: VacationSettings;
  createdAt: string;
}

export interface VacationSummary extends Vacation {
  members: number;
  properties: number;
  /** Title of the booked house, if there is one. */
  booked: string | null;
}

export interface Member {
  userId: string;
  name: string | null;
  role: Role;
  joinedAt: string;
}

export interface Property {
  id: string;
  vacationId: string;
  url: string;
  title: string | null;
  description: string | null;
  provider: string | null;
  price: number | null;
  beds: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  hasPool: boolean;
  address: string | null;
  lat: number | null;
  lng: number | null;
  avatar: string | null;
  status: PropertyStatus;
  /** What the listing page said when the house was added / refreshed (text only, synced, searchable). */
  previewTitle: string | null;
  previewDescription: string | null;
  previewSite: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Everything the list and the detail page show about one house. */
export interface PropertyWithStats extends Property {
  suggestedByName: string | null;
  voteCount: number;
  voteSum: number;
  voteAvg: number | null;
  myVote: number | null;
  vetoCount: number;
  myVeto: boolean;
  favoriteCount: number;
  myFavorite: boolean;
  commentCount: number;
}

export interface Vote {
  userId: string;
  name: string | null;
  value: number;
  mine: boolean;
}

export interface Comment {
  id: string;
  propertyId: string;
  authorId: string | null;
  authorName: string | null;
  text: string;
  stars: number | null;
  createdAt: string;
  mine: boolean;
}

export type PropertyInput = Partial<
  Pick<
    Property,
    | 'title'
    | 'description'
    | 'provider'
    | 'price'
    | 'beds'
    | 'bedrooms'
    | 'bathrooms'
    | 'hasPool'
    | 'address'
    | 'lat'
    | 'lng'
    | 'avatar'
    | 'previewTitle'
    | 'previewDescription'
    | 'previewSite'
  >
> & { url: string };

export interface VacationInput {
  name: string;
  description?: string | null;
  destination?: string | null;
  startDate?: IsoDate | null;
  endDate?: IsoDate | null;
}

/** A link preview as this phone has it cached. */
export interface Preview {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  /** Something an <img> can show: the cached file on phones, the provider's URL in the browser. */
  imageSrc: string | null;
  status: 'ok' | 'failed';
  fetchedAt: string;
}
