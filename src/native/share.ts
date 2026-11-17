import { Share } from '@capacitor/share';
import { isCancel } from './platform';
import { writeClipboard } from './clipboard';

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function shareText(p: { title: string; text: string; url?: string }): Promise<ShareResult> {
  try {
    const can = await Share.canShare();
    if (can.value) {
      await Share.share({ title: p.title, text: p.text, url: p.url, dialogTitle: p.title });
      return 'shared';
    }
  } catch (e) {
    if (isCancel(e)) return 'cancelled';
  }
  try {
    await writeClipboard(p.url ? `${p.text} ${p.url}` : p.text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
