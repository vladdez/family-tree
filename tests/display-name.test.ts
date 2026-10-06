import test from 'node:test';
import assert from 'node:assert/strict';
import { displayName, inferredPatronymic } from '../src/domain/people';
import type { Catalog, Person } from '../src/domain/schemas';

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
