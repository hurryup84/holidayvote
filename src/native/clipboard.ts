import { Clipboard } from '@capacitor/clipboard';
import { isNative } from './platform';

/** WebView clipboard access is unreliable; use the native plugin on both phones.
 * Returns null for an empty clipboard and throws when reading fails. */
export async function readClipboard(): Promise<string | null> {
  try {
    if (isNative) {
      const result = await Clipboard.read();
      return result.value || null;
    }
    const text = await navigator.clipboard.readText();
    return text || null;
  } catch (error) {
    console.error('[clipboard] read failed', error);
    throw error;
  }
}

/** Write text to the clipboard. */
export async function writeClipboard(text: string): Promise<void> {
  if (isNative) {
    try {
      await Clipboard.write({ string: text });
      return;
    } catch (error) {
      console.error('[clipboard] write failed', error);
      throw error;
    }
  }
  await navigator.clipboard.writeText(text);
}
