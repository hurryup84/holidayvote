/**
 * Single source of truth for the local schema (plain SQLite; sql.js in the browser and tests).
 * Every table has an implicit `id TEXT PRIMARY KEY`. Mirrors concept/03_data_model.md and the
 * server tables in supabase/migrations.
 * Push devices, delivery events and receipts are server-only and are never mirrored here.
 *
 * Holiday-home pictures are never in the database (local or server). Each phone keeps its own cache of
 * the link previews (`preview_cache`, local only; the picture as a file in the app's data directory –
 * src/data/media/previewCache.ts). The preview TEXT (title, description, site) is stored with the link
 * (`properties.preview_*`), synced, so houses can be searched.
 */
export type ColType = 'text' | 'integer' | 'real';

export interface TableDef {
  columns: Record<string, ColType>;
  /** Never synced (device-specific state). */
  localOnly?: boolean;
  indexes?: Record<string, string[]>;
}

const audit = {
  created_by: 'text',
  updated_by: 'text',
  created_at: 'text',
  updated_at: 'text',
  deleted_at: 'text',
} as const satisfies Record<string, ColType>;

export const SCHEMA = {
  profiles: {
    columns: {
      display_name: 'text',
      created_at: 'text',
      updated_at: 'text',
    },
  },
  /** The shared space ("table" in Esstisch): one holiday that a group decides on. */
  vacations: {
    columns: {
      name: 'text',
      description: 'text',
      destination: 'text',
      start_date: 'text', // YYYY-MM-DD
      end_date: 'text', // YYYY-MM-DD
      owner_id: 'text',
      settings: 'text', // JSON: VacationSettings
      ...audit,
    },
  },
  vacation_members: {
    columns: {
      vacation_id: 'text',
      user_id: 'text',
      role: 'text', // owner | member
      display_name: 'text', // copy of the member's profile name (server-maintained)
      joined_at: 'text',
      created_at: 'text',
      updated_at: 'text',
    },
    indexes: { by_vacation: ['vacation_id'] },
  },
  /** A holiday home: its link plus what the group typed in. No picture. */
  properties: {
    columns: {
      vacation_id: 'text',
      url: 'text',
      title: 'text',
      description: 'text',
      provider: 'text',
      price: 'real', // total price for the stay
      beds: 'integer',
      bedrooms: 'integer',
      bathrooms: 'integer',
      has_pool: 'integer', // 0 / 1
      address: 'text',
      lat: 'real',
      lng: 'real',
      avatar: 'text', // icon key when the page has no preview picture (components/houseAvatars.ts)
      status: 'text', // active | eliminated | booked
      preview_title: 'text', // what the listing page said (OpenGraph), kept for search
      preview_description: 'text',
      preview_site: 'text',
      ...audit,
    },
    indexes: { by_vacation: ['vacation_id'] },
  },
  /** Stars 1–5 per person and house (one row each; removing a vote sets deleted_at). */
  votes: {
    columns: {
      vacation_id: 'text',
      property_id: 'text',
      user_id: 'text',
      value: 'integer',
      ...audit,
    },
    indexes: { by_property: ['property_id'], by_vacation: ['vacation_id'] },
  },
  /** One veto per person and vacation ("not for me"): one row per person, property_id moves. */
  vetoes: {
    columns: {
      vacation_id: 'text',
      user_id: 'text',
      property_id: 'text',
      ...audit,
    },
    indexes: { by_vacation: ['vacation_id'] },
  },
  /** One favourite per person and vacation: one row per person, property_id moves. */
  favorites: {
    columns: {
      vacation_id: 'text',
      user_id: 'text',
      property_id: 'text',
      ...audit,
    },
    indexes: { by_vacation: ['vacation_id'] },
  },
  /** Short comments on a house, optionally with stars. Author = created_by. */
  comments: {
    columns: {
      vacation_id: 'text',
      property_id: 'text',
      text: 'text',
      stars: 'integer',
      ...audit,
    },
    indexes: { by_property: ['property_id'] },
  },
  /**
   * This phone's cache of link previews (never synced, never uploaded). Key = the link. The picture is a
   * downscaled file (`image_file`, relative to the app's data directory); in the browser only its URL.
   */
  preview_cache: {
    localOnly: true,
    columns: {
      title: 'text',
      description: 'text',
      site_name: 'text',
      image_url: 'text',
      image_file: 'text',
      status: 'text', // ok | failed
      fetched_at: 'text',
    },
  },
  app_kv: {
    localOnly: true,
    columns: { value: 'text' },
  },
} satisfies Record<string, TableDef>;

export type TableName = keyof typeof SCHEMA;

/** Tables that sync once the user has an account, in upload order (parents first). */
export const SYNCABLE_TABLES = [
  'profiles',
  'vacations',
  'vacation_members',
  'properties',
  'votes',
  'vetoes',
  'favorites',
  'comments',
] as const;
export type SyncableTable = (typeof SYNCABLE_TABLES)[number];

/** Data that belongs to one vacation (`vacation_id`; `vacations` itself by `id`), in upload order. */
export const VACATION_DATA = ['vacations', 'properties', 'votes', 'vetoes', 'favorites', 'comments'] as const;

export function columnsOf(name: TableName): string[] {
  return ['id', ...Object.keys((SCHEMA as Record<string, TableDef>)[name].columns)];
}
export const TABLE_NAMES = Object.keys(SCHEMA) as TableName[];

/** Plain SQLite DDL. */
export function schemaToDdl(): string[] {
  const out: string[] = [];
  for (const [name, def] of Object.entries(SCHEMA) as [string, TableDef][]) {
    const cols = Object.entries(def.columns).map(([c, t]) => `${c} ${t.toUpperCase()}`);
    out.push(`CREATE TABLE IF NOT EXISTS ${name} (id TEXT PRIMARY KEY, ${cols.join(', ')})`);
    for (const [idx, idxCols] of Object.entries(def.indexes ?? {})) {
      out.push(`CREATE INDEX IF NOT EXISTS ${name}_${idx} ON ${name} (${idxCols.join(', ')})`);
    }
  }
  return out;
}
