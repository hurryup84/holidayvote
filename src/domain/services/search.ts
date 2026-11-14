import type { Property } from '../models';

const norm = (s: string) =>
  s
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    // Letters without an accent to strip (Danish / Norwegian holiday homes): ø → o, æ → ae, œ → oe.
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe');

/** Does the house match every word of the search (title, provider, notes, address, link, listing text)? */
export function matchesSearch(p: Property, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(
    [p.title, p.provider, p.description, p.address, p.url, p.previewTitle, p.previewDescription, p.previewSite].filter(Boolean).join(' '),
  );
  return words.every((w) => hay.includes(w));
}
