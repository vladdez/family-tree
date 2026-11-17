import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptFamilySource } from '../src/domain/family-source';
import { PersonProfileSchema } from '../src/domain/schemas';
import { personPortraits } from '../src/domain/portraits';
import { validateMedia } from '../scripts/data-files';

const source = {
  schemaVersion: 2,
  people: [{ id: 'a', firstName: 'Тест', lastName: '', patronymic: '', maidenName: '', birthYears: [], deathYears: [] }],
  relations: [], unidentifiedRelatives: [], issues: [],
};
const photos = [
  { path: '/media/photos/young.jpg', label: 'В молодости' },
  { path: '/media/photos/adult.jpg', label: 'В зрелые годы' },
  { path: '/media/photos/later.jpg', label: 'Поздние годы' },
];

test('portrait galleries preserve the supplied order with zero, one, two or three photos and no placeholders', () => {
  for (const count of [0, 1, 2, 3]) {
    const portraits = photos.slice(0, count);
    const { people: [person] } = adaptFamilySource(source, [{ id: 'a', portraits }]);
    assert.deepEqual(personPortraits(person), portraits);
    assert.equal(person.portrait, portraits[0]?.path ?? null);
  }
});

test('legacy portraits remain available and the primary avatar does not duplicate an explicit gallery', () => {
  for (const portraits of [undefined, []]) {
    const { people: [person] } = adaptFamilySource(source, [{ id: 'a', portrait: photos[0].path, portraits }]);
    assert.deepEqual(personPortraits(person), [{ path: photos[0].path, label: '' }]);
  }
  const { people: [person] } = adaptFamilySource(source, [{ id: 'a', portrait: photos[2].path, portraits: photos }]);
  assert.deepEqual(personPortraits(person), photos);
  assert.equal(person.portrait, photos[2].path);
});

test('portrait galleries reject empty, duplicate and unsafe photo paths; captions are optional', () => {
  for (const portraits of [[{ path: '' }], [photos[0], photos[0]], [{ path: '/media/../private.jpg' }]]) {
    assert.equal(PersonProfileSchema.safeParse({ id: 'a', portraits }).success, false);
  }
  assert.equal(PersonProfileSchema.parse({ id: 'a', portraits: [{ path: photos[0].path }] }).portraits![0].label, '');
});

test('media validation checks additional portraits as well as the primary avatar', async () => {
  const family = adaptFamilySource(source, [{ id: 'a', portrait: '/media/photos/logos/maria-efimovna-mikheeva-1941.jpg', portraits: photos }]);
  await assert.rejects(validateMedia({ ...family, documents: [], places: [] }), /Медиафайл не найден: public\/media\/photos\/young.jpg/);
});
