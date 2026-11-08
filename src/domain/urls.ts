export function withBase(path: string, base: string): string {
  if (/^https:\/\//.test(path)) return path;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) throw new Error(`Недопустимый локальный URL: ${path}`);
  return `${base.replace(/\/$/, '')}${path}`;
}
export function url(path: string) {
  const base = path.startsWith('/media/') ? import.meta.env?.PUBLIC_MEDIA_BASE ?? import.meta.env?.BASE_URL ?? '/' : import.meta.env?.BASE_URL ?? '/';
  return withBase(path, base);
}
export function personUrl(slug: string) { return url(`/people/${slug}/`); }
export function documentUrl(id: string) { return url(`/documents/${id}/`); }
