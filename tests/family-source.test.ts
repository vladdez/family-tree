import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FamilySourceSchema } from '../src/domain/schemas';
import { adaptFamilySource } from '../src/domain/family-source';
import { validateCatalog } from '../src/domain/validation';
import { fullName, personSearchText } from '../src/domain/people';
import { getParents, getSpouses, getSiblings, getRelativeGroups, getTreeRelationships, getTreeData, relationEndpoints } from '../src/domain/relationships';
import { getSourceIssues, getUnidentifiedRelatives } from '../src/domain/source-notes';
import { layoutTree } from '../src/components/genealogy/layout';
import { edgePath } from '../src/components/genealogy/edges';
import { getTreeBranches } from '../src/domain/tree-branches';
import branchRoots from '../src/data/tree-branches.json';
import { getFamilyConnections, familyPath } from '../src/components/genealogy/families';

const source = FamilySourceSchema.parse(JSON.parse(await readFile(new URL('../src/data/family.json', import.meta.url), 'utf8')));
const catalog = validateCatalog({ ...adaptFamilySource(source), documents: [], places: [] });

test('confirmed Alexandra/Anisia identity preserves dates, both children and marriage in a single record', () => {
  const person = catalog.people.find((person) => person.id === 'alexandra-gerasimovna-pavlova')!;
  assert.equal(person.birth.date, '1912'); assert.equal(person.death.date, '1991');
  assert.ok(person.alternateNames.includes('Анисия (Александра) Павлова (Герасимова)'));
  assert.deepEqual(person.spouses, ['petr-pavlovich-pavlov-1912']);
  assert.deepEqual(person.children.slice().sort(), ['fyodor-son-of-anisia', 'maria-petrovna-grigoryeva-1940']);
  assert.ok(getParents('maria-petrovna-grigoryeva-1940', catalog).some((parent) => parent.id === person.id));
  assert.deepEqual(getParents('fyodor-son-of-anisia', catalog).map((parent) => parent.id), [person.id]);
  assert.deepEqual(getSpouses('petr-pavlovich-pavlov-1912', catalog).map((spouse) => spouse.id), [person.id]);
  assert.ok(getSiblings('maria-petrovna-grigoryeva-1940', catalog).some((sibling) => sibling.id === 'fyodor-son-of-anisia'));
  assert.equal(getRelativeGroups(person.id, catalog).some((group) => group.label === 'Возможное совпадение записи'), false);
  assert.equal(getSourceIssues(person.id, catalog).some((issue) => issue.type === 'identity_conflict'), false);
  assert.equal(JSON.stringify(source).includes('anisia-alexandra-pavlova-1912'), false);
});

test('the real family source defines every published node, name and year without seed data', () => {
  assert.deepEqual(catalog.people.map((p) => p.id), source.people.map((p) => p.id));
  for (const record of source.people) {
    const person = catalog.people.find((p) => p.id === record.id)!;
    assert.equal(fullName(person), record.archivalName ?? [record.firstName, record.patronymic, record.lastName].filter(Boolean).join(' '));
    assert.equal(person.archivalName, record.archivalName);
    for (const field of ['firstName', 'lastName', 'patronymic', 'maidenName'] as const) assert.equal(person[field], record[field]);
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

test('direct sibling links remain reciprocal without fabricated parents; possible identities stay separate', () => {
  for (const relation of source.relations) {
    if (relation.type === 'half_sibling' || relation.type === 'sibling') {
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
  const input = { schemaVersion: 2, people: [{ id: 'a', firstName: 'Тест', lastName: '', patronymic: '', maidenName: '', birthYears: [1900], deathYears: [1980, 1981] }], relations: [], unidentifiedRelatives: [], issues: [] };
  const enriched = adaptFamilySource(input, [{ id: 'a', birthDate: '1900-03-12', birthDocumentId: 'birth-source', deathDocumentId: 'death-source', biography: 'Текст профиля', portrait: null }]);
  assert.equal(enriched.people[0].birth.date, '1900-03-12'); assert.equal(enriched.people[0].biography, 'Текст профиля');
  assert.deepEqual(enriched.people[0].death.alternatives, ['1980', '1981']);
  assert.equal(enriched.people[0].birth.documentId, 'birth-source');
  assert.equal(enriched.people[0].death.documentId, 'death-source');
  assert.throws(() => adaptFamilySource(input, [{ id: 'a', deathDate: '1980' }]), /противоречит/);
  assert.throws(() => adaptFamilySource(input, [{ id: 'missing' }]), /отсутствует/);
});

test('source records preserve exact dates, year-only dates, unknown dates and alternate names', () => {
  const input = { schemaVersion: 2, people: [
    { id: 'a', firstName: 'Тест', lastName: '', patronymic: '', maidenName: '', alternateNames: ['Другое имя'], birth: '1965-10-21', death: '2025' },
    { id: 'b', firstName: 'Другой', lastName: 'тест', patronymic: '', maidenName: '', birth: '1990', death: null },
  ], relations: [{ type: 'spouse', person1: 'a', person2: 'b' }], unidentifiedRelatives: [], issues: [] };
  const adapted = adaptFamilySource(input);
  assert.equal(adapted.people[0].birth.date, '1965-10-21'); assert.equal(adapted.people[0].death.date, '2025');
  assert.equal(adapted.people[1].birth.date, '1990'); assert.equal(adapted.people[1].death.date, null);
  assert.deepEqual(adapted.people[0].alternateNames, ['Другое имя']); assert.ok(personSearchText(adapted.people[0]).includes('другое имя'));
  assert.equal(adapted.relations[0].status, 'explicit');
  assert.throws(() => adaptFamilySource(input, [{ id: 'a', birthDate: '1965-10-22' }]), /противоречит/);
  assert.equal(FamilySourceSchema.safeParse({ ...input, people: [{ ...input.people[0], birthYears: [1965] }] }).success, false);
});

test('structured names retain confirmed name parts and leave unknown parts empty', () => {
  for (const [id, fields, expectedName] of [
    ['elvira-mikheeva-grigoryeva', ['Эльвира', 'Михеева', 'Константиновна', 'Григорьева'], 'Эльвира Константиновна Михеева'],
    ['yuri-vladimirovich-mikheev-1965', ['Юрий', 'Михеев', 'Владимирович', ''], 'Юрий Владимирович Михеев'],
    ['vladimir-mikheev-1995', ['Владимир', 'Михеев', 'Юрьевич', ''], 'Владимир Юрьевич Михеев'],
    ['maria-efimova-1941', ['Мария', 'Михеева', 'Ефимовна', 'Ефимова'], 'Мария Ефимовна Михеева'],
    ['alexandra-gerasimovna-pavlova', ['Александра', 'Павлова', 'Герасимовна', 'Герасимова'], 'Александра Герасимовна Павлова'],
    ['ksenia-mikheeva-1990', ['Ксения', 'Михайлова', '', 'Михеева'], 'Ксения Михайлова'],
    ['yakov', ['Яков', '', '', ''], 'Яков'],
  ] as const) {
    const person = catalog.people.find((person) => person.id === id)!;
    assert.deepEqual([person.firstName, person.lastName, person.patronymic, person.maidenName], fields);
    assert.equal(fullName(person), expectedName);
    assert.equal('name' in person, false);
  }
  const ksenia = catalog.people.find((person) => person.id === 'ksenia-mikheeva-1990')!;
  assert.ok(personSearchText(ksenia).includes('ксения михайлова'));
  assert.ok(personSearchText(ksenia).includes('ксения михеева'));
  const person = adaptFamilySource({ schemaVersion: 2, people: [
    { id: 'test', firstName: ' Алёна ', lastName: ' Иванова ', patronymic: ' Петровна ', maidenName: ' Соколова ', birth: null, death: null },
  ], relations: [], unidentifiedRelatives: [], issues: [] }).people[0];
  assert.equal(fullName(person), 'Алёна Петровна Иванова');
  assert.ok(personSearchText(person).includes('алена петровна соколова'));
  assert.equal(fullName(person).includes('Соколова'), false);
});

test('uncertain archival names retain their exact wording without assigning a surname or patronymic', () => {
  for (const [id, firstName, archivalName] of [
    ['mikhey-petrov-1833', 'Михей', 'Михей Петров'],
    ['avdotya-efremova', 'Авдотья', 'Авдотья Ефремова'],
    ['tatyana-grigoryeva', 'Татьяна', 'Татьяна Григорьева'],
    ['stepan-kirillov', 'Степан', 'Степан Кириллов'],
    ['natalya-andreeva', 'Наталья', 'Наталья Андреева'],
  ] as const) {
    const person = catalog.people.find((person) => person.id === id)!;
    assert.equal(person.firstName, firstName);
    assert.equal(person.lastName, ''); assert.equal(person.patronymic, ''); assert.equal(person.maidenName, '');
    assert.equal(person.archivalName, archivalName);
    assert.equal(fullName(person), archivalName);
    assert.ok(personSearchText(person).includes(archivalName.toLocaleLowerCase('ru').replaceAll('ё', 'е')));
  }
  assert.equal(fullName(catalog.people.find((person) => person.id === 'elvira-mikheeva-grigoryeva')!), 'Эльвира Константиновна Михеева');
  assert.equal(FamilySourceSchema.safeParse({ ...source, people: [{ ...source.people[0], archivalName: ' ' }] }).success, false);
});

test('the new source format rejects an old name string, missing fields and a blank first name', () => {
  assert.equal(source.schemaVersion, 2);
  const record = source.people[0];
  assert.equal(FamilySourceSchema.safeParse({ ...source, schemaVersion: 1 }).success, false);
  assert.equal(FamilySourceSchema.safeParse({ ...source, people: [{ ...record, name: 'Яков' }] }).success, false);
  assert.equal(FamilySourceSchema.safeParse({ ...source, people: [{ ...record, firstName: ' ' }] }).success, false);
  for (const field of ['firstName', 'lastName', 'patronymic', 'maidenName'] as const) {
    const { [field]: omitted, ...missingField } = record;
    assert.equal(FamilySourceSchema.safeParse({ ...source, people: [missingField] }).success, false, field);
  }
});

test('unknown IDs in source annotations and duplicate relation entries fail validation', () => {
  assert.throws(() => validateCatalog({ ...catalog, issues: [{ person: 'missing', type: 'identity_conflict', reason: 'Тест' }] }), /неизвестный person ID/);
  assert.throws(() => validateCatalog({ ...catalog, unidentifiedRelatives: [{ people: ['missing'], relation: 'child', sex: 'unknown', count: 1, status: 'explicit' }] }), /неизвестный person ID/);
  if (source.relations.length) assert.throws(() => validateCatalog({ ...catalog, relations: [...source.relations, source.relations[0]] }), /Повтор связи/);
});

test('confirmed paternal chain reaches Yuri and all six children share Vladimir and Maria as parents', () => {
  const chain = ['petr-mikheev-1889', 'dmitry-mikheev-1910', 'vladimir-mikheev-1941', 'yuri-vladimirovich-mikheev-1965'];
  for (let index = 1; index < chain.length; index++) {
    const relation = source.relations.filter((relation) => relation.type === 'parent' && relation.parent === chain[index - 1] && relation.child === chain[index]);
    assert.equal(relation.length, 1);
    assert.equal(relation[0].status, 'explicit');
    assert.ok(catalog.people.find((person) => person.id === chain[index - 1])!.children.includes(chain[index]));
  }
  const parents = ['vladimir-mikheev-1941', 'maria-efimova-1941'];
  const children = ['alevtina-daughter-of-vladimir-and-maria', 'svetlana-daughter-of-vladimir-and-maria',
    'yuri-vladimirovich-mikheev-1965', 'sergey-son-of-vladimir-and-maria',
    'elena-daughter-of-vladimir-and-maria', 'anastasia-daughter-of-vladimir-and-maria'];
  for (const id of children) assert.deepEqual(catalog.people.find((person) => person.id === id)!.parents, parents);
  for (const id of parents) {
    assert.deepEqual(catalog.people.find((person) => person.id === id)!.children.slice().sort(), children.slice().sort());
    assert.deepEqual(getUnidentifiedRelatives(catalog, id), []);
  }
});

test('actual family layout keeps spouses together, parents above children and all cards distinct', () => {
  const { people } = getTreeData(catalog);
  const edges = getTreeRelationships(catalog);
  const branches = getTreeBranches(people, edges, branchRoots);
  const graph = layoutTree(people, edges, { nodeWidth: 220, nodeHeight: 140, gap: 40, generationGap: 100 }, branches);
  const nodes = new Map(graph.nodes.map((p) => [p.id, p]));
  assert.equal(nodes.size, source.people.length);
  assert.equal(new Set(graph.nodes.map((p) => `${p.x}:${p.y}`)).size, source.people.length);
  for (const edge of edges) {
    if (edge.type === 'parent') assert.ok(nodes.get(edge.from)!.y < nodes.get(edge.to)!.y, edge.id);
    if (edge.type === 'spouse') assert.equal(nodes.get(edge.from)!.y, nodes.get(edge.to)!.y, edge.id);
  }
  const contemporaries = ['konstantin-grigoryevich-grigoryev-1935', 'maria-petrovna-grigoryeva-1940', 'vladimir-mikheev-1941', 'maria-efimova-1941', 'vladimir-halfbrother-1947'];
  assert.equal(new Set(contemporaries.map((id) => nodes.get(id)!.y)).size, 1);
  assert.equal(new Set(['ksenia-mikheeva-1990', 'vladimir-mikheev-1995', 'maria-mikheeva-2003'].map((id) => nodes.get(id)!.y)).size, 1);
  assert.ok(graph.periods?.some((period) => period.label === '1935–1947'));
  assert.ok(graph.periods?.some((period) => period.label === '1990–2003'));
  const father = branches.find((branch) => branch.id === 'paternal')!;
  const mother = branches.find((branch) => branch.id === 'maternal')!;
  assert.ok(father.personIds.includes('petr-mikheev-1889'));
  assert.ok(father.personIds.includes('vladimir-mikheev-1941'));
  assert.ok(mother.personIds.includes('konstantin-grigoryevich-grigoryev-1935'));
  assert.ok(mother.personIds.includes('maria-petrovna-grigoryeva-1940'));
  assert.ok(Math.max(...father.personIds.map((id) => nodes.get(id)!.x + 220)) < Math.min(...mother.personIds.map((id) => nodes.get(id)!.x)));
  assert.deepEqual(branches.find((branch) => branch.kind === 'descendants')!.personIds.sort(), ['ksenia-mikheeva-1990', 'maria-mikheeva-2003', 'vladimir-mikheev-1995']);
  assert.deepEqual(branches.flatMap((branch) => branch.personIds).sort(), source.people.map((person) => person.id).sort());
});

test('real family connectors preserve all parent edges and never pass through cards', () => {
  const { people, relationships } = getTreeData(catalog);
  const geometry = { nodeWidth: 220, nodeHeight: 140, gap: 40, generationGap: 100 };
  const branches = getTreeBranches(people, relationships, branchRoots);
  const graph = layoutTree(people, relationships, geometry, branches), nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const families = getFamilyConnections(graph.nodes, relationships, geometry);
  const main = families.find((family) => family.parentIds.includes('yuri-vladimirovich-mikheev-1965'))!;
  assert.deepEqual(main.parentIds, ['elvira-mikheeva-grigoryeva', 'yuri-vladimirovich-mikheev-1965']);
  assert.deepEqual(main.childIds.slice().sort(), ['ksenia-mikheeva-1990', 'maria-mikheeva-2003', 'vladimir-mikheev-1995']);
  assert.deepEqual([...new Set(families.flatMap((family) => family.lines.flatMap((line) => line.edges.map((edge) => edge.id))))].sort(), relationships.filter((edge) => edge.type === 'parent').map((edge) => edge.id).sort());
  const paths = [...families.flatMap((family) => family.lines.map((line) => ({ id: line.id, path: familyPath(line.points) }))),
    ...relationships.filter((edge) => edge.type !== 'parent').map((edge) => ({ id: edge.id, path: edgePath(edge, nodes.get(edge.from)!, nodes.get(edge.to)!, geometry) }))];
  for (const line of paths) {
    const tokens = line.path.match(/[MVH]|-?\d+(?:\.\d+)?/g)!;
    let x = 0, y = 0;
    while (tokens.length) {
      const command = tokens.shift(), previous = { x, y };
      if (command === 'M') { x = Number(tokens.shift()); y = Number(tokens.shift()); continue; }
      if (command === 'V') y = Number(tokens.shift());
      if (command === 'H') x = Number(tokens.shift());
      for (const node of graph.nodes) {
        const crosses = x === previous.x
          ? x > node.x && x < node.x + geometry.nodeWidth && Math.max(y, previous.y) > node.y && Math.min(y, previous.y) < node.y + geometry.nodeHeight
          : y > node.y && y < node.y + geometry.nodeHeight && Math.max(x, previous.x) > node.x && Math.min(x, previous.x) < node.x + geometry.nodeWidth;
        assert.equal(crosses, false, `${line.id} crosses ${node.id}`);
      }
    }
  }
});
