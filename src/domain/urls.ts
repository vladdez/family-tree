export function withBase(path: string, base: string): string {
  if (/^https:\/\//.test(path)) return path;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) throw new Error(`Недопустимый локальный URL: ${path}`);
  return `${base.replace(/\/$/, '')}${path}`;
}
export function url(path: string) { return withBase(path, import.meta.env.BASE_URL); }
export function personUrl(slug: string) { return url(`/people/${slug}/`); }
export function documentUrl(id: string) { return url(`/documents/${id}/`); }
