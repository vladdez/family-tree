import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLongevityReport, estimateAge } from '../src/domain/longevity';
import type { Catalog, Person } from '../src/domain/schemas';

function person(id: string, sex: Person['sex'], birth: string | null, death: string | null, parents: string[] = []): Person {
  const event = (date: string | null) => ({ date, placeId: null, alternatives: [], notes: '' });
  return {
    id, slug: id, firstName: id, lastName: '', patronymic: '', maidenName: '', alternateNames: [], sex,
    birth: event(birth), death: event(death), parents, spouses: [], children: [], parentDetails: [],
    marriages: [], events: [], portrait: null, summary: '', biography: '', notes: '', sources: [],
  };
}

test('точные даты дают полный возраст', () => {
  assert.deepEqual(estimateAge(['1965-10-21'], ['2024-11-20']), {
    min: 59, max: 59, midpoint: 59, exact: true, label: '59',
  });
});

test('неполные и альтернативные даты помечаются как оценка', () => {
  assert.deepEqual(estimateAge(['1802'], ['1855']), {
    min: 53, max: 53, midpoint: 53, exact: false, label: '≈ 53',
  });
  assert.deepEqual(estimateAge(['1747', '1748'], ['1809']), {
    min: 61, max: 62, midpoint: 61.5, exact: false, label: '61–62',
  });
});

test('отчёт включает только прямых предков с обеими датами', () => {
  const catalog: Catalog = {
    people: [
      person('father', 'male', '1950', '2020', ['grandfather']),
      person('grandfather', 'male', '1920', '1990'),
      person('mother', 'female', '1955', null, ['grandmother']),
      person('grandmother', 'unknown', '1925', '2005'),
      person('collateral', 'female', '1930', '2010'),
    ],
    documents: [], places: [], relations: [
      { type: 'parent', parent: 'grandmother', child: 'mother', role: 'mother', status: 'explicit' },
    ],
  };
  const report = buildLongevityReport(catalog, [
    { id: 'paternal', personId: 'father', label: 'По отцу' },
    { id: 'maternal', personId: 'mother', label: 'По матери' },
  ]);
  const ids = new Set(report.records.map((record) => record.person.id));
  assert.equal(ids.has('father'), true);
  assert.equal(ids.has('grandfather'), true);
  assert.equal(ids.has('mother'), false);
  assert.equal(ids.has('grandmother'), true);
  assert.equal(ids.has('collateral'), false);
  assert.equal(report.records.length + report.incomplete.length, report.ancestors.length);
  assert.equal(report.branches.length, 2);
  assert.equal(report.sexes.reduce((total, group) => total + group.records.length, 0), report.records.length);
  assert.equal(report.sexes.find((group) => group.id === 'female')?.records.length, 1);
  assert.equal(report.sexes.some((group) => group.id === 'unknown'), false);
});
