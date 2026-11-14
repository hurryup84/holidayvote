import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';

/** True for errors that only mean "the user cancelled". */
export function isCancel(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
  return msg.includes('cancel') || msg.includes('no image') || msg.includes('dismiss') || msg.includes('abort');
}
