import type { Clock } from '../../core/clock';
import type { Db } from '../db/db';
import type { Session } from '../../domain/models';

/** Everything a repository needs. Writes always stamp vacation_id / created_by / timestamps. */
export interface RepoContext {
  db: Db;
  session: Session;
  clock: Clock;
}
