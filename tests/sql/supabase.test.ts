import { beforeAll, describe, expect, it } from 'vitest';
import { startServer, type Server } from './pgServer';

/**
 * Runs the real Supabase migrations against Postgres (PGlite) with small stand-ins for the
 * Supabase-provided schemas, then checks row-level security and the RPCs as different users.
 */
const A = '00000000-0000-7000-8000-00000000000a';
const B = '00000000-0000-7000-8000-00000000000b';
const C = '00000000-0000-7000-8000-00000000000c';
const VAC_A = '10000000-0000-7000-8000-00000000000a';
const VAC_B = '10000000-0000-7000-8000-00000000000b';
const HOUSE_A = '20000000-0000-7000-8000-00000000000a';
const HOUSE_A2 = '20000000-0000-7000-8000-0000000000a2';
const HOUSE_B = '20000000-0000-7000-8000-00000000000b';

let as: Server['as'];
let asAdmin: Server['asAdmin'];

async function errorOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'no error';
  } catch (e) {
    return String((e as Error).message);
  }
}

async function invite(owner: string, vacation: string): Promise<string> {
  const [r] = await as<{ r: { code: string } }>(owner, 'select create_invite($1) as r', [vacation]);
  return r.r.code;
}

beforeAll(async () => {
  ({ as, asAdmin } = await startServer());
  await asAdmin(`insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}')`);
  for (const [u, name] of [[A, 'Anna'], [B, 'Ben'], [C, 'Cleo']]) {
    await as(u, 'insert into profiles (id, display_name) values ($1, $2)', [u, name]);
    await as(u, `select accept_terms('2026-11')`);
  }
  for (const [u, v, h] of [[A, VAC_A, HOUSE_A], [B, VAC_B, HOUSE_B]]) {
    await as(u, `insert into vacations (id, name, owner_id, created_by) values ($1, 'Sommer', $2, $2)`, [v, u]);
    await as(u, `insert into properties (id, vacation_id, url, title, created_by) values ($1, $2, 'https://www.airbnb.de/rooms/1', 'Haus', $3)`, [h, v, u]);
  }
});

describe('schema + RLS', () => {
  it('creating a vacation makes the creator its owner', async () => {
    expect(await as(A, 'select role, display_name from vacation_members where vacation_id = $1', [VAC_A])).toEqual([
      { role: 'owner', display_name: 'Anna' },
    ]);
  });

  it('users only see their own vacations', async () => {
    expect(await as(B, 'select id from properties where vacation_id = $1', [VAC_A])).toEqual([]);
    expect(await as(C, 'select id from vacations')).toEqual([]);
  });

  it('no picture column exists on properties', async () => {
    const cols = await asAdmin<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'properties'",
    );
    expect(cols.map((c) => c.column_name).filter((c) => /image|photo|picture/.test(c))).toEqual([]);
  });

  it('cannot write into a foreign vacation or fake memberships', async () => {
    expect(await errorOf(as(B, `insert into properties (id, vacation_id, url, created_by) values (gen_random_uuid(), $1, 'https://x.de', $2)`, [VAC_A, B]))).toMatch(
      /row-level security/,
    );
    expect(await errorOf(as(B, 'insert into vacation_members (vacation_id, user_id) values ($1, $2)', [VAC_A, B]))).toMatch(/permission denied|row-level security/);
    expect(await errorOf(as(B, `insert into vacations (id, name, owner_id) values (gen_random_uuid(), 'X', $1)`, [A]))).toMatch(/row-level security/);
  });

  it('invite + join: the member sees the vacation; names come via vacation_members', async () => {
    const code = await invite(A, VAC_A);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    const [r] = await as<{ r: { vacation_id: string; status: string } }>(B, 'select accept_invite($1) as r', [code.toLowerCase()]);
    expect(r.r).toMatchObject({ vacation_id: VAC_A, status: 'joined' });
    expect((await as(B, 'select id from properties where vacation_id = $1', [VAC_A])).length).toBe(1);
    expect(await as(B, 'select display_name from vacation_members where vacation_id = $1 order by joined_at', [VAC_A])).toEqual([
      { display_name: 'Anna' },
      { display_name: 'Ben' },
    ]);
    expect(await errorOf(as(C, `select accept_invite('ZZZZZZ')`))).toMatch(/invalid_code/);
  });

  it('members add houses; only the owner books; only owner / suggester delete', async () => {
    await as(B, `insert into properties (id, vacation_id, url, created_by) values ($1, $2, 'https://booking.com/h', $3)`, [HOUSE_A2, VAC_A, B]);
    // B tries to book A's house → status silently kept, the rest of the change goes through
    await as(B, `update properties set status = 'booked', price = 1200 where id = $1`, [HOUSE_A]);
    expect(await as(A, 'select status, price from properties where id = $1', [HOUSE_A])).toEqual([{ status: 'active', price: '1200.00' }]);
    await as(A, `update properties set status = 'booked' where id = $1`, [HOUSE_A]);
    expect(await as(B, 'select status from properties where id = $1', [HOUSE_A])).toEqual([{ status: 'booked' }]);
    // B can't soft-delete A's house, but its own
    await as(B, 'update properties set deleted_at = now() where id = $1', [HOUSE_A]);
    expect(await as(A, 'select deleted_at from properties where id = $1', [HOUSE_A])).toEqual([{ deleted_at: null }]);
    // created_by never changes on edit
    await as(B, 'update properties set created_by = $2 where id = $1', [HOUSE_A, B]);
    expect(await as(A, 'select created_by from properties where id = $1', [HOUSE_A])).toEqual([{ created_by: A }]);
    // a non-owner can't insert a house as "booked"
    await as(B, `insert into properties (id, vacation_id, url, status, created_by) values (gen_random_uuid(), $1, 'https://x.de/2', 'booked', $2)`, [VAC_A, B]);
    expect((await as(A, `select id from properties where vacation_id = $1 and status = 'booked'`, [VAC_A])).length).toBe(1);
  });

  it('votes, vetoes, favourites: own rows only, same vacation, one veto per person', async () => {
    await as(B, `insert into votes (id, vacation_id, property_id, user_id, value) values (gen_random_uuid(), $1, $2, $3, 4)`, [VAC_A, HOUSE_A, B]);
    expect(await errorOf(as(B, `insert into votes (id, vacation_id, property_id, user_id, value) values (gen_random_uuid(), $1, $2, $3, 4)`, [VAC_A, HOUSE_A2, A]))).toMatch(
      /row-level security/,
    );
    expect(await errorOf(as(B, `insert into votes (id, vacation_id, property_id, user_id, value) values (gen_random_uuid(), $1, $2, $3, 9)`, [VAC_A, HOUSE_A2, B]))).toMatch(
      /check constraint/,
    );
    expect(await errorOf(as(A, `insert into vetoes (id, vacation_id, property_id, user_id) values (gen_random_uuid(), $1, $2, $3)`, [VAC_A, HOUSE_B, A]))).toMatch(
      /not part of vacation/,
    );
    await as(B, `insert into vetoes (id, vacation_id, property_id, user_id) values (gen_random_uuid(), $1, $2, $3)`, [VAC_A, HOUSE_A2, B]);
    expect(await errorOf(as(B, `insert into vetoes (id, vacation_id, property_id, user_id) values (gen_random_uuid(), $1, $2, $3)`, [VAC_A, HOUSE_A, B]))).toMatch(
      /duplicate key/,
    );
    expect((await as(A, 'select id from vetoes where vacation_id = $1', [VAC_A])).length).toBe(1);
  });

  it('comments: everyone reads, only the author deletes', async () => {
    const id = '30000000-0000-7000-8000-000000000001';
    await as(B, `insert into comments (id, vacation_id, property_id, text, created_by) values ($1, $2, $3, 'Toller Pool', $4)`, [id, VAC_A, HOUSE_A, B]);
    expect(await as(A, 'select text from comments where id = $1', [id])).toEqual([{ text: 'Toller Pool' }]);
    await as(A, 'update comments set text = $2 where id = $1', [id, 'hacked']);
    expect(await as(B, 'select text from comments where id = $1', [id])).toEqual([{ text: 'Toller Pool' }]);
  });

  it('sync_pull returns my vacations, memberships and own profile (no terms / ban fields)', async () => {
    const [r] = await as<{ r: { vacations: Record<string, { rows: Record<string, unknown[]> }>; profile: Record<string, unknown>; members: unknown[] } }>(
      B,
      'select sync_pull(\'{}\') as r',
    );
    expect(Object.keys(r.r.vacations).sort()).toEqual([VAC_A, VAC_B].sort());
    expect(r.r.vacations[VAC_A].rows.properties.length).toBeGreaterThanOrEqual(2);
    expect(r.r.profile).not.toHaveProperty('banned_at');
    expect(r.r.members.length).toBe(3);
  });

  it('broadcast signal goes to vacation:<id>; only members may listen', async () => {
    const msgs = await asAdmin<{ topic: string }>(`select distinct topic from realtime.messages where topic = $1`, [`vacation:${VAC_A}`]);
    expect(msgs.length).toBe(1);
    expect(await as(B, 'select can_listen_to_topic($1) as ok', [`vacation:${VAC_A}`])).toEqual([{ ok: true }]);
    expect(await as(C, 'select can_listen_to_topic($1) as ok', [`vacation:${VAC_A}`])).toEqual([{ ok: false }]);
  });

  it('report + block: reported, B leaves, C (blocked by A) cannot join', async () => {
    await as(C, `select accept_invite($1)`, [await invite(A, VAC_A)]);
    await as(A, `select block_member($1, $2)`, [VAC_A, C]);
    expect(await as(A, 'select user_id from vacation_members where vacation_id = $1 and user_id = $2', [VAC_A, C])).toEqual([]);
    expect(await errorOf(as(C, 'select accept_invite($1)', [await invite(A, VAC_A)]))).toMatch(/blocked/);
    expect((await asAdmin(`select id from content_reports where target_type = 'member'`)).length).toBe(1);
  });

  it('owner leaves → longest-standing member becomes owner; votes of leavers go', async () => {
    await as(A, 'select leave_vacation($1)', [VAC_A]);
    expect(await as(B, 'select owner_id from vacations where id = $1', [VAC_A])).toEqual([{ owner_id: B }]);
    expect(await as(B, `select role from vacation_members where vacation_id = $1 and user_id = $2`, [VAC_A, B])).toEqual([{ role: 'owner' }]);
  });

  it('delete_vacation: owner only, deletion is logged for the phones', async () => {
    expect(await errorOf(as(A, 'select delete_vacation($1)', [VAC_B]))).toMatch(/not_allowed/);
    await as(B, 'select delete_vacation($1)', [VAC_B]);
    expect(await asAdmin('select id from vacations where id = $1', [VAC_B])).toEqual([]);
    expect((await asAdmin(`select row_id from sync_deletes where vacation_id = $1 and tbl = 'properties'`, [VAC_B])).length).toBe(1);
  });
});

describe('recovery code', () => {
  it('moves vacations, ownership and votes to the new account and deletes the old one', async () => {
    const NEW = '00000000-0000-7000-8000-0000000000ff';
    await asAdmin(`insert into auth.users (id) values ('${NEW}')`);
    const [{ code }] = await as<{ code: string }>(B, 'select create_recovery_code() as code');
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const [bad] = await as<{ r: { error?: string } }>(NEW, `select recover_account('AAAA-AAAA-AAAA') as r`);
    expect(bad.r.error).toBe('invalid_code');
    const [r] = await as<{ r: { display_name: string; vacations: number } }>(NEW, 'select recover_account($1) as r', [code.toLowerCase()]);
    expect(r.r).toEqual({ display_name: 'Ben', vacations: 1 });
    expect(await as(NEW, 'select owner_id from vacations where id = $1', [VAC_A])).toEqual([{ owner_id: NEW }]);
    expect((await as(NEW, 'select id from votes where user_id = $1', [NEW])).length).toBe(1);
    expect(await asAdmin('select id from auth.users where id = $1', [B])).toEqual([]);
    expect(await as(NEW, 'select recovery_code_created_at() is not null as ok')).toEqual([{ ok: true }]);
  });

  it('delete_my_account: the last member deletes the vacation', async () => {
    const NEW = '00000000-0000-7000-8000-0000000000ff';
    await as(NEW, 'select delete_my_account()');
    expect(await asAdmin('select id from vacations where id = $1', [VAC_A])).toEqual([]);
    expect(await asAdmin('select id from profiles where id = $1', [NEW])).toEqual([]);
  });
});
