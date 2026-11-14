import { newId } from '../../core/ids';
import type { Comment } from '../../domain/models';
import type { RepoContext } from './context';
import { mapComment, memberNameSql, type CommentRow } from './rows';

export const COMMENT_TABLES = ['comments', 'vacation_members'];

export function commentRepo({ db, session, clock }: RepoContext) {
  const u = session.userId;
  return {
    async forProperty(propertyId: string): Promise<Comment[]> {
      const rows = await db.getAll<CommentRow>(
        `SELECT c.id, c.property_id, c.created_by, ${memberNameSql('c.vacation_id', 'c.created_by')} AS author_name,
                c.text, c.stars, c.created_at
         FROM comments c WHERE c.property_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at`,
        [propertyId],
      );
      return rows.map((r) => mapComment(r, u));
    },

    async add(vacationId: string, propertyId: string, text: string, stars: number | null): Promise<void> {
      const body = text.trim();
      if (!body) return;
      const now = clock.nowIso();
      await db.execute(
        `INSERT INTO comments (id, vacation_id, property_id, text, stars, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId(), vacationId, propertyId, body.slice(0, 1000), stars, u, u, now, now],
      );
    },

    /** Own comments only (the server enforces it too). */
    async remove(id: string): Promise<void> {
      const now = clock.nowIso();
      await db.execute('UPDATE comments SET deleted_at = ?, updated_by = ?, updated_at = ? WHERE id = ? AND created_by = ?', [now, u, now, id, u]);
    },
  };
}
