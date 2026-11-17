import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaceSchema, type Person } from '../src/domain/schemas';
import { countryForEvent, placeNameForEvent, previousPlaceNamesForPerson, settlementNameForEvent } from '../src/domain/places';
import lashTayaba from '../src/data/places/lash-tayaba.json';
import staryeToysi from '../src/data/places/starye-toysi.json';
import berezniki from '../src/data/places/berezniki.json';
import countryHistory from '../src/data/place-country-history.json';
import administrationHistory from '../src/data/place-administration-history.json';
import { isPartialDate } from '../src/domain/schemas';

const place = PlaceSchema.parse(lashTayaba);
const event = (date: string | null, alternatives: string[] = []): Person['birth'] => ({ date, alternatives, placeId: place.id, notes: '' });
const person = (birth: string | null, death: string | null = null) => ({ birth: event(birth), death: event(death) });

test('complete event addresses use the contemporary district, region and country', () => {
  assert.equal(placeNameForEvent(place, event('1965-10-21')), 'Лащ-Таяба, Яльчикский район, Чувашская АССР, СССР');
  assert.equal(placeNameForEvent(place, event('1910-08-26')), 'Уразгильдино, Буинский уезд, Симбирская губерния, Российская империя');
  assert.equal(placeNameForEvent(place, event('1995-04-21')), 'Лащ-Таяба, Яльчикский район, Чувашская Республика, Россия');
  assert.equal(placeNameForEvent(PlaceSchema.parse(staryeToysi), event('1941-04-01')), 'Старые Тойси, Чкаловский район, Чувашская АССР, СССР');
  assert.equal(placeNameForEvent(PlaceSchema.parse(berezniki), event('1997')), 'Березники, Пермская область, Россия');
});

test('district and republic transitions are independent, and uncertain fields are omitted', () => {
  assert.equal(placeNameForEvent(place, event('1965-03-13')), 'Лащ-Таяба, Батыревский район, Чувашская АССР, СССР');
  assert.equal(placeNameForEvent(place, event('1965-03-14')), 'Лащ-Таяба, Яльчикский район, Чувашская АССР, СССР');
  assert.equal(placeNameForEvent(place, event('1965')), 'Лащ-Таяба, Чувашская АССР, СССР');
  assert.equal(placeNameForEvent(place, event('1990-10-23')), 'Лащ-Таяба, Яльчикский район, Чувашская АССР, СССР');
  assert.equal(placeNameForEvent(place, event('1990-10-24')), 'Лащ-Таяба, Яльчикский район, Чувашская ССР, СССР');
  assert.equal(placeNameForEvent(place, event('1992-02-12')), 'Лащ-Таяба, Яльчикский район, Чувашская ССР, Россия');
  assert.equal(placeNameForEvent(place, event('1992-02-13')), 'Лащ-Таяба, Яльчикский район, Чувашская Республика, Россия');
  assert.equal(placeNameForEvent(place, event(null)), 'Лащ-Таяба');
  assert.equal(placeNameForEvent(place, event(null, ['1941', '1995'])), 'Лащ-Таяба, Яльчикский район');
  assert.equal(placeNameForEvent(undefined, event('1965')), 'Место пока неизвестно');
});

test('historical place periods have valid dates and no overlapping alternatives for the same field', () => {
  const groups = [...countryHistory.map((history) => ({ ...history, field: 'country' })), ...administrationHistory];
  const byField = new Map<string, { from: string; to?: string }[]>();
  for (const group of groups) for (const period of group.periods) {
    assert.ok(isPartialDate(period.from));
    assert.ok(!period.to || isPartialDate(period.to));
    assert.ok(!period.to || period.from <= period.to);
    for (const id of group.placeIds) {
      const key = `${id}:${group.field}`;
      byField.set(key, [...(byField.get(key) ?? []), period]);
    }
  }
  for (const [key, periods] of byField) {
    periods.sort((a, b) => a.from.localeCompare(b.from));
    for (let i = 1; i < periods.length; i++) assert.ok(periods[i - 1].to && periods[i - 1].to! < periods[i].from, key);
  }
});

test('country follows the event date rather than the current country of the place', () => {
  for (const [date, country] of [
    ['1698', 'Русское царство'], ['1858', 'Российская империя'], ['1910-08-26', 'Российская империя'],
    ['1920', 'РСФСР'], ['1922-12-29', 'РСФСР'], ['1922-12-30', 'СССР'],
    ['1965-10-21', 'СССР'], ['1991-12-25', 'СССР'], ['1991-12-26', 'Россия'], ['1995-04-21', 'Россия'],
  ]) assert.equal(countryForEvent(place, event(date)), country, date);
  const life = person('1910', '1996');
  assert.equal(countryForEvent(place, life.birth), 'Российская империя');
  assert.equal(countryForEvent(place, life.death), 'Россия');
});

test('country selection handles partial and conflicting dates without inventing precision', () => {
  assert.equal(countryForEvent(place, event('1965-10')), 'СССР');
  for (const date of [null, '1721', '1917', '1922', '1991', '1991-12']) assert.equal(countryForEvent(place, event(date)), '', String(date));
  assert.equal(countryForEvent(place, event(null, ['1941', '1942'])), 'СССР');
  assert.equal(countryForEvent(place, event(null, ['1990', '1995'])), '');
  assert.equal(countryForEvent(PlaceSchema.parse({ id: 'boeblingen', name: 'Бёблинген', country: 'Германия' }), event('2026')), 'Германия');
});

test('Urazgildino is shown for historical lives and hidden for people born after the name period', () => {
  for (const birth of ['1698', '1858', '1910-08-26', '1916']) {
    assert.deepEqual(previousPlaceNamesForPerson(place, person(birth)), ['Уразгильдино']);
  }
  for (const birth of ['1917', '1918', '1941', '1965-10-21', '1995-04-21']) {
    assert.deepEqual(previousPlaceNamesForPerson(place, person(birth)), []);
  }
  assert.deepEqual(previousPlaceNamesForPerson(place, person('1910', '1996')), ['Уразгильдино']);
});

test('settlement names follow the event year and do not guess across a name change', () => {
  assert.equal(settlementNameForEvent(place, event('1916-12-31')), 'Уразгильдино');
  assert.equal(settlementNameForEvent(place, event('1917-01-01')), 'Лащ-Таяба');
  assert.equal(settlementNameForEvent(place, event(null, ['1855', '1858'])), 'Уразгильдино');
  assert.equal(settlementNameForEvent(place, event(null, ['1916', '1917'])), 'Лащ-Таяба');
  assert.equal(settlementNameForEvent(place, event(null)), 'Лащ-Таяба');
  assert.equal(settlementNameForEvent(place, event('1996')), 'Лащ-Таяба');
});

test('unknown and alternative life dates do not invent overlap with a historical name', () => {
  assert.deepEqual(previousPlaceNamesForPerson(place, person(null)), []);
  assert.deepEqual(previousPlaceNamesForPerson(place, person(null, '1900')), ['Уразгильдино']);
  assert.deepEqual(previousPlaceNamesForPerson(place, person(null, '1960')), []);
  assert.deepEqual(previousPlaceNamesForPerson(place, { birth: event(null, ['1910', '1920']), death: event(null) }), []);
  assert.deepEqual(previousPlaceNamesForPerson(place, { birth: event(null, ['1855', '1858']), death: event(null) }), ['Уразгильдино']);
});

test('bounded name periods use the known lifetime, not just birth or presumed survival', () => {
  const bounded = PlaceSchema.parse({ id: 'place', name: 'Место', previousNames: ['Старое'], previousNamePeriods: [{ name: 'Старое', fromYear: 1900, toYear: 1920 }] });
  assert.deepEqual(previousPlaceNamesForPerson(bounded, person('1880', '1930')), ['Старое']);
  assert.deepEqual(previousPlaceNamesForPerson(bounded, person('1880', '1899')), []);
  assert.deepEqual(previousPlaceNamesForPerson(bounded, person('1880')), []);
  assert.deepEqual(previousPlaceNamesForPerson(bounded, person('1921')), []);
  assert.deepEqual(previousPlaceNamesForPerson(undefined, person('1900')), []);
  assert.deepEqual(previousPlaceNamesForPerson({ ...bounded, previousNamePeriods: undefined }, person('1900')), []);
});

test('historical name periods require valid years and at least one boundary', () => {
  for (const period of [{ name: 'Старое' }, { name: 'Старое', fromYear: 1920, toYear: 1900 }, { name: 'Старое', toYear: 0 }]) {
    assert.equal(PlaceSchema.safeParse({ id: 'place', name: 'Место', previousNamePeriods: [period] }).success, false);
  }
});
