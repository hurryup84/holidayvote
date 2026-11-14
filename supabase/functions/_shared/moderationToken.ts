// Link to the moderation page (website/moderation.html#t=<token>): "<expiry seconds>.<HMAC-SHA256 hex>",
// signed with the digest secret. Created by report-digest (and by hand in the SQL editor, see
// supabase/README.md), checked by the Edge Function `moderation`. WebCrypto only (Deno + Node tests).
const enc = new TextEncoder();

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createModerationToken(secret: string, validDays = 7, now = Date.now()): Promise<string> {
  const exp = String(Math.floor(now / 1000) + validDays * 86_400);
  return `${exp}.${await hmacHex(secret, exp)}`;
}

/** True if the token was signed with `secret` and hasn't expired. */
export async function checkModerationToken(secret: string, token: string | null | undefined, now = Date.now()): Promise<boolean> {
  const [exp, sig] = (token ?? '').split('.');
  if (!/^\d{9,11}$/.test(exp ?? '') || !/^[0-9a-f]{64}$/.test(sig ?? '')) return false;
  if (Number(exp) * 1000 < now) return false;
  const expected = await hmacHex(secret, exp);
  let diff = 0; // constant time
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
