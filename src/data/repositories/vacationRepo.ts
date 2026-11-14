import { newId } from '../../core/ids';
import type { Member, Role, Vacation, VacationInput, VacationSettings, VacationSummary } from '../../domain/models';
import type { RepoContext } from './context';
import { mapVacation, parseSettings, type VacationRow } from './rows';

export const VACATION_TABLES = ['vacations', 'vacation_members', 'properties'];

const clean = (s: string | null | undefined) => (s ?? '').trim() || null;

export function vacationRepo({ db, session, clock }: RepoContext) {
  const u = session.userId;
  return {
    /** My vacations (newest first), with a few numbers for the list. */
    async list(): Promise<VacationSummary[]> {
      const rows = await db.getAll<
        VacationRow & { members: number; properties: number; booked: string | null }
      >(
        `SELECT v.*,
           (SELECT COUNT(*) FROM vacation_members x WHERE x.vacation_id = v.id) AS members,
           (SELECT COUNT(*) FROM properties p WHERE p.vacation_id = v.id AND p.deleted_at IS NULL AND p.status <> 'eliminated') AS properties,
           (SELECT COALESCE(p.title, p.provider, p.url) FROM properties p
            WHERE p.vacation_id = v.id AND p.deleted_at IS NULL AND p.status = 'booked' LIMIT 1) AS booked
         FROM vacations v JOIN vacation_members m ON m.vacation_id = v.id AND m.user_id = ?
         WHERE v.deleted_at IS NULL
         ORDER BY COALESCE(v.start_date, '9999') DESC, v.created_at DESC`,
        [u],
      );
      return rows.map((r) => ({
        ...mapVacation(r),
        members: Math.max(1, Number(r.members)),
        properties: Number(r.properties),
        booked: r.booked,
      }));
    },

    async get(id: string): Promise<Vacation | null> {
      const r = await db.getOptional<VacationRow>('SELECT * FROM vacations WHERE id = ? AND deleted_at IS NULL', [id]);
      return r ? mapVacation(r) : null;
    },

    /** A new vacation, owned by me. On the server the owner membership is created by a trigger. */
    async create(input: VacationInput): Promise<string> {
      const id = newId();
      const now = clock.nowIso();
      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO vacations (id, name, description, destination, start_date, end_date, owner_id, settings,
             created_by, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            input.name.trim(),
            clean(input.description),
            clean(input.destination),
            input.startDate || null,
            input.endDate || null,
            u,
            JSON.stringify({ fields: {} } satisfies VacationSettings),
            u,
            u,
            now,
            now,
          ],
        );
        // Bridges until sync brings the server's membership (vacation_members is never uploaded).
        await tx.execute(
          `INSERT INTO vacation_members (id, vacation_id, user_id, role, joined_at, created_at, updated_at)
           VALUES (?, ?, ?, 'owner', ?, ?, ?)`,
          [newId(), id, u, now, now, now],
        );
      });
      return id;
    },

    async update(id: string, input: VacationInput): Promise<void> {
      await db.execute(
        `UPDATE vacations SET name = ?, description = ?, destination = ?, start_date = ?, end_date = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`,
        [input.name.trim(), clean(input.description), clean(input.destination), input.startDate || null, input.endDate || null, u, clock.nowIso(), id],
      );
    },

    async updateSettings(id: string, patch: Partial<VacationSettings>): Promise<void> {
      const r = await db.getOptional<{ settings: string | null }>('SELECT settings FROM vacations WHERE id = ?', [id]);
      const next = { ...parseSettings(r?.settings ?? null), ...patch };
      await db.execute('UPDATE vacations SET settings = ?, updated_by = ?, updated_at = ? WHERE id = ?', [
        JSON.stringify(next),
        u,
        clock.nowIso(),
        id,
      ]);
    },

    /** People at the vacation (owner first). */
    async members(vacationId: string): Promise<Member[]> {
      const rows = await db.getAll<{ user_id: string; display_name: string | null; role: string; joined_at: string }>(
        `SELECT m.user_id, COALESCE(m.display_name, (SELECT p.display_name FROM profiles p WHERE p.id = m.user_id)) AS display_name,
                m.role, m.joined_at
         FROM vacation_members m WHERE m.vacation_id = ? ORDER BY (m.role = 'owner') DESC, m.joined_at`,
        [vacationId],
      );
      return rows.map((r) => ({ userId: r.user_id, name: r.display_name, role: r.role as Role, joinedAt: r.joined_at }));
    },

    async myRole(vacationId: string): Promise<Role | null> {
      const r = await db.getOptional<{ role: string }>('SELECT role FROM vacation_members WHERE vacation_id = ? AND user_id = ?', [
        vacationId,
        u,
      ]);
      return (r?.role as Role) ?? null;
    },

    /** Removes a vacation that was never on the server (only on this phone). Shared ones: AccountService. */
    async deleteLocal(id: string): Promise<void> {
      await db.writeTransaction(async (tx) => {
        for (const t of ['comments', 'votes', 'vetoes', 'favorites', 'properties', 'vacation_members']) {
          await tx.execute(`DELETE FROM ${t} WHERE vacation_id = ?`, [id]);
        }
        await tx.execute('DELETE FROM vacations WHERE id = ?', [id]);
      });
    },
  };
}

export type VacationRepo = ReturnType<typeof vacationRepo>;
