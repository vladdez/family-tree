import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Catalog } from '../src/domain/schemas';
import { adaptFamilySource } from '../src/domain/family-source';
export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export async function readRecords(kind: 'people' | 'documents' | 'places'): Promise<unknown[]> {
  const directory = path.join(projectRoot, 'src/data', kind);
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(names.map(async (name) => {
    try { return JSON.parse(await readFile(path.join(directory, name), 'utf8')); }
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
  const paths = new Set([...catalog.people.flatMap((p) => p.portrait ? [p.portrait] : []), ...catalog.documents.flatMap((d) => d.files.map((f) => f.path))]);
  for (const mediaPath of paths) {
    const absolute = path.join(projectRoot, 'public', mediaPath);
    try { if (!(await stat(absolute)).isFile()) throw new Error('не файл'); }
    catch { throw new Error(`Медиафайл не найден: public${mediaPath}`); }
  }
}
