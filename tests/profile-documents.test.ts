import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentSchema, type Catalog } from '../src/domain/schemas';
import { getProfileDocuments, getDocumentsForPerson } from '../src/domain/documents';

test('profile albums separate photographs from records, retain PDFs, and respect visibility and family links', () => {
  const record = (id: string, type: 'photograph' | 'birth', date: string | null, peopleIds = ['a'], showInDocumentTrail = true) => DocumentSchema.parse({
    id, title: id, type, date, peopleIds, showInDocumentTrail,
    files: [{ path: `/media/photos/${id}.pdf`, label: id }],
    archive: { name: '', fond: '', opis: '', delo: '', page: '' }, transcription: '', notes: '',
  });
  const catalog: Catalog = { people: [], places: [], documents: [
    record('family-photo', 'photograph', '1967', ['a', 'b']),
    record('birth-record', 'birth', '1941'),
    record('early-photo', 'photograph', '1963'),
    record('undated-photo', 'photograph', null),
    record('other-photo', 'photograph', '1950', ['other']),
    record('hidden-photo', 'photograph', '1950', ['a'], false),
    record('hidden-record', 'birth', '1941', ['a'], false),
  ] };
  const snapshot = JSON.stringify(catalog);
  const { photographs, documents } = getProfileDocuments('a', catalog);
  assert.deepEqual(photographs.map((d) => d.id), ['early-photo', 'family-photo', 'undated-photo']);
  assert.deepEqual(documents.map((d) => d.id), ['birth-record']);
  assert.deepEqual(getProfileDocuments('b', catalog).photographs.map((d) => d.id), ['family-photo']);
  assert.deepEqual(getProfileDocuments('missing', catalog), { photographs: [], documents: [] });
  assert.ok(getDocumentsForPerson('a', catalog).some((d) => d.id === 'hidden-record'));
  assert.equal(JSON.stringify(catalog), snapshot);
});
