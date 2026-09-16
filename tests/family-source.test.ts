import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FamilySourceSchema } from '../src/domain/schemas';
import { adaptFamilySource } from '../src/domain/family-source';
import { validateCatalog } from '../src/domain/validation';
import { fullName, personSearchText } from '../src/domain/people';
import { getSiblings, getRelativeGroups, getTreeRelationships, relationEndpoints } from '../src/domain/relationships';
import { getSourceIssues, getUnidentifiedRelatives } from '../src/domain/source-notes';
import { layoutTree } from '../src/components/genealogy/layout';

const source = FamilySourceSchema.parse(JSON.parse(await readFile(new URL('../src/data/family.json', import.meta.url), 'utf8')));
const catalog = validateCatalog({ ...adaptFamilySource(source), documents: [], places: [] });

test('the real family source defines every published node, name and year without seed data', () => {
  assert.deepEqual(catalog.people.map((p) => p.id), source.people.map((p) => p.id));
  for (const record of source.people) {
    const person = catalog.people.find((p) => p.id === record.id)!;
    assert.equal(fullName(person), record.name);
    assert.deepEqual(person.alternateNames, record.alternateNames);
    for (const [event, years, date] of [[person.birth, record.birthYears ?? [], record.birth], [person.death, record.deathYears ?? [], record.death]] as const) {
      assert.equal(event.date, date ?? (years.length === 1 ? String(years[0]).padStart(4, '0') : null));
      assert.deepEqual(event.alternatives, years.length > 1 ? years.map((y) => String(y).padStart(4, '0')) : []);
    }
    assert.deepEqual(person.parents, source.relations.filter((r) => r.type === 'parent' && r.child === person.id).map((r) => r.type === 'parent' ? r.parent : ''));
  }
});

test('all source edges and their confidence statuses are preserved', () => {
  const edges = getTreeRelationships(catalog);
  assert.equal(edges.length, source.relations.length);
  source.relations.forEach((relation, index) => {
    assert.deepEqual([edges[index].from, edges[index].to], relationEndpoints(relation));
    assert.equal(edges[index].type, relation.type); assert.equal(edges[index].status, relation.status);
    if (relation.type === 'parent' && relation.status !== 'explicit') {
      const group = getRelativeGroups(relation.child, catalog).find((g) => g.label === 'Родители')!;
      assert.match(group.annotations[relation.parent], /Предположение|Требует уточнения/);
    }
  });
});

test('half-siblings remain reciprocal without a fabricated shared parent; possible identities stay separate', () => {
  for (const relation of source.relations) {
    if (relation.type === 'half_sibling') {
      assert.ok(getSiblings(relation.person1, catalog).some((p) => p.id === relation.person2));
      assert.ok(getSiblings(relation.person2, catalog).some((p) => p.id === relation.person1));
    }
    if (relation.type === 'possible_same_person') {
      assert.ok(catalog.people.some((p) => p.id === relation.person1)); assert.ok(catalog.people.some((p) => p.id === relation.person2));
      assert.ok(getRelativeGroups(relation.person1, catalog).find((g) => g.label === 'Возможное совпадение записи')?.people.some((p) => p.id === relation.person2));
    }
  }
});

test('all corrections, identity issues and unnamed-relative counts remain attached to their records', () => {
  assert.deepEqual(catalog.issues, source.issues); assert.deepEqual(catalog.unidentifiedRelatives, source.unidentifiedRelatives);
  for (const issue of source.issues) {
    for (const id of [...(issue.person ? [issue.person] : []), ...(issue.people ?? []), ...(issue.relatedPerson ? [issue.relatedPerson] : [])]) assert.ok(getSourceIssues(id, catalog).some((i) => i.reason === issue.reason));
  }
  assert.equal(getUnidentifiedRelatives(catalog).length, source.unidentifiedRelatives.length);
  for (const relative of source.unidentifiedRelatives) for (const id of relative.people) assert.ok(getUnidentifiedRelatives(catalog, id).some((r) => r.count === relative.count && r.status === relative.status && r.relation === relative.relation));
});

test('profiles enrich existing nodes and cannot silently choose an uncertain year', () => {
  const input = { schemaVersion: 1, people: [{ id: 'a', name: 'Тест', birthYears: [1900], deathYears: [1980, 1981] }], relations: [], unidentifiedRelatives: [], issues: [] };
  const enriched = adaptFamilySource(input, [{ id: 'a', birthDate: '1900-03-12', biography: 'Текст профиля', portrait: null }]);
  assert.equal(enriched.people[0].birth.date, '1900-03-12'); assert.equal(enriched.people[0].biography, 'Текст профиля');
  assert.deepEqual(enriched.people[0].death.alternatives, ['1980', '1981']);
  assert.throws(() => adaptFamilySource(input, [{ id: 'a', deathDate: '1980' }]), /противоречит/);
  assert.throws(() => adaptFamilySource(input, [{ id: 'missing' }]), /отсутствует/);
});

test('source records preserve exact dates, year-only dates, unknown dates and alternate names', () => {
  const input = { schemaVersion: 1, people: [
    { id: 'a', name: 'Тест', alternateNames: ['Другое имя'], birth: '1965-10-21', death: '2025' },
    { id: 'b', name: 'Другой тест', birth: '1990', death: null },
  ], relations: [{ type: 'spouse', person1: 'a', person2: 'b' }], unidentifiedRelatives: [], issues: [] };
  const adapted = adaptFamilySource(input);
  assert.equal(adapted.people[0].birth.date, '1965-10-21'); assert.equal(adapted.people[0].death.date, '2025');
  assert.equal(adapted.people[1].birth.date, '1990'); assert.equal(adapted.people[1].death.date, null);
  assert.deepEqual(adapted.people[0].alternateNames, ['Другое имя']); assert.ok(personSearchText(adapted.people[0]).includes('другое имя'));
  assert.equal(adapted.relations[0].status, 'explicit');
  assert.throws(() => adaptFamilySource(input, [{ id: 'a', birthDate: '1965-10-22' }]), /противоречит/);
  assert.equal(FamilySourceSchema.safeParse({ ...input, people: [{ ...input.people[0], birthYears: [1965] }] }).success, false);
});

test('unknown IDs in source annotations and duplicate relation entries fail validation', () => {
  assert.throws(() => validateCatalog({ ...catalog, issues: [{ person: 'missing', type: 'identity_conflict', reason: 'Тест' }] }), /неизвестный person ID/);
  assert.throws(() => validateCatalog({ ...catalog, unidentifiedRelatives: [{ people: ['missing'], relation: 'child', sex: 'unknown', count: 1, status: 'explicit' }] }), /неизвестный person ID/);
  if (source.relations.length) assert.throws(() => validateCatalog({ ...catalog, relations: [...source.relations, source.relations[0]] }), /Повтор связи/);
});

test('actual family layout keeps spouses together, parents above children and all cards distinct', () => {
  const people = catalog.people.map((p) => ({ id: p.id, name: fullName(p), lifespan: '', href: '', uncertain: false }));
  const edges = getTreeRelationships(catalog);
  const graph = layoutTree(people, edges, { nodeWidth: 220, nodeHeight: 140, gap: 40, generationGap: 100 });
  const nodes = new Map(graph.nodes.map((p) => [p.id, p]));
  assert.equal(nodes.size, source.people.length);
  assert.equal(new Set(graph.nodes.map((p) => `${p.x}:${p.y}`)).size, source.people.length);
  for (const edge of edges) {
    if (edge.type === 'parent') assert.ok(nodes.get(edge.from)!.y < nodes.get(edge.to)!.y, edge.id);
    if (edge.type === 'spouse') assert.equal(nodes.get(edge.from)!.y, nodes.get(edge.to)!.y, edge.id);
  }
});
