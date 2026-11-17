import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type Server } from './pgServer';

const A = '00000000-0000-7000-8000-00000000000a';
const B = '00000000-0000-7000-8000-00000000000b';
const C = '00000000-0000-7000-8000-00000000000c';
const VAC = '10000000-0000-7000-8000-00000000000a';
const HOUSE = '20000000-0000-7000-8000-00000000000a';
const APNS = 'a'.repeat(64);
const FCM = 'firebase-token:'.repeat(8);
interface Due {
  device_id: string; platform: string; token: string; environment: string | null;
  kind: string; local_date: string; title: string; body: string; route: string;
}
let server: Server;
const due = async (time = '2026-11-17T12:00:00Z') =>
  (await server.asAdmin<{ r: Due[] }>('select push_due_house($1) as r', [time]))[0].r;
const register = (user: string, platform: string, token: string, tz = 'UTC') =>
  server.as(user, `select register_push_device($1, $2, $3, 'en')`, [platform, token, tz]);

beforeAll(async () => {
  server = await startServer();
  await server.asAdmin('insert into auth.users (id) values ($1), ($2), ($3)', [A, B, C]);
  for (const [user, name] of [[A, 'Anna'], [B, 'Ben'], [C, 'Cleo']]) {
    await server.as(user, 'insert into profiles (id, display_name) values ($1, $2)', [user, name]);
    await server.as(user, `select accept_terms('2026-11')`);
  }
  await server.as(A, `insert into vacations (id, name, owner_id, created_by) values ($1, 'Summer', $2, $2)`, [VAC, A]);
  const [{ r }] = await server.as<{ r: { code: string } }>(A, 'select create_invite($1) as r', [VAC]);
  await server.as(B, 'select accept_invite($1)', [r.code]);
  await server.as(A, `insert into properties (id, vacation_id, url, title, created_by)
    values ($1, $2, 'https://example.com/house', 'Beach house', $3)`, [HOUSE, VAC, A]);
}, 30_000);
beforeEach(async () => {
  await server.asAdmin('truncate push_devices cascade');
});
afterAll(async () => { await server?.db.close(); });

describe('Android and iOS push delivery', () => {
  it('upgrades a hash-only registration in place and keeps raw tokens private', async () => {
    const [legacy] = await server.asAdmin<{ id: string }>(`insert into push_devices (user_id, platform, secret_hash, tz)
      values ($1, 'android', encode(sha256(convert_to($2, 'UTF8')), 'hex'), 'UTC') returning id`, [B, FCM]);
    expect(await due()).toEqual([]);
    await register(B, 'android', FCM);
    await register(B, 'android', FCM);
    expect(await server.asAdmin('select id, fcm_token from push_devices')).toEqual([{ id: legacy.id, fcm_token: FCM }]);
    await expect(server.as(B, 'select fcm_token from push_devices')).rejects.toThrow(/permission denied|row-level security/);
    await expect(server.as(B, 'select push_due_house()')).rejects.toThrow(/permission denied/);
    await expect(register(B, 'android', '')).rejects.toThrow('bad_device');
  });

  it('returns platform-specific tokens and a complete delivery payload only for other members', async () => {
    await register(B, 'ios', APNS);
    await register(B, 'android', FCM);
    await register(A, 'android', 'self-'.repeat(12));
    await register(C, 'android', 'outsider-'.repeat(10));
    const rows = await due();
    expect(rows).toHaveLength(2);
    expect(rows.find((d) => d.platform === 'ios')).toMatchObject({ token: APNS, environment: null });
    expect(rows.find((d) => d.platform === 'android')).toMatchObject({
      token: FCM, environment: null, local_date: '2026-11-17', title: 'New holiday home',
      body: 'Anna added "Beach house" to "Summer".', route: `/vacations/${VAC}/houses/${HOUSE}`,
      kind: expect.stringMatching(/^house:/), device_id: expect.any(String),
    });
  });

  it('preserves daytime limits and sent receipts for both platforms', async () => {
    await register(B, 'ios', APNS);
    await register(B, 'android', FCM);
    expect(await due('2026-11-17T07:59:59Z')).toEqual([]);
    expect(await due('2026-11-17T08:00:00Z')).toHaveLength(2);
    expect(await due('2026-11-17T20:59:59Z')).toHaveLength(2);
    expect(await due('2026-11-17T21:00:00Z')).toEqual([]);
    for (const d of await due()) {
      await server.asAdmin('select push_mark_sent($1, $2, $3, $4)', [
        d.device_id, d.kind, d.local_date, d.platform === 'ios' ? 'sandbox' : null,
      ]);
    }
    expect(await due()).toEqual([]);
    expect((await server.asAdmin('select environment from push_devices where platform = $1', ['ios']))[0]).toEqual({ environment: 'sandbox' });
  });
});
