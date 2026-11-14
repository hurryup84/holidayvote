import { expect, it } from 'vitest';
import type { Property } from '../../src/domain/models';
import { matchesSearch } from '../../src/domain/services/search';

const p = {
  url: 'https://www.novasol.de/ferienhaus/1',
  title: 'Reetdachhaus',
  provider: 'Novasol',
  description: null,
  address: 'Rømø',
  previewTitle: 'Ferienhaus mit Sauna und Kamin',
  previewDescription: 'Großer Garten, 300 m zum Strand',
  previewSite: 'NOVASOL',
} as Property;

it('searches title, address and the stored listing text (case, accents, ß)', () => {
  expect(matchesSearch(p, '')).toBe(true);
  expect(matchesSearch(p, 'sauna strand')).toBe(true);
  expect(matchesSearch(p, 'romo')).toBe(true);
  expect(matchesSearch(p, 'GROSSER')).toBe(true);
  expect(matchesSearch(p, 'pool')).toBe(false);
});
