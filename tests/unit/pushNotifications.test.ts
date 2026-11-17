import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: { isNative: true, platform: 'android' },
  hasAccount: vi.fn(),
  saveToken: vi.fn(),
  addListener: vi.fn(),
  register: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
}));
vi.mock('../../src/native/platform', () => mocks.platform);
vi.mock('../../src/data/sync/push', () => ({ hasPushAccount: mocks.hasAccount, registerPushToken: mocks.saveToken }));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    addListener: mocks.addListener, register: mocks.register,
    checkPermissions: mocks.checkPermissions, requestPermissions: mocks.requestPermissions,
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.platform.isNative = true;
  mocks.platform.platform = 'android';
  mocks.hasAccount.mockResolvedValue(true);
  mocks.saveToken.mockResolvedValue(undefined);
  mocks.addListener.mockResolvedValue({ remove: vi.fn() });
  mocks.register.mockResolvedValue(undefined);
  mocks.checkPermissions.mockResolvedValue({ receive: 'prompt' });
  mocks.requestPermissions.mockResolvedValue({ receive: 'granted' });
});
afterEach(() => vi.restoreAllMocks());

describe('native push registration', () => {
  it('waits for listeners and permission before registering, with one setup for concurrent calls', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    mocks.addListener.mockImplementationOnce(async () => {
      await pending;
      return { remove: vi.fn() };
    });
    const push = await import('../../src/native/pushNotifications');
    const first = push.start();
    const second = push.start();
    await vi.waitFor(() => expect(mocks.addListener).toHaveBeenCalledTimes(1));
    expect(mocks.register).not.toHaveBeenCalled();
    release();
    await Promise.all([first, second]);
    expect(mocks.addListener).toHaveBeenCalledTimes(2);
    expect(mocks.requestPermissions).toHaveBeenCalledTimes(1);
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.register.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.requestPermissions.mock.invocationCallOrder[0]);
    const callback = mocks.addListener.mock.calls.find(([event]) => event === 'registration')![1] as (token: { value: string }) => void;
    callback({ value: 'new-fcm-token' });
    await vi.waitFor(() => expect(mocks.saveToken).toHaveBeenCalledWith('android', 'new-fcm-token'));
  });

  it('does not register when Android permission is denied and can retry later', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.requestPermissions.mockResolvedValueOnce({ receive: 'denied' });
    const push = await import('../../src/native/pushNotifications');
    await push.start();
    expect(mocks.register).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith('[push] notification permission not granted');
    mocks.checkPermissions.mockResolvedValue({ receive: 'granted' });
    await push.start();
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.addListener).toHaveBeenCalledTimes(2);
  });

  it('registers existing iOS accounts without the Android permission flow', async () => {
    mocks.platform.platform = 'ios';
    const push = await import('../../src/native/pushNotifications');
    await push.start();
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.checkPermissions).not.toHaveBeenCalled();
  });

  it('waits for an account and reports registration and upload failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.hasAccount.mockResolvedValueOnce(false);
    const push = await import('../../src/native/pushNotifications');
    await push.start();
    expect(mocks.addListener).not.toHaveBeenCalled();
    mocks.register.mockRejectedValueOnce(new Error('Firebase unavailable'));
    await push.start();
    expect(console.error).toHaveBeenCalledWith('[push] registration setup failed', expect.any(Error));
    mocks.saveToken.mockRejectedValueOnce(new Error('RPC failed'));
    await push.onToken('token');
    expect(console.error).toHaveBeenCalledWith('[push] token registration failed', expect.any(Error));
  });
});
