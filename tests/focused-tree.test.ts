import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adaptFamilySource } from '../src/domain/family-source';
import { validateCatalog } from '../src/domain/validation';
import { getFocusedTree } from '../src/domain/focused-tree';
import { getTreeBranches } from '../src/domain/tree-branches';
import { layoutTree } from '../src/components/genealogy/layout';
import { getFamilyConnections } from '../src/components/genealogy/families';
import { fitNodes } from '../src/components/genealogy/viewport';
import branchRoots from '../src/data/tree-branches.json';
import treeSettings from '../src/data/tree-view.json';

const source = JSON.parse(await readFile(new URL('../src/data/family.json', import.meta.url), 'utf8'));
const catalog = validateCatalog({ ...adaptFamilySource(source), documents: [], places: [] });

test('main tree retains Vladimir, both parents, his sisters and both ancestral lines without deleting source records', () => {
  const snapshot = JSON.stringify(catalog), tree = getFocusedTree(catalog, treeSettings);
  const ids = new Set(tree.people.map((person) => person.id));
  assert.equal(tree.people.find((person) => person.id === tree.focusPersonId)!.name, 'Владимир Юрьевич Михеев');
  assert.deepEqual(tree.familyPersonIds.slice().sort(), ['elvira-mikheeva-grigoryeva', 'ksenia-mikheeva-1990', 'maria-mikheeva-2003', 'vladimir-mikheev-1995', 'yuri-vladimirovich-mikheev-1965']);
  for (const id of ['petr-mikheev-1889', 'dmitry-mikheev-1910', 'vladimir-mikheev-1941', 'konstantin-grigoryevich-grigoryev-1935', 'maria-petrovna-grigoryeva-1940']) assert.ok(ids.has(id), id);
  for (const id of ['vladimir-halfbrother-1947', 'maria-efimova-1941', 'efim-father-of-maria']) assert.equal(ids.has(id), false, id);
  const ancestors = tree.people.filter((person) => !tree.familyPersonIds.includes(person.id));
  for (const person of ancestors) {
    assert.ok(tree.relationships.some((edge) => edge.type === 'parent' && edge.from === person.id), person.id);
  }
  assert.ok(tree.people.length < catalog.people.length);
  assert.equal(catalog.people.length, 52);
  assert.equal(catalog.relations?.length, 72);
  assert.equal(JSON.stringify(catalog), snapshot);
});

test('hidden siblings and spouses remain linked inside ancestor cards with uncertainty labels', () => {
  const tree = getFocusedTree(catalog, treeSettings);
  const brother = tree.relatives['konstantin-grigoryevich-grigoryev-1935'].find((group) => group.label === 'Братья и сёстры')!.people.find((person) => person.id === 'vladimir-halfbrother-1947')!;
  assert.equal(brother.annotation, 'Общие родители не уточнены');
  assert.deepEqual(catalog.people.find((person) => person.id === brother.id)!.parents, []);
  const reciprocal = getFocusedTree(catalog, { focusPersonId: brother.id }).relatives;
  assert.equal(Object.values(reciprocal).flatMap((groups) => groups.flatMap((group) => group.people)).some((person) => person.annotation.includes('Неполнородное')), false);
  assert.ok(brother.href.includes('/people/')); assert.ok(brother.lifespan.includes('1947'));
  assert.ok(tree.relatives['vladimir-mikheev-1941'].find((group) => group.label === 'Супруги')!.people.some((person) => person.id === 'maria-efimova-1941'));
  assert.ok(tree.relationships.some((edge) => edge.type === 'parent' && edge.to === 'elvira-mikheeva-grigoryeva' && edge.status === 'inferred_branch_context'));
  for (const groups of Object.values(tree.relatives)) for (const group of groups) for (const person of group.people) assert.equal(tree.people.some((visible) => visible.id === person.id), false);
});

test('only the focal person’s siblings are separate nodes; cousins, siblings of ancestors and unconfirmed spouses stay in cards', () => {
  const people = ['me', 'sister', 'father', 'mother', 'grandfather', 'uncle', 'cousin', 'spouse', 'half', 'other-parent'].map((id) => ({ id, name: id, birthYears: [], death: null }));
  const input = { schemaVersion: 1, people, relations: [
    { type: 'parent', parent: 'father', child: 'me' }, { type: 'parent', parent: 'mother', child: 'me', status: 'inferred_context' },
    { type: 'parent', parent: 'father', child: 'sister' }, { type: 'parent', parent: 'mother', child: 'sister' },
    { type: 'parent', parent: 'grandfather', child: 'father' }, { type: 'parent', parent: 'grandfather', child: 'uncle' },
    { type: 'parent', parent: 'uncle', child: 'cousin' }, { type: 'spouse', person1: 'grandfather', person2: 'spouse' },
    { type: 'half_sibling', person1: 'me', person2: 'half' }, { type: 'parent', parent: 'other-parent', child: 'half' },
  ], issues: [], unidentifiedRelatives: [] };
  const records = validateCatalog({ ...adaptFamilySource(input), documents: [], places: [] });
  const tree = getFocusedTree(records, { focusPersonId: 'me' });
  assert.deepEqual(tree.people.map((person) => person.id).sort(), ['father', 'grandfather', 'half', 'me', 'mother', 'sister']);
  assert.ok(tree.relatives.father.find((group) => group.label === 'Братья и сёстры')!.people.some((person) => person.id === 'uncle'));
  assert.ok(tree.relatives.grandfather.find((group) => group.label === 'Дети')!.people.some((person) => person.id === 'uncle'));
  assert.ok(tree.relatives.grandfather.find((group) => group.label === 'Супруги')!.people.some((person) => person.id === 'spouse'));
  assert.ok(tree.relatives.half.find((group) => group.label === 'Родители')!.people.some((person) => person.id === 'other-parent'));
  assert.ok(tree.relationships.some((edge) => edge.from === 'mother' && edge.to === 'me' && edge.status === 'inferred_context'));
  assert.throws(() => getFocusedTree(records, { focusPersonId: 'missing' }), /Неизвестный человек/);
  assert.throws(() => getFocusedTree(records, { focusPersonId: '' }));
});

test('focused real layout preserves era alignment, branch separation and the shared connection to all three children', () => {
  const tree = getFocusedTree(catalog, treeSettings), geometry = { nodeWidth: 220, nodeHeight: 180, gap: 40, generationGap: 100 };
  const branches = getTreeBranches(tree.people, tree.relationships, branchRoots);
  const graph = layoutTree(tree.people, tree.relationships, geometry, branches), nodes = new Map(graph.nodes.map((person) => [person.id, person]));
  assert.equal(new Set(graph.nodes.map((person) => `${person.x}:${person.y}`)).size, tree.people.length);
  for (const edge of tree.relationships) if (edge.type === 'parent') assert.ok(nodes.get(edge.from)!.y < nodes.get(edge.to)!.y);
  assert.equal(new Set(['konstantin-grigoryevich-grigoryev-1935', 'maria-petrovna-grigoryeva-1940', 'vladimir-mikheev-1941'].map((id) => nodes.get(id)!.y)).size, 1);
  assert.equal(new Set(['ksenia-mikheeva-1990', 'vladimir-mikheev-1995', 'maria-mikheeva-2003'].map((id) => nodes.get(id)!.y)).size, 1);
  assert.ok(nodes.get('yuri-vladimirovich-mikheev-1965')!.x < nodes.get('elvira-mikheeva-grigoryeva')!.x);
  assert.equal(nodes.get('elvira-mikheeva-grigoryeva')!.x - nodes.get('yuri-vladimirovich-mikheev-1965')!.x, (geometry.nodeWidth + geometry.gap) * 2);
  assert.equal(nodes.get('vladimir-mikheev-1995')!.x, (nodes.get('yuri-vladimirovich-mikheev-1965')!.x + nodes.get('elvira-mikheeva-grigoryeva')!.x) / 2);
  const families = getFamilyConnections(graph.nodes, tree.relationships, geometry);
  const main = families.find((family) => family.parentIds.includes('yuri-vladimirovich-mikheev-1965'))!;
  assert.deepEqual(main.parentIds, ['elvira-mikheeva-grigoryeva', 'yuri-vladimirovich-mikheev-1965']);
  assert.deepEqual(main.childIds.slice().sort(), ['ksenia-mikheeva-1990', 'maria-mikheeva-2003', 'vladimir-mikheev-1995']);
  assert.deepEqual([...new Set(families.flatMap((family) => family.lines.flatMap((line) => line.edges.map((edge) => edge.id))))].sort(), tree.relationships.filter((edge) => edge.type === 'parent').map((edge) => edge.id).sort());
  for (const family of families) for (const line of family.lines) for (let index = 1; index < line.points.length; index++) {
    const a = line.points[index - 1], b = line.points[index];
    for (const node of graph.nodes) {
      const crosses = a.x === b.x
        ? a.x > node.x && a.x < node.x + geometry.nodeWidth && Math.max(a.y, b.y) > node.y && Math.min(a.y, b.y) < node.y + geometry.nodeHeight
        : a.y > node.y && a.y < node.y + geometry.nodeHeight && Math.max(a.x, b.x) > node.x && Math.min(a.x, b.x) < node.x + geometry.nodeWidth;
      assert.equal(crosses, false, `${line.id} crosses ${node.id}`);
    }
  }
  for (const viewport of [{ width: 320, height: 500 }, { width: 1200, height: 600 }]) {
    const family = graph.nodes.filter((person) => tree.familyPersonIds.includes(person.id)), view = fitNodes(viewport, family, geometry);
    for (const node of family) {
      assert.ok(view.x + node.x * view.scale >= 0); assert.ok(view.y + node.y * view.scale >= 0);
      assert.ok(view.x + (node.x + geometry.nodeWidth) * view.scale <= viewport.width);
      assert.ok(view.y + (node.y + geometry.nodeHeight) * view.scale <= viewport.height);
    }
  }
});

test('paternal cards from 1857–1858 to 1889–1906 follow their ancestry without crossed or bent descents', () => {
  const tree = getFocusedTree(catalog, treeSettings), geometry = { nodeWidth: 220, nodeHeight: 180, gap: 40, generationGap: 100 };
  const snapshot = JSON.stringify(tree);
  const graph = layoutTree(tree.people, tree.relationships, geometry, getTreeBranches(tree.people, tree.relationships, branchRoots));
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const families = getFamilyConnections(graph.nodes, tree.relationships, geometry);
  const petr = nodes.get('petr-mikheev-1889')!, paraskeva = nodes.get('paraskeva-pavlova-1889')!;
  const left = families.find((family) => family.childIds.includes(petr.id))!;
  const right = families.find((family) => family.childIds.includes(paraskeva.id))!;
  assert.ok(petr.x < paraskeva.x);
  assert.equal(petr.y, paraskeva.y);
  assert.equal(graph.periods!.find((period) => period.y === petr.y)!.label, '1889–1906');
  for (const id of [...left.parentIds, ...right.parentIds]) {
    const node = nodes.get(id)!;
    assert.equal(graph.periods!.find((period) => period.y === node.y)!.label, '1857–1858');
  }
  const xs = (family: typeof left) => family.lines.flatMap((line) => line.points.map((point) => point.x));
  assert.ok(Math.max(...xs(left)) < Math.min(...xs(right)), 'the two parent families must have disjoint routes');
  for (const [family, child] of [[left, petr], [right, paraskeva]] as const) {
    assert.ok(family.lines.find((line) => line.id.endsWith(':spine'))!.points.every((point) => point.x === child.x + geometry.nodeWidth / 2));
    assert.equal(family.lines.some((line) => line.id.includes(':children:')), false);
  }
  assert.ok(tree.relationships.some((edge) => edge.type === 'spouse'
    && [edge.from, edge.to].includes(petr.id) && [edge.from, edge.to].includes(paraskeva.id)));
  assert.equal(JSON.stringify(tree), snapshot);
});
