import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePreview } from '../../src/core/ogParse';

describe('link preview parser', () => {
  it('reads OpenGraph tags (any attribute order, entities, relative image)', () => {
    const html = `<html><head><title>Fallback</title>
      <meta content="Reetdachhaus &amp; Sauna – Rømø" property="og:title">
      <meta property='og:description' content='4 Schlafzimmer, Garten'>
      <meta property="og:image" content="/img/house.jpg?w=1200">
      <meta property="og:site_name" content="Novasol"></head></html>`;
    expect(parsePreview(html, 'https://www.novasol.de/ferienhaus/1')).toEqual({
      title: 'Reetdachhaus & Sauna – Rømø',
      description: '4 Schlafzimmer, Garten',
      image: 'https://www.novasol.de/img/house.jpg?w=1200',
      siteName: 'Novasol',
    });
  });

  it('falls back to twitter tags, JSON-LD and <title>', () => {
    const html = `<title>Strandvilla &#8211; Sellin</title>
      <script type="application/ld+json">{"@type":"LodgingBusiness","image":["https://cdn.x.de/a.jpg"]}</script>`;
    expect(parsePreview(html, 'https://x.de/h')).toMatchObject({ title: 'Strandvilla – Sellin', image: 'https://cdn.x.de/a.jpg' });
    expect(parsePreview('<meta name="twitter:image" content="https://t.co/i.png">', 'https://x.de')).toMatchObject({ image: 'https://t.co/i.png' });
  });

  it('no data → nulls; never non-http image URLs', () => {
    expect(parsePreview('<p>nothing</p>', 'https://x.de')).toEqual({ title: null, description: null, image: null, siteName: null });
    expect(parsePreview('<meta property="og:image" content="javascript:alert(1)">', 'https://x.de').image).toBeNull();
  });

  it('the Edge Function uses the same parser (copy must stay identical)', () => {
    const root = join(__dirname, '../..');
    expect(readFileSync(join(root, 'supabase/functions/_shared/ogParse.ts'), 'utf8')).toBe(readFileSync(join(root, 'src/core/ogParse.ts'), 'utf8'));
  });
});
