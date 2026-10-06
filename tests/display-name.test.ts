import test from 'node:test';
import assert from 'node:assert/strict';
import { displayName, inferredPatronymic } from '../src/domain/people';
import type { Catalog, Person } from '../src/domain/schemas';
import { validateCatalog } from '../src/domain/validation';
import { readRawCatalog } from '../scripts/data-files';

function person(id: string, firstName: string, sex: Person['sex'], options: Partial<Person> = {}): Person {
  const event = { date: null, placeId: null, alternatives: [], notes: '' };
  return {
    id, slug: id, firstName, lastName: '', patronymic: '', maidenName: '', alternateNames: [], sex,
    birth: event, death: event, parents: [], spouses: [], children: [], parentDetails: [], marriages: [], events: [],
    portrait: null, summary: '', biography: '', notes: '', sources: [], ...options,
  };
}

test('отчество выводится из имени единственного установленного отца', () => {
  const father = person('yakov', 'Яков', 'male');
  const son = person('petr', 'Пётр', 'male', { parents: [father.id], parentDetails: [{ personId: father.id, role: 'father', kind: 'unknown' }] });
  const daughter = person('matryona', 'Матрёна', 'female', { parents: [father.id], parentDetails: [{ personId: father.id, role: 'father', kind: 'unknown' }] });
  const catalog: Catalog = { people: [father, son, daughter], documents: [], places: [] };
  assert.equal(displayName(son, catalog), 'Пётр Яковлевич');
  assert.equal(displayName(daughter, catalog), 'Матрёна Яковлевна');
});

test('архивное имя и неоднозначная старая форма не дополняются', () => {
  const petr = person('petr', 'Пётр', 'male');
  const pavel = person('pavel', 'Павел', 'male');
  const mikhey = person('mikhey', 'Михей', 'male', { archivalName: 'Михей Петров', parents: [petr.id] });
  const paraskeva = person('paraskeva', 'Параскева', 'female', { lastName: 'Павлова', parents: [pavel.id] });
  const catalog: Catalog = { people: [petr, pavel, mikhey, paraskeva], documents: [], places: [] };
  assert.equal(inferredPatronymic(mikhey, catalog), null);
  assert.equal(displayName(mikhey, catalog), 'Михей Петров');
  assert.equal(inferredPatronymic(paraskeva, catalog), null);
  assert.equal(displayName(paraskeva, catalog), 'Параскева Павлова');
});

test('известное отчество не заменяется вычисленным', () => {
  const father = person('pavel', 'Павел', 'male');
  const personWithPatronymic = person('petr', 'Пётр', 'male', { patronymic: 'Павлович', lastName: 'Павлов', parents: [father.id] });
  const catalog: Catalog = { people: [father, personWithPatronymic], documents: [], places: [] };
  assert.equal(displayName(personWithPatronymic, catalog), 'Пётр Павлович Павлов');
});

test('у всех людей с установленным отцом выводится отчество, если имя не неоднозначно', async () => {
  const catalog = validateCatalog(await readRawCatalog());
  const ambiguousHistoricalNames = new Set([
    // «Павлова» в записи может быть как фамилией, так и старой формой отчества.
    'paraskeva-pavlova-1889',
  ]);
  const missing = catalog.people.filter((person) => {
    if (person.patronymic || person.archivalName || ambiguousHistoricalNames.has(person.id)) return false;
    const explicitFathers = person.parentDetails.filter((parent) => parent.role === 'father').map((parent) => parent.personId);
    const maleParents = person.parents.filter((id) => catalog.people.find((candidate) => candidate.id === id)?.sex === 'male');
    const fatherIds = [...new Set(explicitFathers.length ? explicitFathers : maleParents)];
    return fatherIds.length === 1 && !inferredPatronymic(person, catalog);
  });
  assert.deepEqual(missing.map((person) => person.id), []);
  const lev = catalog.people.find((person) => person.id === 'lev-son-of-vladimir-mikheev-and-elizaveta-petrova')!;
  assert.equal(displayName(lev, catalog), 'Лев Владимирович');
  assert.equal(lev.birth.placeId, 'boeblingen');
});

test('места рождения ближайшей семьи сохраняют подтверждённые исключения', async () => {
  const catalog = validateCatalog(await readRawCatalog());
  const places = new Map(catalog.people.map((person) => [person.id, person.birth.placeId]));
  for (const id of [
    'vladimir-mikheev-1995', 'yuri-vladimirovich-mikheev-1965', 'ksenia-mikheeva-1990',
    'maria-mikheeva-2003', 'elizaveta-petrova-beloborodova',
  ]) assert.equal(places.get(id), 'lash-tayaba', id);
  assert.equal(places.get('elvira-mikheeva-grigoryeva'), 'khirposi');
  assert.equal(places.get('lev-son-of-vladimir-mikheev-and-elizaveta-petrova'), 'boeblingen');
});
