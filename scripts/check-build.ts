import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { projectRoot, readRawCatalog } from './data-files';
import { validateCatalog } from '../src/domain/validation';
import { fullName, lifespan, personDescription } from '../src/domain/people';
import { getRelativeGroups } from '../src/domain/relationships';
import { getSourceIssues, getUnidentifiedRelatives } from '../src/domain/source-notes';
import { getPersonRedirects } from '../src/domain/person-redirects';
import personRedirects from '../src/data/person-redirects.json';

const dist = path.join(projectRoot, 'dist');
const errors: string[] = [];
const pages: string[] = [];
async function walk(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file); else if (entry.name.endsWith('.html')) pages.push(file);
  }
}
function elements(node: DefaultTreeAdapterMap['node']): DefaultTreeAdapterMap['element'][] {
  const children = 'childNodes' in node ? node.childNodes.flatMap(elements) : [];
  return 'tagName' in node ? [node, ...children] : children;
}
function attr(node: DefaultTreeAdapterMap['element'], name: string) { return node.attrs.find((a) => a.name === name)?.value; }
function textContent(node: DefaultTreeAdapterMap['node']): string { return 'value' in node ? node.value : 'childNodes' in node ? node.childNodes.map(textContent).join('') : ''; }

await walk(dist);
// Read the emitted canonical URL instead of duplicating Astro's base configuration.
const rootNodes = elements(parse(await readFile(path.join(dist, 'index.html'), 'utf8')));
const rootCanonical = attr(rootNodes.find((n) => n.tagName === 'link' && attr(n, 'rel') === 'canonical')!, 'href');
if (!rootCanonical) throw new Error('Отсутствует canonical главной страницы');
const site = new URL(rootCanonical);
const base = site.pathname.endsWith('/') ? site.pathname : `${site.pathname}/`;
let checkedLinks = 0;
for (const page of pages) {
  const nodes = elements(parse(await readFile(page, 'utf8')));
  const relative = path.relative(dist, page).split(path.sep).join('/');
  const pagePath = relative.endsWith('index.html') ? relative.slice(0, -'index.html'.length) : relative;
  const current = new URL(pagePath, site);
  for (const node of nodes) {
    for (const name of ['href', 'src']) {
      const value = attr(node, name); if (!value || /^(#|mailto:|tel:|data:)/.test(value)) continue;
      const target = new URL(value, current); if (target.origin !== site.origin) continue;
      if (!target.pathname.startsWith(base)) { errors.push(`${relative}: URL выходит за base ${base}: ${value}`); continue; }
      const local = decodeURIComponent(target.pathname.slice(base.length));
      const targetPath = path.join(dist, local);
      try {
        const info = await stat(targetPath);
        if (info.isDirectory()) await stat(path.join(targetPath, 'index.html'));
        checkedLinks++;
      } catch { errors.push(`${relative}: отсутствующая цель ${value}`); }
    }
  }
  for (const key of ['og:title', 'og:description', 'twitter:title', 'twitter:description']) if (!nodes.some((n) => n.tagName === 'meta' && (attr(n, 'property') ?? attr(n, 'name')) === key && attr(n, 'content'))) errors.push(`${relative}: нет ${key}`);
}
const catalog = validateCatalog(await readRawCatalog());
const redirects = getPersonRedirects(catalog, personRedirects);
for (const person of catalog.people) {
  const file = path.join(dist, 'people', person.slug, 'index.html');
  const nodes = elements(parse(await readFile(file, 'utf8')));
  const visibleText = textContent(nodes.find((n) => n.tagName === 'main')!);
  const personLinks = new Set(nodes.filter((n) => n.tagName === 'a').map((n) => attr(n, 'href')));
  for (const name of person.alternateNames) if (!visibleText.includes(name)) errors.push(`${person.id}: пропущено альтернативное имя ${name}`);
  const title = `${fullName(person)} · ${lifespan(person)} — Родословная Михеевых`;
  const meta = (key: string) => attr(nodes.find((n) => n.tagName === 'meta' && (attr(n, 'property') ?? attr(n, 'name')) === key)!, 'content');
  if (textContent(nodes.find((n) => n.tagName === 'h1')!) !== fullName(person)) errors.push(`${person.id}: заголовок не соответствует записи`);
  if (textContent(nodes.find((n) => n.tagName === 'title')!) !== title || meta('og:title') !== title || meta('twitter:title') !== title) errors.push(`${person.id}: неверные заголовки метаданных`);
  if (meta('description') !== personDescription(person) || meta('og:description') !== personDescription(person) || meta('twitter:description') !== personDescription(person)) errors.push(`${person.id}: неверные описания метаданных`);
  const socialImages = nodes.filter((n) => n.tagName === 'meta' && ['og:image', 'twitter:image'].includes(attr(n, 'property') ?? attr(n, 'name') ?? ''));
  if (!person.portrait && socialImages.length) errors.push(`${person.id}: вымышленное изображение в метаданных`);
  for (const image of socialImages) if (attr(image, 'content') !== new URL(`${base.replace(/\/$/, '')}${person.portrait}`, site.origin).href) errors.push(`${person.id}: неверный URL портрета`);
  for (const group of getRelativeGroups(person.id, catalog)) for (const relative of group.people) {
    if (!personLinks.has(`${base}people/${relative.slug}/`)) errors.push(`${person.id}: нет ссылки на родственника ${relative.id}`);
    if (group.annotations[relative.id] && !visibleText.includes(group.annotations[relative.id])) errors.push(`${person.id}: не показан статус связи ${relative.id}`);
  }
  for (const issue of getSourceIssues(person.id, catalog)) if (!visibleText.includes(issue.reason)) errors.push(`${person.id}: пропущено замечание источника`);
  for (const relative of getUnidentifiedRelatives(catalog, person.id)) if (!visibleText.includes(relative.title) || !visibleText.includes(relative.statusLabel)) errors.push(`${person.id}: пропущены безымянные родственники`);
}
const peoplePages = pages.filter((file) => path.relative(dist, file).startsWith(`people${path.sep}`) && path.relative(dist, file) !== path.join('people', 'index.html'));
if (peoplePages.length !== catalog.people.length + redirects.length) errors.push('Число личных страниц и перенаправлений не соответствует источнику');
for (const { from, person } of redirects) {
  const nodes = elements(parse(await readFile(path.join(dist, 'people', from, 'index.html'), 'utf8')));
  const destination = `${base}people/${person.slug}/`;
  if (!nodes.some((node) => node.tagName === 'meta' && attr(node, 'http-equiv') === 'refresh' && attr(node, 'content') === `0;url=${destination}`)) errors.push(`${from}: неверная цель перенаправления`);
  if (!nodes.some((node) => node.tagName === 'link' && attr(node, 'rel') === 'canonical' && attr(node, 'href') === new URL(destination, site.origin).href)) errors.push(`${from}: неверный canonical перенаправления`);
  if (!nodes.some((node) => node.tagName === 'meta' && attr(node, 'name') === 'robots' && attr(node, 'content') === 'noindex, follow')) errors.push(`${from}: перенаправление не исключено из индексации`);
  if (!nodes.some((node) => node.tagName === 'a' && attr(node, 'href') === destination)) errors.push(`${from}: нет ссылки на объединённую страницу`);
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Статический сайт проверен: ${pages.length} страниц, ${checkedLinks} локальных ссылок и ресурсов, base ${base}. Все люди, связи, статусы, замечания источников и метаданные проверены.`);
