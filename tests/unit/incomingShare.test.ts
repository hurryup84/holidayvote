import { describe, expect, it } from 'vitest';
import { sharedHolidayHomeUrl } from '../../src/native/incomingShare';

describe('shared holiday-home links', () => {
  it('extracts browser text and keeps listing query parameters and fragments', () => {
    expect(sharedHolidayHomeUrl('Look at this!\nhttps://example.com/house?id=42&x=1#details'))
      .toBe('https://example.com/house?id=42&x=1#details');
  });

  it('removes surrounding punctuation without removing balanced URL parentheses', () => {
    expect(sharedHolidayHomeUrl('House (https://example.com/ferienhaus_(alpsee)).'))
      .toBe('https://example.com/ferienhaus_(alpsee)');
    expect(sharedHolidayHomeUrl('[https://example.com/house]')).toBe('https://example.com/house');
  });

  it('rejects non-web shares and credential-bearing URLs', () => {
    for (const text of ['Ferienhaus', 'javascript:alert(1)', 'file:///house', 'ftp://example.com', 'https://user:pass@example.com/']) {
      expect(sharedHolidayHomeUrl(text)).toBeNull();
    }
  });
});
