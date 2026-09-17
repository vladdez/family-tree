import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PersonSchema, DocumentSchema, PartialDateSchema, type Catalog } from '../src/domain/schemas';
import { validateCatalog } from '../src/domain/validation';
import { getParents, getChildren, getSpouses, getSiblings, getRelativeGroups } from '../src/domain/relationships';
import { getDocumentsForPerson } from '../src/domain/documents';
import { getTimeline } from '../src/domain/timeline';
import { lifespan, eventDate, fullName, showBirthOnly } from '../src/domain/people';
import { formatDate } from '../src/domain/dates';
import { withBase } from '../src/domain/urls';
import { validateMedia } from '../scripts/data-files';

// Synthetic fixtures are used only by tests and never included in site data.
function person(id: string, changes: Record<string, unknown> = {}) {
  return PersonSchema.parse({ id, slug: id, firstName: 'Тест', lastName: '', patronymic: '', maidenName: '', sex: 'unknown', birth: { date: '1900', placeId: null }, death: { date: null, placeId: null }, parents: [], spouses: [], children: [], portrait: null, summary: '', biography: '', ...changes });
}
function document(peopleIds: string[]) {
  return DocumentSchema.parse({ id: 'source', title: 'Тестовый источник', type: 'marriage', date: '1920-06', peopleIds, files: [], archive: { name: '', fond: '', opis: '', delo: '', page: '' }, transcription: '', notes: '' });
}
const raw = (people: ReturnType<typeof person>[], documents: ReturnType<typeof document>[] = []) => ({ people, documents, places: [] });

test('partial dates preserve precision and validate actual calendar dates', () => {
  for (const date of ['1889', '1889-06', '1889-06-15', '2000-02-29', '0001-01-01']) assert.ok(PartialDateSchema.safeParse(date).success);
  for (const date of ['1889-2', '1900-02-29', '1889-04-31', '1889-13', '0000', '1889-00', '1889-01-00']) assert.equal(PartialDateSchema.safeParse(date).success, false, date);
  assert.equal(formatDate('1889'), '1889'); assert.equal(formatDate('1889-06'), 'июнь 1889'); assert.equal(formatDate('1889-06-15'), '15 июня 1889');
});

test('uncertain death dates remain alternatives without choosing a year', () => {
  const dmitry = person('a', { birth: { date: '1910', placeId: null }, death: { date: null, placeId: null, alternatives: ['1996', '1998'] } });
  const catalog = validateCatalog(raw([dmitry]));
  assert.equal(dmitry.death.date, null); assert.deepEqual(dmitry.death.alternatives, ['1996', '1998']);
  assert.equal(lifespan(dmitry), '1910 — 1996 / 1998'); assert.match(eventDate(dmitry.death), /1996 или 1998/);
  const death = getTimeline(dmitry.id, catalog).find((e) => e.type === 'death')!;
  assert.equal(death.date, null); assert.deepEqual(death.alternatives, ['1996', '1998']);
});

test('recent births use the born prefix without implying a death; known deaths and uncertain older births retain their dates', () => {
  const cases = [
    ['1934', [], null, [], '1934 — ?', false],
    ['1935', [], null, [], 'род. 1935', true],
    ['1969-03-18', [], null, [], 'род. 1969', true],
    ['1995', [], null, [], 'род. 1995', true],
    [null, ['1935', '1936'], null, [], 'род. 1935 / 1936', true],
    [null, ['1934', '1935'], null, [], '1934 / 1935 — ?', false],
    [null, [], null, [], '? — ?', false],
    ['1935', [], '2024', [], '1935 — 2024', false],
    ['1965-10-21', [], '2025', [], '1965 — 2025', false],
    ['1941', [], null, ['2016', '2017'], '1941 — 2016 / 2017', false],
  ] as const;
  for (const [birth, birthAlternatives, death, deathAlternatives, expected, birthOnly] of cases) {
    const record = person('test', { birth: { date: birth, placeId: null, alternatives: [...birthAlternatives] }, death: { date: death, placeId: null, alternatives: [...deathAlternatives] } });
    const snapshot = JSON.stringify(record);
    assert.equal(lifespan(record), expected);
    assert.equal(showBirthOnly(record), birthOnly);
    assert.equal(JSON.stringify(record), snapshot);
  }
});

test('validation rejects duplicate IDs, slugs, missing references and one-sided links', () => {
  assert.throws(() => validateCatalog(raw([person('a'), person('a')])), /Повтор person ID/);
  assert.throws(() => validateCatalog(raw([person('a'), person('b', { slug: 'a' })])), /Повтор slug/);
  assert.throws(() => validateCatalog(raw([person('a', { parents: ['missing'] })])), /неизвестный parents/);
  assert.throws(() => validateCatalog(raw([person('a', { parents: ['b'] }), person('b')])), /обратная связь/);
  assert.throws(() => validateCatalog(raw([person('a', { spouses: ['b'] }), person('b')])), /обратная связь/);
  assert.throws(() => validateCatalog(raw([person('a')], [document(['missing'])])), /неизвестный person ID/);
  assert.throws(() => validateCatalog(raw([person('a', { birth: { date: '1900', placeId: 'missing' } })])), /неизвестное место/);
  assert.throws(() => validateCatalog(raw([person('a', { parents: ['a'], children: ['a'] })])), /самим собой/);
});

test('validation rejects ancestor cycles while allowing a non-binary family graph', () => {
  assert.throws(() => validateCatalog(raw([person('a', { parents: ['b'], children: ['b'] }), person('b', { parents: ['a'], children: ['a'] })])), /Цикл/);
  const catalog = validateCatalog(raw([
    person('a', { children: ['d', 'e'], spouses: ['b', 'c'] }),
    person('b', { children: ['d', 'e'], spouses: ['a'] }),
    person('c', { children: ['d'], spouses: ['a'] }),
    person('d', { parents: ['a', 'b', 'c'], parentDetails: [{ personId: 'c', role: 'parent', kind: 'adoptive' }] }),
    person('e', { parents: ['a', 'b'] }),
  ]));
  assert.equal(getParents('d', catalog).length, 3); assert.equal(getSpouses('a', catalog).length, 2);
  assert.deepEqual(getChildren('a', catalog).map((p) => p.id), ['d', 'e']);
  assert.deepEqual(getSiblings('d', catalog).map((p) => p.id), ['e']);
  assert.equal(fullName(catalog.people[0]), fullName(catalog.people[1])); // Identical names remain separate IDs.
});

test('shared documents stay one entity and linked marriage timeline is not duplicated', () => {
  const marriage = { date: '1920-06', documentId: 'source' };
  const catalog = validateCatalog(raw([
    person('a', { spouses: ['b'], marriages: [{ ...marriage, spouseId: 'b' }] }),
    person('b', { spouses: ['a'], marriages: [{ ...marriage, spouseId: 'a' }] }),
  ], [document(['a', 'b'])]));
  assert.strictEqual(getDocumentsForPerson('a', catalog)[0], getDocumentsForPerson('b', catalog)[0]);
  const timeline = getTimeline('a', catalog);
  assert.equal(timeline.filter((e) => e.documentId === 'source').length, 1);
  assert.deepEqual(timeline.find((e) => e.type === 'marriage')!.peopleIds, ['b']);
  assert.ok(!timeline.some((e) => e.type === 'death'));
  assert.throws(() => validateCatalog(raw([catalog.people[0], person('b', { spouses: ['a'] })], catalog.documents)), /брак должен быть отражён/);
});

test('siblings with unknown shared parents remain reciprocal without inheriting a father, mother or half-sibling label', () => {
  const catalog = validateCatalog({ ...raw([
    person('father', { children: ['a'] }), person('a', { parents: ['father'] }), person('b'),
  ]), relations: [{ type: 'sibling', person1: 'a', person2: 'b', status: 'explicit' }] });
  const snapshot = JSON.stringify(catalog);
  assert.deepEqual(getSiblings('a', catalog).map((person) => person.id), ['b']);
  assert.deepEqual(getSiblings('b', catalog).map((person) => person.id), ['a']);
  assert.deepEqual(getParents('b', catalog), []);
  assert.deepEqual(getChildren('father', catalog).map((person) => person.id), ['a']);
  for (const [id, sibling] of [['a', 'b'], ['b', 'a']]) {
    const group = getRelativeGroups(id, catalog).find((group) => group.label === 'Братья и сёстры')!;
    assert.equal(group.annotations[sibling], 'Общие родители не уточнены');
  }
  assert.equal(JSON.stringify(catalog), snapshot);
});

test('timeline sorts partial dates and puts undated events last', () => {
  const catalog = validateCatalog(raw([person('a', { events: [
    { id: 'unknown', date: null, title: 'Без даты' }, { id: 'late', date: '1950-05', title: 'Позже' }, { id: 'early', date: '1920', title: 'Раньше' },
  ] })]));
  assert.deepEqual(getTimeline('a', catalog).map((e) => e.date), ['1900', '1920', '1950-05', null]);
});

test('media must exist and paths cannot traverse out of public/media', async () => {
  const catalog: Catalog = { ...raw([person('a', { portrait: '/media/people/absent.jpg' })]), places: [] };
  await assert.rejects(validateMedia(catalog), /Медиафайл не найден/);
  assert.equal(PersonSchema.safeParse({ ...person('a'), portrait: '/media/../secret.jpg' }).success, false);
});

test('route and media helpers consistently prefix a non-root base', () => {
  assert.equal(withBase('/people/a/', '/family-tree/'), '/family-tree/people/a/');
  assert.equal(withBase('/media/documents/source.pdf', '/family-tree/'), '/family-tree/media/documents/source.pdf');
  assert.equal(withBase('/', '/family-tree/'), '/family-tree/');
  assert.equal(withBase('/people/a/', '/'), '/people/a/');
  assert.equal(withBase('https://archive.example/source', '/family-tree/'), 'https://archive.example/source');
  assert.throws(() => withBase('//elsewhere.example', '/')); assert.throws(() => withBase('/../secret', '/'));
});
