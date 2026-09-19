export interface InlinePart { text: string; href?: string }

// Only HTTPS Markdown links are supported. Text stays escaped by Astro.
export function parseInlineLinks(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/gu)) {
    try {
      const url = new URL(match[2]);
      if (url.protocol !== 'https:' || !url.hostname) continue;
    } catch { continue; }
    if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index) });
    parts.push({ text: match[1], href: match[2] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
