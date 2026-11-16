// Apple Push Notification service, directly (no Firebase, no third party): token-based auth with the
// .p8 key from the Apple Developer account. Used by push-houses.
// https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
import { SignJWT, importPKCS8 } from 'jose';

export const APNS_HOST = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;
export type ApnsEnvironment = keyof typeof APNS_HOST;

const BEGIN = '-----BEGIN PRIVATE KEY-----';
const END = '-----END PRIVATE KEY-----';

/**
 * The APNS_KEY_P8 secret as PEM, however it was pasted: whole file, one line, with literal "\n",
 * in quotes, or only the base64 lines between BEGIN and END. Anything else throws an error that
 * describes the value's shape (never the key itself).
 */
export function apnsKeyPem(p8: string): string {
  let s = p8.replace(/^﻿/, '').trim();
  if (/^(["'`]).*\1$/s.test(s)) s = s.slice(1, -1).trim();
  s = s.replace(/\\r/g, '').replace(/\\n/g, '\n');
  if (s.includes('BEGIN EC PRIVATE KEY')) {
    throw new Error('APNS_KEY_P8 is an "EC PRIVATE KEY" (converted with openssl) – use the original AuthKey_….p8 from Apple unchanged');
  }
  if (!s.includes('-----BEGIN')) {
    if (/\.p8$/i.test(s)) throw new Error('APNS_KEY_P8 is a file name – set the file content: npx supabase secrets set APNS_KEY_P8="$(cat AuthKey_XXXXXXXXXX.p8)"');
    if (!/^[A-Za-z0-9+/=\s]+$/.test(s)) {
      throw new Error(`APNS_KEY_P8 is not a .p8 key (${s.length} characters, no "${BEGIN}" line) – set the content of AuthKey_….p8`);
    }
    s = `${BEGIN}\n${s}\n${END}`;
  }
  const start = s.indexOf(BEGIN);
  const stop = s.indexOf(END);
  if (start < 0 || stop < start) throw new Error(`APNS_KEY_P8 must contain "${BEGIN}" … "${END}"`);
  const body = s.slice(start + BEGIN.length, stop).replace(/\s+/g, '');
  return `${BEGIN}\n${body.match(/.{1,64}/g)?.join('\n') ?? ''}\n${END}`;
}

/** Provider token: ES256, valid up to 1 h at Apple – one per run is enough. */
export async function apnsJwt(p8: string, keyId: string, teamId: string, now = Date.now()): Promise<string> {
  const key = await importPKCS8(apnsKeyPem(p8), 'ES256');
  return new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: keyId }).setIssuer(teamId).setIssuedAt(Math.floor(now / 1000)).sign(key);
}

/** What the phone gets: a plain visible message; tapping it opens the vacation. */
export function apnsPayload(title: string, body: string, route: string): string {
  return JSON.stringify({ aps: { alert: { title, body }, sound: 'default' }, route });
}

export type SendResult =
  | { ok: true; environment: ApnsEnvironment }
  /** gone = the token is dead (app deleted, or not a token for this app) → forget the phone. */
  | { ok: false; gone: boolean; status: number; reason: string };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Sends one message. Unknown environment: production first (App Store / TestFlight builds), then sandbox
 * (builds from Xcode) when Apple says the token isn't one of its production tokens.
 */
export async function sendApns(
  opts: { token: string; environment: ApnsEnvironment | null; jwt: string; topic: string; payload: string; collapseId?: string },
  fetchImpl: Fetch = fetch,
): Promise<SendResult> {
  const tries: ApnsEnvironment[] = opts.environment ? [opts.environment] : ['production', 'sandbox'];
  let last: SendResult = { ok: false, gone: false, status: 0, reason: 'not sent' };
  for (const env of tries) {
    const res = await fetchImpl(`${APNS_HOST[env]}/3/device/${opts.token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${opts.jwt}`,
        'apns-topic': opts.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 3 * 3600),
        ...(opts.collapseId ? { 'apns-collapse-id': opts.collapseId } : {}),
        'content-type': 'application/json',
      },
      body: opts.payload,
    });
    if (res.ok) return { ok: true, environment: env };
    const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason ?? '';
    last = { ok: false, gone: res.status === 410 || reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic', status: res.status, reason };
    if (reason !== 'BadDeviceToken') break;
  }
  return last;
}
