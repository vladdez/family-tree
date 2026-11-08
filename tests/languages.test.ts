import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { languagePaths } from '../src/domain/language';
import { generateEnglishSource } from '../scripts/english-source';
import { projectRoot, readRawCatalog } from '../scripts/data-files';
import { adaptFamilySource } from '../src/domain/family-source';
import { DocumentSchema } from '../src/domain/schemas';

test('language switches preserve the current page for root and project hosting', () => {
  for (const base of ['/', '/family-tree/']) for (const page of ['', 'tree/', 'people/efim-father-of-maria/', 'documents/dmitry-birth-1910/', '404.html']) {
    const expected = { ru: base + page, en: base + 'en/' + page };
    assert.deepEqual(languagePaths(base + page, base), expected);
    assert.deepEqual(languagePaths(base + 'en/' + page, base), expected);
  }
  assert.throws(() => languagePaths('/elsewhere/', '/family-tree/'));
  assert.deepEqual(languagePaths('/family-tree/en/404/', '/family-tree/'), { ru: '/family-tree/404.html', en: '/family-tree/en/404.html' });
  assert.deepEqual(languagePaths('/people/enoch/', '/'), { ru: '/people/enoch/', en: '/en/people/enoch/' });
});

test('English inputs preserve every person, date, relationship and event reference', async () => {
  const original = await readRawCatalog();
  const before = JSON.stringify(original);
  await generateEnglishSource();
  const directory = path.join(projectRoot, '.tooling/en/src/data');
  const read = async (name: string) => JSON.parse(await readFile(path.join(directory, name), 'utf8'));
  const profiles = [];
  for (const kind of ['tree', 'non-tree']) for (const file of await readdir(path.join(directory, 'people', kind))) if (file.endsWith('.json')) profiles.push(await read(`people/${kind}/${file}`));
  const english = adaptFamilySource(await read('family.json'), profiles);
  const facts = (people: typeof original.people) => people.map((p) => ({
    id: p.id, slug: p.slug, sex: p.sex, birth: { ...p.birth, notes: '' }, death: { ...p.death, notes: '' },
    parents: p.parents, children: p.children, spouses: p.spouses, parentDetails: p.parentDetails,
    events: p.events.map(({ id, date, documentId, sourceRefs, beforeEventId }) => ({ id, date, documentId, sourceRefs, beforeEventId })),
    marriages: p.marriages.map(({ spouseId, date, documentId }) => ({ spouseId, date, documentId })),
    sources: p.sources.map(({ href, pages }) => ({ href, pageNumbers: (pages ?? '').replace(/[^0-9–—-]/gu, '') })),
  }));
  assert.deepEqual(facts(english.people), facts(original.people));
  const maria = english.people.find((p) => p.id === 'maria-efimova-1941')!;
  assert.equal(maria.firstName, 'Maria');
  assert.equal(maria.maidenName, 'Kuznetsova');
  assert.ok(JSON.stringify(maria.biography).includes('Librarian') || JSON.stringify(maria.biography).includes('library'));
  assert.equal(english.people.find((p) => p.id === 'efim-father-of-maria')!.lastName, 'Kuznetsov');
  const englishDocuments = await Promise.all((await readdir(path.join(directory, 'documents'))).filter((file) => file.endsWith('.json')).map((file) => read(`documents/${file}`)));
  const documentFacts = (documents: unknown[]) => documents.map((value) => DocumentSchema.parse(value)).map((d) => ({
    id: d.id, type: d.type, date: d.date, peopleIds: d.peopleIds, originalUrl: d.originalUrl,
    files: d.files.map(({ path, preview }) => ({ path, preview })),
  })).sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(documentFacts(englishDocuments), documentFacts(original.documents));
  assert.equal(JSON.stringify(await readRawCatalog()), before);
});
