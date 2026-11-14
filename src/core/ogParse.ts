/**
 * Reads the preview data of a web page (OpenGraph / Twitter cards / JSON-LD / <title>).
 * Pure string parsing – used by the app (native fetch) and mirrored by the Edge Function link-preview.
 */
export interface LinkPreview {
  title: string | null;
  description: string | null;
  /** Absolute URL of the preview picture on the provider's server. Shown live, never stored. */
  image: string | null;
  siteName: string | null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? null) : null;
}

function metaContent(html: string, keys: string[]): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const key of keys) {
    for (const tag of tags) {
      const k = attr(tag, 'property') ?? attr(tag, 'name') ?? attr(tag, 'itemprop');
      if (k && k.toLowerCase() === key) {
        const c = attr(tag, 'content');
        if (c && c.trim()) return decodeEntities(c.trim());
      }
    }
  }
  return null;
}

function jsonLdImage(html: string): string | null {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const stack: unknown[] = [JSON.parse(m[1])];
      while (stack.length) {
        const v = stack.pop();
        if (Array.isArray(v)) stack.push(...v);
        else if (v && typeof v === 'object') {
          const img = (v as Record<string, unknown>).image;
          if (typeof img === 'string') return img;
          if (Array.isArray(img) && typeof img[0] === 'string') return img[0];
          if (img && typeof img === 'object' && typeof (img as { url?: unknown }).url === 'string') return (img as { url: string }).url;
          stack.push(...Object.values(v as Record<string, unknown>));
        }
      }
    } catch {
      /* broken JSON-LD */
    }
  }
  return null;
}

function absolute(url: string | null, base: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(decodeEntities(url), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parsePreview(html: string, pageUrl: string): LinkPreview {
  const head = html.slice(0, 600_000);
  const title =
    metaContent(head, ['og:title', 'twitter:title']) ?? (/<title[^>]*>([^<]+)<\/title>/i.exec(head)?.[1] ? decodeEntities(/<title[^>]*>([^<]+)<\/title>/i.exec(head)![1].trim()) : null);
  const image = absolute(metaContent(head, ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image']) ?? jsonLdImage(head), pageUrl);
  return {
    title: title ? title.replace(/\s+/g, ' ').slice(0, 200) : null,
    description: metaContent(head, ['og:description', 'twitter:description', 'description'])?.replace(/\s+/g, ' ').slice(0, 600) ?? null,
    image,
    siteName: metaContent(head, ['og:site_name', 'application-name']),
  };
}
