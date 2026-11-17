import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: { isNative: true, platform: 'android' },
  nativeRead: vi.fn(),
  webRead: vi.fn(),
}));
vi.mock('../../src/native/platform', () => mocks.platform);
vi.mock('@capacitor/clipboard', () => ({ Clipboard: { read: mocks.nativeRead } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.platform.isNative = true;
  mocks.platform.platform = 'android';
  vi.stubGlobal('navigator', { clipboard: { readText: mocks.webRead } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('clipboard reads', () => {
  it.each(['android', 'ios'])('reads links through the native plugin on %s, not the WebView API', async (platform) => {
    mocks.platform.platform = platform;
    mocks.nativeRead.mockResolvedValue({ value: 'https://example.com/holiday-home', type: 'text/plain' });
    mocks.webRead.mockRejectedValue(new Error('WebView clipboard unavailable'));
    const { readClipboard } = await import('../../src/native/clipboard');
    expect(await readClipboard()).toBe('https://example.com/holiday-home');
    expect(mocks.nativeRead).toHaveBeenCalledTimes(1);
    expect(mocks.webRead).not.toHaveBeenCalled();
  });

  it('keeps using the Web Clipboard API in a browser', async () => {
    mocks.platform.isNative = false;
    mocks.webRead.mockResolvedValue('https://example.com/browser');
    const { readClipboard } = await import('../../src/native/clipboard');
    expect(await readClipboard()).toBe('https://example.com/browser');
    expect(mocks.nativeRead).not.toHaveBeenCalled();
  });

  it.each([true, false])('distinguishes an empty clipboard from a failed read (native: %s)', async (native) => {
    mocks.platform.isNative = native;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.nativeRead.mockResolvedValue({ value: '', type: 'text/plain' });
    mocks.webRead.mockResolvedValue('');
    const { readClipboard } = await import('../../src/native/clipboard');
    expect(await readClipboard()).toBeNull();
    const error = new Error('Clipboard access denied');
    (native ? mocks.nativeRead : mocks.webRead).mockRejectedValue(error);
    await expect(readClipboard()).rejects.toBe(error);
    expect(console.error).toHaveBeenCalledWith('[clipboard] read failed', error);
  });
});
