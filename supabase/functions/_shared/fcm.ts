import { SignJWT, importPKCS8 } from 'jose';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type FcmResult =
  | { ok: true }
  | { ok: false; gone: boolean; status: number; reason: string };

/** Service-account credentials stay on the server; access tokens are reused until near expiry. */
export function createFcmClient(serviceAccountJson: string, fetchImpl: Fetch = fetch, now = Date.now) {
  let account: { project_id?: string; client_email?: string; private_key?: string };
  try {
    account = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must contain service-account JSON');
  }
  if (!account || typeof account.project_id !== 'string' || !account.project_id ||
      typeof account.client_email !== 'string' || !account.client_email ||
      typeof account.private_key !== 'string' || !account.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT requires project_id, client_email and private_key');
  }
  const { project_id: project, client_email: email, private_key: pem } = account;
  let cached: { token: string; expiresAt: number } | undefined;

  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt > now() + 60_000) return cached.token;
    const issuedAt = Math.floor(now() / 1000);
    const key = await importPKCS8(pem, 'RS256');
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(email)
      .setAudience(TOKEN_URL)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3600)
      .sign(key);
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    if (!res.ok) throw new Error(`FCM OAuth token exchange failed (${res.status})`);
    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (typeof data.access_token !== 'string' || !data.access_token ||
        typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 60) {
      throw new Error('FCM OAuth returned an invalid access token or expiry');
    }
    cached = { token: data.access_token, expiresAt: now() + data.expires_in * 1000 };
    return cached.token;
  }

  return {
    async send(message: { token: string; title: string; body: string; route: string }): Promise<FcmResult> {
      const token = await accessToken();
      const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: message.token,
            notification: { title: message.title, body: message.body },
            data: { route: message.route },
            android: { priority: 'high' },
          },
        }),
      });
      if (res.ok) return { ok: true };
      if (res.status === 401) cached = undefined;
      const text = await res.text();
      let error: { status?: string; details?: { '@type'?: string; errorCode?: string }[] } | undefined;
      try {
        error = (JSON.parse(text) as { error?: typeof error }).error;
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
        return { ok: false, gone: false, status: res.status, reason: 'Non-JSON FCM error response' };
      }
      const codes = Array.isArray(error?.details)
        ? error.details.filter((d) => d?.['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError').map((d) => d.errorCode)
        : [];
      return {
        ok: false,
        gone: res.status === 404 && codes.includes('UNREGISTERED'),
        status: res.status,
        reason: codes.join(', ') || error?.status || 'FCM request failed',
      };
    },
  };
}
