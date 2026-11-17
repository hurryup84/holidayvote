import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  apnsJwt: vi.fn(),
  sendApns: vi.fn(),
  createFcmClient: vi.fn(),
  sendFcm: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('../../supabase/functions/_shared/apns.ts', () => ({
  apnsJwt: mocks.apnsJwt, sendApns: mocks.sendApns, apnsPayload: () => 'payload',
}));
vi.mock('../../supabase/functions/_shared/fcm.ts', () => ({ createFcmClient: mocks.createFcmClient }));

let handler: (request: Request) => Promise<Response>;
let secrets: Record<string, string>;
const device = (platform: 'ios' | 'android') => ({
  device_id: `${platform}-device`, token: `${platform}-token`, platform, environment: null,
  kind: 'house:event', local_date: '2026-11-17', title: 'House', body: 'Added', route: '/vacations/123',
});
const invoke = () => handler(new Request('https://example.invalid/push-houses', { headers: { 'x-cron-secret': 'cron-secret' } }));

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  secrets = {
    REPORT_DIGEST_SECRET: 'cron-secret', SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test',
    APNS_KEY_P8: 'test', APNS_KEY_ID: 'test', APNS_TEAM_ID: 'test', FIREBASE_SERVICE_ACCOUNT: 'test-json',
  };
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => secrets[name] },
    serve: (callback: typeof handler) => { handler = callback; },
  });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.apnsJwt.mockResolvedValue('apns-jwt');
  mocks.sendApns.mockResolvedValue({ ok: true, environment: 'sandbox' });
  mocks.sendFcm.mockResolvedValue({ ok: true });
  mocks.createFcmClient.mockReturnValue({ send: mocks.sendFcm });
  const moduleUrl = new URL('../../supabase/functions/push-houses/index.ts', import.meta.url).href;
  await import(moduleUrl);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('push-houses orchestration', () => {
  it('sends through each provider and records the correct environment', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [device('android'), device('ios')], error: null });
    expect((await invoke()).status).toBe(200);
    expect(mocks.sendFcm).toHaveBeenCalledWith(device('android'));
    expect(mocks.sendApns).toHaveBeenCalledWith(expect.objectContaining({ token: 'ios-token', jwt: 'apns-jwt' }));
    expect(mocks.rpc).toHaveBeenCalledWith('push_mark_sent', expect.objectContaining({ p_device: 'android-device', p_environment: null }));
    expect(mocks.rpc).toHaveBeenCalledWith('push_mark_sent', expect.objectContaining({ p_device: 'ios-device', p_environment: 'sandbox' }));
  });

  it('keeps iOS working when Firebase credentials are missing or invalid', async () => {
    delete secrets.FIREBASE_SERVICE_ACCOUNT;
    mocks.rpc.mockResolvedValueOnce({ data: [device('android'), device('ios')], error: null });
    const response = await invoke();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('1 sent, 0 gone, 1 failed');
    expect(mocks.sendApns).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalledWith('push_forget_device', expect.anything());
  });

  it('keeps Android working when APNs signing fails', async () => {
    mocks.apnsJwt.mockRejectedValueOnce(new Error('Invalid APNs key'));
    mocks.rpc.mockResolvedValueOnce({ data: [device('ios'), device('android')], error: null });
    expect((await invoke()).status).toBe(500);
    expect(mocks.sendFcm).toHaveBeenCalledTimes(1);
  });

  it('only removes confirmed dead tokens and reports receipt-write failures', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [device('android')], error: null });
    mocks.sendFcm.mockResolvedValueOnce({ ok: false, gone: true, status: 404, reason: 'UNREGISTERED' });
    expect((await invoke()).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('push_forget_device', { p_device: 'android-device' });

    mocks.rpc.mockResolvedValueOnce({ data: [device('android')], error: null });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'write failed' } });
    const response = await invoke();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('0 sent, 0 gone, 1 failed');
  });

  it('requires the cron secret and does not require Firebase for an iOS-only batch', async () => {
    expect((await handler(new Request('https://example.invalid'))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    delete secrets.FIREBASE_SERVICE_ACCOUNT;
    mocks.rpc.mockResolvedValueOnce({ data: [device('ios')], error: null });
    expect((await invoke()).status).toBe(200);
    expect(mocks.createFcmClient).not.toHaveBeenCalled();
  });
});
