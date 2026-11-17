import test from 'node:test';
import assert from 'node:assert/strict';
import { PersonSchema, DocumentSchema } from '../src/domain/schemas';
import { validateCatalog } from '../src/domain/validation';
import { getTimeline } from '../src/domain/timeline';
import { getProfileFootnotes } from '../src/domain/profile-footnotes';

test('citations follow reading order while sourceRefs remain stable and unused sources stay at the end', () => {
  const person = PersonSchema.parse({
    id: 'a', slug: 'a', firstName: 'Анна', lastName: '', patronymic: '', maidenName: '', sex: 'female',
    birth: { date: '1900', placeId: null }, death: { date: null, placeId: null },
    parents: [], children: [], spouses: [], portrait: null, summary: '',
    biography: [
      { title: 'Образование', text: 'Училась.', sourceRefs: [3] },
      { title: 'Работа', text: 'Работала.', sourceRefs: [1] },
    ],
    notes: '[Примечание](https://example.org/note).',
    sources: [
      { title: 'Работа', href: 'https://example.org/work' },
      { title: 'Общий источник', href: 'https://example.org/general' },
      { title: 'Образование', href: 'https://example.org/school' },
      { title: 'Событие', href: 'https://example.org/event' },
    ],
    events: [{ id: 'event', title: 'Событие', date: '1920', sourceRefs: [4, 3] }],
  });
  const catalog = { people: [person], documents: [], places: [] };
  const snapshot = JSON.stringify(catalog);
  const footnotes = getProfileFootnotes(person, getTimeline('a', catalog), catalog);
  assert.deepEqual(footnotes.map(({ number, sourceNumber, href }) => [number, sourceNumber, href]), [
    [1, 3, 'https://example.org/school'],
    [2, 1, 'https://example.org/work'],
    [3, undefined, 'https://example.org/note'],
    [4, 4, 'https://example.org/event'],
    [5, 2, 'https://example.org/general'],
  ]);
  assert.equal(JSON.stringify(catalog), snapshot);
});

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
    { number: 1, title: 'деревни', href: 'https://example.org/place', pages: '', documentIds: [] },
    { number: 2, sourceNumber: 1, title: 'Запись', href: 'https://example.org/record', pages: '3', documentIds: ['record'] },
  ]);
  assert.equal(JSON.stringify(catalog), snapshot);
  assert.deepEqual(getTimeline('a', catalog).find((event) => event.title === 'Крещение')!.sourceRefs, [1]);
  assert.throws(() => validateCatalog({ ...catalog, people: [{ ...person, biography: [{ title: 'Семья', text: 'Текст.', sourceRefs: [2] }] }] }), /неизвестный номер источника 2/);
  assert.equal(PersonSchema.safeParse({ ...person, biography: [{ title: 'Семья', text: 'Текст.', sourceRefs: [1, 1] }] }).success, false);
});
