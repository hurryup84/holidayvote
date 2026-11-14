import { Browser } from '@capacitor/browser';
import { isNative } from './platform';

export async function openUrl(url: string): Promise<void> {
  if (isNative) await Browser.open({ url });
  else window.open(url, '_blank', 'noopener');
}

/** Normalises user input like "chefkoch.de/rezept" to a full URL. */
export function normaliseUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}
