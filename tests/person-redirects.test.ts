import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRawCatalog } from '../scripts/data-files';
import { validateCatalog } from '../src/domain/validation';
import { getPersonRedirects } from '../src/domain/person-redirects';
import personRedirects from '../src/data/person-redirects.json';

const catalog = validateCatalog(await readRawCatalog());

test('the published Anisia address points to the single merged Alexandra record', () => {
  const redirects = getPersonRedirects(catalog, personRedirects);
  const redirect = redirects.find((entry) => entry.from === 'anisia-alexandra-pavlova-1912')!;
  assert.ok(redirect);
  assert.equal(redirect.person.id, 'alexandra-gerasimovna-pavlova');
  assert.equal(catalog.people.some((person) => person.slug === redirect.from), false);
});

test('published addresses survive the migration to birth-year IDs', () => {
  const redirects = getPersonRedirects(catalog, personRedirects);
  for (const [from, personId] of [
    ['ekaterina-wife-of-nikifor', 'ekaterina-1857'],
    ['matryona-daughter-of-petr', 'matryona-1821'],
    ['katerina-daughter-of-petr', 'katerina-1823'],
  ]) {
    const redirect = redirects.find((entry) => entry.from === from);
    assert.ok(redirect, `Missing redirect for ${from}`);
    assert.equal(redirect.person.id, personId);
    assert.equal(redirect.person.slug, personId);
    assert.equal(catalog.people.some((person) => person.slug === from), false);
  }
});

test('redirect validation rejects missing people, duplicate aliases, real page conflicts and invalid paths', () => {
  const redirect = personRedirects[0];
  assert.throws(() => getPersonRedirects(catalog, [{ ...redirect, personId: 'missing' }]), /Неизвестный человек/);
  assert.throws(() => getPersonRedirects(catalog, [redirect, redirect]), /Повтор или конфликт/);
  assert.throws(() => getPersonRedirects(catalog, [{ ...redirect, from: catalog.people[0].slug }]), /Повтор или конфликт/);
  assert.throws(() => getPersonRedirects(catalog, [{ ...redirect, from: '../outside' }]));
});
