import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Catalog } from '../src/domain/schemas';
import { adaptFamilySource } from '../src/domain/family-source';
export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export async function readRecords(kind: 'people' | 'documents' | 'places'): Promise<unknown[]> {
  const directory = path.join(projectRoot, 'src/data', kind);
  async function jsonFiles(current: string): Promise<string[]> {
    const entries = await readdir(current, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => {
      const fullPath = path.join(current, entry.name);
      return entry.isDirectory() ? jsonFiles(fullPath) : entry.isFile() && entry.name.endsWith('.json') ? [fullPath] : [];
    }));
    return nested.flat().sort();
  }
  const files = kind === 'people'
    ? await jsonFiles(directory)
    : (await readdir(directory)).filter((name) => name.endsWith('.json')).sort().map((name) => path.join(directory, name));
  return Promise.all(files.map(async (file) => {
    const name = path.relative(directory, file);
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { throw new Error(`${kind}/${name}: ${error instanceof Error ? error.message : error}`); }
  }));
}
export async function readRawCatalog() {
  const [source, profiles, documents, places] = await Promise.all([
    readFile(path.join(projectRoot, 'src/data/family.json'), 'utf8').then(JSON.parse),
    readRecords('people'), readRecords('documents'), readRecords('places'),
  ]);
  return { ...adaptFamilySource(source, profiles), documents, places };
}
export async function validateMedia(catalog: Catalog) {
  const paths = new Set([...catalog.people.flatMap((p) => [...(p.portrait ? [p.portrait] : []), ...p.sources.filter((source) => source.href.startsWith('/')).map((source) => source.href)]), ...catalog.documents.flatMap((d) => d.files.flatMap((f) => f.preview ? [f.path, f.preview] : [f.path]))]);
  for (const mediaPath of paths) {
    const absolute = path.join(projectRoot, 'public', mediaPath);
    try { if (!(await stat(absolute)).isFile()) throw new Error('не файл'); }
    catch { throw new Error(`Медиафайл не найден: public${mediaPath}`); }
  }
}
