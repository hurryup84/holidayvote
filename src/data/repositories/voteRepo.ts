import { newId } from '../../core/ids';
import type { Vote } from '../../domain/models';
import type { RepoContext } from './context';
import { memberNameSql } from './rows';

/**
 * Stars 1–5 per person and house; one veto and one favourite per person and vacation.
 * One row per person (votes: per house); removing sets deleted_at, moving a veto / favourite
 * changes property_id of the same row – so two devices never create competing rows.
 */
export function voteRepo({ db, session, clock }: RepoContext) {
  const u = session.userId;

  async function pick(kind: 'vetoes' | 'favorites', vacationId: string, propertyId: string | null): Promise<void> {
    const now = clock.nowIso();
    await db.writeTransaction(async (tx) => {
      const existing = await tx.getOptional<{ id: string }>(`SELECT id FROM ${kind} WHERE vacation_id = ? AND user_id = ?`, [
        vacationId,
        u,
      ]);
      if (existing) {
        await tx.execute(
          `UPDATE ${kind} SET property_id = COALESCE(?, property_id), deleted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?`,
          [propertyId, propertyId === null ? now : null, u, now, existing.id],
        );
      } else if (propertyId !== null) {
        await tx.execute(
          `INSERT INTO ${kind} (id, vacation_id, user_id, property_id, created_by, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [newId(), vacationId, u, propertyId, u, u, now, now],
        );
      }
    });
  }

  return {
    /** My stars (1–5) for a house, or null to remove them. */
    async set(vacationId: string, propertyId: string, value: number | null): Promise<void> {
      if (value !== null && !(Number.isInteger(value) && value >= 1 && value <= 5)) throw new Error(`invalid vote ${value}`);
      const now = clock.nowIso();
      await db.writeTransaction(async (tx) => {
        const existing = await tx.getOptional<{ id: string }>('SELECT id FROM votes WHERE property_id = ? AND user_id = ?', [propertyId, u]);
        if (existing) {
          await tx.execute('UPDATE votes SET value = COALESCE(?, value), deleted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?', [
            value,
            value === null ? now : null,
            u,
            now,
            existing.id,
          ]);
        } else if (value !== null) {
          await tx.execute(
            `INSERT INTO votes (id, vacation_id, property_id, user_id, value, created_by, updated_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [newId(), vacationId, propertyId, u, value, u, u, now, now],
          );
        }
      });
    },

    /** Who voted what (best first, mine on top among equals). */
    async forProperty(propertyId: string): Promise<Vote[]> {
      const rows = await db.getAll<{ user_id: string; value: number; name: string | null }>(
        `SELECT v.user_id, v.value, ${memberNameSql('v.vacation_id', 'v.user_id')} AS name FROM votes v
         WHERE v.property_id = ? AND v.deleted_at IS NULL
         ORDER BY v.value DESC, (v.user_id = ?) DESC`,
        [propertyId, u],
      );
      return rows.map((r) => ({ userId: r.user_id, name: r.name, value: Number(r.value), mine: r.user_id === u }));
    },

    /** Names of the people who vetoed / favoured a house. */
    async pickedBy(kind: 'vetoes' | 'favorites', propertyId: string): Promise<{ userId: string; name: string | null }[]> {
      const rows = await db.getAll<{ user_id: string; name: string | null }>(
        `SELECT x.user_id, ${memberNameSql('x.vacation_id', 'x.user_id')} AS name FROM ${kind} x
         WHERE x.property_id = ? AND x.deleted_at IS NULL`,
        [propertyId],
      );
      return rows.map((r) => ({ userId: r.user_id, name: r.name }));
    },

    /** My veto moves to this house (null = take it back). */
    setVeto: (vacationId: string, propertyId: string | null) => pick('vetoes', vacationId, propertyId),
    /** My favourite moves to this house (null = take it back). */
    setFavorite: (vacationId: string, propertyId: string | null) => pick('favorites', vacationId, propertyId),

    /** The house my veto is on (to warn "this moves your veto"). */
    async myVeto(vacationId: string): Promise<string | null> {
      const r = await db.getOptional<{ property_id: string }>(
        'SELECT property_id FROM vetoes WHERE vacation_id = ? AND user_id = ? AND deleted_at IS NULL',
        [vacationId, u],
      );
      return r?.property_id ?? null;
    },
  };
}

export type VoteRepo = ReturnType<typeof voteRepo>;
