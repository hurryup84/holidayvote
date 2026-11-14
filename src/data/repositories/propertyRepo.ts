import { newId } from '../../core/ids';
import type { Property, PropertyInput, PropertyStatus, PropertyWithStats } from '../../domain/models';
import type { RepoContext } from './context';
import { mapProperty, mapPropertyWithStats, memberNameSql, type PropertyRow, type PropertyStatsRow } from './rows';

export const PROPERTY_TABLES = ['properties', 'votes', 'vetoes', 'favorites', 'comments', 'vacation_members'];

/** Same link, ignoring tracking parameters, "www.", trailing slashes and case of the host. */
export function urlKey(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return `${host}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

const statsSql = (where: string) => `
  SELECT p.*,
    ${memberNameSql('p.vacation_id', 'p.created_by')} AS suggested_by_name,
    (SELECT COUNT(*) FROM votes v WHERE v.property_id = p.id AND v.deleted_at IS NULL) AS vote_count,
    (SELECT SUM(v.value) FROM votes v WHERE v.property_id = p.id AND v.deleted_at IS NULL) AS vote_sum,
    (SELECT v.value FROM votes v WHERE v.property_id = p.id AND v.user_id = ? AND v.deleted_at IS NULL) AS my_vote,
    (SELECT COUNT(*) FROM vetoes x WHERE x.property_id = p.id AND x.deleted_at IS NULL) AS veto_count,
    EXISTS (SELECT 1 FROM vetoes x WHERE x.property_id = p.id AND x.user_id = ? AND x.deleted_at IS NULL) AS my_veto,
    (SELECT COUNT(*) FROM favorites f WHERE f.property_id = p.id AND f.deleted_at IS NULL) AS favorite_count,
    EXISTS (SELECT 1 FROM favorites f WHERE f.property_id = p.id AND f.user_id = ? AND f.deleted_at IS NULL) AS my_favorite,
    (SELECT COUNT(*) FROM comments c WHERE c.property_id = p.id AND c.deleted_at IS NULL) AS comment_count
  FROM properties p WHERE ${where} AND p.deleted_at IS NULL`;

const fieldValues = (i: PropertyInput) => [
  i.title?.trim() || null,
  i.description?.trim() || null,
  i.provider?.trim() || null,
  i.price ?? null,
  i.beds ?? null,
  i.bedrooms ?? null,
  i.bathrooms ?? null,
  i.hasPool ? 1 : 0,
  i.address?.trim() || null,
  i.lat ?? null,
  i.lng ?? null,
  i.avatar ?? null,
  i.previewTitle?.trim().slice(0, 300) || null,
  i.previewDescription?.trim().slice(0, 2000) || null,
  i.previewSite?.trim().slice(0, 100) || null,
];

export function propertyRepo({ db, session, clock }: RepoContext) {
  const u = session.userId;
  return {
    async listWithStats(vacationId: string): Promise<PropertyWithStats[]> {
      const rows = await db.getAll<PropertyStatsRow>(statsSql('p.vacation_id = ?'), [u, u, u, vacationId]);
      return rows.map(mapPropertyWithStats);
    },

    async getWithStats(id: string): Promise<PropertyWithStats | null> {
      const r = await db.getOptional<PropertyStatsRow>(statsSql('p.id = ?'), [u, u, u, id]);
      return r ? mapPropertyWithStats(r) : null;
    },

    async get(id: string): Promise<Property | null> {
      const r = await db.getOptional<PropertyRow>('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL', [id]);
      return r ? mapProperty(r) : null;
    },

    /** A house with the same link already in this vacation (duplicate warning). */
    async findByUrl(vacationId: string, url: string, exceptId?: string): Promise<Property | null> {
      const key = urlKey(url);
      const rows = await db.getAll<PropertyRow>('SELECT * FROM properties WHERE vacation_id = ? AND deleted_at IS NULL', [vacationId]);
      const hit = rows.find((r) => r.id !== exceptId && urlKey(r.url) === key);
      return hit ? mapProperty(hit) : null;
    },

    async create(vacationId: string, input: PropertyInput): Promise<string> {
      const id = newId();
      const now = clock.nowIso();
      await db.execute(
        `INSERT INTO properties (id, vacation_id, url, title, description, provider, price, beds, bedrooms, bathrooms, has_pool,
           address, lat, lng, avatar, preview_title, preview_description, preview_site, status, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
        [id, vacationId, input.url.trim(), ...fieldValues(input), u, u, now, now],
      );
      return id;
    },

    async update(id: string, input: PropertyInput): Promise<void> {
      await db.execute(
        `UPDATE properties SET url = ?, title = ?, description = ?, provider = ?, price = ?, beds = ?, bedrooms = ?, bathrooms = ?,
           has_pool = ?, address = ?, lat = ?, lng = ?, avatar = ?, preview_title = ?, preview_description = ?, preview_site = ?,
           updated_by = ?, updated_at = ?
         WHERE id = ?`,
        [input.url.trim(), ...fieldValues(input), u, clock.nowIso(), id],
      );
    },

    /** "Refresh preview": keep what the listing page says now with the link (only if it changed). */
    async setPreviewInfo(id: string, info: { title: string | null; description: string | null; siteName: string | null }): Promise<void> {
      const cur = await db.getOptional<{ preview_title: string | null; preview_description: string | null; preview_site: string | null }>(
        'SELECT preview_title, preview_description, preview_site FROM properties WHERE id = ?',
        [id],
      );
      const next = [info.title?.slice(0, 300) ?? null, info.description?.slice(0, 2000) ?? null, info.siteName?.slice(0, 100) ?? null];
      if (!cur || (cur.preview_title === next[0] && cur.preview_description === next[1] && cur.preview_site === next[2])) return;
      if (next.every((v) => v === null)) return; // a failed fetch never wipes what we had
      await db.execute(
        'UPDATE properties SET preview_title = ?, preview_description = ?, preview_site = ?, updated_by = ?, updated_at = ? WHERE id = ?',
        [...next, u, clock.nowIso(), id],
      );
    },

    /** Only the owner may change the status (the server enforces it). Booking one house un-books the others. */
    async setStatus(id: string, status: PropertyStatus): Promise<void> {
      const now = clock.nowIso();
      await db.writeTransaction(async (tx) => {
        if (status === 'booked') {
          const p = await tx.getOptional<{ vacation_id: string }>('SELECT vacation_id FROM properties WHERE id = ?', [id]);
          if (p) {
            await tx.execute(
              "UPDATE properties SET status = 'active', updated_by = ?, updated_at = ? WHERE vacation_id = ? AND status = 'booked' AND id <> ?",
              [u, now, p.vacation_id, id],
            );
          }
        }
        await tx.execute('UPDATE properties SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?', [status, u, now, id]);
      });
    },

    /** Soft delete (synced to everyone). Allowed for the owner and whoever suggested the house. */
    async remove(id: string): Promise<void> {
      const now = clock.nowIso();
      await db.execute('UPDATE properties SET deleted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?', [now, u, now, id]);
    },

    /** Houses with coordinates (map). */
    async withCoordinates(vacationId: string): Promise<Property[]> {
      const rows = await db.getAll<PropertyRow>(
        'SELECT * FROM properties WHERE vacation_id = ? AND deleted_at IS NULL AND lat IS NOT NULL AND lng IS NOT NULL',
        [vacationId],
      );
      return rows.map(mapProperty);
    },
  };
}

export type PropertyRepo = ReturnType<typeof propertyRepo>;
