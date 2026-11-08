import { withBase } from './urls';

export const language = import.meta.env?.PUBLIC_SITE_LANGUAGE === 'en' ? 'en' : 'ru';
export function languagePaths(pathname: string, siteBase: string) {
  const base = `${siteBase.replace(/\/$/, '')}/`;
  if (!pathname.startsWith(base)) throw new Error('Page is outside the site base');
  const page = pathname.slice(base.length).replace(/^en(?:\/|$)/, '');
  const relative = page === '404/' ? '404.html' : page;
  return { ru: withBase(`/${relative}`, base), en: withBase(`/en/${relative}`, base) };
}
