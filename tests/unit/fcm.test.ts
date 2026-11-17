import { createVerify, generateKeyPairSync } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createFcmClient } from '../../supabase/functions/_shared/fcm';

let credentials: string;
let publicKey: string;
const message = { token: 'device-token', title: 'New house', body: 'Added by Anna', route: '/vacations/123' };
const oauthResponse = () => Response.json({ access_token: 'oauth-access-token', expires_in: 3600 });

beforeAll(() => {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  publicKey = keys.publicKey;
  credentials = JSON.stringify({
    project_id: 'holidayvote-test', client_email: 'push@example.invalid', private_key: keys.privateKey,
  });
});

describe('FCM HTTP v1', () => {
  it('signs the OAuth assertion, sends the route and reuses then refreshes access tokens', async () => {
    let now = Date.UTC(2026, 10, 17, 12);
    const fetchImpl = vi.fn(async (url: string, _init: RequestInit) =>
      url.includes('oauth2') ? oauthResponse() : Response.json({ name: 'projects/test/messages/1' }),
    );
    const client = createFcmClient(credentials, fetchImpl, () => now);
    expect(await client.send(message)).toEqual({ ok: true });

    const assertion = new URLSearchParams(String(fetchImpl.mock.calls[0][1].body)).get('assertion')!;
    const [header, payload, signature] = assertion.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toMatchObject({ alg: 'RS256' });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toMatchObject({
      iss: 'push@example.invalid',
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      iat: now / 1000, exp: now / 1000 + 3600,
    });
    expect(createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://fcm.googleapis.com/v1/projects/holidayvote-test/messages:send');
    expect(fetchImpl.mock.calls[1][1].headers).toMatchObject({ authorization: 'Bearer oauth-access-token' });
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1].body))).toEqual({
      message: {
        token: message.token, notification: { title: message.title, body: message.body },
        data: { route: message.route }, android: { priority: 'high' },
      },
    });
    await client.send(message);
    expect(fetchImpl.mock.calls.filter(([url]) => url.includes('oauth2'))).toHaveLength(1);
    now += 3541_000;
    await client.send(message);
    expect(fetchImpl.mock.calls.filter(([url]) => url.includes('oauth2'))).toHaveLength(2);
  });

  it.each([
    [404, 'UNREGISTERED', true],
    [404, undefined, false],
    [400, 'INVALID_ARGUMENT', false],
    [403, 'SENDER_ID_MISMATCH', false],
    [429, 'QUOTA_EXCEEDED', false],
    [503, 'UNAVAILABLE', false],
  ])('only forgets a confirmed unregistered token (%s / %s)', async (status, errorCode, gone) => {
    const fetchImpl = vi.fn(async (url: string) => url.includes('oauth2') ? oauthResponse() : Response.json({
      error: { status: 'FAILED', details: errorCode ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }] : [] },
    }, { status }));
    expect(await createFcmClient(credentials, fetchImpl).send(message)).toMatchObject({ ok: false, status, gone });
  });

  it('reports OAuth failures without sending or exposing credentials', async () => {
    const fetchImpl = vi.fn(async () => new Response('private response body', { status: 401 }));
    await expect(createFcmClient(credentials, fetchImpl).send(message)).rejects.toThrow('FCM OAuth token exchange failed (401)');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(() => createFcmClient('not json')).toThrow('service-account JSON');
    expect(() => createFcmClient('{}')).toThrow('requires project_id');
  });

  it('preserves devices on non-JSON failures and refreshes credentials after a 401', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes('oauth2')
      ? oauthResponse() : new Response('upstream unavailable', { status: 401 }));
    const client = createFcmClient(credentials, fetchImpl);
    expect(await client.send(message)).toMatchObject({ ok: false, status: 401, gone: false });
    await client.send(message);
    expect(fetchImpl.mock.calls.filter(([url]) => url.includes('oauth2'))).toHaveLength(2);
  });
});
