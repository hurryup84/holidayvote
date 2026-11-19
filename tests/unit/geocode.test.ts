import { expect, it, vi } from 'vitest';
import { CapacitorHttp } from '@capacitor/core';
import { geocode } from '../../src/native/geocode';

vi.mock('../../src/native/platform', () => ({ isNative: true }));
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { get: vi.fn() } }));

it('ends an address lookup when the native bridge never responds', async () => {
  vi.useFakeTimers();
  const get = vi.mocked(CapacitorHttp.get).mockImplementation(() => new Promise(() => {}));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const lookup = geocode('Munich');
    const finished = vi.fn();
    void lookup.then(finished);
    await vi.advanceTimersByTimeAsync(4999);
    expect(finished).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(lookup).resolves.toBeNull();
    expect(get).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('[geocode]', new Error('Address lookup timed out'));
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
