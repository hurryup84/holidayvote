import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../../src/core/clock';
import { openSqlJsDb } from '../../src/data/db/sqljsDb';
import { previewCache } from '../../src/data/media/previewCache';
import type { LinkPreview } from '../../src/core/ogParse';

const fetchMock = vi.fn<(url: string) => Promise<LinkPreview | null>>();
vi.mock('../../src/native/linkPreview', () => ({ fetchLinkPreview: (url: string) => fetchMock(url), downloadImage: async () => null }));

const URL1 = 'https://www.novasol.de/ferienhaus/1';
const page = (title: string): LinkPreview => ({ title, description: 'Sauna', image: 'https://cdn.novasol.de/1.jpg', siteName: 'Novasol' });

describe('preview cache (per phone)', () => {
  beforeEach(() => fetchMock.mockReset());

  it('fetches a link once; later reads come from the cache', async () => {
    const cache = previewCache(await openSqlJsDb(), fixedClock('2026-11-15T12:00:00'));
    fetchMock.mockResolvedValue(page('Reetdachhaus'));
    expect(await cache.ensure(URL1)).toMatchObject({ title: 'Reetdachhaus', imageSrc: 'https://cdn.novasol.de/1.jpg', status: 'ok' });
    expect(await cache.ensure(URL1)).toMatchObject({ title: 'Reetdachhaus' });
    expect(await cache.get(URL1)).toMatchObject({ title: 'Reetdachhaus' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('parallel requests for the same link share one fetch', async () => {
    const cache = previewCache(await openSqlJsDb(), fixedClock('2026-11-15T12:00:00'));
    fetchMock.mockResolvedValue(page('A'));
    await Promise.all([cache.ensure(URL1), cache.ensure(URL1), cache.refresh(URL1)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refresh fetches again; a failed refresh keeps the old preview', async () => {
    const cache = previewCache(await openSqlJsDb(), fixedClock('2026-11-15T12:00:00'));
    fetchMock.mockResolvedValueOnce(page('Alt')).mockResolvedValueOnce(page('Neu')).mockResolvedValueOnce(null);
    await cache.ensure(URL1);
    expect(await cache.refresh(URL1)).toMatchObject({ title: 'Neu' });
    expect(await cache.refresh(URL1)).toMatchObject({ title: 'Neu', status: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('a failure is remembered and retried only after a day; clear empties the cache', async () => {
    const db = await openSqlJsDb();
    const cache = previewCache(db, fixedClock('2026-11-15T12:00:00'));
    fetchMock.mockResolvedValue(null);
    expect(await cache.ensure(URL1)).toBeNull();
    expect(await cache.ensure(URL1)).toMatchObject({ status: 'failed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await db.execute("UPDATE preview_cache SET fetched_at = '2000-01-01T00:00:00.000Z'");
    fetchMock.mockResolvedValue(page('Jetzt'));
    expect(await cache.ensure(URL1)).toMatchObject({ title: 'Jetzt' });
    expect((await cache.stats()).count).toBe(1);
    await cache.clear();
    expect(await cache.get(URL1)).toBeNull();
  });
});
