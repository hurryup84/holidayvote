import type { Comment, Property, PropertyStatus, PropertyWithStats, Vacation, VacationSettings } from '../../domain/models';

// Row shapes as they come out of SQLite.
export interface VacationRow {
  id: string;
  name: string;
  description: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  owner_id: string;
  settings: string | null;
  created_at: string;
}

export function parseSettings(v: string | null): VacationSettings {
  try {
    const s = JSON.parse(v || '{}') as Partial<VacationSettings>;
    return { fields: s.fields && typeof s.fields === 'object' ? s.fields : {} };
  } catch {
    return { fields: {} };
  }
}

export function mapVacation(r: VacationRow): Vacation {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    destination: r.destination,
    startDate: r.start_date,
    endDate: r.end_date,
    ownerId: r.owner_id,
    settings: parseSettings(r.settings),
    createdAt: r.created_at,
  };
}

export interface PropertyRow {
  id: string;
  vacation_id: string;
  url: string;
  title: string | null;
  description: string | null;
  provider: string | null;
  price: number | null;
  beds: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  has_pool: number | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  avatar: string | null;
  status: string | null;
  preview_title: string | null;
  preview_description: string | null;
  preview_site: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function mapProperty(r: PropertyRow): Property {
  return {
    id: r.id,
    vacationId: r.vacation_id,
    url: r.url,
    title: r.title,
    description: r.description,
    provider: r.provider,
    price: num(r.price),
    beds: num(r.beds),
    bedrooms: num(r.bedrooms),
    bathrooms: num(r.bathrooms),
    hasPool: Number(r.has_pool ?? 0) === 1,
    address: r.address,
    lat: num(r.lat),
    lng: num(r.lng),
    avatar: r.avatar,
    status: (['active', 'eliminated', 'booked'].includes(r.status ?? '') ? r.status : 'active') as PropertyStatus,
    previewTitle: r.preview_title ?? null,
    previewDescription: r.preview_description ?? null,
    previewSite: r.preview_site ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface PropertyStatsRow extends PropertyRow {
  suggested_by_name: string | null;
  vote_count: number | null;
  vote_sum: number | null;
  my_vote: number | null;
  veto_count: number | null;
  my_veto: number | null;
  favorite_count: number | null;
  my_favorite: number | null;
  comment_count: number | null;
}

export function mapPropertyWithStats(r: PropertyStatsRow): PropertyWithStats {
  const voteCount = Number(r.vote_count ?? 0);
  const voteSum = Number(r.vote_sum ?? 0);
  return {
    ...mapProperty(r),
    suggestedByName: r.suggested_by_name,
    voteCount,
    voteSum,
    voteAvg: voteCount ? voteSum / voteCount : null,
    myVote: num(r.my_vote),
    vetoCount: Number(r.veto_count ?? 0),
    myVeto: Number(r.my_veto ?? 0) === 1,
    favoriteCount: Number(r.favorite_count ?? 0),
    myFavorite: Number(r.my_favorite ?? 0) === 1,
    commentCount: Number(r.comment_count ?? 0),
  };
}

export interface CommentRow {
  id: string;
  property_id: string;
  created_by: string | null;
  author_name: string | null;
  text: string;
  stars: number | null;
  created_at: string;
}

export function mapComment(r: CommentRow, me: string): Comment {
  return {
    id: r.id,
    propertyId: r.property_id,
    authorId: r.created_by,
    authorName: r.author_name,
    text: r.text,
    stars: num(r.stars),
    createdAt: r.created_at,
    mine: r.created_by === me,
  };
}

/** Name of a person at a vacation: the server-maintained copy, or my own profile (before the first sync). */
export const memberNameSql = (vacationCol: string, userCol: string) =>
  `COALESCE((SELECT m.display_name FROM vacation_members m WHERE m.vacation_id = ${vacationCol} AND m.user_id = ${userCol}),
            (SELECT pr.display_name FROM profiles pr WHERE pr.id = ${userCol}))`;
