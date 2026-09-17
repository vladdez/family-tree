import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRawCatalog } from '../scripts/data-files';
import { validateCatalog } from '../src/domain/validation';
import { getPersonRedirects } from '../src/domain/person-redirects';
import personRedirects from '../src/data/person-redirects.json';

const catalog = validateCatalog(await readRawCatalog());

test('the published Anisia address points to the single merged Alexandra record', () => {
  const redirects = getPersonRedirects(catalog, personRedirects);
  assert.equal(redirects.length, 1);
  assert.equal(redirects[0].from, 'anisia-alexandra-pavlova-1912');
  assert.equal(redirects[0].person.id, 'alexandra-gerasimovna-pavlova');
  assert.equal(catalog.people.some((person) => person.slug === redirects[0].from), false);
});

test('redirect validation rejects missing people, duplicate aliases, real page conflicts and invalid paths', () => {
  const redirect = personRedirects[0];
  assert.throws(() => getPersonRedirects(catalog, [{ ...redirect, personId: 'missing' }]), /Неизвестный человек/);
  assert.throws(() => getPersonRedirects(catalog, [redirect, redirect]), /Повтор или конфликт/);
  assert.throws(() => getPersonRedirects(catalog, [{ ...redirect, from: catalog.people[0].slug }]), /Повтор или конфликт/);
  assert.throws(() => getPersonRedirects(catalog, [{ ...redirect, from: '../outside' }]));
});
