import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkModerationToken, createModerationToken } from '../../supabase/functions/_shared/moderationToken';

/** Link to the moderation page: signed, expires, matches the SQL-editor recipe (pgcrypto hmac … sha256 hex). */
const SECRET = 'a3f1digestsecret';

describe('moderation link token', () => {
  it('valid for 7 days, then expired', async () => {
    const now = Date.UTC(2026, 10, 11);
    const t = await createModerationToken(SECRET, 7, now);
    expect(await checkModerationToken(SECRET, t, now)).toBe(true);
    expect(await checkModerationToken(SECRET, t, now + 6 * 86_400_000)).toBe(true);
    expect(await checkModerationToken(SECRET, t, now + 8 * 86_400_000)).toBe(false);
  });

  it('rejects other secrets, changed expiry and garbage', async () => {
    const t = await createModerationToken(SECRET);
    expect(await checkModerationToken('other', t)).toBe(false);
    const [exp, sig] = t.split('.');
    expect(await checkModerationToken(SECRET, `${Number(exp) + 86_400}.${sig}`)).toBe(false);
    for (const bad of ['', 'x', 'abc.def', null, undefined]) expect(await checkModerationToken(SECRET, bad)).toBe(false);
  });

  it('a token made like in the SQL editor (hmac(exp, secret, sha256) as hex) is accepted', async () => {
    const exp = String(Math.floor(Date.now() / 1000) + 3600);
    const sqlStyle = `${exp}.${createHmac('sha256', SECRET).update(exp).digest('hex')}`;
    expect(await checkModerationToken(SECRET, sqlStyle)).toBe(true);
  });
});
