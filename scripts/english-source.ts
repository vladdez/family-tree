import { readdir, readFile, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './data-files';
import { PersonProfileSchema, DocumentSchema } from '../src/domain/schemas';

const cyrillic = /[А-Яа-яЁё]/u;
const properFields = new Set(['firstName', 'lastName', 'patronymic', 'maidenName', 'archivalName', 'alternateNames', 'name', 'district', 'region', 'country', 'previousNames']);
const letters: Record<string, string> = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'yo', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'kh', ц:'ts', ч:'ch', ш:'sh', щ:'shch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' };
export function transliterate(text: string): string {
  return [...text.replaceAll('ье', 'йе').replaceAll('Ье', 'Йе')].map((char) => {
    const lower = char.toLowerCase(), result = letters[lower];
    return result === undefined ? char : char === lower ? result : result.slice(0, 1).toUpperCase() + result.slice(1);
  }).join('');
}
export async function generateEnglishSource() {
  const directory = path.join(projectRoot, 'src/i18n');
  const [content, ui, names] = await Promise.all(['content.en.json', 'ui.en.json', 'names.en.json'].map(async (file) => JSON.parse(await readFile(path.join(directory, file), 'utf8')) as Record<string, string>));
  const normalized = new Map(Object.entries(content).map(([key, value]) => [key.replace(/\s+/gu, ' ').trim(), value]));
  const missing = new Set<string>();
  const translate = (value: unknown, key = ''): unknown => {
    if (typeof value === 'string' && cyrillic.test(value)) {
      const translated = content[value] ?? normalized.get(value.replace(/\s+/gu, ' ').trim()) ?? ui[value] ?? names[value];
      if (translated !== undefined) return translated;
      if (properFields.has(key)) return transliterate(value);
      missing.add(value); return value;
    }
    if (Array.isArray(value)) return value.map((item) => translate(item, key));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, translate(item, field)]));
    return value;
  };
  // Templates and client code use the same complete phrase catalogue. English
  // literals use typographic quotes so replacements stay valid in TS and HTML.
  const replacements = Object.entries({ ...names, ...ui }).sort((a, b) => b[0].length - a[0].length);
  for (const [, value] of replacements) if (/["'`]/u.test(value)) throw new Error(`Unsafe source translation: ${value}`);
  const sourcePattern = new RegExp(replacements.map(([key]) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gu');
  const sourceMap = new Map(replacements);
  const destination = path.join(projectRoot, '.tooling/en');
  await rm(path.join(destination, 'src'), { recursive: true, force: true });
  await mkdir(path.join(destination, 'public'), { recursive: true });
  async function copy(relative: string) {
    const from = path.join(projectRoot, 'src', relative), to = path.join(destination, 'src', relative);
    await mkdir(path.dirname(to), { recursive: true });
    const entries = await readdir(from, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'i18n') continue;
      const name = path.join(relative, entry.name), input = path.join(from, entry.name), output = path.join(to, entry.name);
      if (entry.isDirectory()) { await mkdir(output, { recursive: true }); await copy(name); continue; }
      if (name === path.join('pages', 'developer.md')) { await copyFile(path.join(directory, 'developer.en.md'), output); continue; }
      if (name.startsWith(`data${path.sep}`) && name.endsWith('.json')) {
        let record = JSON.parse(await readFile(input, 'utf8'));
        if (name.startsWith(`data${path.sep}people${path.sep}`)) record = PersonProfileSchema.parse(record);
        else if (name.startsWith(`data${path.sep}documents${path.sep}`)) record = DocumentSchema.parse(record);
        if (name.startsWith(`data${path.sep}sources${path.sep}`)) { await copyFile(input, output); continue; }
        await writeFile(output, JSON.stringify(translate(record), null, 2) + '\n');
      } else if (/\.(?:astro|tsx?|md)$/u.test(name)) {
        const source = (await readFile(input, 'utf8')).replace(sourcePattern, (value) => sourceMap.get(value)!)
          .replaceAll("'ru-RU'", "'en-GB'").replaceAll("toLocaleLowerCase('ru')", "toLocaleLowerCase('en')");
        if (/\.(?:astro|tsx)$/u.test(name) && cyrillic.test(source.replaceAll(".replaceAll('ё', 'е')", '').replaceAll("'М'", ''))) {
          missing.add(`Interface text in ${name}`);
        }
        await writeFile(output, source);
      } else await copyFile(input, output);
    }
  }
  await copy('');
  if (missing.size) {
    const file = path.join(projectRoot, '.tooling/missing-english.json');
    await writeFile(file, JSON.stringify([...missing], null, 2));
    throw new Error(`Missing ${missing.size} English content translations; see ${file}`);
  }
}
