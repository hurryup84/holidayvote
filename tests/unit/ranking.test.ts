import { describe, expect, it } from 'vitest';
import type { PropertyWithStats } from '../../src/domain/models';
import { rankProperties } from '../../src/domain/services/ranking';
import { detectProvider, extractUrl } from '../../src/domain/services/provider';
import { urlKey } from '../../src/data/repositories/propertyRepo';
import { haversineKm } from '../../src/domain/services/geo';

const house = (id: string, p: Partial<PropertyWithStats>): PropertyWithStats => ({
  id, vacationId: 'v', url: `https://x.de/${id}`, title: id, description: null, provider: null, price: null, beds: null,
  bedrooms: null, bathrooms: null, hasPool: false, address: null, lat: null, lng: null, avatar: null, status: 'active',
  previewTitle: null, previewDescription: null, previewSite: null,
  createdBy: null, createdAt: `2026-11-0${id.length}T00:00:00Z`, updatedAt: '', suggestedByName: null, voteCount: 0, voteSum: 0,
  voteAvg: null, myVote: null, vetoCount: 0, myVeto: false, favoriteCount: 0, myFavorite: false, commentCount: 0, ...p,
});

describe('ranking', () => {
  it('booked first, eliminated last, then stars → votes → vetoes → favourites → price', () => {
    const list = [
      house('out', { status: 'eliminated', voteAvg: 5, voteCount: 3 }),
      house('cheap', { voteAvg: 4, voteCount: 2, price: 900 }),
      house('pricey', { voteAvg: 4, voteCount: 2, price: 2000 }),
      house('vetoed', { voteAvg: 4, voteCount: 2, vetoCount: 1, price: 100 }),
      house('top', { voteAvg: 4.5, voteCount: 2 }),
      house('more', { voteAvg: 4, voteCount: 3 }),
      house('booked', { status: 'booked' }),
      house('none', {}),
    ];
    expect(rankProperties(list).map((h) => h.id)).toEqual(['booked', 'top', 'more', 'cheap', 'pricey', 'vetoed', 'none', 'out']);
  });
});

describe('links', () => {
  it('provider names and duplicate keys', () => {
    expect(detectProvider('https://www.airbnb.de/rooms/1')).toBe('Airbnb');
    expect(detectProvider('https://www.booking.com/hotel/x.html')).toBe('Booking.com');
    expect(detectProvider('https://example.org/x')).toBe('example.org');
    expect(urlKey('https://www.airbnb.de/rooms/123/?adults=2')).toBe(urlKey('https://AIRBNB.de/rooms/123'));
    expect(urlKey('https://airbnb.de/rooms/123')).not.toBe(urlKey('https://airbnb.de/rooms/124'));
  });
  it('finds the link in a shared text', () => {
    expect(extractUrl('Schau mal: https://www.airbnb.de/rooms/1?x=2.')).toBe('https://www.airbnb.de/rooms/1?x=2');
    expect(extractUrl('novasol.de/ferienhaus/1')).toBe('https://novasol.de/ferienhaus/1');
    expect(extractUrl('kein Link hier')).toBeNull();
  });
  it('distance', () => {
    expect(Math.round(haversineKm({ lat: 52.52, lng: 13.405 }, { lat: 48.137, lng: 11.575 }))).toBe(504);
  });
});
