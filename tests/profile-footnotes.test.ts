import test from 'node:test';
import assert from 'node:assert/strict';
import { PersonSchema, DocumentSchema } from '../src/domain/schemas';
import { validateCatalog } from '../src/domain/validation';
import { getTimeline } from '../src/domain/timeline';
import { getProfileFootnotes, getGeneralProfileFootnotes } from '../src/domain/profile-footnotes';

test('footnotes share a source between biography, inline links and multiple document events', () => {
  const person = PersonSchema.parse({
    id: 'a', slug: 'a', firstName: 'Анна', lastName: '', patronymic: '', maidenName: '', sex: 'female',
    birth: { date: '1900', placeId: null, documentId: 'record' }, death: { date: null, placeId: null },
    parents: [], children: [], spouses: [], portrait: null, summary: '',
    biography: [{ title: 'Происхождение', text: 'Из [деревни](https://example.org/place).', sourceRefs: [1] }],
    notes: '[Другая подпись](https://example.org/place).',
    sources: [{ title: 'Запись', href: 'https://example.org/record', pages: '3' }],
    events: [{ id: 'baptism', title: 'Крещение', date: '1900-01-15', documentId: 'record', sourceRefs: [1] }],
  });
  const document = DocumentSchema.parse({
    id: 'record', title: 'Рождение и крещение', type: 'birth', date: '1900', peopleIds: ['a'],
    originalUrl: 'https://example.org/record', files: [], archive: { name: '', fond: '', opis: '', delo: '', page: '' }, transcription: '', notes: '',
  });
  const catalog = validateCatalog({ people: [person], documents: [document], places: [] });
  const snapshot = JSON.stringify(catalog);
  assert.deepEqual(getProfileFootnotes(person, getTimeline('a', catalog), catalog), [
    { number: 1, title: 'Запись', href: 'https://example.org/record', pages: '3', documentIds: ['record'] },
    { number: 2, title: 'деревни', href: 'https://example.org/place', pages: '', documentIds: [] },
  ]);
  assert.equal(JSON.stringify(catalog), snapshot);
  assert.deepEqual(getGeneralProfileFootnotes(person, getTimeline('a', catalog), getProfileFootnotes(person, getTimeline('a', catalog), catalog)), []);
  assert.deepEqual(getTimeline('a', catalog).find((event) => event.title === 'Крещение')!.sourceRefs, [1]);
  assert.throws(() => validateCatalog({ ...catalog, people: [{ ...person, biography: [{ title: 'Семья', text: 'Текст.', sourceRefs: [2] }] }] }), /неизвестный номер источника 2/);
  assert.equal(PersonSchema.safeParse({ ...person, biography: [{ title: 'Семья', text: 'Текст.', sourceRefs: [1, 1] }] }).success, false);
});
