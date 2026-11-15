import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNative } from './platform';

export interface IncomingShare {
  id: string;
  text: string;
  title?: string;
}

interface IncomingSharePlugin {
  pending(): Promise<{ shares: IncomingShare[] }>;
  remove(options: { id: string }): Promise<void>;
  addListener(event: 'shareReceived', listener: () => void): Promise<PluginListenerHandle>;
}

const IncomingShare = registerPlugin<IncomingSharePlugin>('IncomingShare');

/** Browsers may share a URL alone or surround it with a title and other text. */
export function sharedHolidayHomeUrl(text: string): string | null {
  const match = /https?:\/\/[^\s<>"']+/i.exec(text);
  if (!match) return null;
  let candidate = match[0].replace(/[.,!;]+$/, '');
  for (const [open, close] of [['(', ')'], ['[', ']']]) {
    while (candidate.endsWith(close) && candidate.split(close).length > candidate.split(open).length) {
      candidate = candidate.slice(0, -1);
    }
  }
  try {
    const url = new URL(candidate);
    if (!url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch (error) {
    console.warn('[incoming-share] invalid holiday home URL', error);
    return null;
  }
}

export async function pendingShares(): Promise<IncomingShare[]> {
  return isNative ? (await IncomingShare.pending()).shares : [];
}

export async function removeShare(id: string): Promise<void> {
  if (isNative) await IncomingShare.remove({ id });
}

export async function onIncomingShare(listener: () => void): Promise<PluginListenerHandle> {
  return isNative ? IncomingShare.addListener('shareReceived', listener) : { remove: async () => undefined };
}
