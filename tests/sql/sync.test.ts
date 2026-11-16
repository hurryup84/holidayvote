import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/core/clock';
import type { Db } from '../../src/data/db/db';
import { openSqlJsDb } from '../../src/data/db/sqljsDb';
import { FatalUploadError, type BackendOp, type PullResult, type SyncBackend, type SyncEngine } from '../../src/data/db/sync';
import { createRepos } from '../../src/data/repositories';
import { ensureLocalSession } from '../../src/data/repositories/kv';
import { createSyncEngine, isFatalCode } from '../../src/data/sync/engine';
import type { Session } from '../../src/domain/models';
import { startServer, type Server } from './pgServer';

/**
 * End-to-end test of the sync: two "phones" (sql.js + the real sync engine) talk to Postgres (PGlite)
 * running the real Supabase migrations, through a backend that does what supabase-js does
 * (upsert / delete as the signed-in user, `sync_pull` RPC).
 */
const A = '00000000-0000-7000-8000-0000000000a1';
const B = '00000000-0000-7000-8000-0000000000b1';
const clock = fixedClock('2026-11-15T12:00:00');

let server: Server;

function backendFor(uid: string): SyncBackend {
  const fail = (e: unknown) => {
    const err = e as { code?: string; message: string };
    if (isFatalCode(err.code)) throw new FatalUploadError(`${err.code} ${err.message}`);
    throw e;
  };
  return {
    async upload(ops: BackendOp[]) {
      for (const op of ops) {
        try {
          if (op.op === 'PUT') {
            const cols = Object.keys(op.data);
            await server.as(
              uid,
              `insert into ${op.table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
               on conflict (id) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}`,
              cols.map((c) => op.data[c]),
            );
          } else {
            await server.as(uid, `delete from ${op.table} where id::text = $1`, [op.id]);
          }
        } catch (e) {
          fail(e);
        }
      }
    },
    async pull(cursors) {
      const [{ r }] = await server.as<{ r: PullResult }>(uid, 'select sync_pull($1::jsonb) as r', [JSON.stringify(cursors)]);
      return r;
    },
    subscribe: () => () => undefined,
  };
}

interface Phone {
  db: Db;
  sync: SyncEngine;
  session: Session;
}
const phones: Phone[] = [];

/** A phone that used the app alone, then got its account (like AccountService.ensureAccount). */
async function phone(uid: string, name: string, before?: (p: Phone) => Promise<void>): Promise<Phone> {
  const db = await openSqlJsDb();
  const local = await ensureLocalSession(db, clock, { userName: name });
  const sync = await createSyncEngine(db, { pollMs: 1e9, debounceMs: 1e9 });
  const p: Phone = { db, sync, session: local };
  await before?.(p);
  await sync.enableSync(async (tx) => {
    await tx.execute('UPDATE profiles SET id = ? WHERE id = ?', [uid, local.userId]);
    for (const [t, c] of [
      ['vacations', 'owner_id'],
      ['vacations', 'created_by'],
      ['vacations', 'updated_by'],
      ['vacation_members', 'user_id'],
      ['properties', 'created_by'],
      ['properties', 'updated_by'],
    ]) {
      await tx.execute(`UPDATE ${t} SET ${c} = ? WHERE ${c} = ?`, [uid, local.userId]);
    }
  });
  p.session = { userId: uid };
  await server.as(uid, 'select accept_terms($1)', ['2026-11']);
  await sync.connect(backendFor(uid));
  phones.push(p);
  return p;
}

const repos = (p: Phone) => createRepos({ db: p.db, session: p.session, clock });

let anna: Phone;
let ben: Phone;
let vacation: string;
let house: string;

beforeAll(async () => {
  server = await startServer();
  await server.asAdmin(`insert into auth.users (id) values ('${A}'), ('${B}')`);
  anna = await phone(A, 'Anna', async (p) => {
    vacation = await repos(p).vacations.create({ name: 'Dänemark 2027', destination: 'Rømø', startDate: '2027-07-10' });
    house = await repos(p).properties.create(vacation, { url: 'https://www.novasol.de/ferienhaus/1', title: 'Reetdachhaus', price: 1800 });
  });
  await anna.sync.syncNow();
  ben = await phone(B, 'Ben');
  await ben.sync.syncNow();
});

afterAll(async () => {
  for (const p of phones) await p.sync.disconnect();
});

describe('sync (two phones, real migrations)', () => {
  it('uploads the local vacation when the account is created', async () => {
    expect(await server.as(A, 'select name, destination from vacations')).toEqual([{ name: 'Dänemark 2027', destination: 'Rømø' }]);
    expect(await server.as(A, 'select title, price from properties')).toEqual([{ title: 'Reetdachhaus', price: '1800.00' }]);
    expect(await anna.sync.pendingUploads()).toBe(0);
    // The local placeholder membership was replaced by the server's.
    expect(await anna.db.getAll('SELECT user_id, role, display_name FROM vacation_members')).toEqual([
      { user_id: A, role: 'owner', display_name: 'Anna' },
    ]);
  });

  it('Ben joins with a code and gets the vacation', async () => {
    const [{ r }] = await server.as<{ r: { code: string } }>(A, 'select create_invite($1) as r', [vacation]);
    await server.as(B, 'select accept_invite($1)', [r.code]);
    await ben.sync.syncNow();
    const list = await repos(ben).vacations.list();
    expect(list.map((v) => [v.name, v.members, v.properties])).toEqual([['Dänemark 2027', 2, 1]]);
    expect((await repos(ben).properties.listWithStats(vacation))[0]).toMatchObject({ title: 'Reetdachhaus', suggestedByName: 'Anna' });
  });

  it('votes, veto, favourite and comments go both ways', async () => {
    await repos(ben).votes.set(vacation, house, 5);
    await repos(ben).votes.setFavorite(vacation, house);
    await repos(ben).comments.add(vacation, house, 'Sauna! 😍', 5);
    const second = await repos(ben).properties.create(vacation, { url: 'https://www.airbnb.de/rooms/2', title: 'Strandhütte' });
    await repos(ben).votes.setVeto(vacation, second);
    await ben.sync.syncNow();
    await anna.sync.syncNow();

    const [top, other] = await repos(anna).properties.listWithStats(vacation).then((l) => l.sort((a, b) => (b.voteAvg ?? 0) - (a.voteAvg ?? 0)));
    expect(top).toMatchObject({ id: house, voteAvg: 5, favoriteCount: 1, commentCount: 1, myVote: null });
    expect(other).toMatchObject({ title: 'Strandhütte', vetoCount: 1, suggestedByName: 'Ben' });
    expect((await repos(anna).comments.forProperty(house))[0]).toMatchObject({ text: 'Sauna! 😍', authorName: 'Ben', mine: false });

    // Moving the veto changes the same row (no second veto)
    await repos(ben).votes.setVeto(vacation, house);
    await ben.sync.syncNow();
    expect(await server.as(A, 'select count(*)::int as n from vetoes')).toEqual([{ n: 1 }]);
  });

  it('preview text is shown but not stored with the link; the preview cache (with the picture) stays on the phone', async () => {
    const id = await repos(anna).properties.create(vacation, {
      url: 'https://www.booking.com/hotel/dk/x.html',
      title: 'Mein Titel',
    });
    await anna.db.execute(
      "INSERT INTO preview_cache (id, title, image_url, image_file, status, fetched_at) VALUES ('https://www.booking.com/hotel/dk/x.html', 'x', 'https://cf.bstatic.com/1.jpg', 'previews/1.jpg', 'ok', '2026-11-15')",
    );
    expect(await anna.sync.pendingUploads()).toBe(1); // the house only
    await anna.sync.syncNow();
    expect(await server.as(A, 'select title, preview_title, preview_description, preview_site from properties where id = $1', [id])).toEqual([
      { title: 'Mein Titel', preview_title: null, preview_description: null, preview_site: null },
    ]);
    await ben.sync.syncNow();
    expect(await repos(ben).properties.get(id)).toMatchObject({ title: 'Mein Titel' });
    expect(await ben.db.getAll('SELECT id FROM preview_cache')).toEqual([]);
    await repos(anna).properties.remove(id);
    await anna.sync.syncNow();
  });

  it('only the owner books; a member\'s attempt is ignored by the server and comes back', async () => {
    await repos(ben).properties.setStatus(house, 'booked');
    await ben.sync.syncNow();
    await ben.sync.syncNow();
    expect((await repos(ben).properties.get(house))?.status).toBe('active');
    await repos(anna).properties.setStatus(house, 'booked');
    await anna.sync.syncNow();
    await ben.sync.syncNow();
    expect((await repos(ben).properties.get(house))?.status).toBe('booked');
  });

  it('Ben leaves → the vacation disappears from his phone, his votes go', async () => {
    await server.as(B, 'select leave_vacation($1)', [vacation]);
    await ben.sync.syncNow();
    expect(await repos(ben).vacations.list()).toEqual([]);
    expect(await ben.db.getAll('SELECT id FROM properties')).toEqual([]);
    await anna.sync.syncNow();
    expect((await repos(anna).properties.getWithStats(house))?.voteCount).toBe(0);
    // His comment stays (content of the vacation)
    expect((await repos(anna).comments.forProperty(house)).length).toBe(1);
  });

  it('owner deletes the vacation → gone everywhere', async () => {
    await server.as(A, 'select delete_vacation($1)', [vacation]);
    await anna.sync.syncNow();
    expect(await repos(anna).vacations.list()).toEqual([]);
  });
});
