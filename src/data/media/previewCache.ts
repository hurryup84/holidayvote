import type { Clock } from '../../core/clock';
import type { Preview } from '../../domain/models';
import { fetchLinkPreview } from '../../native/linkPreview';
import type { Db } from '../db/db';

/**
 * This phone's cache of link previews – so opening the app doesn't fetch every holiday-home page again.
 * - Text (title, description, site) + picture URL in the local-only table `preview_cache`.
 * - The picture is NOT downloaded or stored. The OpenGraph image URL is hotlinked directly from
 *   the provider's page (copyright). No picture is kept on this phone or any server.
 * Never synced, never uploaded: every person has their own cache.
 */
export const PREVIEW_DIR = 'previews';
const RETRY_FAILED_MS = 24 * 3600_000;
const MAX_PARALLEL = 3;

interface Row {
  id: string;
  title: string | null;
  description: string | null;
  site_name: string | null;
  image_url: string | null;
  image_file: string | null;
  status: string | null;
  fetched_at: string;
}

const inFlight = new Map<string, Promise<Preview | null>>();
let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

export function previewCache(db: Db, clock: Clock) {
  async function toPreview(r: Row): Promise<Preview> {
    return {
      url: r.id,
      title: r.title,
      description: r.description,
      siteName: r.site_name,
      imageSrc: r.image_url ?? null,
      status: r.status === 'failed' ? 'failed' : 'ok',
      fetchedAt: r.fetched_at,
    };
  }

  const row = (url: string) => db.getOptional<Row>('SELECT * FROM preview_cache WHERE id = ?', [url]);

  async function fetchAndStore(url: string): Promise<Preview | null> {
    const old = await row(url);
    const p = await fetchLinkPreview(url);
    const now = clock.nowIso();
    if (!p || (!p.title && !p.image && !p.description)) {
      // Keep a good old entry; otherwise remember the failure (retried after a day).
      if (old && old.status !== 'failed') {
        await db.execute('UPDATE preview_cache SET fetched_at = ? WHERE id = ?', [now, url]);
        return toPreview({ ...old, fetched_at: now });
      }
      await db.execute(
        `INSERT OR REPLACE INTO preview_cache (id, title, description, site_name, image_url, image_file, status, fetched_at)
         VALUES (?, NULL, NULL, NULL, NULL, NULL, 'failed', ?)`,
        [url, now],
      );
      return null;
    }
    await db.execute(
      `INSERT OR REPLACE INTO preview_cache (id, title, description, site_name, image_url, image_file, status, fetched_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'ok', ?)`,
      [url, p.title, p.description, p.siteName ?? null, p.image ?? null, now],
    );
    return (await row(url).then((r) => (r ? toPreview(r) : null))) ?? null;
  }

  return {
    /** What this phone has cached (no network). */
    async get(url: string): Promise<Preview | null> {
      const r = await row(url);
      return r ? toPreview(r) : null;
    },

    /** Cached preview, fetched first if there is none yet (or a failure is old). */
    async ensure(url: string): Promise<Preview | null> {
      const r = await row(url);
      if (r) {
        const failedLongAgo =
          r.status === 'failed' && clock.now().getTime() - new Date(r.fetched_at).getTime() > RETRY_FAILED_MS;
        if (!failedLongAgo) {
          return {
            url: r.id,
            title: r.title,
            description: r.description,
            siteName: r.site_name,
            imageSrc: r.image_url ?? null,
            status: r.status === 'failed' ? 'failed' : 'ok',
            fetchedAt: r.fetched_at,
          };
        }
      }
      return this.refresh(url);
    },

    /** Fetch the page text again now. No picture is downloaded. Parallel calls for the same link share one fetch. */
    refresh(url: string): Promise<Preview | null> {
      let p = inFlight.get(url);
      if (!p) {
        p = slot(() => fetchAndStore(url)).finally(() => inFlight.delete(url));
        inFlight.set(url, p);
      }
      return p;
    },

    /** Settings → "Clear cache": everything goes; previews load again when a house is shown. */
    async clear(): Promise<void> {
      await db.execute('DELETE FROM preview_cache');
    },

    /** Seed a demo preview from a local photo (no network). Used by the debug seeder and store screenshots. */
    async seed(url: string, title: string | null, description: string | null, siteName: string | null, imageUrl: string): Promise<void> {
      const now = clock.nowIso();
      await db.execute(
        `INSERT OR REPLACE INTO preview_cache (id, title, description, site_name, image_url, image_file, status, fetched_at)
         VALUES (?, ?, ?, ?, ?, NULL, 'ok', ?)`,
        [url, title, description, siteName, imageUrl, now],
      );
    },

    async stats(): Promise<{ count: number; bytes: number }> {
      const r = await db.getOptional<{ n: number }>("SELECT COUNT(*) AS n FROM preview_cache WHERE status = 'ok'");
      return { count: Number(r?.n ?? 0), bytes: 0 };
    },
  };
}

export type PreviewCache = ReturnType<typeof previewCache>;
