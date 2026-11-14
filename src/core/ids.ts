import { v7 as uuidv7 } from 'uuid';

/** Device-generated, time-sortable UUID (v7). Used for every row. */
export function newId(): string {
  return uuidv7();
}
