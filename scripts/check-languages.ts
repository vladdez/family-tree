import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse, type DefaultTreeAdapterMap as Tree } from 'parse5';
import { projectRoot } from './data-files';
import { languagePaths } from '../src/domain/language';

const dist = path.join(projectRoot, 'dist');
function nodes(node: Tree['node']): Tree['element'][] {
  return [...('tagName' in node ? [node] : []), ...('childNodes' in node ? node.childNodes.flatMap(nodes) : [])];
}
const attr = (node: Tree['element'], name: string) => node.attrs.find((item) => item.name === name)?.value;
function visible(node: Tree['node']): string {
  if ('tagName' in node && ['script', 'style'].includes(node.tagName)) return '';
  return 'value' in node ? node.value : 'childNodes' in node ? node.childNodes.map(visible).join('') : '';
}
async function files(directory: string, relative = ''): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!relative && entry.name === 'en') continue;
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await files(path.join(directory, entry.name), name));
    else if (entry.name.endsWith('.html')) result.push(name);
  }
  return result;
}
const pages = await files(dist);
const home = nodes(parse(await readFile(path.join(dist, 'index.html'), 'utf8')));
const site = new URL(attr(home.find((node) => node.tagName === 'link' && attr(node, 'rel') === 'canonical')!, 'href')!);
const errors: string[] = [];
for (const file of pages) {
  const relative = file.endsWith('index.html') ? file.slice(0, -'index.html'.length) : file;
  const expected = languagePaths(site.pathname + relative, site.pathname);
  for (const lang of ['ru', 'en'] as const) {
    const target = path.join(dist, lang === 'en' ? 'en' : '', file);
    let html: string;
    try { html = await readFile(target, 'utf8'); } catch { errors.push(`Missing ${lang} page: ${file}`); continue; }
    const document = parse(html), elements = nodes(document);
    if (!elements.some((node) => node.tagName === 'html' && attr(node, 'lang') === lang)) errors.push(`${lang}/${file}: incorrect language`);
    for (const choice of ['ru', 'en'] as const) {
      const button = elements.find((node) => node.tagName === 'a' && attr(node, 'data-language') === choice);
      if (!button || attr(button, 'href') !== expected[choice] || (attr(button, 'aria-current') === 'page') !== (lang === choice)) errors.push(`${lang}/${file}: incorrect ${choice} switch`);
      if (!elements.some((node) => node.tagName === 'link' && attr(node, 'rel') === 'alternate' && attr(node, 'hreflang') === choice && attr(node, 'href') === new URL(expected[choice], site).href)) errors.push(`${lang}/${file}: missing alternate ${choice}`);
    }
    if (lang === 'en') {
      if (/[А-Яа-яЁё]/u.test(visible(document))) errors.push(`en/${file}: untranslated visible text`);
      for (const node of elements) {
        for (const name of ['title', 'alt', 'aria-label', 'placeholder']) if (/[А-Яа-яЁё]/u.test(attr(node, name) ?? '')) errors.push(`en/${file}: untranslated ${name}`);
        if (node.tagName === 'meta' && /[А-Яа-яЁё]/u.test(attr(node, 'content') ?? '')) errors.push(`en/${file}: untranslated metadata`);
        if (node.tagName === 'astro-island') {
          if (/[А-Яа-яЁё]/u.test(attr(node, 'props') ?? '')) errors.push(`en/${file}: untranslated interactive tree data`);
          for (const name of ['component-url', 'renderer-url']) {
            const href = attr(node, name);
            if (!href?.startsWith(`${site.pathname}en/`)) { errors.push(`en/${file}: incorrect ${name}`); continue; }
            try { await readFile(path.join(dist, href.slice(site.pathname.length))); } catch { errors.push(`en/${file}: missing ${name}`); }
          }
        }
        if (node.tagName === 'script' && attr(node, 'type') === 'application/json') {
          const data = 'childNodes' in node ? node.childNodes.map((child) => 'value' in child ? child.value : '').join('') : '';
          if (/[А-Яа-яЁё]/u.test(data)) errors.push(`en/${file}: untranslated interactive chart data`);
        }
        if (node.tagName === 'a' && !attr(node, 'data-language')) {
          const href = attr(node, 'href') ?? '';
          if (href.startsWith(site.pathname) && !href.startsWith(`${site.pathname}en/`) && !href.startsWith(`${site.pathname}media/`)) errors.push(`en/${file}: link leaves English site: ${href}`);
        }
      }
    }
  }
}
if (errors.length) throw new Error(errors.join('\n'));
console.log(`Языки проверены: ${pages.length} пар страниц RU / EN, переключатели, английский текст и ссылки.`);
